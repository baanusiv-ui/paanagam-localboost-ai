import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "./security.js";
import { findOwnedBusiness } from "./modules/businesses/access.js";

const POS_BASE = "https://puzbosqwkdgsozzhuszx.supabase.co/functions/v1/integration-api/api/v1/integration";
const keyBody = z.object({ apiKey: z.string().trim().min(20).max(300).regex(/^lb_[a-f0-9]+$/) });
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

async function posGet(apiKey: string, path: string) {
  const url = new URL(POS_BASE + "/" + path);
  const response = await fetch(url, { method: "GET", headers: { authorization: "Bearer " + apiKey, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error(body?.error?.message || body?.error?.code || "POS API request failed (" + response.status + ")");
  if (!body || body.source !== "paanagam-pos" || body.api_version !== "v1") throw new Error("Unexpected POS API response");
  return body;
}

export async function registerPosIntegrationRoutes(app: FastifyInstance, prisma: PrismaClient, requireUser: any) {
  app.get("/v1/businesses/:businessId/pos-integration", { preHandler: requireUser }, async (request: any, reply) => {
    const business = await findOwnedBusiness(prisma, request.userId, request.params.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found" });
    const row = await prisma.posIntegrationConnection.findUnique({ where: { businessId: business.id } });
    return { connected: Boolean(row), lastTestedAt: row?.lastTestedAt ?? null, lastSyncedAt: row?.lastSyncedAt ?? null, lastStatus: row?.lastStatus ?? "NOT_CONNECTED", lastError: row?.lastError ?? null, businessName: row?.posBusinessName ?? null };
  });

  app.post("/v1/businesses/:businessId/pos-integration/connect", { preHandler: requireUser, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request: any, reply) => {
    const business = await findOwnedBusiness(prisma, request.userId, request.params.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found" });
    const parsed = keyBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Enter a valid Paanagam POS integration key." });
    try {
      const result = await posGet(parsed.data.apiKey, "business");
      const posBusiness = result.data;
      if (!posBusiness?.business_id) return reply.code(422).send({ error: "The POS key is valid but the POS business ID is missing." });
      const row = await prisma.posIntegrationConnection.upsert({
        where: { businessId: business.id },
        create: { businessId: business.id, apiKeyEncrypted: encryptSecret(parsed.data.apiKey), posBusinessId: posBusiness.business_id, posBusinessName: posBusiness.business_name ?? null, lastTestedAt: new Date(), lastStatus: "CONNECTED", lastError: null },
        update: { apiKeyEncrypted: encryptSecret(parsed.data.apiKey), posBusinessId: posBusiness.business_id, posBusinessName: posBusiness.business_name ?? null, lastTestedAt: new Date(), lastStatus: "CONNECTED", lastError: null }
      });
      return { connected: true, businessName: row.posBusinessName, lastTestedAt: row.lastTestedAt, message: "Paanagam POS connection verified. API key stored encrypted." };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not verify POS connection." });
    }
  });

  app.post("/v1/businesses/:businessId/pos-integration/test", { preHandler: requireUser }, async (request: any, reply) => {
    const business = await findOwnedBusiness(prisma, request.userId, request.params.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found" });
    const row = await prisma.posIntegrationConnection.findUnique({ where: { businessId: business.id } });
    if (!row) return reply.code(404).send({ error: "Connect the POS API key first." });
    try {
      const result = await posGet(decryptSecret(row.apiKeyEncrypted), "sync/status");
      await prisma.posIntegrationConnection.update({ where: { businessId: business.id }, data: { lastTestedAt: new Date(), lastStatus: "CONNECTED", lastError: null } });
      return { connected: true, posStatus: result.data?.status ?? "unknown", dataUpdatedAt: result.data_updated_at ?? null, supportedModules: result.data?.supported_modules ?? [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "POS connection test failed";
      await prisma.posIntegrationConnection.update({ where: { businessId: business.id }, data: { lastTestedAt: new Date(), lastStatus: "ERROR", lastError: message.slice(0, 500) } });
      return reply.code(502).send({ error: message });
    }
  });

  app.post("/v1/businesses/:businessId/pos-integration/sync", { preHandler: requireUser, config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (request: any, reply) => {
    const business = await findOwnedBusiness(prisma, request.userId, request.params.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found" });
    const row = await prisma.posIntegrationConnection.findUnique({ where: { businessId: business.id } });
    if (!row) return reply.code(404).send({ error: "Connect the POS API key first." });
    const key = decryptSecret(row.apiKeyEncrypted);
    const to = new Date(), from = new Date(to.getTime() - 29 * 86400000);
    try {
      const [menu, daily] = await Promise.all([
        posGet(key, "menu?limit=500"),
        posGet(key, "sales/daily?from=" + dateOnly(from) + "&to=" + dateOnly(to) + "&limit=500")
      ]);
      let importedMenu = 0, importedDays = 0;
      for (const item of (Array.isArray(menu.data) ? menu.data : [])) {
        const externalId = "paanagam-pos:menu:" + String(item.menu_item_id ?? item.name).slice(0, 80);
        await prisma.growthRecord.upsert({ where: { businessId_recordType_externalId: { businessId: business.id, recordType: "MENU_ITEM", externalId } }, create: { businessId: business.id, recordType: "MENU_ITEM", externalId, source: "PAANAGAM_POS_READ_ONLY", payload: item }, update: { source: "PAANAGAM_POS_READ_ONLY", payload: item, recordedAt: new Date() } });
        importedMenu++;
      }
      for (const item of (Array.isArray(daily.data) ? daily.data : [])) {
        const externalId = "paanagam-pos:daily:" + String(item.business_date);
        await prisma.growthRecord.upsert({ where: { businessId_recordType_externalId: { businessId: business.id, recordType: "DAILY_SALES", externalId } }, create: { businessId: business.id, recordType: "DAILY_SALES", externalId, source: "PAANAGAM_POS_READ_ONLY", payload: item }, update: { source: "PAANAGAM_POS_READ_ONLY", payload: item, recordedAt: new Date() } });
        importedDays++;
      }
      const now = new Date();
      await prisma.posIntegrationConnection.update({ where: { businessId: business.id }, data: { lastSyncedAt: now, lastStatus: "SYNCED", lastError: null } });
      return { success: true, importedMenu, importedSalesDays: importedDays, periodStart: dateOnly(from), periodEnd: dateOnly(to), syncedAt: now.toISOString(), note: "Read-only import. POS records were not modified." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "POS sync failed";
      await prisma.posIntegrationConnection.update({ where: { businessId: business.id }, data: { lastStatus: "ERROR", lastError: message.slice(0, 500) } });
      return reply.code(502).send({ error: message });
    }
  });
}
