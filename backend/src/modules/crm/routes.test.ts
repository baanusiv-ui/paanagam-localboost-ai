import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { PrismaClient } from "@prisma/client";
import { registerCrmRoutes } from "./routes.js";

function harness(overrides: Record<string, unknown> = {}) {
  const db = {
    business: { findFirst: async () => ({ id: "biz-owned", ownerId: "user-1" }), findUnique: async () => ({ customerRetentionMonths: 36 }), update: async ({ data }: { data: Record<string, unknown> }) => data },
    customer: {
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "cus-1", ...data }),
      findFirst: async () => null,
      update: async ({ data }: { data: Record<string, unknown> }) => ({ id: "cus-1", ...data }),
      deleteMany: async () => ({ count: 1 })
    },
    customerConsent: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "consent-1", ...data }) },
    customerEvent: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "event-1", ...data }), deleteMany: async () => ({ count: 0 }) },
    activityEvent: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "audit-1", ...data }) },
    $transaction: async (callback: (tx: any) => unknown) => callback(db)
  };
  Object.assign(db, overrides);
  const app = Fastify();
  const requireUser = async (request: { userId?: string | null }) => { request.userId = "user-1"; };
  return { app, db, requireUser };
}

test("CRM customer list is scoped through the authenticated business owner", async () => {
  let listCalled = false;
  const { app, db, requireUser } = harness({
    business: { findFirst: async () => null },
    customer: { findMany: async () => { listCalled = true; return []; } }
  });
  await registerCrmRoutes(app, db as unknown as PrismaClient, requireUser as never);
  const response = await app.inject({ method: "GET", url: "/v1/businesses/other-business/customers" });
  assert.equal(response.statusCode, 404);
  assert.equal(listCalled, false);
  await app.close();
});

test("CRM customer creation requires a valid E.164 phone or email", async () => {
  const { app, db, requireUser } = harness();
  await registerCrmRoutes(app, db as unknown as PrismaClient, requireUser as never);
  const response = await app.inject({
    method: "POST",
    url: "/v1/businesses/biz-owned/customers",
    payload: { name: "Test customer", phone: "9876543210" }
  });
  assert.equal(response.statusCode, 400);
  await app.close();
});

test("CRM customer creation writes only within the owned business", async () => {
  let createdBusinessId = "";
  const { app, db, requireUser } = harness({
    customer: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdBusinessId = String(data.businessId);
        return { id: "cus-1", ...data };
      }
    }
  });
  await registerCrmRoutes(app, db as unknown as PrismaClient, requireUser as never);
  const response = await app.inject({
    method: "POST",
    url: "/v1/businesses/biz-owned/customers",
    payload: { name: "Test customer", phone: "+919876543210" }
  });
  assert.equal(response.statusCode, 201);
  assert.equal(createdBusinessId, "biz-owned");
  await app.close();
});

test("CRM consent endpoint appends a decision rather than overwriting history", async () => {
  let consentGranted: unknown;
  const { app, db, requireUser } = harness({
    customer: { findFirst: async () => ({ id: "cus-1" }) },
    customerConsent: { create: async ({ data }: { data: Record<string, unknown> }) => {
      consentGranted = data.granted;
      return { id: "consent-1", ...data };
    } }
  });
  await registerCrmRoutes(app, db as unknown as PrismaClient, requireUser as never);
  const response = await app.inject({
    method: "POST",
    url: "/v1/businesses/biz-owned/customers/cus-1/consents",
    payload: { channel: "WHATSAPP", purpose: "MARKETING", granted: false, source: "OWNER_REQUEST" }
  });
  assert.equal(response.statusCode, 201);
  assert.equal(consentGranted, false);
  await app.close();
});

test("CRM export is business-scoped and includes consent and event history", async () => {
  let query: any;
  const { app, db, requireUser } = harness({ customer: { findFirst: async (args: any) => { query = args; return { id: "cus-1", consents: [], events: [] }; } } });
  await registerCrmRoutes(app, db as unknown as PrismaClient, requireUser as never);
  const response = await app.inject({ method: "GET", url: "/v1/businesses/biz-owned/customers/cus-1/export" });
  assert.equal(response.statusCode, 200);
  assert.equal(query.where.businessId, "biz-owned");
  assert.ok(response.headers["content-disposition"]?.includes("attachment"));
  await app.close();
});

test("CRM customer deletion requires the exact confirmation phrase", async () => {
  let erased = false;
  const { app, db, requireUser } = harness({
    customer: { findFirst: async () => ({ id: "cus-1" }), deleteMany: async () => { erased = true; return { count: 1 }; } }
  });
  await registerCrmRoutes(app, db as unknown as PrismaClient, requireUser as never);
  const response = await app.inject({ method: "DELETE", url: "/v1/businesses/biz-owned/customers/cus-1", payload: { confirmation: "yes" } });
  assert.equal(response.statusCode, 400);
  assert.equal(erased, false);
  await app.close();
});

