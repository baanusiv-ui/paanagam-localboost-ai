import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { apiErrorHandler } from "./error-handler.js";

async function build(options: { bodyLimit?: number; limit?: number } = {}) {
  const app = Fastify({ bodyLimit: options.bodyLimit ?? 1024 });
  if (options.limit) await app.register(rateLimit, { max: options.limit, timeWindow: "1 minute" });
  app.setErrorHandler(apiErrorHandler);
  app.post("/echo", async request => ({ ok: true, body: request.body }));
  app.post("/validated", { schema: { body: { type: "object", required: ["name"], properties: { name: { type: "string" } } } } }, async () => ({ ok: true }));
  app.get("/boom", async () => { throw new Error("database password is hunter2"); });
  app.get("/upstream/:status", async request => {
    const error = new Error("Canva said no") as Error & { statusCode?: number };
    error.statusCode = Number((request.params as { status: string }).status);
    throw error;
  });
  app.get("/ping", async () => ({ pong: true }));
  return app;
}

test("malformed JSON keeps its 400 status with a fixed message", async () => {
  const app = await build();
  const res = await app.inject({ method: "POST", url: "/echo", headers: { "content-type": "application/json" }, payload: "{not json" });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), { error: "Invalid request" });
});

test("schema validation failures keep 400 without leaking validator details", async () => {
  const app = await build();
  const res = await app.inject({ method: "POST", url: "/validated", payload: {} });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), { error: "Invalid request" });
});

test("oversized bodies return 413 and unsupported media types return 415", async () => {
  const app = await build({ bodyLimit: 20 });
  const large = await app.inject({ method: "POST", url: "/echo", headers: { "content-type": "application/json" }, payload: JSON.stringify({ text: "x".repeat(200) }) });
  assert.equal(large.statusCode, 413);
  assert.deepEqual(large.json(), { error: "Request body too large" });
  const media = await app.inject({ method: "POST", url: "/echo", headers: { "content-type": "text/xml" }, payload: "<a/>" });
  assert.equal(media.statusCode, 415);
  assert.deepEqual(media.json(), { error: "Unsupported media type" });
});

test("rate limiting is reported as 429, not as a server error", async () => {
  const app = await build({ limit: 1 });
  assert.equal((await app.inject({ method: "GET", url: "/ping" })).statusCode, 200);
  const limited = await app.inject({ method: "GET", url: "/ping" });
  assert.equal(limited.statusCode, 429);
  assert.deepEqual(limited.json(), { error: "Too many requests. Try again shortly." });
});

test("unexpected errors stay 500 and never leak their message", async () => {
  const app = await build();
  const res = await app.inject({ method: "GET", url: "/boom" });
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.json(), { error: "Internal server error" });
  assert.ok(!res.body.includes("hunter2"));
});

test("upstream errors carrying their own statusCode are not forwarded to the dashboard", async () => {
  const app = await build();
  for (const status of [400, 401, 403, 404, 413, 422]) {
    const res = await app.inject({ method: "GET", url: "/upstream/" + status });
    assert.equal(res.statusCode, 500, "upstream " + status + " must not become the API's own status");
    assert.deepEqual(res.json(), { error: "Internal server error" });
  }
});
