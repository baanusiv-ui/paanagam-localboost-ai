import assert from "node:assert/strict";
import Fastify from "fastify";
import { test } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { registerCrmRoutes } from "./routes.js";

test("every CRM route denies a business that the authenticated user does not own", async () => {
  const ownershipQueries: unknown[] = [];
  const db = { business: { findFirst: async (args: unknown) => { ownershipQueries.push(args); return null; } } } as unknown as PrismaClient;
  const app = Fastify();
  app.decorateRequest("userId", null);
  const requireUser = async (request: any) => { request.userId = "authenticated-user-a"; };
  await registerCrmRoutes(app, db, requireUser as any);
  const businessId = "business-owned-by-another-user";
  const customerId = "customer-owned-by-another-user";
  const requests = [
    { method: "GET", url: `/v1/businesses/${businessId}/crm/customer-voice` },
    { method: "GET", url: `/v1/businesses/${businessId}/customers` },
    { method: "POST", url: `/v1/businesses/${businessId}/customers`, payload: { phone: "+919876543210" } },
    { method: "GET", url: `/v1/businesses/${businessId}/customers/${customerId}` },
    { method: "PATCH", url: `/v1/businesses/${businessId}/customers/${customerId}`, payload: { name: "Changed" } },
    { method: "POST", url: `/v1/businesses/${businessId}/customers/${customerId}/consents`, payload: { channel: "EMAIL", purpose: "MARKETING", granted: true, source: "OWNER" } },
    { method: "POST", url: `/v1/businesses/${businessId}/customer-events`, payload: { eventType: "PURCHASE_RECORDED", source: "OWNER" } },
    { method: "GET", url: `/v1/businesses/${businessId}/customers/${customerId}/export` },
    { method: "DELETE", url: `/v1/businesses/${businessId}/customers/${customerId}`, payload: { confirmation: "DELETE CUSTOMER" } },
    { method: "GET", url: `/v1/businesses/${businessId}/crm-retention` },
    { method: "PATCH", url: `/v1/businesses/${businessId}/crm-retention`, payload: { retentionMonths: 36 } },
    { method: "GET", url: `/v1/businesses/${businessId}/crm-retention/preview` },
    { method: "POST", url: `/v1/businesses/${businessId}/crm-retention/apply`, payload: { confirmation: "DELETE EXPIRED CUSTOMER DATA", expectedCustomerIds: [customerId] } }
  ] as const;
  try {
    for (const request of requests) {
      const response = await app.inject(request as any);
      assert.equal(response.statusCode, 404, request.method + " " + request.url);
      assert.deepEqual(response.json(), { error: "Business not found." });
    }
    assert.equal(ownershipQueries.length, requests.length);
    for (const query of ownershipQueries) assert.deepEqual(query, { where: { id: businessId, ownerId: "authenticated-user-a" } });
  } finally { await app.close(); }
});
