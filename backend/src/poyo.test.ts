import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/localboost?schema=public";
process.env.JWT_SECRET ??= "test-jwt-secret-at-least-32-characters-long";
process.env.TOKEN_ENCRYPTION_KEY_BASE64 ??= "dGVzdC1lbmNyeXB0aW9uLWtleS1mb3ItdGVzdHM=";
process.env.POYO_ENABLED = "true";
process.env.POYO_API_KEY = "test-poyo-api-key";

const { verifyPoyoWebhook, getPoyoBalance, getPoyoTaskStatus, submitPoyoGeneration } = await import("./poyo.js");

test("accepts a correctly signed PoYo webhook within the five-minute window", () => {
  const taskId = "task-test-123";
  const timestamp = "1783680000";
  const secret = "test-webhook-secret";
  const signature = createHmac("sha256", secret).update(taskId + "." + timestamp).digest("base64");
  assert.equal(verifyPoyoWebhook({ taskId, timestamp, signature, secret, nowSeconds: Number(timestamp) + 120 }), true);
});

test("rejects an invalid signature", () => {
  assert.equal(verifyPoyoWebhook({
    taskId: "task-test-123", timestamp: "1783680000", signature: "not-a-signature",
    secret: "test-webhook-secret", nowSeconds: 1783680000
  }), false);
});

test("rejects stale webhook timestamps", () => {
  const taskId = "task-test-123";
  const timestamp = "1783680000";
  const secret = "test-webhook-secret";
  const signature = createHmac("sha256", secret).update(taskId + "." + timestamp).digest("base64");
  assert.equal(verifyPoyoWebhook({ taskId, timestamp, signature, secret, nowSeconds: Number(timestamp) + 301 }), false);
});

test("rejects malformed webhook timestamps", () => {
  assert.equal(verifyPoyoWebhook({
    taskId: "task-test-123", timestamp: "yesterday", signature: "anything",
    secret: "test-webhook-secret", nowSeconds: 1783680000
  }), false);
});

test("reads and validates the PoYo account balance response", async () => {
  let requestedUrl = "";
  const balance = await getPoyoBalance(async (input, init) => {
    requestedUrl = String(input);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-poyo-api-key");
    return Response.json({ code: 200, data: { email: "owner@example.com", credits_amount: 125.5 } });
  });
  assert.equal(requestedUrl.endsWith("/api/user/balance"), true);
  assert.deepEqual(balance, { email: "owner@example.com", creditsAmount: 125.5 });
});

test("maps the provider task status response", async () => {
  const status = await getPoyoTaskStatus("task-123", async (input) => {
    assert.equal(String(input).endsWith("/api/generate/status/task-123"), true);
    return Response.json({ code: 200, data: {
      task_id: "task-123", status: "finished", progress: 100,
      files: [{ file_url: "https://cdn.example.test/result.mp4", file_type: "video" }]
    } });
  });
  assert.equal(status.status, "finished");
  assert.equal(status.progress, 100);
  assert.equal(status.files?.[0]?.file_type, "video");
});

test("submits the documented model/input envelope and end-user attribution", async () => {
  let submittedBody: Record<string, unknown> | undefined;
  let attribution = "";
  const result = await submitPoyoGeneration({
    model: "model-test", input: { prompt: "test prompt" },
    callbackUrl: "https://localboost.example.test/v1/poyo/webhook",
    endUserId: "business-owner-123"
  }, async (_input, init) => {
    submittedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    attribution = new Headers(init?.headers).get("X-End-User-ID") ?? "";
    return Response.json({ code: 200, data: { task_id: "provider-task-123" } });
  });
  assert.deepEqual(submittedBody, {
    model: "model-test", input: { prompt: "test prompt" },
    callback_url: "https://localboost.example.test/v1/poyo/webhook"
  });
  assert.equal(attribution, "business-owner-123");
  assert.equal(result.taskId, "provider-task-123");
});

test("rejects non-HTTPS callback URLs before making a provider request", async () => {
  let called = false;
  await assert.rejects(() => submitPoyoGeneration({
    model: "model-test", input: {}, callbackUrl: "http://localhost/webhook"
  }, async () => {
    called = true;
    return Response.json({});
  }), /must use HTTPS/);
  assert.equal(called, false);
});
