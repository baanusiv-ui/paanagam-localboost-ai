import test from "node:test";
import assert from "node:assert/strict";
import { buildGrowthActionMeasurements } from "./growth-action-measurement.js";

const action = (id: string) => ({
  id,
  priority: "MEDIUM" as const,
  score: 50,
  title: "Test",
  action: "Do",
  why: "Evidence",
  evidence: { source: "OWNER_ENTERED", recordIds: [], dateFrom: null, dateTo: null, calculation: "Recorded" },
  confidence: "MEDIUM" as const,
  requiresOwnerApproval: true as const,
  status: "SUGGESTED" as const
});

const sales = (date: string, net: number, orders = 10) => ({
  id: date,
  recordType: "DAILY_SALES" as const,
  payload: { net, orders },
  recordedAt: date + "T12:00:00.000Z",
  source: "OWNER_ENTERED"
});

test("waits until the full follow-up window completes", () => {
  const result = buildGrowthActionMeasurements(
    [action("sales-trend-check")],
    [{ actionId: "sales-trend-check", status: "COMPLETED", completedAt: "2026-10-08T10:00:00.000Z" }],
    [],
    new Date("2026-10-15T12:00:00.000Z")
  );
  const first = result[0];
  assert.ok(first);
  assert.equal(first.measurement.status, "COLLECTING");
});

test("compares complete seven-day sales windows and avoids causal claims", () => {
  const rows = [
    ...Array.from({ length: 7 }, (_, i) => sales("2026-10-" + String(i + 1).padStart(2, "0"), 1000)),
    ...Array.from({ length: 7 }, (_, i) => sales("2026-10-" + String(i + 9).padStart(2, "0"), 1200))
  ];
  const result = buildGrowthActionMeasurements(
    [action("sales-trend-check")],
    [{ actionId: "sales-trend-check", status: "COMPLETED", completedAt: "2026-10-08T10:00:00.000Z" }],
    rows,
    new Date("2026-10-16T00:00:00.000Z")
  );
  const first = result[0];
  assert.ok(first);
  assert.equal(first.measurement.status, "READY");
  if (!("before" in first.measurement) || !first.measurement.before ||
      !("after" in first.measurement) || !first.measurement.after) {
    assert.fail("Ready sales measurement should include both comparison windows.");
  }
  assert.equal(first.measurement.observedChangePercent, 20);
  assert.equal(first.measurement.before.coverageDays, 7);
  assert.equal(first.measurement.after.coverageDays, 7);
  assert.match(first.measurement.note, /does not prove/);
});

test("reports missing sales days as insufficient, not zero", () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => sales("2026-10-" + String(i + 1).padStart(2, "0"), 1000)),
    ...Array.from({ length: 7 }, (_, i) => sales("2026-10-" + String(i + 9).padStart(2, "0"), 1200))
  ];
  const result = buildGrowthActionMeasurements(
    [action("sales-trend-check")],
    [{ actionId: "sales-trend-check", status: "COMPLETED", completedAt: "2026-10-08T10:00:00.000Z" }],
    rows,
    new Date("2026-10-16T00:00:00.000Z")
  );
  const first = result[0];
  assert.ok(first);
  assert.equal(first.measurement.status, "INSUFFICIENT_DATA");
  if (!("before" in first.measurement) || !first.measurement.before) {
    assert.fail("Insufficient-data measurement should include the available before window.");
  }
  assert.equal(first.measurement.before.coverageDays, 6);
});

test("does not invent metrics for unsupported action types", () => {
  const result = buildGrowthActionMeasurements(
    [action("refresh-profile-evidence")],
    [{ actionId: "refresh-profile-evidence", status: "COMPLETED", completedAt: "2026-10-08T10:00:00.000Z" }],
    [],
    new Date("2026-10-16T00:00:00.000Z")
  );
  const first = result[0];
  assert.ok(first);
  assert.equal(first.measurement.status, "NOT_SUPPORTED");
});

test("does not measure actions before completion", () => {
  const result = buildGrowthActionMeasurements(
    [action("sales-trend-check")],
    [],
    [],
    new Date("2026-10-20T00:00:00.000Z")
  );
  const first = result[0];
  assert.ok(first);
  assert.equal(first.measurement.status, "NOT_READY");
});

test("compares review feedback only when both windows have enough reviews", () => {
  const rows = [
    ...["2026-10-01", "2026-10-02", "2026-10-03"].map((date, i) => ({
      id: "b" + i,
      recordType: "REVIEW_ITEM" as const,
      payload: { reviewDate: date, reviewText: "bad service", rating: 2 },
      recordedAt: date + "T12:00:00.000Z",
      source: "GOOGLE_API"
    })),
    ...["2026-10-09", "2026-10-10", "2026-10-11"].map((date, i) => ({
      id: "a" + i,
      recordType: "REVIEW_ITEM" as const,
      payload: { reviewDate: date, reviewText: "good service", rating: 5 },
      recordedAt: date + "T12:00:00.000Z",
      source: "GOOGLE_API"
    }))
  ];
  const result = buildGrowthActionMeasurements(
    [action("review-friction")],
    [{ actionId: "review-friction", status: "COMPLETED", completedAt: "2026-10-08T10:00:00.000Z" }],
    rows,
    new Date("2026-10-16T00:00:00.000Z")
  );
  const first = result[0];
  assert.ok(first);
  assert.equal(first.measurement.status, "READY");
  if (!("before" in first.measurement) || !first.measurement.before ||
      !("after" in first.measurement) || !first.measurement.after) {
    assert.fail("Ready review measurement should include both comparison windows.");
  }
  assert.equal(first.measurement.before.negativeThemeMatches, 3);
  assert.equal(first.measurement.after.averageRating, 5);
});
