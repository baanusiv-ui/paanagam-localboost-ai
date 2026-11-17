import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "./security.js";
import { findOwnedBusiness } from "./modules/businesses/access.js";

const POS_BASE = "https://puzbosqwkdgsozzhuszx.supabase.co/functions/v1/integration-api/api/v1/integration";
const keyBody = z.object({ apiKey: z.string().trim().min(20).max(300).regex(/^lb_[a-f0-9]+$/) });
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const POS_SOURCE = "PAANAGAM_POS_READ_ONLY";

type PosRecordType = "MENU_ITEM" | "DAILY_SALES" | "MENU_ITEM_SALES" | "ORDER_SUMMARY" | "PAYMENT_SUMMARY" | "INVENTORY_SNAPSHOT" | "POS_SYNC_STATUS";

export function assertPosBusinessIdentity(body: any, expectedBusinessId?: string) {
  if (!body || body.source !== "paanagam-pos" || body.api_version !== "v1") throw new Error("Unexpected POS API response");
  if (expectedBusinessId && body.business_id !== expectedBusinessId) throw new Error("POS business identity mismatch. Refusing cross-business import.");
  return body;
}

export function posRecordExternalId(kind: string, key: string) {
  return "paanagam-pos:" + kind + ":" + key;
}

function sourceEnvelope(body: any, record: unknown) {
  return {
    ...(record && typeof record === "object" && !Array.isArray(record) ? record as Record<string, unknown> : { value: record }),
    _source: {
      provider: body.source,
      apiVersion: body.api_version,
      businessId: body.business_id,
      branchId: body.branch_id ?? null,
      generatedAt: body.generated_at ?? null,
      dataUpdatedAt: body.data_updated_at ?? null,
      currency: body.currency ?? null,
      timezone: body.timezone ?? null,
      periodStart: body.period_start ?? null,
      periodEnd: body.period_end ?? null,
      coverage: body.coverage ?? null,
      notes: body.notes ?? null
    }
  };
}

async function upsertGrowthRecord(prisma: PrismaClient, businessId: string, recordType: PosRecordType, externalId: string, payload: unknown) {
  const safePayload = payload as any;
  await prisma.growthRecord.upsert({
    where: { businessId_recordType_externalId: { businessId, recordType, externalId } },
    create: { businessId, recordType, externalId, source: POS_SOURCE, payload: safePayload },
    update: { source: POS_SOURCE, payload: safePayload, recordedAt: new Date() }
  });
}

