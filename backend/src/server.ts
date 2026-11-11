import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { createHash } from "node:crypto";
import { EvidenceSource, Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { findOwnedBusiness } from "./modules/businesses/access.js";
import { recordBusinessActivity } from "./modules/activity/record.js";
import { createRequireUser } from "./modules/identity/auth.js";
import { env, corsOrigins } from "./env.js";
import { verifyAccessToken, encryptSecret, randomUrlToken, decryptSecret } from "./security.js";
import { buildAudit } from "./audit.js";
import { buildBusinessIntelligence } from "./intelligence.js";
import { generateLocalConsultant, getLocalAiStatus } from "./consultant.js";
import { generateLocalReviewReplyDraft } from "./review-replies.js";
import { generateLocalContentDraft } from "./content-drafts.js";
import { generateCampaignImage } from "./image-generation.js";
import { generateLocalKeywords } from "./local-seo.js";
import { normalizeGoogleReview, type GoogleReviewApiRecord } from "./google-reviews.js";
import { analyzeReviewThemes } from "./review-themes.js";
import { buildGrowthOverview } from "./growth-overview.js";
import { mergeGrowthActionTracking } from "./growth-action-tracking.js";
import { buildGrowthActionMeasurements } from "./growth-action-measurement.js";
import { calculateGrowthGoal, buildGrowthGoalHistory } from "./growth-goals.js";
import { buildGrowthPerformanceReport } from "./growth-performance-report.js";
import { buildMenuSalesIntelligence } from "./menu-sales-intelligence.js";
import { registerPosIntegrationRoutes } from "./pos-integration.js";

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
await app.register(helmet);
await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || corsOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Origin not allowed"), false);
  }
});
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

const requireUser = createRequireUser(async (token) => {
  const identity = await verifyAccessToken(token);
  const authUsers = await prisma.$queryRaw<Array<{ id: string; email: string; name: string | null; emailVerified: boolean }>>`
    SELECT "id", "email", "name", "emailVerified"
    FROM neon_auth."user"
    WHERE "id" = CAST(${identity.subject} AS uuid)
    LIMIT 1
  `;
  const authUser = authUsers[0];
  if (!authUser || !authUser.emailVerified || authUser.email.trim().toLowerCase() !== identity.email) {
    throw new Error("A verified Neon Auth account is required");
  }
  const bySubject = await prisma.user.findUnique({ where: { authSubject: identity.subject } });
  if (bySubject) return bySubject.id;

  const byEmail = await prisma.user.findUnique({ where: { email: authUser.email.trim().toLowerCase() } });
  if (byEmail) {
    if (byEmail.authSubject && byEmail.authSubject !== identity.subject) {
      throw new Error("This email is already linked to a different identity");
    }
    const linked = await prisma.user.update({
      where: { id: byEmail.id },
      data: { authSubject: identity.subject, ...(authUser.name ? { name: authUser.name } : {}) }
    });
    return linked.id;
  }

  const created = await prisma.user.create({
    data: {
      email: authUser.email.trim().toLowerCase(),
      authSubject: identity.subject,
      name: authUser.name,
      passwordHash: null
    }
  });
  return created.id;
});

app.decorateRequest("userId", null);
await registerPosIntegrationRoutes(app, prisma, requireUser);
app.get("/v1/me", { preHandler: requireUser }, async (request, reply) => {
  const user = await prisma.user.findUnique({
    where: { id: request.userId! },
    select: { id: true, email: true, name: true, createdAt: true }
  });
  if (!user) return reply.code(404).send({ error: "User not found" });
  return { user };
});

declare module "fastify" {
  interface FastifyRequest { userId: string | null }
}




async function googleAccessToken(businessId: string): Promise<string> {
  const connection = await prisma.googleConnection.findUnique({ where: { businessId } });
  if (!connection) throw new Error("Google Business Profile is not connected");
  if (connection.expiresAt && connection.expiresAt.getTime() > Date.now() + 60_000) {
    return decryptSecret(connection.accessTokenEncrypted);
  }
  if (!connection.refreshTokenEncrypted) throw new Error("Google authorisation expired. Reconnect the Google account.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: decryptSecret(connection.refreshTokenEncrypted),
      grant_type: "refresh_token"
    })
  });
  const data = await response.json() as { access_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error === "invalid_grant" ? "Google authorisation expired or was revoked. Reconnect the Google account." : "Google token refresh failed. Check OAuth settings and API access.");
  }
  await prisma.googleConnection.update({
    where: { businessId },
    data: {
      accessTokenEncrypted: encryptSecret(data.access_token),
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
      scope: data.scope ?? connection.scope
    }
  });
  return data.access_token;
}

async function googleGet<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: "Bearer " + accessToken } });
  const data = await response.json() as T & { error?: { message?: string; status?: string } };
  if (!response.ok) {
    const reason = data.error?.message || data.error?.status || "Google API request failed";
    throw new Error(reason);
  }
  return data;
}
async function googlePost<T>(url: string, accessToken: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: "Bearer " + accessToken, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json() as T & { error?: { message?: string; status?: string } };
  if (!response.ok) throw new Error(data.error?.message || data.error?.status || "Google Business Profile publishing failed");
  return data;
}

async function ownedBusiness(userId: string, businessId: string) {
  return findOwnedBusiness(prisma, userId, businessId);
}

async function recordActivity(input: {
  businessId: string; actorUserId: string; eventType: string; entityType: string;
  entityId?: string | null; summary: string; metadata?: Record<string, unknown>;
}) {
  return recordBusinessActivity(prisma, input);
}

app.get("/v1/businesses/:businessId/data-status", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });

  const [evidence, growthRecords, googleConnection] = await Promise.all([
    prisma.evidence.findMany({
      where: { businessId: business.id },
      select: { source: true, observedAt: true, expiresAt: true, verified: true },
      orderBy: { observedAt: "desc" },
      take: 500
    }),
    prisma.growthRecord.findMany({
      where: { businessId: business.id },
      select: { recordType: true, source: true, recordedAt: true },
      orderBy: { recordedAt: "desc" },
      take: 500
    }),
    prisma.googleConnection.findUnique({
      where: { businessId: business.id },
      select: { connectedAt: true, expiresAt: true, scope: true }
    })
  ]);

  const countBy = (items: Array<{ source: string }>) => items.reduce<Record<string, number>>((counts, item) => {
    counts[item.source] = (counts[item.source] || 0) + 1;
    return counts;
  }, {});
  const growthByType = growthRecords.reduce<Record<string, number>>((counts, item) => {
    counts[item.recordType] = (counts[item.recordType] || 0) + 1;
    return counts;
  }, {});
  const now = new Date();
  return {
    business: { id: business.id, displayName: business.displayName },
    generatedAt: now.toISOString(),
    google: {
      connectionSaved: Boolean(googleConnection),
      connectedAt: googleConnection?.connectedAt ?? null,
      accessTokenExpiresAt: googleConnection?.expiresAt ?? null,
      hasBusinessManageScope: Boolean(googleConnection?.scope.split(" ").includes("https://www.googleapis.com/auth/business.manage"))
    },
    evidence: {
      sampledCount: evidence.length,
      sourceCounts: countBy(evidence),
      verifiedCount: evidence.filter(item => item.verified).length,
      expiredCount: evidence.filter(item => item.expiresAt && item.expiresAt <= now).length,
      latestObservedAt: evidence[0]?.observedAt ?? null
    },
    growthRecords: {
      sampledCount: growthRecords.length,
      sourceCounts: countBy(growthRecords),
      typeCounts: growthByType,
      latestRecordedAt: growthRecords[0]?.recordedAt ?? null
    },
    limits: { sampledRecordsPerSection: 500, metricsAreNotExhaustiveWhenSampleLimitReached: evidence.length === 500 || growthRecords.length === 500 }
  };
});

const growthRecordType = z.enum(["MENU_ITEM", "DAILY_SALES", "RETENTION_SNAPSHOT", "CAMPAIGN_DRAFT", "COMPETITOR", "LOCAL_KEYWORD", "REVIEW_ITEM", "GOOGLE_CONTENT"]);

app.post("/v1/businesses/:businessId/local-seo/keywords", {
  preHandler: requireUser,
  config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
}, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({
    locality: z.string().trim().min(1).max(120),
    services: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
    language: z.enum(["Tamil", "English", "Tamil + English"]).default("Tamil + English")
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Enter a locality and at least one product or service." });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });

  const suggestions = generateLocalKeywords({
    businessName: business.displayName,
    category: business.category ?? undefined,
    locality: body.data.locality,
    services: body.data.services,
    language: body.data.language
  });
  const generatedAt = new Date();
  await Promise.all(suggestions.map(async (item) => {
    const externalId = "local-seo:" + createHash("sha256").update(body.data.locality.toLowerCase() + "|" + item.keyword.toLowerCase()).digest("hex").slice(0, 40);
    await prisma.growthRecord.upsert({
      where: { businessId_recordType_externalId: { businessId: business.id, recordType: "LOCAL_KEYWORD", externalId } },
      create: {
        businessId: business.id,
        recordType: "LOCAL_KEYWORD",
        externalId,
        source: "RULES_GENERATED",
        payload: { ...item, locality: body.data.locality, generatedAt: generatedAt.toISOString() } as Prisma.InputJsonValue,
        recordedAt: generatedAt
      },
      update: {
        source: "RULES_GENERATED",
        payload: { ...item, locality: body.data.locality, generatedAt: generatedAt.toISOString() } as Prisma.InputJsonValue,
        recordedAt: generatedAt
      }
    });
  }));
  return {
    business: { id: business.id, displayName: business.displayName },
    generatedAt: generatedAt.toISOString(),
    methodology: "Template-based suggestions from owner-entered products/services and locality. No search-volume, ranking, or competition data is claimed.",
    suggestions
  };
});


app.post("/v1/businesses/:businessId/creative-assets", {
  preHandler: requireUser, bodyLimit: 6 * 1024 * 1024,
  config: { rateLimit: { max: 12, timeWindow: "1 minute" } }
}, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({ fileName: z.string().trim().min(1).max(160), mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]), dataBase64: z.string().min(16).max(5_600_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/), altText: z.string().trim().max(240).optional() }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Provide a PNG, JPEG or WebP image and a valid file name." });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const bytes = Buffer.from(body.data.dataBase64, "base64");
  if (!bytes.length || bytes.length > 4 * 1024 * 1024 || bytes.toString("base64") !== body.data.dataBase64) return reply.code(413).send({ error: "Image must be a valid base64 file no larger than 4 MB." });
  const png = body.data.mimeType === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = body.data.mimeType === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = body.data.mimeType === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpeg && !webp) return reply.code(415).send({ error: "Image content does not match its declared PNG, JPEG or WebP type." });
  const usage = await prisma.creativeAsset.aggregate({ where: { businessId: business.id }, _count: { _all: true }, _sum: { byteSize: true } });
  if (usage._count._all >= 100 || (usage._sum.byteSize ?? 0) + bytes.length > 100 * 1024 * 1024) return reply.code(413).send({ error: "Business creative library limit reached (100 assets or 100 MB)." });
  const fileName = body.data.fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "campaign-artwork";
  const asset = await prisma.creativeAsset.create({ data: { businessId: business.id, fileName, mimeType: body.data.mimeType, byteSize: bytes.length, data: bytes, altText: body.data.altText || null }, select: { id: true, fileName: true, mimeType: true, byteSize: true, altText: true, createdAt: true } });
  await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "CREATIVE_ASSET_UPLOADED", entityType: "CREATIVE_ASSET", entityId: asset.id, summary: "Campaign artwork saved to the business creative library", metadata: { mimeType: asset.mimeType, byteSize: asset.byteSize } });
  return reply.code(201).send({ asset, contentPath: "/v1/businesses/" + business.id + "/creative-assets/" + asset.id + "/content", storage: "BUSINESS_DATABASE" });
});

