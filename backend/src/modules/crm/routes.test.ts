import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { PrismaClient } from "@prisma/client";
import { registerCrmRoutes } from "./routes.js";

function harness(overrides: Record<string, unknown> = {}) {
  const db = {
    business: { findFirst: async () => ({ id: "biz-owned", ownerId: "user-1" }) },
    customer: {
      findMany: async () => [],
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "cus-1", ...data }),
      findFirst: async () => null,
      update: async ({ data }: { data: Record<string, unknown> }) => ({ id: "cus-1", ...data })
    },
    customerConsent: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "consent-1", ...data }) },
    customerEvent: { create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "event-1", ...data }) },
    $transaction: async (callback: (tx: unknown) => unknown) => callback(db)
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
