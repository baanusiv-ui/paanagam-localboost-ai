import assert from "node:assert/strict";
import Fastify from "fastify";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { registerPosIntegrationRoutes } from "./pos-integration.js";

test("every POS integration route denies a business not owned by the authenticated user", async () => {
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