app.get("/v1/businesses/:businessId/creative-assets", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(request.query);
  if (!params.success || !query.success) return reply.code(400).send({ error: "Invalid creative asset query" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const assets = await prisma.creativeAsset.findMany({ where: { businessId: business.id }, select: { id: true, fileName: true, mimeType: true, byteSize: true, altText: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: query.data.limit });
  return { assets, storage: "BUSINESS_DATABASE" };
});

app.get("/v1/businesses/:businessId/creative-assets/:assetId/content", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1), assetId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid creative asset identifier" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const asset = await prisma.creativeAsset.findFirst({ where: { id: params.data.assetId, businessId: business.id }, select: { data: true, mimeType: true } });
  if (!asset) return reply.code(404).send({ error: "Creative asset not found" });
  return reply.header("content-type", asset.mimeType).header("content-length", String(asset.data.length)).header("content-disposition", "inline").header("cache-control", "private, no-store").header("x-content-type-options", "nosniff").send(Buffer.from(asset.data));
});

app.delete("/v1/businesses/:businessId/creative-assets/:assetId", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1), assetId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid creative asset identifier" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const asset = await prisma.creativeAsset.findFirst({ where: { id: params.data.assetId, businessId: business.id }, select: { id: true, fileName: true, byteSize: true } });
  if (!asset) return reply.code(404).send({ error: "Creative asset not found" });
  await prisma.creativeAsset.delete({ where: { id: asset.id } });
  await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "CREATIVE_ASSET_DELETED", entityType: "CREATIVE_ASSET", entityId: asset.id, summary: "Campaign artwork removed from the business creative library", metadata: { fileName: asset.fileName, byteSize: asset.byteSize } });
  return reply.code(204).send();
});
app.get("/v1/businesses/:businessId/growth-records", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const query = z.object({
    type: growthRecordType.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: z.string().min(1).max(64).optional()
  }).safeParse(request.query);
  if (!params.success || !query.success) return reply.code(400).send({ error: "Invalid growth record query" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  if (query.data.cursor) {
    const cursorExists = await prisma.growthRecord.findFirst({ where: { id: query.data.cursor, businessId: business.id }, select: { id: true } });
    if (!cursorExists) return reply.code(400).send({ error: "Invalid growth record cursor" });
  }
  const records = await prisma.growthRecord.findMany({
    where: { businessId: business.id, ...(query.data.type ? { recordType: query.data.type } : {}) },
    orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {}),
    take: query.data.limit
  });
  return { records, nextCursor: records.length === query.data.limit ? records[records.length - 1]?.id ?? null : null, source: "OWNER_ENTERED", storage: "SERVER" };
});

app.post("/v1/businesses/:businessId/growth-records", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({
    type: growthRecordType,
    externalId: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._:-]+$/),
    payload: z.record(z.unknown()),
    recordedAt: z.coerce.date().optional()
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid growth record", details: body.success ? undefined : body.error.flatten() });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  if (Buffer.byteLength(JSON.stringify(body.data.payload), "utf8") > 64 * 1024) {
    return reply.code(413).send({ error: "Growth record payload exceeds 64 KB" });
  }
  const existingRecord = await prisma.growthRecord.findUnique({
    where: { businessId_recordType_externalId: { businessId: business.id, recordType: body.data.type, externalId: body.data.externalId } },
    select: { id: true }
  });
  const record = await prisma.growthRecord.upsert({
    where: {
      businessId_recordType_externalId: {
        businessId: business.id,
        recordType: body.data.type,
        externalId: body.data.externalId
      }
    },
    create: {
      businessId: business.id,
      recordType: body.data.type,
      externalId: body.data.externalId,
      payload: body.data.payload as Prisma.InputJsonValue,
      recordedAt: body.data.recordedAt
    },
    update: {
      payload: body.data.payload as Prisma.InputJsonValue,
      recordedAt: body.data.recordedAt ?? new Date()
    }
  });
  await recordActivity({
    businessId: business.id, actorUserId: request.userId!,
    eventType: existingRecord ? "GROWTH_RECORD_UPDATED" : "GROWTH_RECORD_CREATED",
    entityType: body.data.type, entityId: record.id,
    summary: body.data.type.replaceAll("_", " ").toLowerCase() + (existingRecord ? " record updated" : " record added"),
    metadata: { recordType: body.data.type, externalId: body.data.externalId, source: "OWNER_ENTERED" }
  });
  return reply.code(200).send({ record, source: "OWNER_ENTERED", storage: "SERVER" });
});

app.delete("/v1/businesses/:businessId/growth-records/:recordId", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1), recordId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid growth record identifier" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const existingRecord = await prisma.growthRecord.findFirst({ where: { id: params.data.recordId, businessId: business.id }, select: { id: true, recordType: true, externalId: true } });
  if (!existingRecord) return reply.code(404).send({ error: "Growth record not found" });
  await prisma.growthRecord.delete({ where: { id: existingRecord.id } });
  await recordActivity({
    businessId: business.id, actorUserId: request.userId!, eventType: "GROWTH_RECORD_DELETED",
    entityType: existingRecord.recordType, entityId: existingRecord.id,
    summary: existingRecord.recordType.replaceAll("_", " ").toLowerCase() + " record deleted",
    metadata: { recordType: existingRecord.recordType, externalId: existingRecord.externalId }
  });
  return reply.code(204).send();
});



app.get("/v1/businesses/:businessId/intelligence", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const records = await prisma.growthRecord.findMany({
    where: { businessId: business.id, recordType: { in: ["MENU_ITEM", "DAILY_SALES", "RETENTION_SNAPSHOT"] } },
    orderBy: [{ recordedAt: "asc" }, { createdAt: "asc" }],
    take: 500
  });
  const report = buildBusinessIntelligence(records.map(record => ({
    id: record.id,
    recordType: record.recordType,
    payload: record.payload as unknown as Record<string, unknown>,
    recordedAt: record.recordedAt,
    source: record.source
  })));
  return { business: { id: business.id, displayName: business.displayName }, ...report };
});
app.get("/v1/businesses/:businessId/menu-sales-intelligence", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const query = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).safeParse(request.query);
  if (!params.success || !query.success || (query.data.from && query.data.to && query.data.from > query.data.to)) return reply.code(400).send({ error: "Invalid menu and sales date range" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const records = await prisma.growthRecord.findMany({
    where: { businessId: business.id, recordType: { in: ["MENU_ITEM", "DAILY_SALES"] } },
    orderBy: [{ recordedAt: "asc" }, { createdAt: "asc" }],
    take: 5000
  });
  const report = buildMenuSalesIntelligence(records.map(record => ({
    id: record.id, recordType: record.recordType as "MENU_ITEM" | "DAILY_SALES",
    payload: record.payload as unknown as Record<string, unknown>, recordedAt: record.recordedAt, source: record.source
  })), query.data.from, query.data.to);
  return { business: { id: business.id, displayName: business.displayName }, ...report, limits: { maxRecords: 5000, mayBeIncomplete: records.length === 5000 } };
});

app.get("/v1/ai/status", { preHandler: requireUser }, async () => getLocalAiStatus());

app.post("/v1/businesses/:businessId/consultant", {
  preHandler: requireUser,
  config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
}, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({ language: z.enum(["Tamil", "English", "Tamil + English"]).default("Tamil + English") }).safeParse(request.body ?? {});
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid consultant request" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const records = await prisma.growthRecord.findMany({
    where: { businessId: business.id, recordType: { in: ["MENU_ITEM", "DAILY_SALES", "RETENTION_SNAPSHOT"] } },
    orderBy: [{ recordedAt: "asc" }, { createdAt: "asc" }],
    take: 500
  });
  const report = buildBusinessIntelligence(records.map(record => ({
    id: record.id,
    recordType: record.recordType,
    payload: record.payload as unknown as Record<string, unknown>,
    recordedAt: record.recordedAt,
    source: record.source
  })));
  try {
    const consultant = await generateLocalConsultant(report, body.data.language);
    return { business: { id: business.id, displayName: business.displayName }, reportEngine: report.engine, ...consultant };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local AI consultant is unavailable";
    request.log.warn({ message }, "Local AI consultant request failed");
    return reply.code(503).send({ error: message });
  }
});


app.post("/v1/businesses/:businessId/reviews/reply-draft", {
  preHandler: requireUser,
  config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
}, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({
    reviewText: z.string().trim().min(1).max(4000),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    language: z.enum(["Tamil", "English", "Tamil + English"]).default("Tamil + English"),
    tone: z.enum(["WARM", "PROFESSIONAL", "APOLOGETIC"]).default("WARM")
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid review reply request" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  try {
    const draft = await generateLocalReviewReplyDraft({
      businessName: business.displayName,
      reviewText: body.data.reviewText,
      rating: body.data.rating,
      language: body.data.language,
      tone: body.data.tone
    });
    return { business: { id: business.id, displayName: business.displayName }, ...draft };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local AI review reply generation is unavailable";
    request.log.warn({ message }, "Local AI review reply generation failed");
    return reply.code(503).send({ error: message });
  }
});

app.post("/v1/businesses/:businessId/google-content/draft", {
  preHandler: requireUser,
  config: { rateLimit: { max: 5, timeWindow: "1 minute" } }
}, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({
    topic: z.string().trim().min(1).max(300),
    offer: z.string().trim().max(500).optional(),
    publishDate: z.string().trim().max(30).optional(),
    language: z.enum(["Tamil", "English", "Tamil + English"]).default("Tamil + English"),
    format: z.enum(["SQUARE", "PORTRAIT", "STORY"]).default("SQUARE"),
    tone: z.enum(["WARM", "TRADITIONAL", "OFFER_LED"]).default("WARM")
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid Google content draft request" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  try {
    const draft = await generateLocalContentDraft({
      businessName: business.displayName,
      topic: body.data.topic,
      offer: body.data.offer,
      publishDate: body.data.publishDate,
      language: body.data.language,
      format: body.data.format,
      tone: body.data.tone
    });
    return { business: { id: business.id, displayName: business.displayName }, ...draft };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local AI content drafting is unavailable";
    request.log.warn({ message }, "Local AI Google content drafting failed");
    return reply.code(503).send({ error: message });
  }
});

app.post("/v1/businesses/:businessId/creative/image", {
  preHandler: requireUser,
  config: { rateLimit: { max: 3, timeWindow: "1 minute" } }
}, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({
    topic: z.string().trim().min(1).max(300),
    offer: z.string().trim().max(500).optional(),
    creativeBrief: z.string().trim().max(1200).optional(),
    language: z.enum(["Tamil", "English", "Tamil + English"]).default("Tamil + English"),
    format: z.enum(["SQUARE", "PORTRAIT", "STORY"]).default("SQUARE")
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid creative image request" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  try {
    const image = await generateCampaignImage({
      businessName: business.displayName,
      topic: body.data.topic,
      offer: body.data.offer,
      creativeBrief: body.data.creativeBrief,
      language: body.data.language,
      format: body.data.format
    });
    return { business: { id: business.id, displayName: business.displayName }, ...image };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campaign image generation is unavailable";
    request.log.warn({ message, businessId: business.id }, "Campaign image generation failed");
    return reply.code(503).send({ error: message });
  }
});

