import { createHash, createDecipheriv } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./db.js";

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/business.manage";
const TARGET_LOCATION_ID = "13677234647182178607";
const PAGE_LIMIT = 5;

function decryptSecret(value: string): string {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY_BASE64 || "", "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes");
  const [iv, tag, encrypted] = value.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Invalid encrypted Google credential");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

async function accessToken(connection: {
  businessId: string; accessTokenEncrypted: string; refreshTokenEncrypted: string | null; expiresAt: Date | null;
}): Promise<string> {
  if (connection.expiresAt && connection.expiresAt.getTime() > Date.now() + 60_000) {
    return decryptSecret(connection.accessTokenEncrypted);
  }
  if (!connection.refreshTokenEncrypted) throw new Error("Google refresh token is unavailable; reconnect Google");
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) throw new Error("Google OAuth client credentials are not configured on the sync job");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: decryptSecret(connection.refreshTokenEncrypted), grant_type: "refresh_token"
    })
  });
  const data = await response.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !data.access_token) throw new Error("Google token refresh failed: " + (data.error || response.status));
  // Persist the refreshed token encrypted with the same key and AES-GCM envelope used by the API.
  const { createCipheriv, randomBytes } = await import("node:crypto");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(process.env.TOKEN_ENCRYPTION_KEY_BASE64!, "base64"), iv);
  const encrypted = Buffer.concat([cipher.update(data.access_token, "utf8"), cipher.final()]);
  const encryptedValue = [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64url")).join(".");
  await prisma.googleConnection.update({
    where: { businessId: connection.businessId },
    data: { accessTokenEncrypted: encryptedValue, expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000) }
  });
  return data.access_token;
}

function normalizeReview(review: {
  name?: string; reviewId?: string; starRating?: string; comment?: string; createTime?: string; updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}) {
  const reviewId = (review.reviewId || review.name?.split("/").pop() || "").trim();
  if (!reviewId) return null;
  const ratings: Record<string, number> = {
    STAR_RATING_ONE: 1, STAR_RATING_TWO: 2, STAR_RATING_THREE: 3,
    STAR_RATING_FOUR: 4, STAR_RATING_FIVE: 5
  };
  const reply = review.reviewReply?.comment?.trim() || "";
  return {
    reviewId, googleReviewName: review.name || null,
    reviewText: (review.comment || "").trim().slice(0, 4000),
    rating: review.starRating ? ratings[review.starRating] ?? null : null,
    reviewDate: review.createTime || review.updateTime || null,
    googleReplyText: reply || null, googleReplyUpdatedAt: review.reviewReply?.updateTime || null,
    reviewSource: "Google Business Profile", status: reply ? "REPLIED" : "REVIEW_CAPTURED", provenance: "GOOGLE_API"
  };
}

async function writeStatus(db: PrismaClient, businessId: string, state: Record<string, unknown>) {
  await db.evidence.create({
    data: {
      businessId, category: "GOOGLE_REVIEW_SYNC_STATUS", source: "GOOGLE_API",
      sourceLabel: "Automated Google Business Profile review sync", verified: true,
      value: state as Prisma.InputJsonValue, observedAt: new Date()
    }
  });
}

