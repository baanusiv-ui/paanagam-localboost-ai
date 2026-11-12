import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/localboost?schema=public";
process.env.JWT_SECRET ??= "test-jwt-secret-at-least-32-characters-long";
process.env.TOKEN_ENCRYPTION_KEY_BASE64 ??= "dGVzdC1lbmNyeXB0aW9uLWtleS1mb3ItdGVzdHM=";

const { verifyPoyoWebhook } = await import("./poyo.js");

test("accepts a correctly signed PoYo webhook within the five-minute window", () => {
  const taskId = "task-test-123";
  const timestamp = "1783680000";
  const secret = "test-webhook-secret";
  const signature = createHmac("sha256", secret).update(taskId + "." + timestamp).digest("base64");
  assert.equal(verifyPoyoWebhook({ taskId, timestamp, signature, secret, nowSeconds: Number(timestamp) + 120 }), true);
});

test("rejects an invalid signature", () => {
  assert.equal(verifyPoyoWebhook({
    taskId: "task-test-123",
    timestamp: "1783680000",
    signature: "not-a-signature",
    secret: "test-webhook-secret",
    nowSeconds: 1783680000
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
    taskId: "task-test-123",
    timestamp: "yesterday",
    signature: "anything",
    secret: "test-webhook-secret",
    nowSeconds: 1783680000
  }), false);
});
