import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import type { PrismaClient } from "@prisma/client";
import { createRequireUser } from "./auth.js";
import { registerIdentityRoutes } from "./routes.js";

const profile = {
  id: "user-1",
  email: "owner@example.com",
  name: "Owner",
  createdAt: new Date("2026-01-01T00:00:00.000Z")
};

function makeApp(overrides: Record<string, unknown> = {}) {
  const calls: { create?: unknown; findUnique?: unknown } = {};
  const user = {
    create: async (args: unknown) => {
      calls.create = args;
      return profile;
    },
    findUnique: async (args: unknown) => {
      calls.findUnique = args;
      if ("findUnique" in overrides && typeof overrides.findUnique === "function") {
        return (overrides.findUnique as (args: unknown) => unknown)(args);
      }
      return { ...profile, passwordHash: "hashed-password" };
    }
  };
  const db = { user } as unknown as Pick<PrismaClient, "user">;
  const app = Fastify();
  app.decorateRequest("userId", null);
  const auth = createRequireUser(async (token) => {
    if (token !== "valid-token") throw new Error("invalid token");
    return "user-1";
  });
  registerIdentityRoutes(app, db, auth, {
    hashPassword: async (password) => "hashed:" + password,
    verifyPassword: async (hash, password) => hash === "hashed-password" && password === "correct-password",
    issueAccessToken: async (userId) => "access:" + userId
  });
  return { app, calls };
}

test("registration validates input, normalizes email and returns a 15-minute session", async () => {
  const { app, calls } = makeApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { email: "OWNER@EXAMPLE.COM", password: "long-enough-password", name: "Owner" }
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(calls.create, {
    data: { email: "owner@example.com", passwordHash: "hashed:long-enough-password", name: "Owner" },
    select: { id: true, email: true, name: true, createdAt: true }
  });
  assert.equal(response.json().accessToken, "access:user-1");
  assert.equal(response.json().expiresIn, 900);
  await app.close();
});

test("registration rejects a password shorter than 12 characters", async () => {
  const { app, calls } = makeApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { email: "owner@example.com", password: "short" }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(calls.create, undefined);
  await app.close();
});

test("login normalizes email and returns a session for a valid password", async () => {
  const { app, calls } = makeApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { email: "OWNER@EXAMPLE.COM", password: "correct-password" }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls.findUnique, { where: { email: "owner@example.com" } });
  assert.equal(response.json().accessToken, "access:user-1");
  await app.close();
});

test("login rejects an incorrect password", async () => {
  const { app } = makeApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { email: "owner@example.com", password: "incorrect" }
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test("current-user endpoint requires authentication and returns the caller profile", async () => {
  const { app, calls } = makeApp();
  const unauthenticated = await app.inject({ method: "GET", url: "/v1/me" });
  assert.equal(unauthenticated.statusCode, 401);

  const authenticated = await app.inject({
    method: "GET",
    url: "/v1/me",
    headers: { authorization: "Bearer valid-token" }
  });
  assert.equal(authenticated.statusCode, 200);
  assert.deepEqual(calls.findUnique, {
    where: { id: "user-1" },
    select: { id: true, email: true, name: true, createdAt: true }
  });
  assert.equal(authenticated.json().user.id, "user-1");
  await app.close();
});