app.get("/health", async () => ({ ok: true, service: "localboost-api", version: "0.1.0" }));

app.get("/v1/businesses", { preHandler: requireUser }, async (request) => {
  return prisma.business.findMany({
    where: { ownerId: request.userId! },
    select: { id: true, displayName: true, category: true, address: true, website: true, phone: true, createdAt: true, googleConnection: { select: { connectedAt: true, scope: true } } },
    orderBy: { createdAt: "desc" }
  });
});

app.post("/v1/businesses", { preHandler: requireUser }, async (request, reply) => {
  const parsed = z.object({
    displayName: z.string().trim().min(1).max(160),
    category: z.string().trim().max(120).optional(),
    address: z.string().trim().max(500).optional(),
    website: z.string().url().max(500).optional(),
    phone: z.string().trim().max(40).optional(),
    countryCode: z.string().length(2).default("IN")
  }).safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid business details", details: parsed.error.flatten() });
  const business = await prisma.business.create({ data: { ...parsed.data, ownerId: request.userId! } });
  const initialEvidence = [
    { category: "business_name", value: { text: business.displayName } },
    ...(business.category ? [{ category: "primary_category", value: { text: business.category } }] : []),
    ...(business.address ? [{ category: "address", value: { text: business.address } }] : []),
    ...(business.phone ? [{ category: "phone", value: { text: business.phone } }] : []),
    ...(business.website ? [{ category: "website", value: { text: business.website } }] : [])
  ];
  await prisma.evidence.createMany({
    data: initialEvidence.map((item) => ({
      businessId: business.id,
      category: item.category,
      value: item.value,
      source: EvidenceSource.OWNER_CONFIRMED,
      sourceLabel: "Entered by the business owner during setup",
      verified: true
    }))
  });
  return reply.code(201).send({ business });
});

app.post("/v1/businesses/:businessId/evidence", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({
    category: z.string().trim().min(1).max(80).regex(/^[a-z0-9_]+$/),
    value: z.unknown(),
    source: z.nativeEnum(EvidenceSource),
    sourceLabel: z.string().trim().max(160).optional(),
    verified: z.boolean().default(false),
    observedAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional()
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid evidence details" });
  if (body.data.source === EvidenceSource.GOOGLE_API) return reply.code(403).send({ error: "Google API evidence can only be created by the trusted integration service" });
  if (body.data.source === EvidenceSource.DEMO && body.data.verified) return reply.code(400).send({ error: "Demo evidence cannot be marked verified" });
  if (body.data.source === EvidenceSource.PUBLIC_OBSERVATION && body.data.verified) return reply.code(400).send({ error: "Public observations cannot be marked owner-verified or API-verified" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const evidence = await prisma.evidence.create({
    data: {
      businessId: business.id,
      category: body.data.category,
      value: body.data.value as Prisma.InputJsonValue,
      source: body.data.source,
      sourceLabel: body.data.sourceLabel,
      verified: body.data.verified,
      observedAt: body.data.observedAt,
      expiresAt: body.data.expiresAt
    }
  });
  return reply.code(201).send({ evidence });
});

app.get("/v1/businesses/:businessId/evidence", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  if (!(await ownedBusiness(request.userId!, params.data.businessId))) return reply.code(404).send({ error: "Business not found" });
  return prisma.evidence.findMany({
    where: { businessId: params.data.businessId },
    orderBy: { observedAt: "desc" },
    select: { id: true, category: true, value: true, source: true, sourceLabel: true, verified: true, observedAt: true, expiresAt: true }
  });
});

app.post("/v1/businesses/:businessId/audits", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  if (!(await ownedBusiness(request.userId!, params.data.businessId))) return reply.code(404).send({ error: "Business not found" });
  const evidence = await prisma.evidence.findMany({ where: { businessId: params.data.businessId } });
  const result = buildAudit(evidence);
  const audit = await prisma.audit.create({
    data: {
      businessId: params.data.businessId,
      status: result.status,
      completeness: result.completeness,
      findings: result.findings as unknown as Prisma.InputJsonValue,
      evidenceIds: result.evidenceIds
    }
  });
  return reply.code(201).send({ audit, interpretation: result.scoreMeaning, engine: result.engine });
});

app.get("/v1/businesses/:businessId/audits", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  if (!(await ownedBusiness(request.userId!, params.data.businessId))) return reply.code(404).send({ error: "Business not found" });
  return prisma.audit.findMany({ where: { businessId: params.data.businessId }, orderBy: { createdAt: "desc" } });
});

app.get("/v1/businesses/:businessId/google", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  if (!(await ownedBusiness(request.userId!, params.data.businessId))) return reply.code(404).send({ error: "Business not found" });
  const connection = await prisma.googleConnection.findUnique({
    where: { businessId: params.data.businessId },
    select: { scope: true, connectedAt: true, expiresAt: true, updatedAt: true }
  });
  return { connected: Boolean(connection), connection };
});

app.post("/v1/google/connect/:businessId/url", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return reply.code(503).send({ error: "Google OAuth is not configured. Add credentials to the deployment environment first." });
  const state = randomUrlToken();
  const verifier = randomUrlToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await prisma.oAuthState.create({
    data: { state, codeVerifier: verifier, userId: request.userId!, businessId: business.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) }
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/business.manage",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString();
  return { authorizationUrl: url.toString() };
});


app.get("/v1/businesses/:businessId/google/accounts", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  if (!(await ownedBusiness(request.userId!, params.data.businessId))) return reply.code(404).send({ error: "Business not found" });
  try {
    const accessToken = await googleAccessToken(params.data.businessId);
    const result = await googleGet<{ accounts?: Array<{ name?: string; accountName?: string; type?: string; role?: string; permissionLevel?: string }> }>(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20", accessToken
    );
    return { accounts: (result.accounts ?? []).map(account => ({
      name: account.name, accountName: account.accountName, type: account.type,
      role: account.role, permissionLevel: account.permissionLevel
    })) };
  } catch (error) {
    request.log.warn({ error: error instanceof Error ? error.message : "unknown" }, "Google accounts list failed");
    return reply.code(502).send({ error: error instanceof Error ? error.message : "Could not list Google accounts" });
  }
});

app.get("/v1/businesses/:businessId/google/locations", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const query = z.object({ accountName: z.string().regex(/^accounts\/[A-Za-z0-9_-]+$/) }).safeParse(request.query);
  if (!params.success || !query.success) return reply.code(400).send({ error: "A valid Google account is required" });
  if (!(await ownedBusiness(request.userId!, params.data.businessId))) return reply.code(404).send({ error: "Business not found" });
  try {
    const accessToken = await googleAccessToken(params.data.businessId);
    const accounts = await googleGet<{ accounts?: Array<{ name?: string }> }>(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20", accessToken
    );
    if (!(accounts.accounts ?? []).some(account => account.name === query.data.accountName)) {
      return reply.code(403).send({ error: "This Google account is not accessible to the connected user" });
    }
    const locations: Array<Record<string, unknown>> = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page++) {
      const url = new URL("https://mybusinessbusinessinformation.googleapis.com/v1/" + query.data.accountName + "/locations");
      url.searchParams.set("readMask", "name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,categories");
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const result = await googleGet<{ locations?: Array<Record<string, unknown>>; nextPageToken?: string }>(url.toString(), accessToken);
      locations.push(...(result.locations ?? []));
      pageToken = result.nextPageToken;
      if (!pageToken) break;
    }
    return { locations };
  } catch (error) {
    request.log.warn({ error: error instanceof Error ? error.message : "unknown" }, "Google locations list failed");
    return reply.code(502).send({ error: error instanceof Error ? error.message : "Could not list Google locations" });
  }
});


app.post("/v1/businesses/:businessId/google-media", {
  preHandler: requireUser,
  bodyLimit: 6 * 1024 * 1024,
  config: { rateLimit: { max: 4, timeWindow: "1 minute" } }
}, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({
    fileName: z.string().trim().min(1).max(120),
    mimeType: z.enum(["image/jpeg", "image/png"]),
    imageBase64: z.string().min(16).max(5_600_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
    category: z.enum(["PROFILE", "COVER"])
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Choose a valid JPG or PNG image and profile photo category." });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const connection = await prisma.googleConnection.findUnique({ where: { businessId: business.id } });
  if (!connection?.googleAccountId || !connection.googleLocationResourceName) return reply.code(409).send({ error: "Connect Google and import the selected verified Business Profile location first." });
  const bytes = Buffer.from(body.data.imageBase64, "base64");
  if (!bytes.length || bytes.length > 4 * 1024 * 1024 || bytes.toString("base64") !== body.data.imageBase64) return reply.code(413).send({ error: "Image must be valid and no larger than 4 MB." });
  const jpeg = body.data.mimeType === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = body.data.mimeType === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (!jpeg && !png) return reply.code(415).send({ error: "Image bytes do not match the selected JPG or PNG format." });
  try {
    const accessToken = await googleAccessToken(business.id);
    const parent = connection.googleAccountId + "/" + connection.googleLocationResourceName;
    const start = await googlePost<{ resourceName?: string }>(
      "https://mybusiness.googleapis.com/v4/" + parent + "/media:startUpload", accessToken, {}
    );
    if (!start.resourceName) throw new Error("Google did not return an upload resource.");
    const uploadResponse = await fetch("https://mybusiness.googleapis.com/upload/v1/media/" + encodeURIComponent(start.resourceName) + "?upload_type=media", {
      method: "POST",
      headers: { authorization: "Bearer " + accessToken, "content-type": body.data.mimeType },
      body: new Uint8Array(bytes)
    });
    if (!uploadResponse.ok) {
      const uploadError = await uploadResponse.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(uploadError.error?.message || "Google image upload failed.");
    }
    const media = await googlePost<{ name?: string; mediaFormat?: string; googleUrl?: string; locationAssociation?: { category?: string } }>(
      "https://mybusiness.googleapis.com/v4/" + parent + "/media", accessToken,
      { mediaFormat: "PHOTO", locationAssociation: { category: body.data.category }, dataRef: { resourceName: start.resourceName } }
    );
    const expectedCategory = body.data.category;
    const confirmedCategory = media.locationAssociation?.category ?? (expectedCategory === "PROFILE" ? "PROFILE" : undefined);
    if (!media.name || confirmedCategory !== expectedCategory) throw new Error("Google did not confirm the requested profile photo category.");
    await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: expectedCategory === "PROFILE" ? "GBP_LOGO_UPLOADED" : "GBP_COVER_UPLOADED", entityType: "GBP_MEDIA", entityId: media.name, summary: expectedCategory === "PROFILE" ? "Owner uploaded a Google Business Profile logo/profile photo" : "Owner uploaded a Google Business Profile cover photo", metadata: { category: expectedCategory, fileName: body.data.fileName, mimeType: body.data.mimeType } });
    return reply.code(201).send({ uploaded: true, category: confirmedCategory, mediaName: media.name, googleUrl: media.googleUrl ?? null, message: "Google accepted the profile image." });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Google Business Profile image upload failed";
    request.log.warn({ error: reason }, "Google Business Profile media upload failed");
    return reply.code(502).send({ error: reason });
  }
});

