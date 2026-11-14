import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLocalSocialContentMessages } from "./local-social-content-drafts.js";

const input = {
  businessName: "Paanagam",
  topic: "Filter coffee customer welcome",
  evidence: "Saved menu item: filter coffee. No price supplied.",
  language: "Tamil + English" as const,
  format: "SQUARE" as const,
  tone: "WARM" as const
};

test("local social content prompt carries supplied evidence and forbids invented facts", () => {
  const messages = buildLocalSocialContentMessages(input);
  assert.equal(messages.length, 2);
  assert.match(messages[0]!.content, /Never invent prices/);
  assert.match(messages[0].content, /Tamil \+ English/);
  const payload = JSON.parse(messages[1]!.content);
  assert.equal(payload.businessName, "Paanagam");
  assert.equal(payload.evidence, input.evidence);
});

test("prompt bounds long source evidence before sending it to the model", () => {
  const messages = buildLocalSocialContentMessages({ ...input, evidence: "x".repeat(3000) });
  const payload = JSON.parse(messages[1].content);
  assert.equal(payload.evidence.length, 1800);
});
