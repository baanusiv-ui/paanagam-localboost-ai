import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { PrismaClient } from "@prisma/client";
import { registerPoyoRoutes } from "./poyo-routes.js";

test("all PoYo business routes reject a foreign-owned business before touching task or asset data", async () => {
  const ownershipLookups: unknown[] = [];
  const forbiddenCalls: string[] = [];
  const db = {
    business: { findFirst: async (args: unknown) => { ownershipLookups.push(args); return null; } },
    user: { findUnique: async () => { forbiddenCalls.push("user.findUnique"); return null; } },
    poyoCreativeTask: new Proxy({}, { get: (_target, property) => async () => { forbiddenCalls.push("poyoCreativeTask." + String(property)); return null; } }),
    creativeAsset: new Proxy({}, { get: (_target, property) => async () => { forbiddenCalls.push("creativeAsset." + String(property)); return null; } }),
    activityEvent: { create: async () => { forbiddenCalls.push("activityEvent.create"); return null; } }
  } as unknown as PrismaClient;

  const app = Fastify();
  app.decorateRequest("userId", null);
  const requireUser = async (request: { userId?: string }) => { request.userId = "authenticated-owner"; };
  registerPoyoRoutes(app, db, requireUser as never);

  const cases = [
    { method: "GET", url: "/v1/businesses/foreign-business/poyo/tasks" },
    { method: "POST", url: "/v1/businesses/foreign-business/poyo/tasks", payload: { mediaType: "IMAGE", modelId: "nano-banana-2.1", prompt: "test prompt", modelInput: {} } },
    { method: "POST", url: "/v1/businesses/foreign-business/poyo/tasks/task-1/submit" },
    { method: "POST", url: "/v1/businesses/foreign-business/poyo/tasks/task-1/refresh" },
    { method: "POST", url: "/v1/businesses/foreign-business/poyo/tasks/task-1/approve" },
    { method: "GET", url: "/v1/businesses/foreign-business/poyo/assets/asset-1/content" },
    { method: "GET", url: "/v1/businesses/foreign-business/poyo/tasks/task-1" }
  ] as const;

  for (const item of cases) {
    const response = await app.inject({ ...item, headers: { authorization: "Bearer test-token" } });
    assert.equal(response.statusCode, 404, item.method + " " + item.url + " must conceal foreign business existence");
  }

  assert.equal(ownershipLookups.length, cases.length);
  for (const args of ownershipLookups) {
    assert.deepEqual(args, { where: { id: "foreign-business", ownerId: "authenticated-owner" } });
  }
  assert.deepEqual(forbiddenCalls, []);
  await app.close();
});