// Google Business Profile posts use a separate approval queue. No Google write occurs before explicit owner approval and publish action.
app.post("/v1/businesses/:businessId/google-posts/draft", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({
    summary: z.string().trim().min(1).max(1500),
    assetId: z.string().min(1).optional(),
    languageCode: z.string().trim().min(2).max(12).default("ta")
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Enter a valid Google post (maximum 1,500 characters)." });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const connection = await prisma.googleConnection.findUnique({ where: { businessId: business.id } });
  if (!connection?.googleAccountId || !connection.googleLocationResourceName) return reply.code(409).send({ error: "Connect Google and import the selected verified Business Profile location first." });
  let assetId: string | null = null;
  if (body.data.assetId) {
    const asset = await prisma.creativeAsset.findFirst({ where: { id: body.data.assetId, businessId: business.id }, select: { id: true, mimeType: true } });
    if (!asset) return reply.code(404).send({ error: "Creative image not found in this business workspace." });
    if (!["image/jpeg", "image/png"].includes(asset.mimeType)) return reply.code(415).send({ error: "Google post artwork must be JPEG or PNG." });
    assetId = asset.id;
  }
  const id = "gbp-post:" + randomUrlToken(18);
  const post = await prisma.growthRecord.create({
    data: { businessId: business.id, recordType: "GOOGLE_CONTENT", externalId: id, source: "OWNER_DRAFT", payload: {
      kind: "GBP_LOCAL_POST", summary: body.data.summary, languageCode: body.data.languageCode,
      assetId, status: "DRAFT", createdAt: new Date().toISOString()
    } }
  });
  await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "GBP_POST_DRAFT_CREATED", entityType: "GBP_POST", entityId: post.id, summary: "Google Business Profile post draft created; not published", metadata: { hasImage: Boolean(assetId) } });
  return reply.code(201).send({ post });
});

app.get("/v1/businesses/:businessId/google-posts", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const posts = await prisma.growthRecord.findMany({ where: { businessId: business.id, recordType: "GOOGLE_CONTENT", externalId: { startsWith: "gbp-post:" } }, orderBy: { createdAt: "desc" }, take: 50 });
  return { posts };
});

app.post("/v1/businesses/:businessId/google-posts/:postId/approve", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1), postId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid Google post identifier" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const post = await prisma.growthRecord.findFirst({ where: { id: params.data.postId, businessId: business.id, recordType: "GOOGLE_CONTENT", externalId: { startsWith: "gbp-post:" } } });
  if (!post) return reply.code(404).send({ error: "Google post draft not found" });
  const payload = post.payload as Record<string, unknown>;
  if (payload.status !== "DRAFT" && payload.status !== "REJECTED" && payload.status !== "FAILED") return reply.code(409).send({ error: "Only draft, rejected or failed Google posts can be approved." });
  const updated = await prisma.growthRecord.update({ where: { id: post.id }, data: { payload: { ...payload, status: "APPROVED", approvedAt: new Date().toISOString(), approvedByUserId: request.userId } as Prisma.InputJsonValue } });
  await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "GBP_POST_APPROVED", entityType: "GBP_POST", entityId: post.id, summary: "Owner explicitly approved a Google Business Profile post", metadata: {} });
  return { post: updated, publishingStarted: false };
});

app.post("/v1/businesses/:businessId/google-posts/:postId/reject", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1), postId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid Google post identifier" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const post = await prisma.growthRecord.findFirst({ where: { id: params.data.postId, businessId: business.id, recordType: "GOOGLE_CONTENT", externalId: { startsWith: "gbp-post:" } } });
  if (!post) return reply.code(404).send({ error: "Google post draft not found" });
  const payload = post.payload as Record<string, unknown>;
  if (payload.status === "PUBLISHED" || payload.status === "PUBLISHING") return reply.code(409).send({ error: "A published or publishing post cannot be rejected." });
  const updated = await prisma.growthRecord.update({ where: { id: post.id }, data: { payload: { ...payload, status: "REJECTED", approvedAt: null, approvedByUserId: null } as Prisma.InputJsonValue } });
  await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "GBP_POST_REJECTED", entityType: "GBP_POST", entityId: post.id, summary: "Owner rejected a Google Business Profile post", metadata: {} });
  return { post: updated, rejected: true };
});

app.post("/v1/businesses/:businessId/google-posts/:postId/publish", { preHandler: requireUser, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1), postId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid Google post identifier" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const post = await prisma.growthRecord.findFirst({ where: { id: params.data.postId, businessId: business.id, recordType: "GOOGLE_CONTENT", externalId: { startsWith: "gbp-post:" } } });
  if (!post) return reply.code(404).send({ error: "Google post draft not found" });
  const payload = post.payload as Record<string, unknown>;
  if (payload.status !== "APPROVED" || payload.approvedByUserId !== request.userId) return reply.code(409).send({ error: "Only the exact post approved by this owner can be published." });
  const connection = await prisma.googleConnection.findUnique({ where: { businessId: business.id } });
  if (!connection?.googleAccountId || !connection.googleLocationResourceName) return reply.code(409).send({ error: "Select and import the verified Google Business Profile location first." });
  const claimed = await prisma.growthRecord.updateMany({ where: { id: post.id, businessId: business.id }, data: { payload: { ...payload, status: "PUBLISHING" } as Prisma.InputJsonValue } });
  if (!claimed.count) return reply.code(409).send({ error: "This post is already being processed." });
  let shareToken: string | null = null;
  try {
    const accessToken = await googleAccessToken(business.id);
    const body: Record<string, unknown> = { languageCode: String(payload.languageCode || "ta"), summary: String(payload.summary), topicType: "STANDARD" };
    if (typeof payload.assetId === "string") {
      const asset = await prisma.creativeAsset.findFirst({ where: { id: payload.assetId, businessId: business.id } });
      if (!asset) throw new Error("The approved post image is no longer available.");
      if (!env.META_PUBLIC_API_BASE_URL) throw new Error("Configure the public HTTPS API base URL before publishing an image with a Google post.");
      shareToken = randomUrlToken(32);
      await prisma.metaMediaShare.create({ data: { token: shareToken, businessId: business.id, assetId: asset.id, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) } });
      body.media = [{ mediaFormat: "PHOTO", sourceUrl: env.META_PUBLIC_API_BASE_URL.replace(/\/$/, "") + "/v1/meta/media/" + shareToken }];
    }
    const resource = connection.googleAccountId + "/" + connection.googleLocationResourceName;
    const result = await googlePost<{ name?: string; state?: string }>("https://mybusiness.googleapis.com/v4/" + resource + "/localPosts", accessToken, body);
    const updated = await prisma.growthRecord.update({ where: { id: post.id }, data: { payload: { ...payload, status: "PUBLISHED", googlePostName: result.name ?? null, publishedAt: new Date().toISOString(), publishError: null } as Prisma.InputJsonValue } });
    await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "GBP_POST_PUBLISHED", entityType: "GBP_POST", entityId: post.id, summary: "Owner-approved Google Business Profile post published", metadata: { googlePostName: result.name ?? null } });
    return { post: updated, published: true, googlePostName: result.name ?? null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Google Business Profile publishing failed";
    await prisma.growthRecord.update({ where: { id: post.id }, data: { payload: { ...payload, status: "FAILED", publishError: reason.slice(0, 500) } as Prisma.InputJsonValue } });
    await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "GBP_POST_PUBLISH_FAILED", entityType: "GBP_POST", entityId: post.id, summary: "Google Business Profile publishing failed; owner action is required", metadata: { reason: reason.slice(0, 240) } });
    return reply.code(502).send({ error: reason });
  }
});

app.post("/v1/businesses/:businessId/google/import", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({
    accountName: z.string().regex(/^accounts\/[A-Za-z0-9_-]+$/),
    locationName: z.string().regex(/^locations\/[A-Za-z0-9_-]+$/)
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Select a valid Google account and business location" });
  if (!(await ownedBusiness(request.userId!, params.data.businessId))) return reply.code(404).send({ error: "Business not found" });
  try {
    const accessToken = await googleAccessToken(params.data.businessId);
    const accounts = await googleGet<{ accounts?: Array<{ name?: string }> }>(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20", accessToken
    );
    if (!(accounts.accounts ?? []).some(account => account.name === body.data.accountName)) {
      return reply.code(403).send({ error: "This Google account is not accessible to the connected user" });
    }
    const listUrl = new URL("https://mybusinessbusinessinformation.googleapis.com/v1/" + body.data.accountName + "/locations");
    listUrl.searchParams.set("readMask", "name");
    listUrl.searchParams.set("pageSize", "100");
    let nextPage: string | undefined;
    let found = false;
    for (let page = 0; page < 10; page++) {
      const result = await googleGet<{ locations?: Array<{ name?: string }>; nextPageToken?: string }>(listUrl.toString(), accessToken);
      if ((result.locations ?? []).some(location => location.name === body.data.locationName)) { found = true; break; }
      nextPage = result.nextPageToken;
      if (!nextPage) break;
      listUrl.searchParams.set("pageToken", nextPage);
    }
    if (!found) return reply.code(404).send({ error: "The selected location is not listed under this Google account" });

    const locationId = body.data.locationName.slice("locations/".length);
    const location = await googleGet<{
      name?: string; title?: string; websiteUri?: string;
      phoneNumbers?: { primaryPhone?: string };
      storefrontAddress?: Record<string, unknown>;
      regularHours?: Record<string, unknown>;
      categories?: { primaryCategory?: { displayName?: string; name?: string } };
    }>(
      "https://mybusinessbusinessinformation.googleapis.com/v1/locations/" + encodeURIComponent(locationId) +
      "?readMask=name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,categories", accessToken
    );
    const sourceLabel = "Google Business Profile API · " + (location.name ?? body.data.locationName);
    const observedAt = new Date();
    const evidenceItems: Array<{ category: string; value: Prisma.InputJsonValue }> = [];
    if (location.title) evidenceItems.push({ category: "business_name", value: { text: location.title } });
    if (location.categories?.primaryCategory?.displayName) evidenceItems.push({ category: "primary_category", value: { text: location.categories.primaryCategory.displayName } });
    if (location.storefrontAddress) evidenceItems.push({ category: "address", value: location.storefrontAddress as Prisma.InputJsonValue });
    if (location.phoneNumbers?.primaryPhone) evidenceItems.push({ category: "phone", value: { text: location.phoneNumbers.primaryPhone } });
    if (location.websiteUri) evidenceItems.push({ category: "website", value: { text: location.websiteUri } });
    if (location.regularHours) evidenceItems.push({ category: "business_hours", value: location.regularHours as Prisma.InputJsonValue });
    evidenceItems.push({ category: "google_profile_access", value: { connected: true, selectedLocation: location.name ?? body.data.locationName } });
    await prisma.$transaction([
      prisma.evidence.createMany({
        data: evidenceItems.map(item => ({
          businessId: params.data.businessId, category: item.category, value: item.value,
          source: EvidenceSource.GOOGLE_API, sourceLabel, verified: true, observedAt
        }))
      }),
      prisma.googleConnection.update({
        where: { businessId: params.data.businessId },
        data: { googleAccountId: body.data.accountName, googleLocationResourceName: body.data.locationName }
      })
    ]);
    return { imported: evidenceItems.length, location: { name: location.name, title: location.title }, source: "GOOGLE_API", observedAt };
  } catch (error) {
    request.log.warn({ error: error instanceof Error ? error.message : "unknown" }, "Google profile import failed");
    return reply.code(502).send({ error: error instanceof Error ? error.message : "Could not import Google Business Profile data" });
  }
});




app.get("/v1/businesses/:businessId/growth-performance-report", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const query = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() }).safeParse(request.query);
  if (!params.success || !query.success) return reply.code(400).send({ error: "Select a valid report month using YYYY-MM." });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const now = new Date();
  const month = query.data.month ?? now.toISOString().slice(0, 7);
  const monthStart = new Date(month + "-01T00:00:00.000Z");
  const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  const [rows, goals, actions] = await Promise.all([
    prisma.growthRecord.findMany({
      where: { businessId: business.id, recordedAt: { gte: monthStart, lt: monthEnd }, recordType: { in: ["DAILY_SALES", "REVIEW_ITEM"] } },
      orderBy: { recordedAt: "asc" }, take: 10000
    }),
    prisma.growthGoal.findMany({ where: { businessId: business.id, monthStart }, orderBy: { metric: "asc" } }),
    prisma.growthAction.findMany({ where: { businessId: business.id }, orderBy: { updatedAt: "desc" }, take: 500 })
  ]);
  const records = rows.map(row => ({
    id: row.id, recordType: row.recordType,
    payload: row.payload as unknown as Record<string, unknown>,
    recordedAt: row.recordedAt, source: row.source
  }));
  const report = buildGrowthPerformanceReport(month, records, goals, actions, now);
  return { business: { id: business.id, displayName: business.displayName }, ...report };
});

