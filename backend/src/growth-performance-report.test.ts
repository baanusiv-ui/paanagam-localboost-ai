import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrowthPerformanceReport } from "./growth-performance-report.js";

test("monthly report aggregates saved sales, orders, reviews and owner goals", () => {
  const records = [
    { id: "s1", recordType: "DAILY_SALES", payload: { net: 1200, orders: 12 }, recordedAt: "2026-11-01T12:00:00Z", source: "OWNER_ENTERED" },
    { id: "s2", recordType: "DAILY_SALES", payload: { netSales: 800, orders: 8 }, recordedAt: "2026-11-02T12:00:00Z", source: "POS_IMPORT" },
    { id: "r1", recordType: "REVIEW_ITEM", payload: { rating: 5 }, recordedAt: "2026-11-02T12:00:00Z", source: "GOOGLE_API" },
    { id: "r2", recordType: "REVIEW_ITEM", payload: { rating: 3 }, recordedAt: "2026-11-03T12:00:00Z", source: "OWNER_ENTERED" },
    { id: "demo", recordType: "DAILY_SALES", payload: { net: 99999, orders: 1 }, recordedAt: "2026-11-03T12:00:00Z", source: "DEMO" },
    { id: "old", recordType: "DAILY_SALES", payload: { net: 500 }, recordedAt: "2026-10-31T12:00:00Z", source: "OWNER_ENTERED" }
  ];
  const result = buildGrowthPerformanceReport("2026-11", records, [
    { id: "g1", metric: "NET_SALES", targetValue: 2500 },
    { id: "g2", metric: "REVIEW_COUNT", targetValue: 2 },
    { id: "g3", metric: "AVERAGE_RATING", targetValue: 4 }
  ], [], new Date("2026-11-09T00:00:00Z"));

  assert.equal(result.sales.netSales, 2000);
  assert.equal(result.sales.orders, 20);
  assert.equal(result.sales.averageOrderValue, 100);
  assert.equal(result.sales.coverageDays, 2);
  assert.equal(result.reviews.reviewCount, 2);
  assert.equal(result.reviews.averageRating, 4);
  assert.deepEqual(result.goals.map(goal => goal.progressPercent), [80, 100, 100]);
});

test("missing data is null and completed actions use completion month", () => {
  const result = buildGrowthPerformanceReport("2026-11", [], [
    { id: "g1", metric: "NET_SALES", targetValue: 1000 }
  ], [
    { actionId: "a1", title: "Improve service", status: "COMPLETED", completedAt: "2026-11-05T10:00:00Z" },
    { actionId: "a2", title: "Old action", status: "COMPLETED", completedAt: "2026-10-31T10:00:00Z" }
  ]);

  assert.equal(result.sales.netSales, null);
  assert.equal(result.reviews.averageRating, null);
  const firstGoal = result.goals[0];
  assert.ok(firstGoal);
  assert.equal(firstGoal.status, "NO_DATA");
  assert.equal(result.actions.completedInMonth, 1);
  const firstCompletedAction = result.actions.completed[0];
  assert.ok(firstCompletedAction);
  assert.equal(firstCompletedAction.actionId, "a1");
});

test("invalid month is rejected", () => {
  assert.throws(() => buildGrowthPerformanceReport("2026-13", [], [], []), /YYYY-MM/);
});
