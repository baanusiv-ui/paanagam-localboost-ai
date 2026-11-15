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
  assert.match(messages[0]!.content, /Tamil \+ English/);
  const payload = JSON.parse(messages[1]!.content);
  assert.equal(payload.businessName, "Paanagam");
  assert.equal(payload.evidence, input.evidence);
});

test("prompt bounds long source evidence before sending it to the model", () => {
  const messages = buildLocalSocialContentMessages({ ...input, evidence: "x".repeat(3000) });
  const payload = JSON.parse(messages[1]!.content);
  assert.equal(payload.evidence.length, 1800);
});


import { parseLocalSocialContentDraftOutput } from "./local-social-content-drafts.js";

test("parses plain string fields from local model JSON", () => {
  assert.deepEqual(parseLocalSocialContentDraftOutput(JSON.stringify({
    postCopy: "வணக்கம்",
    creativeBrief: "Warm coffee poster"
  })), { postCopy: "வணக்கம்", creativeBrief: "Warm coffee poster" });
});

test("normalizes object-wrapped text fields returned by local models", () => {
  assert.deepEqual(parseLocalSocialContentDraftOutput(JSON.stringify({
    postCopy: { text: "வணக்கம்" },
    creativeBrief: { description: "Warm coffee poster" }
  })), { postCopy: "வணக்கம்", creativeBrief: "Warm coffee poster" });
});

test("rejects object fields without a clear text value", () => {
  assert.throws(() => parseLocalSocialContentDraftOutput(JSON.stringify({
    postCopy: { headline: "வணக்கம்", footer: "Welcome" },
    creativeBrief: "Warm coffee poster"
  })), /unsupported postCopy format/);
});


test("renders bilingual JSON accidentally embedded in postCopy as plain Tamil and English", () => {
  assert.deepEqual(parseLocalSocialContentDraftOutput(JSON.stringify({
    postCopy: JSON.stringify({ Tamil: "இன்று பானகத்தில் சந்திப்போம்.", English: "See you at Paanagam today." }),
    creativeBrief: "Warm cafe visual"
  })), {
    postCopy: "இன்று பானகத்தில் சந்திப்போம்.\\n\\nSee you at Paanagam today.",
    creativeBrief: "Warm cafe visual"
  });
});
