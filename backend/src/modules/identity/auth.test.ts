import assert from "node:assert/strict";
import { test } from "node:test";
import type { FastifyReply, FastifyRequest } from "fastify";
import { createRequireUser } from "./auth.js";

function makeReply() {
  const result: { status?: number; body?: unknown } = {};
  const reply = {
    code(status: number) { result.status = status; return this; },
    send(body: unknown) { result.body = body; return result; }
  };
  return { reply: reply as unknown as FastifyReply, result };
}

test("requireUser rejects requests without a bearer token", async () => {
  const handler = createRequireUser(async () => "user-1");
  const request = { headers: {}, userId: null } as unknown as FastifyRequest;
  const { reply, result } = makeReply();

  await handler(request, reply);

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: "Authentication required" });
});

test("requireUser sets userId after successful token verification", async () => {
  let receivedToken = "";
  const handler = createRequireUser(async (token) => {
    receivedToken = token;
    return "user-verified";
  });
  const request = {
    headers: { authorization: "Bearer valid-token" },
    userId: null
  } as unknown as FastifyRequest;
  const { reply, result } = makeReply();

  await handler(request, reply);

  assert.equal(receivedToken, "valid-token");
  assert.equal(request.userId, "user-verified");
  assert.equal(result.status, undefined);
});

test("requireUser rejects invalid or expired tokens", async () => {
  const handler = createRequireUser(async () => { throw new Error("invalid"); });
  const warnings: Array<{ metadata: unknown; message: string }> = [];
  const request = {
    headers: { authorization: "Bearer expired-token" },
    userId: null,
    log: {
      warn(metadata: unknown, message: string) {
        warnings.push({ metadata, message });
      }
    }
  } as unknown as FastifyRequest;
  const { reply, result } = makeReply();

  await handler(request, reply);

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: "Invalid or expired access token" });
  assert.equal(warnings.length, 1);
  const warning = warnings[0];
  assert.ok(warning);
  assert.equal(warning.message, "Neon Auth access-token verification failed");
  assert.deepEqual(warning.metadata, {
    authFailure: { name: "Error", code: undefined, message: "invalid" }
  });
});