async function syncBusiness(business: {
  id: string; displayName: string; googleConnection: {
    googleAccountId: string | null; googleLocationResourceName: string | null; scope: string;
    accessTokenEncrypted: string; refreshTokenEncrypted: string | null; expiresAt: Date | null;
  } | null;
}) {
  const connection = business.googleConnection;
  const locationId = connection?.googleLocationResourceName?.split("/").pop();
  if (!connection || !connection.googleAccountId || !connection.googleLocationResourceName ||
      locationId !== TARGET_LOCATION_ID) return;
  if (!connection.scope.split(" ").includes(GOOGLE_SCOPE)) {
    await writeStatus(prisma, business.id, { status: "BLOCKED", message: "Google review permission is missing", checkedAt: new Date().toISOString() });
    return;
  }
  try {
    const token = await accessToken({
      businessId: business.id, accessTokenEncrypted: connection.accessTokenEncrypted,
      refreshTokenEncrypted: connection.refreshTokenEncrypted, expiresAt: connection.expiresAt
    });
    const url = new URL("https://mybusiness.googleapis.com/v4/" + connection.googleAccountId + "/" + connection.googleLocationResourceName + "/reviews");
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("orderBy", "updateTime desc");
    let pageToken: string | undefined;
    let totalReviewCount: number | null = null;
    let averageRating: number | null = null;
    let pagesFetched = 0;
    const normalized: NonNullable<ReturnType<typeof normalizeReview>>[] = [];
    for (let page = 0; page < PAGE_LIMIT; page++) {
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await fetch(url, { headers: { authorization: "Bearer " + token } });
      const result = await response.json() as {
        reviews?: Parameters<typeof normalizeReview>[0][]; nextPageToken?: string;
        totalReviewCount?: number; averageRating?: number; error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message || "Google reviews API returned " + response.status);
      pagesFetched++;
      if (page === 0) {
        totalReviewCount = typeof result.totalReviewCount === "number" ? result.totalReviewCount : null;
        averageRating = typeof result.averageRating === "number" ? result.averageRating : null;
      }
      for (const review of result.reviews || []) {
        const item = normalizeReview(review);
        if (item) normalized.push(item);
      }
      pageToken = result.nextPageToken;
      if (!pageToken) break;
    }
    const unique = [...new Map(normalized.map(item => [item.reviewId, item])).values()];
    const ids = unique.map(item => "google-review:" + createHash("sha256").update(item.reviewId).digest("hex").slice(0, 40));
    const existing = ids.length ? await prisma.growthRecord.findMany({
      where: { businessId: business.id, recordType: "REVIEW_ITEM", externalId: { in: ids } }
    }) : [];
    const previousById = new Map(existing.map(row => [row.externalId, row]));
    const importedAt = new Date();
    for (const item of unique) {
      const externalId = "google-review:" + createHash("sha256").update(item.reviewId).digest("hex").slice(0, 40);
      const previousPayload = (previousById.get(externalId)?.payload || {}) as Record<string, unknown>;
      const parsedDate = item.reviewDate ? new Date(item.reviewDate) : importedAt;
      const recordedAt = Number.isNaN(parsedDate.getTime()) ? importedAt : parsedDate;
      const payload = {
        ...previousPayload, ...item,
        replyDraft: typeof previousPayload.replyDraft === "string" ? previousPayload.replyDraft : "",
        status: previousPayload.status === "REPLY_DRAFT" ? "REPLY_DRAFT" : item.status,
        importedAt: importedAt.toISOString()
      };
      await prisma.growthRecord.upsert({
        where: { businessId_recordType_externalId: { businessId: business.id, recordType: "REVIEW_ITEM", externalId } },
        create: { businessId: business.id, recordType: "REVIEW_ITEM", externalId, payload: payload as Prisma.InputJsonValue, source: "GOOGLE_API", recordedAt },
        update: { payload: payload as Prisma.InputJsonValue, source: "GOOGLE_API", recordedAt }
      });
      // CRM receives a review activity without linking it to a customer. Google review
      // display names are intentionally not retained or matched to POS identities.
      await prisma.customerEvent.upsert({
        where: { businessId_source_externalId: { businessId: business.id, source: "GOOGLE_BUSINESS_PROFILE", externalId } },
        create: {
          businessId: business.id,
          customerId: null,
          eventType: "REVIEW_SUBMITTED",
          source: "GOOGLE_BUSINESS_PROFILE",
          externalId,
          occurredAt: recordedAt,
          metadata: {
            rating: item.rating,
            reviewText: item.reviewText,
            reviewSource: "Google Business Profile",
            provenance: "GOOGLE_API"
          } as Prisma.InputJsonValue
        },
        update: {
          occurredAt: recordedAt,
          metadata: {
            rating: item.rating,
            reviewText: item.reviewText,
            reviewSource: "Google Business Profile",
            provenance: "GOOGLE_API"
          } as Prisma.InputJsonValue
        }
      });
    }
    await writeStatus(prisma, business.id, {
      status: "SUCCESS", checkedAt: importedAt.toISOString(), importedCount: unique.length,
      totalReviewCount, averageRating, pagesFetched, pageLimitReached: Boolean(pageToken),
      locationId: TARGET_LOCATION_ID, note: "Read-only sync; no replies were sent or published"
    });
    console.log(JSON.stringify({ businessId: business.id, status: "SUCCESS", importedCount: unique.length, totalReviewCount }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Google review sync error";
    await writeStatus(prisma, business.id, { status: "ERROR", checkedAt: new Date().toISOString(), message, locationId: TARGET_LOCATION_ID });
    console.error(JSON.stringify({ businessId: business.id, status: "ERROR", message }));
  }
}

async function main() {
  // Render Cron Jobs do not overlap runs of the same job; keep each invocation bounded.
  const businesses = await prisma.business.findMany({
    where: { googleConnection: { isNot: null } },
    include: { googleConnection: true }
  });
  for (const business of businesses) await syncBusiness(business);
  console.log(JSON.stringify({ status: "COMPLETE", businessesChecked: businesses.length, completedAt: new Date().toISOString() }));
  await prisma.$disconnect();
}

main().catch(async error => {
  console.error("Google review auto-sync job failed:", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
