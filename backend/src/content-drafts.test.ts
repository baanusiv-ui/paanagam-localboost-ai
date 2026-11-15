import test from "node:test";
import assert from "node:assert/strict";
import { buildContentDraftMessages, parseContentDraftOutput } from "./content-drafts.js";

test("content prompt preserves supplied facts and requested format", () => {
  const messages = buildContentDraftMessages({
    businessName: "Paanagam",
    topic: "Filter coffee",
    offer: "",
    publishDate: "2026-11-12",
    language: "Tamil + English",
    format: "STORY",
    tone: "WARM"
  });
  assert.ok(messages[0]!.content.includes("Tamil + English"));
  assert.ok(messages[0]!.content.includes("STORY"));
  assert.ok(messages[0]!.content.includes("do not create an offer"));
  assert.ok(messages[1]!.content.includes('"offer":""'));
});

test("content output must contain both bounded draft fields and no extras", () => {
  assert.deepEqual(parseContentDraftOutput('{"postCopy":"A fresh coffee update","creativeBrief":"Vertical coffee cup photo with warm natural light"}'), {
    postCopy: "A fresh coffee update",
    creativeBrief: "Vertical coffee cup photo with warm natural light"
  });
  assert.throws(() => parseContentDraftOutput('{"postCopy":"","creativeBrief":"Brief"}'));
  assert.throws(() => parseContentDraftOutput('{"postCopy":"Copy","creativeBrief":"Brief","price":"₹99"}'));
});
