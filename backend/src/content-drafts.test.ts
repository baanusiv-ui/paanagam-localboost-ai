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
  assert.ok(messages[0]!.content.includes("plain strings"));
  assert.ok(messages[1]!.content.includes('"offer":""'));
});

test("content output accepts valid string brief and rejects missing or extra fields", () => {
  assert.deepEqual(parseContentDraftOutput('{"postCopy":"A fresh coffee update","creativeBrief":"Vertical coffee cup photo with warm natural light"}'), {
    postCopy: "A fresh coffee update",
    creativeBrief: "Vertical coffee cup photo with warm natural light"
  });
  assert.throws(() => parseContentDraftOutput('{"postCopy":"","creativeBrief":"Brief"}'));
  assert.throws(() => parseContentDraftOutput('{"postCopy":"Copy","creativeBrief":"Brief","price":"₹99"}'));
});

test("content output normalizes provider structured creative briefs into bounded text", () => {
  const result = parseContentDraftOutput(JSON.stringify({
    postCopy: "காபியின் மணம்!",
    creativeBrief: {
      subject: "South Indian filter coffee",
      composition: "Close-up cup on wooden table",
      lighting: "Warm morning light",
      avoid: ["text", "invented prices"]
    }
  }));
  assert.equal(result.postCopy, "காபியின் மணம்!");
  assert.match(result.creativeBrief, /subject: South Indian filter coffee/);
  assert.match(result.creativeBrief, /composition: Close-up cup on wooden table/);
  assert.match(result.creativeBrief, /avoid 1: text/);
  assert.ok(result.creativeBrief.length <= 1200);
});

test("content output rejects an empty structured creative brief", () => {
  assert.throws(() => parseContentDraftOutput('{"postCopy":"Copy","creativeBrief":{}}'));
});