app.get("/v1/businesses/:businessId/growth-goals/history", { preHandler: requireUser }, async (request, reply) => {
  const params=z.object({businessId:z.string().min(1)}).safeParse(request.params);
  const query=z.object({months:z.coerce.number().int().min(1).max(24).default(6)}).safeParse(request.query);
  if(!params.success||!query.success)return reply.code(400).send({error:"Invalid growth-goal history query"});
  const business=await ownedBusiness(request.userId!,params.data.businessId);
  if(!business)return reply.code(404).send({error:"Business not found"});
  const now=new Date(),currentMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
  const start=new Date(Date.UTC(currentMonth.getUTCFullYear(),currentMonth.getUTCMonth()-(query.data.months-1),1));
  const end=new Date(Date.UTC(currentMonth.getUTCFullYear(),currentMonth.getUTCMonth()+1,1));
  const [goals,rows]=await Promise.all([
    prisma.growthGoal.findMany({where:{businessId:business.id,monthStart:{gte:start,lt:end}},orderBy:[{monthStart:"desc"},{metric:"asc"}]}),
    prisma.growthRecord.findMany({where:{businessId:business.id,recordedAt:{gte:start,lt:end},recordType:{in:["DAILY_SALES","REVIEW_ITEM"]}},orderBy:{recordedAt:"asc"},take:10000})
  ]);
  const records=rows.map(row=>({id:row.id,recordType:row.recordType,payload:row.payload as unknown as Record<string,unknown>,recordedAt:row.recordedAt,source:row.source}));
  return {business:{id:business.id,displayName:business.displayName},months:query.data.months,from:start.toISOString().slice(0,7),to:currentMonth.toISOString().slice(0,7),history:buildGrowthGoalHistory(goals,records,now,query.data.months),limits:{maxMonths:24,maxRecords:10000},method:"Recorded actuals compared with owner-saved monthly targets; archived targets remain visible."};
});

app.get("/v1/businesses/:businessId/growth-baselines", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const query = z.object({ includeArchived: z.enum(["true", "false"]).optional() }).safeParse(request.query);
  if (!params.success || !query.success) return reply.code(400).send({ error: "Invalid growth baseline query" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const baselines = await prisma.growthBaseline.findMany({
    where: { businessId: business.id, ...(query.data.includeArchived === "true" ? {} : { archivedAt: null }) },
    orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }]
  });
  return { business: { id: business.id, displayName: business.displayName }, baselines, supportedMetrics: ["NET_SALES", "REVIEW_COUNT", "AVERAGE_RATING"], guardrails: ["Baseline values are owner-entered reference points, not independently verified actuals.", "Each baseline retains its source label and comparison period.", "Archived baselines remain available when includeArchived=true."] };
});

app.post("/v1/businesses/:businessId/growth-baselines", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({
    metric: z.enum(["NET_SALES", "REVIEW_COUNT", "AVERAGE_RATING"]),
    baselineValue: z.number().finite().nonnegative().max(1000000000),
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sourceLabel: z.string().trim().min(2).max(120),
    ownerNote: z.string().trim().max(1000).optional()
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Enter a valid baseline and its source." });
  if (body.data.metric === "AVERAGE_RATING" && (body.data.baselineValue < 1 || body.data.baselineValue > 5)) return reply.code(400).send({ error: "Average rating baselines must be between 1 and 5." });
  if (body.data.metric === "REVIEW_COUNT" && !Number.isInteger(body.data.baselineValue)) return reply.code(400).send({ error: "Review count baselines must be whole numbers." });
  const periodStart = new Date(body.data.periodStart + "T00:00:00.000Z");
  const periodEnd = new Date(body.data.periodEnd + "T23:59:59.999Z");
  if (!Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodStart > periodEnd) return reply.code(400).send({ error: "Baseline period end must be on or after its start." });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const baseline = await prisma.growthBaseline.create({ data: {
    businessId: business.id, metric: body.data.metric, baselineValue: body.data.baselineValue,
    periodStart, periodEnd, sourceLabel: body.data.sourceLabel,
    ownerNote: body.data.ownerNote || null
  } });
  await recordActivity({
    businessId: business.id, actorUserId: request.userId!, eventType: "GROWTH_BASELINE_CREATED",
    entityType: "GROWTH_BASELINE", entityId: baseline.id,
    summary: body.data.metric + " starting baseline recorded",
    metadata: { metric: body.data.metric, baselineValue: body.data.baselineValue, periodStart: body.data.periodStart, periodEnd: body.data.periodEnd, sourceLabel: body.data.sourceLabel }
  });
  return reply.code(201).send({ baseline });
});

app.delete("/v1/businesses/:businessId/growth-baselines/:baselineId", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1), baselineId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid baseline identifier" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const result = await prisma.growthBaseline.updateMany({ where: { id: params.data.baselineId, businessId: business.id, archivedAt: null }, data: { archivedAt: new Date() } });
  if (!result.count) return reply.code(404).send({ error: "Growth baseline not found" });
  await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "GROWTH_BASELINE_ARCHIVED", entityType: "GROWTH_BASELINE", entityId: params.data.baselineId, summary: "Growth baseline archived" });
  return reply.code(204).send();
});

app.get("/v1/businesses/:businessId/growth-goals", { preHandler: requireUser }, async (request, reply) => {
  const params=z.object({businessId:z.string().min(1)}).safeParse(request.params);
  const query=z.object({month:z.string().regex(/^\d{4}-\d{2}$/).optional()}).safeParse(request.query);
  if(!params.success||!query.success)return reply.code(400).send({error:"Invalid growth-goal query"});
  const business=await ownedBusiness(request.userId!,params.data.businessId);
  if(!business)return reply.code(404).send({error:"Business not found"});
  const now=new Date(),month=query.data.month??now.toISOString().slice(0,7);
  const monthStart=new Date(month+"-01T00:00:00.000Z");
  const monthEnd=new Date(Date.UTC(monthStart.getUTCFullYear(),monthStart.getUTCMonth()+1,1));
  const [goals,rows]=await Promise.all([
    prisma.growthGoal.findMany({where:{businessId:business.id,monthStart,archivedAt:null},orderBy:{metric:"asc"}}),
    prisma.growthRecord.findMany({where:{businessId:business.id,recordedAt:{gte:monthStart,lt:monthEnd},recordType:{in:["DAILY_SALES","REVIEW_ITEM"]}},orderBy:{recordedAt:"asc"},take:2000})
  ]);
  const records=rows.map(row=>({id:row.id,recordType:row.recordType,payload:row.payload as unknown as Record<string,unknown>,recordedAt:row.recordedAt,source:row.source}));
  return {business:{id:business.id,displayName:business.displayName},month,goals:goals.map(goal=>calculateGrowthGoal(goal,records,now)),supportedMetrics:[{metric:"NET_SALES",label:"Monthly net sales",unit:"INR"},{metric:"REVIEW_COUNT",label:"Monthly review count",unit:"reviews"},{metric:"AVERAGE_RATING",label:"Average review rating",unit:"stars"}],guardrails:["Targets are entered by the business owner; no default target is created.","Progress uses saved non-demo records only.","No forecast or on-track prediction is generated.","Missing sales dates are not treated as zero."]};
});

app.post("/v1/businesses/:businessId/growth-goals", { preHandler: requireUser }, async (request, reply) => {
  const params=z.object({businessId:z.string().min(1)}).safeParse(request.params);
  const body=z.object({metric:z.enum(["NET_SALES","REVIEW_COUNT","AVERAGE_RATING"]),targetValue:z.number().finite().positive().max(1000000000),month:z.string().regex(/^\d{4}-\d{2}$/)}).safeParse(request.body);
  if(!params.success||!body.success)return reply.code(400).send({error:"Enter a valid monthly target."});
  if(body.data.metric==="AVERAGE_RATING"&&body.data.targetValue>5)return reply.code(400).send({error:"Average rating targets must be 5 stars or lower."});
  if(body.data.metric==="REVIEW_COUNT"&&!Number.isInteger(body.data.targetValue))return reply.code(400).send({error:"Review count targets must be whole numbers."});
  const business=await ownedBusiness(request.userId!,params.data.businessId);
  if(!business)return reply.code(404).send({error:"Business not found"});
  const monthStart=new Date(body.data.month+"-01T00:00:00.000Z");
  const goal=await prisma.growthGoal.upsert({
    where:{businessId_metric_monthStart:{businessId:business.id,metric:body.data.metric,monthStart}},
    create:{businessId:business.id,metric:body.data.metric,targetValue:body.data.targetValue,monthStart},
    update:{targetValue:body.data.targetValue,archivedAt:null}
  });
  await recordActivity({
    businessId: business.id, actorUserId: request.userId!, eventType: "GROWTH_GOAL_SAVED",
    entityType: "GROWTH_GOAL", entityId: goal.id,
    summary: body.data.metric + " monthly target saved for " + body.data.month,
    metadata: { metric: body.data.metric, month: body.data.month, targetValue: body.data.targetValue }
  });
  return reply.code(200).send({goal});
});

app.delete("/v1/businesses/:businessId/growth-goals/:goalId", { preHandler: requireUser }, async (request, reply) => {
  const params=z.object({businessId:z.string().min(1),goalId:z.string().min(1)}).safeParse(request.params);
  if(!params.success)return reply.code(400).send({error:"Invalid growth goal identifier"});
  const business=await ownedBusiness(request.userId!,params.data.businessId);
  if(!business)return reply.code(404).send({error:"Business not found"});
  const result=await prisma.growthGoal.updateMany({where:{id:params.data.goalId,businessId:business.id,archivedAt:null},data:{archivedAt:new Date()}});
  if(!result.count)return reply.code(404).send({error:"Growth goal not found"});
  await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "GROWTH_GOAL_ARCHIVED", entityType: "GROWTH_GOAL", entityId: params.data.goalId, summary: "Monthly growth target archived" });
  return reply.code(204).send();
});

