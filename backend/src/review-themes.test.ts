import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeReviewThemes } from "./review-themes.js";

test("matches Tamil and English themes and exposes heuristic provenance", () => {
  const result = analyzeReviewThemes([
    { reviewText: "Great coffee and friendly staff, நல்ல சுவை", rating: 5, reviewDate: "2026-11-01" },
    { reviewText: "விலை அதிகம், service தாமதம்", rating: 2, reviewDate: "2026-11-02" }
  ]);
  assert.equal(result.method, "BILINGUAL_KEYWORD_HEURISTIC");
  assert.equal(result.sampleSize, 2);
  assert.equal(result.textReviewCount, 2);
  assert.ok(result.themes.some(row => row.theme === "FOOD_QUALITY"));
  assert.ok(result.themes.some(row => row.theme === "PRICE_VALUE"));
  assert.ok(result.themes.some(row => row.theme === "WAIT_TIME"));
  assert.equal(result.sentiment.positive, 1);
  assert.equal(result.sentiment.negative, 1);
  assert.equal(result.dateFrom, "2026-11-01");
  assert.equal(result.dateTo, "2026-11-02");
});

test("counts rating-only reviews but does not invent themes", () => {
  const result = analyzeReviewThemes([{ rating: 5 }, { reviewText: " ", rating: 1 }]);
  assert.equal(result.sampleSize, 2);
  assert.equal(result.ratingOnlyCount, 2);
  assert.equal(result.textReviewCount, 0);
  assert.equal(result.themes.length, 0);
  assert.deepEqual(result.sentiment, { positive: 0, negative: 0, neutral: 0 });
});

test("supports mixed-theme reviews and an other bucket", () => {
  const result = analyzeReviewThemes([
    { reviewText: "Good coffee but expensive and slow service", rating: 3 },
    { reviewText: "வணக்கம்", rating: 3 }
  ]);
  const food = result.themes.find(row => row.theme === "FOOD_QUALITY");
  const price = result.themes.find(row => row.theme === "PRICE_VALUE");
  const service = result.themes.find(row => row.theme === "SERVICE");
  assert.equal(food?.count, 1);
  assert.equal(price?.count, 1);
  assert.equal(service?.count, 1);
  assert.equal(result.themes.find(row => row.theme === "OTHER")?.count, 1);
  assert.equal(result.sampleSize, 2);
});
