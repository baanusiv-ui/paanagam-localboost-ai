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


test("normalizes a bilingual JSON object accidentally embedded in postCopy", () => {
  assert.deepEqual(parseContentDraftOutput(JSON.stringify({
    postCopy: JSON.stringify({ Tamil: "இன்று பானகத்தில் சந்திப்போம்.", English: "See you at Paanagam today." }),
    creativeBrief: "A simple warm-toned cafe visual"
  })), {
    postCopy: "இன்று பானகத்தில் சந்திப்போம்.\\n\\nSee you at Paanagam today.",
    creativeBrief: "A simple warm-toned cafe visual"
  });
});

test("keeps plain bilingual prose unchanged", () => {
  assert.equal(parseContentDraftOutput(JSON.stringify({
    postCopy: "வணக்கம்.\\n\\nHello.",
    creativeBrief: "Warm visual"
  })).postCopy, "வணக்கம்.\\n\\nHello.");
});
