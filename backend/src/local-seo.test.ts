import test from "node:test";
import assert from "node:assert/strict";
import { generateLocalKeywords } from "./local-seo.js";

test("generates locality and service keyword ideas without fabricated metrics", () => {
  const result = generateLocalKeywords({
    businessName: "Paanagam",
    category: "Coffee shop",
    locality: "Namakkal",
    services: ["Filter coffee", "Snacks"],
    language: "Tamil + English"
  });
  assert.ok(result.some(item => item.keyword === "Filter coffee in Namakkal"));
  assert.ok(result.some(item => item.keyword === "best Filter coffee in Namakkal"));
  assert.ok(result.some(item => item.keyword === "Namakkal Filter coffee"));
  assert.ok(result.every(item => item.source === "RULES_GENERATED"));
  assert.ok(result.every(item => !("searchVolume" in item) && !("rank" in item)));
});

test("requires a locality and at least one service term", () => {
  assert.deepEqual(generateLocalKeywords({
    businessName: "Paanagam", locality: "", services: ["Coffee"], language: "English"
  }), []);
  assert.deepEqual(generateLocalKeywords({
    businessName: "Paanagam", locality: "Namakkal", services: [], language: "English"
  }), []);
});

test("deduplicates keyword ideas and caps the output", () => {
  const result = generateLocalKeywords({
    businessName: "Paanagam",
    locality: "Namakkal",
    services: ["Coffee", "Coffee", "Tea"],
    language: "Tamil + English"
  });
  assert.equal(new Set(result.map(item => item.keyword.toLowerCase())).size, result.length);
  assert.ok(result.length <= 30);
});