app.get("/v1/businesses/:businessId/activity-history", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const query = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().min(1).max(64).optional(), eventType: z.string().trim().min(1).max(80).optional() }).safeParse(request.query);
  if (!params.success || !query.success) return reply.code(400).send({ error: "Invalid activity history query" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  if (query.data.cursor) {
    const cursorExists = await prisma.activityEvent.findFirst({ where: { id: query.data.cursor, businessId: business.id }, select: { id: true } });
    if (!cursorExists) return reply.code(400).send({ error: "Invalid activity history cursor" });
  }
  const events = await prisma.activityEvent.findMany({
    where: { businessId: business.id, ...(query.data.eventType ? { eventType: query.data.eventType } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(query.data.cursor ? { cursor: { id: query.data.cursor }, skip: 1 } : {}),
    take: query.data.limit,
    select: { id: true, eventType: true, entityType: true, entityId: true, summary: true, metadata: true, createdAt: true }
  });
  return { business: { id: business.id, displayName: business.displayName }, events, nextCursor: events.length === query.data.limit ? events[events.length - 1]?.id ?? null : null };
});

app.get("/v1/businesses/:businessId/growth-history", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const [savedActions, growthRows] = await Promise.all([
    prisma.growthAction.findMany({ where: { businessId: business.id }, orderBy: { updatedAt: "desc" }, take: 200 }),
    prisma.growthRecord.findMany({ where: { businessId: business.id }, orderBy: { recordedAt: "desc" }, take: 1000 })
  ]);
  const records = growthRows.map(row => ({
    id: row.id, recordType: row.recordType,
    payload: row.payload as unknown as Record<string, unknown>,
    recordedAt: row.recordedAt, source: row.source
  }));
  const historyActions = savedActions.map(item => ({
    id: item.actionId,
    priority: item.priority as "HIGH" | "MEDIUM" | "INFO",
    score: 0,
    title: item.title,
    action: "Previously saved owner-tracked recommendation.",
    why: "Saved in this business workspace.",
    evidence: item.evidence as unknown as import("./growth-overview.js").OverviewAction["evidence"],
    confidence: "LOW" as const,
    requiresOwnerApproval: true as const,
    status: item.status
  }));
  const measured = buildGrowthActionMeasurements(historyActions, savedActions, records, new Date());
  const items = measured.map((item, index) => ({
    ...item,
    ownerNote: savedActions[index]!.ownerNote,
    acceptedAt: savedActions[index]!.acceptedAt,
    completedAt: savedActions[index]!.completedAt,
    dismissedAt: savedActions[index]!.dismissedAt,
    createdAt: savedActions[index]!.createdAt,
    updatedAt: savedActions[index]!.updatedAt
  }));
  return {
    business: { id: business.id, displayName: business.displayName },
    total: items.length,
    counts: {
      suggested: items.filter(item => item.status === "SUGGESTED").length,
      accepted: items.filter(item => item.status === "ACCEPTED").length,
      inProgress: items.filter(item => item.status === "IN_PROGRESS").length,
      completed: items.filter(item => item.status === "COMPLETED").length,
      dismissed: items.filter(item => item.status === "DISMISSED").length
    },
    items
  };
});

app.get("/v1/businesses/:businessId/growth-overview", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const [growthRows, evidenceRows] = await Promise.all([
    prisma.growthRecord.findMany({ where: { businessId: business.id }, orderBy: { recordedAt: "desc" }, take: 1000 }),
    prisma.evidence.findMany({ where: { businessId: business.id }, select: { id: true, category: true, source: true, verified: true, observedAt: true, expiresAt: true }, orderBy: { observedAt: "desc" }, take: 500 })
  ]);
  const [overviewActions] = await Promise.all([prisma.growthAction.findMany({ where: { businessId: business.id } })]);
  const overview = buildGrowthOverview({
    records: growthRows.map(row => ({ id: row.id, recordType: row.recordType, payload: row.payload as unknown as Record<string, unknown>, recordedAt: row.recordedAt, source: row.source })),
    evidence: evidenceRows
  });
  const trackedActions = mergeGrowthActionTracking(overview.actions, overviewActions);
  const records = growthRows.map(row => ({ id: row.id, recordType: row.recordType, payload: row.payload as unknown as Record<string, unknown>, recordedAt: row.recordedAt, source: row.source }));
  const actions = buildGrowthActionMeasurements(trackedActions, overviewActions, records, new Date());
  return { business: { id: business.id, displayName: business.displayName }, ...overview, actions };
});

app.patch("/v1/businesses/:businessId/growth-overview/:actionId", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1), actionId: z.string().min(1).max(100) }).safeParse(request.params);
  const body = z.object({
    status: z.enum(["ACCEPTED", "IN_PROGRESS", "COMPLETED", "DISMISSED", "SUGGESTED"]),
    ownerNote: z.string().trim().max(1000).optional()
  }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid growth action update", details: body.success ? undefined : body.error.flatten() });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const [growthRows, evidenceRows] = await Promise.all([
    prisma.growthRecord.findMany({ where: { businessId: business.id }, orderBy: { recordedAt: "desc" }, take: 1000 }),
    prisma.evidence.findMany({ where: { businessId: business.id }, select: { id: true, category: true, source: true, verified: true, observedAt: true, expiresAt: true }, orderBy: { observedAt: "desc" }, take: 500 })
  ]);
  const overview = buildGrowthOverview({
    records: growthRows.map(row => ({ id: row.id, recordType: row.recordType, payload: row.payload as unknown as Record<string, unknown>, recordedAt: row.recordedAt, source: row.source })),
    evidence: evidenceRows
  });
  const action = overview.actions.find(item => item.id === params.data.actionId);
  if (!action) return reply.code(404).send({ error: "Growth action is no longer active. Refresh the overview before updating it." });
  const existing = await prisma.growthAction.findUnique({ where: { businessId_actionId: { businessId: business.id, actionId: action.id } } });
  const now = new Date();
  const status = body.data.status;
  const saved = await prisma.growthAction.upsert({
    where: { businessId_actionId: { businessId: business.id, actionId: action.id } },
    create: {
      businessId: business.id, actionId: action.id, title: action.title, status,
      ownerNote: body.data.ownerNote ?? null, evidence: action.evidence as Prisma.InputJsonValue, priority: action.priority,
      acceptedAt: status === "ACCEPTED" || status === "IN_PROGRESS" || status === "COMPLETED" ? now : null,
      completedAt: status === "COMPLETED" ? now : null, dismissedAt: status === "DISMISSED" ? now : null
    },
    update: {
      title: action.title, status, ownerNote: body.data.ownerNote ?? existing?.ownerNote ?? null,
      evidence: action.evidence as Prisma.InputJsonValue, priority: action.priority,
      acceptedAt: status === "SUGGESTED" || status === "DISMISSED" ? existing?.acceptedAt ?? null : existing?.acceptedAt ?? now,
      completedAt: status === "COMPLETED" ? existing?.completedAt ?? now : null,
      dismissedAt: status === "DISMISSED" ? existing?.dismissedAt ?? now : null
    }
  });
  await recordActivity({
    businessId: business.id, actorUserId: request.userId!, eventType: "GROWTH_ACTION_STATUS_CHANGED",
    entityType: "GROWTH_ACTION", entityId: saved.id,
    summary: "Growth action “" + action.title.slice(0, 120) + "” marked " + status.toLowerCase().replaceAll("_", " "),
    metadata: { actionId: action.id, status, previousStatus: existing?.status ?? "SUGGESTED" }
  });
  return { action: saved, note: "Tracking status saved for this business. No external action was executed." };
});
app.get("/v1/businesses/:businessId/reviews/themes", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const rows = await prisma.growthRecord.findMany({
    where: { businessId: business.id, recordType: "REVIEW_ITEM" },
    orderBy: { recordedAt: "desc" },
    take: 1000
  });
  const reviews = rows.map(row => {
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? row.payload as Record<string, unknown> : {};
    return { reviewText: payload.reviewText, rating: payload.rating, reviewDate: payload.reviewDate };
  });
  return analyzeReviewThemes(reviews);
});

app.post("/v1/businesses/:businessId/google/reviews/import", {
  preHandler: requireUser,
  config: { rateLimit: { max: 2, timeWindow: "1 minute" } }
}, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });

  const connection = await prisma.googleConnection.findUnique({ where: { businessId: business.id } });
  const accountName = connection?.googleAccountId;
  const locationName = connection?.googleLocationResourceName;
  if (!connection || !accountName || !/^accounts\/[A-Za-z0-9_-]+$/.test(accountName) ||
      !locationName || !/^locations\/[A-Za-z0-9_-]+$/.test(locationName)) {
    return reply.code(409).send({ error: "Connect Google and import the selected verified Business Profile location before importing reviews." });
  }
  if (!connection.scope.split(" ").includes("https://www.googleapis.com/auth/business.manage")) {
    return reply.code(403).send({ error: "The connected Google account has not granted Business Profile review access. Reconnect and approve the requested permission." });
  }

  try {
    const accessToken = await googleAccessToken(business.id);
    const url = new URL("https://mybusiness.googleapis.com/v4/" + accountName + "/" + locationName + "/reviews");
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("orderBy", "updateTime desc");

    const normalized: Array<NonNullable<ReturnType<typeof normalizeGoogleReview>>> = [];
    let pageToken: string | undefined;
    let averageRating: number | null = null;
    let totalReviewCount: number | null = null;
    let pagesFetched = 0;
    for (let page = 0; page < 5; page++) {
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const result = await googleGet<{
        reviews?: GoogleReviewApiRecord[];
        nextPageToken?: string;
        averageRating?: number;
        totalReviewCount?: number;
      }>(url.toString(), accessToken);
      pagesFetched += 1;
      if (page === 0) {
        averageRating = typeof result.averageRating === "number" ? result.averageRating : null;
        totalReviewCount = typeof result.totalReviewCount === "number" ? result.totalReviewCount : null;
      }
      for (const review of result.reviews ?? []) {
        const item = normalizeGoogleReview(review);
        if (item) normalized.push(item);
      }
      pageToken = result.nextPageToken;
      if (!pageToken) break;
    }

    const unique = [...new Map(normalized.map(item => [item.reviewId, item])).values()];
    const externalIds = unique.map(item => "google-review:" + createHash("sha256").update(item.reviewId).digest("hex").slice(0, 40));
    const existing = externalIds.length ? await prisma.growthRecord.findMany({
      where: { businessId: business.id, recordType: "REVIEW_ITEM", externalId: { in: externalIds } }
    }) : [];
    const existingById = new Map(existing.map(record => [record.externalId, record]));
    const importedAt = new Date();

    await Promise.all(unique.map(async (item) => {
      const externalId = "google-review:" + createHash("sha256").update(item.reviewId).digest("hex").slice(0, 40);
      const previous = existingById.get(externalId);
      const previousPayload = (previous?.payload ?? {}) as Record<string, unknown>;
      const recorded = item.reviewDate ? new Date(item.reviewDate) : importedAt;
      const recordedAt = Number.isNaN(recorded.getTime()) ? importedAt : recorded;
      const payload = {
        ...previousPayload,
        ...item,
        replyDraft: typeof previousPayload.replyDraft === "string" ? previousPayload.replyDraft : "",
        status: previousPayload.status === "REPLY_DRAFT" ? "REPLY_DRAFT" : item.status,
        importedAt: importedAt.toISOString()
      };
      await prisma.growthRecord.upsert({
        where: { businessId_recordType_externalId: { businessId: business.id, recordType: "REVIEW_ITEM", externalId } },
        create: {
          businessId: business.id, recordType: "REVIEW_ITEM", externalId,
          payload: payload as Prisma.InputJsonValue, source: "GOOGLE_API", recordedAt
        },
        update: {
          payload: payload as Prisma.InputJsonValue, source: "GOOGLE_API", recordedAt
        }
      });
    }));

    return {
      importedCount: unique.length,
      totalReviewCount,
      averageRating,
      pagesFetched,
      pageLimitReached: Boolean(pageToken),
      importedAt: importedAt.toISOString(),
      source: "GOOGLE_API",
      note: "Reviews were imported read-only. No replies were sent, edited or published."
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google review import failed";
    request.log.warn({ message }, "Google Business Profile review import failed");
    return reply.code(502).send({ error: message });
  }
});

