import test from "node:test";
import assert from "node:assert/strict";
import { buildReviewReplyMessages, parseReviewReplyOutput, redactReviewPersonalData } from "./review-replies.js";

test("review reply prompt redacts email and Indian mobile numbers", () => {
  const messages = buildReviewReplyMessages({
    businessName: "Paanagam",
    reviewText: "Please contact me at guest@example.com or 9876543210. Food was cold.",
    rating: 2,
    language: "Tamil",
    tone: "APOLOGETIC"
  });
  const userContent = messages[1]!.content;
  assert.ok(userContent.includes("[redacted email]"));
  assert.ok(userContent.includes("[redacted phone]"));
  assert.ok(!userContent.includes("guest@example.com"));
  assert.ok(!userContent.includes("9876543210"));
});

test("review reply prompt preserves language, tone and review rating", () => {
  const messages = buildReviewReplyMessages({
    businessName: "Paanagam",
    reviewText: "Coffee was excellent",
    rating: 5,
    language: "Tamil + English",
    tone: "WARM"
  });
  assert.ok(messages[0]!.content.includes("Tamil + English"));
  assert.ok(messages[0]!.content.includes("WARM"));
  assert.ok(messages[1]!.content.includes('"rating":5'));
});

test("reply output must be valid, non-empty and within the schema", () => {
  assert.deepEqual(parseReviewReplyOutput('{"reply":"Thank you for visiting us."}'), {
    reply: "Thank you for visiting us."
  });
  assert.throws(() => parseReviewReplyOutput('{"reply":""}'));
  assert.throws(() => parseReviewReplyOutput('{"reply":"Thanks","extra":"not allowed"}'));
});
