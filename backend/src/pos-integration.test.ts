import assert from "node:assert/strict";
import Fastify from "fastify";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { assertPosBusinessIdentity, posRecordExternalId } from "./pos-integration.js";

test("every POS integration route denies a business not owned by the authenticated user", async () => {
  process.env.DATABASE_URL ??= "postgresql://localboost:localboost_dev@localhost:5432/localboost?schema=public";
  process.env.JWT_SECRET ??= "test-only-localboost-jwt-secret-32-bytes-minimum";
  process.env.TOKEN_ENCRYPTION_KEY_BASE64 ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
  const { registerPosIntegrationRoutes } = await import("./pos-integration.js");
  const ownershipQueries: unknown[] = [];
  const db = { business: { findFirst: async (args: unknown) => { ownershipQueries.push(args); return null; } } } as unknown as PrismaClient;
  const app = Fastify();
  app.decorateRequest("userId", null);
  const requireUser = async (request: any) => { request.userId = "authenticated-user-a"; };
  await registerPosIntegrationRoutes(app, db, requireUser as any);
  const businessId = "business-owned-by-another-user";
  const requests = [
    { method: "GET", url: `/v1/businesses/${businessId}/pos-integration` },
    { method: "POST", url: `/v1/businesses/${businessId}/pos-integration/connect`, payload: { apiKey: "lb_0123456789abcdef0123456789abcdef" } },
    { method: "POST", url: `/v1/businesses/${businessId}/pos-integration/test` },
    { method: "POST", url: `/v1/businesses/${businessId}/pos-integration/sync` }
  ] as const;
  try {
    for (const request of requests) {
      const response = await app.inject(request as any);
      assert.equal(response.statusCode, 404, request.method + " " + request.url);
      assert.deepEqual(response.json(), { error: "Business not found" });
    }
    assert.equal(ownershipQueries.length, requests.length);
    for (const query of ownershipQueries) assert.deepEqual(query, { where: { id: businessId, ownerId: "authenticated-user-a" } });
  } finally { await app.close(); }
});

test("Paanagam imports reject a different POS business identity", () => {
  const response = { source: "paanagam-pos", api_version: "v1", business_id: "business-a" };
  assert.doesNotThrow(() => assertPosBusinessIdentity(response, "business-a"));
  assert.throws(() => assertPosBusinessIdentity(response, "business-b"), /business identity mismatch/i);
  assert.throws(() => assertPosBusinessIdentity({ ...response, api_version: "v2" }, "business-a"), /unexpected POS API response/i);
});

test("Paanagam record keys are stable and namespaced by data type", () => {
  assert.equal(posRecordExternalId("daily", "2026-11-17"), "paanagam-pos:daily:2026-11-17");
  assert.notEqual(posRecordExternalId("daily", "2026-11-17"), posRecordExternalId("item-sales", "2026-11-17"));
});