app.get("/v1/google/connect/:businessId", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return reply.code(503).send({ error: "Google OAuth is not configured. Add credentials to the deployment environment first." });

  const state = randomUrlToken();
  const verifier = randomUrlToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await prisma.oAuthState.create({
    data: { state, codeVerifier: verifier, userId: request.userId!, businessId: business.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) }
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/business.manage",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  }).toString();
  return reply.redirect(url.toString());
});

app.get("/v1/google/callback", async (request, reply) => {
  const query = z.object({ code: z.string().optional(), state: z.string().min(1), error: z.string().optional() }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "Invalid OAuth callback" });
  if (query.data.error) return reply.code(400).send({ error: "Google authorisation was not completed", providerError: query.data.error });
  if (!query.data.code) return reply.code(400).send({ error: "Missing authorisation code" });

  const oauthState = await prisma.oAuthState.findUnique({ where: { state: query.data.state } });
  if (!oauthState || oauthState.expiresAt.getTime() < Date.now()) {
    if (oauthState) await prisma.oAuthState.delete({ where: { id: oauthState.id } });
    return reply.code(400).send({ error: "OAuth state is invalid or expired. Start the connection again." });
  }
  await prisma.oAuthState.delete({ where: { id: oauthState.id } });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: query.data.code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
      code_verifier: oauthState.codeVerifier
    })
  });
  const tokenData = await tokenResponse.json() as {
    access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string
  };
  if (!tokenResponse.ok || !tokenData.access_token) {
    request.log.error({ providerError: tokenData.error }, "Google token exchange failed");
    return reply.code(502).send({ error: "Google token exchange failed. Check OAuth configuration and try again." });
  }
  const grantedScopes = (tokenData.scope ?? "").split(" ");
  if (!grantedScopes.includes("https://www.googleapis.com/auth/business.manage")) {
    return reply.code(400).send({ error: "The required Business Profile permission was not granted." });
  }

  await prisma.googleConnection.upsert({
    where: { businessId: oauthState.businessId },
    create: {
      businessId: oauthState.businessId,
      accessTokenEncrypted: encryptSecret(tokenData.access_token),
      refreshTokenEncrypted: tokenData.refresh_token ? encryptSecret(tokenData.refresh_token) : null,
      scope: tokenData.scope ?? "",
      expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null
    },
    update: {
      accessTokenEncrypted: encryptSecret(tokenData.access_token),
      refreshTokenEncrypted: tokenData.refresh_token ? encryptSecret(tokenData.refresh_token) : undefined,
      scope: tokenData.scope ?? "",
      expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null
    }
  });
  await prisma.evidence.create({
    data: {
      businessId: oauthState.businessId,
      category: "google_profile_access",
      value: { connected: true, scope: tokenData.scope ?? "" },
      source: EvidenceSource.GOOGLE_API,
      sourceLabel: "Google OAuth authorisation completed",
      verified: true
    }
  });
  return reply.redirect(`${env.APP_BASE_URL}/?google=connected`);
});


type MetaGraphError = { error?: { message?: string; type?: string; code?: number; error_subcode?: number } };
async function metaRequest<T>(path: string, accessToken: string, method: "GET" | "POST" = "GET", values: Record<string, string> = {}): Promise<T> {
  const url = new URL("https://graph.facebook.com/" + env.META_GRAPH_API_VERSION + "/" + path.replace(/^\//, ""));
  const params = new URLSearchParams({ ...values, access_token: accessToken });
  const response = await fetch(method === "GET" ? url.toString() + "?" + params.toString() : url.toString(), {
    method,
    ...(method === "POST" ? { headers: { "content-type": "application/x-www-form-urlencoded" }, body: params } : {}),
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json() as T & MetaGraphError;
  if (!response.ok) throw new Error(data.error?.message || "Meta Graph API request failed (" + response.status + ")");
  return data;
}
app.post("/v1/meta/connect/:businessId/url", { preHandler: requireUser, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  if (!env.META_APP_ID || !env.META_APP_SECRET) return reply.code(503).send({ error: "Meta OAuth is not configured. Add META_APP_ID, META_APP_SECRET and META_REDIRECT_URI to the API deployment." });
  const state = randomUrlToken();
  await prisma.metaOAuthState.create({ data: { state, userId: request.userId!, businessId: business.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
  const url = new URL("https://www.facebook.com/" + env.META_GRAPH_API_VERSION + "/dialog/oauth");
  url.search = new URLSearchParams({
    client_id: env.META_APP_ID,
    redirect_uri: env.META_REDIRECT_URI,
    response_type: "code",
    state,
    scope: "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish"
  }).toString();
  return { authorizationUrl: url.toString() };
});

app.get("/v1/meta/callback", async (request, reply) => {
  const query = z.object({ code: z.string().optional(), state: z.string().min(1), error: z.string().optional() }).safeParse(request.query);
  if (!query.success) return reply.code(400).send({ error: "Invalid Meta OAuth callback" });
  if (query.data.error) return reply.redirect(env.APP_BASE_URL + "/?meta=cancelled");
  if (!query.data.code) return reply.code(400).send({ error: "Missing Meta authorisation code" });
  const state = await prisma.metaOAuthState.findUnique({ where: { state: query.data.state } });
  if (!state || state.expiresAt.getTime() < Date.now()) {
    if (state) await prisma.metaOAuthState.delete({ where: { id: state.id } });
    return reply.code(400).send({ error: "Meta OAuth state is invalid or expired. Start the connection again." });
  }
  await prisma.metaOAuthState.delete({ where: { id: state.id } });
  const tokenUrl = new URL("https://graph.facebook.com/" + env.META_GRAPH_API_VERSION + "/oauth/access_token");
  tokenUrl.search = new URLSearchParams({ client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: env.META_REDIRECT_URI, code: query.data.code }).toString();
  const shortResponse = await fetch(tokenUrl, { signal: AbortSignal.timeout(20000) });
  const shortData = await shortResponse.json() as { access_token?: string; error?: { message?: string } };
  if (!shortResponse.ok || !shortData.access_token) {
    request.log.warn({ providerMessage: shortData.error?.message }, "Meta OAuth token exchange failed");
    return reply.redirect(env.APP_BASE_URL + "/?meta=error");
  }
  const longUrl = new URL("https://graph.facebook.com/" + env.META_GRAPH_API_VERSION + "/oauth/access_token");
  longUrl.search = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: shortData.access_token }).toString();
  const longResponse = await fetch(longUrl, { signal: AbortSignal.timeout(20000) });
  const longData = await longResponse.json() as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!longResponse.ok || !longData.access_token) {
    request.log.warn({ providerMessage: longData.error?.message }, "Meta long-lived token exchange failed");
    return reply.redirect(env.APP_BASE_URL + "/?meta=error");
  }
  let grantedScopes: string[] = [];
  try {
    const permissionResult = await metaRequest<{ data?: Array<{ permission: string; status: string }> }>("me/permissions", longData.access_token);
    grantedScopes = (permissionResult.data ?? []).filter(item => item.status === "granted").map(item => item.permission);
  } catch (error) {
    request.log.warn({ error: error instanceof Error ? error.message : "unknown" }, "Could not verify Meta permissions");
  }
  await prisma.metaOAuthSession.upsert({
    where: { businessId: state.businessId },
    create: { businessId: state.businessId, userId: state.userId, userTokenEncrypted: encryptSecret(longData.access_token), scopes: grantedScopes.join(" "), expiresAt: new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000) },
    update: { userId: state.userId, userTokenEncrypted: encryptSecret(longData.access_token), scopes: grantedScopes.join(" "), expiresAt: new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000) }
  });
  return reply.redirect(env.APP_BASE_URL + "/?meta=connected");
});

app.get("/v1/businesses/:businessId/meta", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const connection = await prisma.metaConnection.findUnique({ where: { businessId: business.id }, select: { pageId: true, pageName: true, instagramUserId: true, instagramUsername: true, scopes: true, connectedAt: true, updatedAt: true } });
  const pending = await prisma.metaOAuthSession.findUnique({ where: { businessId: business.id }, select: { expiresAt: true } });
  return { configured: Boolean(env.META_APP_ID && env.META_APP_SECRET), connected: Boolean(connection), connection, pageSelectionPending: Boolean(pending && pending.expiresAt > new Date()), graphApiVersion: env.META_GRAPH_API_VERSION };
});

app.get("/v1/businesses/:businessId/meta/pages", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const pending = await prisma.metaOAuthSession.findUnique({ where: { businessId: business.id } });
  if (!pending || pending.userId !== request.userId || pending.expiresAt <= new Date()) return reply.code(409).send({ error: "Reconnect Meta to select a Page." });
  try {
    const result = await metaRequest<{ data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }> }>("me/accounts", decryptSecret(pending.userTokenEncrypted), "GET", { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100" });
    return { pages: (result.data ?? []).map(page => ({ id: page.id, name: page.name, instagramUserId: page.instagram_business_account?.id ?? null, instagramUsername: page.instagram_business_account?.username ?? null })) };
  } catch (error) {
    request.log.warn({ error: error instanceof Error ? error.message : "unknown" }, "Meta Page list failed");
    return reply.code(502).send({ error: error instanceof Error ? error.message : "Could not list Meta Pages" });
  }
});

app.post("/v1/businesses/:businessId/meta/page", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({ pageId: z.string().trim().min(1).max(100) }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Select a valid Facebook Page." });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const pending = await prisma.metaOAuthSession.findUnique({ where: { businessId: business.id } });
  if (!pending || pending.userId !== request.userId || pending.expiresAt <= new Date()) return reply.code(409).send({ error: "Reconnect Meta before selecting a Page." });
  try {
    const result = await metaRequest<{ data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }> }>("me/accounts", decryptSecret(pending.userTokenEncrypted), "GET", { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100" });
    const page = (result.data ?? []).find(item => item.id === body.data.pageId);
    if (!page?.access_token) return reply.code(403).send({ error: "That Page is not accessible to the connected Meta user." });
    const granted = new Set(pending.scopes.split(" ").filter(Boolean));
    const missingPageScopes = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"].filter(scope => !granted.has(scope));
    if (missingPageScopes.length) return reply.code(403).send({ error: "Meta did not grant the required Facebook Page permissions: " + missingPageScopes.join(", ") + ". Update the Meta app permissions and reconnect." });
    const connection = await prisma.metaConnection.upsert({
      where: { businessId: business.id },
      create: { businessId: business.id, pageId: page.id, pageName: page.name, instagramUserId: page.instagram_business_account?.id ?? null, instagramUsername: page.instagram_business_account?.username ?? null, pageAccessTokenEncrypted: encryptSecret(page.access_token), scopes: pending.scopes },
      update: { pageId: page.id, pageName: page.name, instagramUserId: page.instagram_business_account?.id ?? null, instagramUsername: page.instagram_business_account?.username ?? null, pageAccessTokenEncrypted: encryptSecret(page.access_token), scopes: pending.scopes }
    });
    await prisma.metaOAuthSession.delete({ where: { businessId: business.id } });
    await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "META_PAGE_CONNECTED", entityType: "META_CONNECTION", entityId: connection.id, summary: "Facebook Page connected to this LocalBoost business", metadata: { pageId: page.id, pageName: page.name, instagramUsername: page.instagram_business_account?.username ?? null } });
    return { connected: true, page: { id: page.id, name: page.name, instagramUserId: page.instagram_business_account?.id ?? null, instagramUsername: page.instagram_business_account?.username ?? null } };
  } catch (error) {
    request.log.warn({ error: error instanceof Error ? error.message : "unknown" }, "Meta Page selection failed");
    return reply.code(502).send({ error: error instanceof Error ? error.message : "Could not connect the selected Page" });
  }
});