test("CRM retention policy is tenant-scoped and bounded", async () => {
  let updated = 0;
  const { app, db, requireUser } = harness({
    business: { findFirst: async () => ({ id: "biz-owned", ownerId: "user-1" }), update: async ({ data }: any) => { updated = data.customerRetentionMonths; return { customerRetentionMonths: updated }; } }
  });
  await registerCrmRoutes(app, db as unknown as PrismaClient, requireUser as never);
  const invalid = await app.inject({ method: "PATCH", url: "/v1/businesses/biz-owned/crm-retention", payload: { retentionMonths: 2 } });
  assert.equal(invalid.statusCode, 400);
  const valid = await app.inject({ method: "PATCH", url: "/v1/businesses/biz-owned/crm-retention", payload: { retentionMonths: 48 } });
  assert.equal(valid.statusCode, 200);
  assert.equal(updated, 48);
  await app.close();
});

test("CRM customer deletion erases linked data only after exact owner confirmation", async () => {
  let customerEventsDeleted = false, customerDeleted = false, auditWritten = false;
  const { app, db, requireUser } = harness({
    customer: { findFirst: async () => ({ id: "cus-1" }), deleteMany: async () => { customerDeleted = true; return { count: 1 }; } },
    customerEvent: { deleteMany: async () => { customerEventsDeleted = true; return { count: 2 }; } },
    activityEvent: { create: async ({ data }: any) => { auditWritten = data.eventType === "CRM_CUSTOMER_ERASED" && data.entityId === null; return { id: "audit-1" }; } }
  });
  await registerCrmRoutes(app, db as unknown as PrismaClient, requireUser as never);
  const response = await app.inject({ method: "DELETE", url: "/v1/businesses/biz-owned/customers/cus-1", payload: { confirmation: "DELETE CUSTOMER" } });
  assert.equal(response.statusCode, 204);
  assert.equal(customerEventsDeleted, true);
  assert.equal(customerDeleted, true);
  assert.equal(auditWritten, true);
  await app.close();
});


test("CRM retention erasure is limited to the exact customer IDs shown in the preview", async () => {
  let selectedIds: string[] = [], deletedIds: string[] = [], eventsDeleted = false;
  const { app, db, requireUser } = harness({
    customer: {
      findMany: async ({ where }: any) => {
        selectedIds = where.id.in;
        return [{ id: "cus-a" }, { id: "cus-b" }];
      },
      deleteMany: async ({ where }: any) => { deletedIds = where.id.in; return { count: deletedIds.length }; }
    },
    customerEvent: { deleteMany: async ({ where }: any) => { eventsDeleted = true; assert.deepEqual(where.customerId.in, ["cus-a", "cus-b"]); return { count: 2 }; } }
  });
  await registerCrmRoutes(app, db as unknown as PrismaClient, requireUser as never);
  const response = await app.inject({
    method: "POST",
    url: "/v1/businesses/biz-owned/crm-retention/apply",
    payload: { confirmation: "DELETE EXPIRED CUSTOMER DATA", expectedCustomerIds: ["cus-b", "cus-a"] }
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(selectedIds, ["cus-a", "cus-b"]);
  assert.deepEqual(deletedIds, ["cus-a", "cus-b"]);
  assert.equal(eventsDeleted, true);
  assert.equal(response.json().previewBound, true);
  await app.close();
});

test("CRM retention erasure rejects a stale preview without deleting records", async () => {
  let deleted = false;
  const { app, db, requireUser } = harness({
    customer: {
      findMany: async () => [{ id: "cus-a" }],
      deleteMany: async () => { deleted = true; return { count: 1 }; }
    }
  });
  await registerCrmRoutes(app, db as unknown as PrismaClient, requireUser as never);
  const response = await app.inject({
    method: "POST",
    url: "/v1/businesses/biz-owned/crm-retention/apply",
    payload: { confirmation: "DELETE EXPIRED CUSTOMER DATA", expectedCustomerIds: ["cus-a", "cus-b"] }
  });
  assert.equal(response.statusCode, 409);
  assert.equal(deleted, false);
  await app.close();
});

test("CRM retention erasure requires unique preview IDs and exact confirmation", async () => {
  let queried = false;
  const { app, db, requireUser } = harness({ customer: { findMany: async () => { queried = true; return []; } } });
  await registerCrmRoutes(app, db as unknown as PrismaClient, requireUser as never);
  const response = await app.inject({
    method: "POST",
    url: "/v1/businesses/biz-owned/crm-retention/apply",
    payload: { confirmation: "yes", expectedCustomerIds: ["cus-a", "cus-a"] }
  });
  assert.equal(response.statusCode, 400);
  assert.equal(queried, false);
  await app.close();
});