async function posGet(apiKey: string, path: string, expectedBusinessId?: string) {
  const url = new URL(POS_BASE + "/" + path);
  const response = await fetch(url, { method: "GET", headers: { authorization: "Bearer " + apiKey, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => null) as any;
  if (!response.ok) throw new Error(body?.error?.message || body?.error?.code || "POS API request failed (" + response.status + ")");
  return assertPosBusinessIdentity(body, expectedBusinessId);
}

async function posGetAll(apiKey: string, path: string, expectedBusinessId?: string) {
  const url = new URL(POS_BASE + "/" + path);
  const rows: unknown[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < 1000; page++) {
    const response = await fetch(url, { method: "GET", headers: { authorization: "Bearer " + apiKey, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => null) as any;
    if (!response.ok) throw new Error(body?.error?.message || body?.error?.code || "POS API request failed (" + response.status + ")");
    assertPosBusinessIdentity(body, expectedBusinessId);
    if (!Array.isArray(body.data)) throw new Error("Unexpected POS list response");
    rows.push(...body.data);
    const cursor = body.next_cursor;
    if (!cursor) return { ...body, data: rows, next_cursor: null };
    if (typeof cursor !== "string" || seen.has(cursor)) throw new Error("POS API returned an invalid or repeated pagination cursor");
    seen.add(cursor);
    url.searchParams.set("cursor", cursor);
  }
  throw new Error("POS API pagination exceeded the safety limit");
}

function parsedSourceDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function registerPosIntegrationRoutes(app: FastifyInstance, prisma: PrismaClient, requireUser: any) {
  app.get("/v1/businesses/:businessId/pos-integration", { preHandler: requireUser }, async (request: any, reply) => {
    const business = await findOwnedBusiness(prisma, request.userId, request.params.businessId);
    if (!business) return reply.code(404).send({ error: "Business not found" });
    const row = await prisma.posIntegrationConnection.findUnique({ where: { businessId: business.id } });
    return {
      connected: Boolean(row),
      lastTestedAt: row?.lastTestedAt ?? null,
      lastSyncedAt: row?.lastSyncedAt ?? null,
      lastSourceUpdatedAt: row?.lastSourceUpdatedAt ?? null,
      lastSyncVersion: row?.lastSyncVersion ?? null,
      lastSyncCounts: row?.lastSyncCounts ?? null,
      lastCoverage: row?.lastCoverage ?? null,
      dataStatus: row?.lastDataStatus ?? null,
      lastStatus: row?.lastStatus ?? "NOT_CONNECTED",
      lastError: row?.lastError ?? null,
      businessName: row?.posBusinessName ?? null
    };
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
      const result = await posGet(decryptSecret(row.apiKeyEncrypted), "sync/status", row.posBusinessId);
      const status = result.data?.status ?? "unknown";
      await prisma.posIntegrationConnection.update({ where: { businessId: business.id }, data: { lastTestedAt: new Date(), lastStatus: status === "stale" ? "STALE" : "CONNECTED", lastDataStatus: status, lastError: null } });
      return { connected: true, posStatus: status, dataUpdatedAt: result.data_updated_at ?? null, supportedModules: result.data?.supported_modules ?? [] };
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
    const fromDate = dateOnly(from), toDate = dateOnly(to);
    try {
      const range = "from=" + fromDate + "&to=" + toDate + "&limit=500";
      const [menu, daily, itemSales, orders, payments, inventory, status] = await Promise.all([
        posGetAll(key, "menu?limit=500", row.posBusinessId),
        posGetAll(key, "sales/daily?" + range, row.posBusinessId),
        posGetAll(key, "sales/items?" + range, row.posBusinessId),
        posGet(key, "orders/summary?" + range, row.posBusinessId),
        posGet(key, "payments/summary?" + range, row.posBusinessId),
        posGet(key, "inventory/summary", row.posBusinessId),
        posGet(key, "sync/status", row.posBusinessId)
      ]);

      const imported = { menu: 0, salesDays: 0, menuItemSales: 0, orderSummaries: 0, paymentSummaries: 0, inventorySnapshots: 0, syncStatus: 0 };
      for (const item of (Array.isArray(menu.data) ? menu.data : [])) {
        const keyPart = String(item.menu_item_id ?? item.id ?? item.name ?? "unknown").slice(0, 120);
        await upsertGrowthRecord(prisma, business.id, "MENU_ITEM", posRecordExternalId("menu", keyPart), item);
        imported.menu++;
      }
      for (const item of (Array.isArray(daily.data) ? daily.data : [])) {
        const businessDate = String(item.business_date ?? "unknown");
        await upsertGrowthRecord(prisma, business.id, "DAILY_SALES", posRecordExternalId("daily", businessDate), sourceEnvelope(daily, item));
        imported.salesDays++;
      }
      for (const item of (Array.isArray(itemSales.data) ? itemSales.data : [])) {
        const businessDate = String(item.business_date ?? fromDate + "_" + toDate);
        const itemKey = String(item.menu_item_id ?? item.item_id ?? item.id ?? item.item_name ?? item.name ?? "unknown").slice(0, 120);
        await upsertGrowthRecord(prisma, business.id, "MENU_ITEM_SALES", posRecordExternalId("item-sales", businessDate + ":" + itemKey), sourceEnvelope(itemSales, item));
        imported.menuItemSales++;
      }

      const summaryKey = fromDate + ":" + toDate;
      await upsertGrowthRecord(prisma, business.id, "ORDER_SUMMARY", posRecordExternalId("orders", summaryKey), sourceEnvelope(orders, orders.data));
      imported.orderSummaries++;
      await upsertGrowthRecord(prisma, business.id, "PAYMENT_SUMMARY", posRecordExternalId("payments", summaryKey), sourceEnvelope(payments, payments.data));
      imported.paymentSummaries++;

      const inventoryVersion = String(status.data?.version ?? inventory.data?.version ?? inventory.generated_at ?? inventory.data_updated_at ?? "latest");
      await upsertGrowthRecord(prisma, business.id, "INVENTORY_SNAPSHOT", posRecordExternalId("inventory", inventoryVersion), sourceEnvelope(inventory, inventory.data));
      imported.inventorySnapshots++;
      await upsertGrowthRecord(prisma, business.id, "POS_SYNC_STATUS", posRecordExternalId("sync-status", "latest"), sourceEnvelope(status, status.data));
      imported.syncStatus++;

      const now = new Date();
      const sourceUpdatedAt = parsedSourceDate(status.data_updated_at ?? daily.data_updated_at ?? null);
      const statusValue = String(status.data?.status ?? "unknown").toLowerCase();
      const staleByAge = sourceUpdatedAt ? now.getTime() - sourceUpdatedAt.getTime() > 24 * 60 * 60 * 1000 : true;
      const dataStatus = statusValue === "stale" || staleByAge ? "STALE" : statusValue === "ok" ? "OK" : "UNKNOWN";
      const counts = { ...imported, total: Object.values(imported).reduce((sum, value) => sum + value, 0) };
      await prisma.posIntegrationConnection.update({
        where: { businessId: business.id },
        data: {
          lastSyncedAt: now,
          lastSourceUpdatedAt: sourceUpdatedAt,
          lastSyncVersion: String(status.data?.version ?? status.version ?? "") || null,
          lastSyncCounts: counts,
          ...(daily.coverage ? { lastCoverage: daily.coverage } : {}),
          lastDataStatus: dataStatus,
          lastStatus: dataStatus === "STALE" ? "STALE" : "SYNCED",
          lastError: null
        }
      });
      return {
        success: true,
        imported,
        periodStart: fromDate,
        periodEnd: toDate,
        syncedAt: now.toISOString(),
        sourceUpdatedAt: sourceUpdatedAt?.toISOString() ?? null,
        dataStatus,
        coverage: daily.coverage ?? null,
        note: "Read-only import. POS records were not modified. Recipe, purchase-lot, expense and detailed stock-event exports are not yet available in the current POS integration API."
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "POS sync failed";
      await prisma.posIntegrationConnection.update({ where: { businessId: business.id }, data: { lastStatus: "ERROR", lastError: message.slice(0, 500) } });
      return reply.code(502).send({ error: message });
    }
  });
}