app.delete("/v1/businesses/:businessId/meta", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  await prisma.metaConnection.deleteMany({ where: { businessId: business.id } });
  await prisma.metaOAuthSession.deleteMany({ where: { businessId: business.id } });
  await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "META_DISCONNECTED", entityType: "META_CONNECTION", summary: "Meta publishing connection removed", metadata: {} });
  return reply.code(204).send();
});

app.post("/v1/businesses/:businessId/social-posts", { preHandler: requireUser, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  const body = z.object({ channel: z.enum(["FACEBOOK", "INSTAGRAM"]), caption: z.string().trim().min(1).max(2200), sourceDraftId: z.string().trim().min(1).max(100), assetId: z.string().min(1).optional() }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "Enter a valid channel and caption (maximum 2,200 characters)." });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  if (body.data.channel === "INSTAGRAM" && !body.data.assetId) return reply.code(400).send({ error: "Instagram feed publishing requires an image saved in the business creative library." });
  if (body.data.assetId) {
    const asset = await prisma.creativeAsset.findFirst({ where: { id: body.data.assetId, businessId: business.id }, select: { id: true, mimeType: true } });
    if (!asset) return reply.code(404).send({ error: "Creative image not found in this business workspace." });
    if (body.data.channel === "INSTAGRAM" && !["image/jpeg", "image/png"].includes(asset.mimeType)) return reply.code(415).send({ error: "Instagram image publishing currently accepts JPEG or PNG artwork." });
  }
  const post = await prisma.socialPost.upsert({
    where: { businessId_channel_sourceDraftId: { businessId: business.id, channel: body.data.channel, sourceDraftId: body.data.sourceDraftId } },
    create: { businessId: business.id, channel: body.data.channel, sourceDraftId: body.data.sourceDraftId, caption: body.data.caption, assetId: body.data.assetId ?? null },
    update: {}
  });
  await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "SOCIAL_DRAFT_CREATED", entityType: "SOCIAL_POST", entityId: post.id, summary: "Social post draft added to the approval centre", metadata: { channel: post.channel, hasImage: Boolean(post.assetId) } });
  return reply.code(201).send({ post });
});

app.get("/v1/businesses/:businessId/social-posts", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid business id" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const posts = await prisma.socialPost.findMany({ where: { businessId: business.id }, include: { asset: { select: { id: true, fileName: true, mimeType: true, byteSize: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return { posts };
});

app.post("/v1/businesses/:businessId/social-posts/:postId/approve", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1), postId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid social post identifier" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const connection = await prisma.metaConnection.findUnique({ where: { businessId: business.id } });
  if (!connection) return reply.code(409).send({ error: "Connect a Facebook Page before approving posts for publishing." });
  const post = await prisma.socialPost.findFirst({ where: { id: params.data.postId, businessId: business.id }, include: { asset: { select: { mimeType: true } } } });
  if (!post) return reply.code(404).send({ error: "Social post not found" });
  if (!["DRAFT", "REJECTED", "FAILED"].includes(post.status)) return reply.code(409).send({ error: "Only draft, rejected or failed posts can be approved." });
  const grantedScopes = new Set(connection.scopes.split(" ").filter(Boolean));
  if (post.channel === "FACEBOOK" && !grantedScopes.has("pages_manage_posts")) return reply.code(403).send({ error: "The Meta connection is missing pages_manage_posts permission. Reconnect after enabling it in your Meta app." });
  if (post.channel === "INSTAGRAM" && (!connection.instagramUserId || !post.asset || !["image/jpeg", "image/png"].includes(post.asset.mimeType) || !grantedScopes.has("instagram_basic") || !grantedScopes.has("instagram_content_publish"))) return reply.code(409).send({ error: "Connect a linked Instagram professional account, grant instagram_basic and instagram_content_publish, and attach a JPEG or PNG image before approving this post." });
  const updated = await prisma.socialPost.update({ where: { id: post.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedByUserId: request.userId!, publishError: null } });
  await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "SOCIAL_POST_APPROVED", entityType: "SOCIAL_POST", entityId: post.id, summary: "Owner explicitly approved a social post for manual publishing", metadata: { channel: post.channel } });
  return { post: updated, publishingStarted: false };
});

app.post("/v1/businesses/:businessId/social-posts/:postId/reject", { preHandler: requireUser }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1), postId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid social post identifier" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const result = await prisma.socialPost.updateMany({ where: { id: params.data.postId, businessId: business.id, status: { in: ["DRAFT", "APPROVED", "FAILED"] } }, data: { status: "REJECTED", approvedAt: null, approvedByUserId: null } });
  if (!result.count) return reply.code(409).send({ error: "This post cannot be rejected in its current state." });
  await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "SOCIAL_POST_REJECTED", entityType: "SOCIAL_POST", entityId: params.data.postId, summary: "Owner rejected a social post draft", metadata: {} });
  return { rejected: true };
});

app.post("/v1/businesses/:businessId/social-posts/:postId/publish", { preHandler: requireUser, config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
  const params = z.object({ businessId: z.string().min(1), postId: z.string().min(1) }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "Invalid social post identifier" });
  const business = await ownedBusiness(request.userId!, params.data.businessId);
  if (!business) return reply.code(404).send({ error: "Business not found" });
  const connection = await prisma.metaConnection.findUnique({ where: { businessId: business.id } });
  if (!connection) return reply.code(409).send({ error: "Connect a Facebook Page before publishing." });
  const post = await prisma.socialPost.findFirst({ where: { id: params.data.postId, businessId: business.id }, include: { asset: true } });
  if (!post) return reply.code(404).send({ error: "Social post not found" });
  if (post.status !== "APPROVED") return reply.code(409).send({ error: "Only owner-approved posts can be published. Approve this exact draft first." });
  if (post.channel === "INSTAGRAM" && (!connection.instagramUserId || !post.asset)) return reply.code(409).send({ error: "A linked Instagram professional account and saved image are required." });
  if (post.asset && !env.META_PUBLIC_API_BASE_URL) return reply.code(503).send({ error: "Set META_PUBLIC_API_BASE_URL to the public HTTPS API origin before publishing images." });
  const claimed = await prisma.socialPost.updateMany({ where: { id: post.id, businessId: business.id, status: "APPROVED" }, data: { status: "PUBLISHING", publishError: null } });
  if (!claimed.count) return reply.code(409).send({ error: "This post is already being processed or is no longer approved." });
  let shareToken: string | null = null;
  try {
    let externalPostId = "";
    const accessToken = decryptSecret(connection.pageAccessTokenEncrypted);
    if (post.asset) {
      shareToken = randomUrlToken(32);
      await prisma.metaMediaShare.create({ data: { token: shareToken, businessId: business.id, assetId: post.asset.id, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) } });
    }
    if (post.channel === "FACEBOOK") {
      const result: { id?: string; post_id?: string } = post.asset
        ? await metaRequest<{ id?: string; post_id?: string }>(connection.pageId + "/photos", accessToken, "POST", { url: env.META_PUBLIC_API_BASE_URL.replace(/\/$/, "") + "/v1/meta/media/" + shareToken, caption: post.caption, published: "true" })
        : await metaRequest<{ id?: string; post_id?: string }>(connection.pageId + "/feed", accessToken, "POST", { message: post.caption });
      externalPostId = result.post_id || result.id || "";
    } else {
      const container = await metaRequest<{ id?: string }>(connection.instagramUserId + "/media", accessToken, "POST", { image_url: env.META_PUBLIC_API_BASE_URL.replace(/\/$/, "") + "/v1/meta/media/" + shareToken, caption: post.caption });
      if (!container.id) throw new Error("Meta did not return an Instagram media container id.");
      let ready = false;
      for (let attempt = 0; attempt < 12; attempt++) {
        const status = await metaRequest<{ status_code?: string; status?: string }>(container.id, accessToken, "GET", { fields: "status_code" });
        const code = status.status_code || status.status;
        if (code === "FINISHED") { ready = true; break; }
        if (code === "ERROR" || code === "EXPIRED") throw new Error("Instagram could not process the uploaded image.");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      if (!ready) throw new Error("Instagram media is still processing. Try publishing again after checking the draft status.");
      const published = await metaRequest<{ id?: string }>(connection.instagramUserId + "/media_publish", accessToken, "POST", { creation_id: container.id });
      externalPostId = published.id || "";
    }
    if (!externalPostId) throw new Error("Meta did not return a published post identifier.");
    const updated = await prisma.socialPost.update({ where: { id: post.id }, data: { status: "PUBLISHED", externalPostId, publishedAt: new Date(), publishError: null } });
    try {
      await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "SOCIAL_POST_PUBLISHED", entityType: "SOCIAL_POST", entityId: post.id, summary: "Owner-triggered social post published through Meta", metadata: { channel: post.channel, externalPostId } });
    } catch (auditError) {
      request.log.error({ error: auditError instanceof Error ? auditError.message : "unknown", postId: post.id }, "Social publish activity event could not be recorded");
    }
    return { post: updated, published: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Meta publishing failed";
    await prisma.socialPost.update({ where: { id: post.id }, data: { status: "FAILED", publishError: reason.slice(0, 500) } });
    await recordActivity({ businessId: business.id, actorUserId: request.userId!, eventType: "SOCIAL_POST_PUBLISH_FAILED", entityType: "SOCIAL_POST", entityId: post.id, summary: "Meta publishing failed; owner action is required to retry", metadata: { channel: post.channel, reason: reason.slice(0, 240) } });
    return reply.code(502).send({ error: reason });
  } finally {
    if (shareToken) await prisma.metaMediaShare.deleteMany({ where: { token: shareToken } });
  }
});

app.get("/v1/meta/media/:token", async (request, reply) => {
  const params = z.object({ token: z.string().min(20).max(128) }).safeParse(request.params);
  if (!params.success) return reply.code(404).send();
  const share = await prisma.metaMediaShare.findUnique({ where: { token: params.data.token }, include: { asset: { select: { data: true, mimeType: true } } } });
  if (!share || share.expiresAt <= new Date()) return reply.code(404).send();
  return reply.header("content-type", share.asset.mimeType).header("content-length", String(share.asset.data.length)).header("content-disposition", "inline").header("cache-control", "public, max-age=300").header("x-content-type-options", "nosniff").send(Buffer.from(share.asset.data));
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  if (reply.sent) return;
  return reply.code(500).send({ error: "Internal server error" });
});

const close = async () => {
  await app.close();
  await prisma.$disconnect();
};
process.on("SIGINT", () => void close().then(() => process.exit(0)));
process.on("SIGTERM", () => void close().then(() => process.exit(0)));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}