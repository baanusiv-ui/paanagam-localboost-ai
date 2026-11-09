import test from "node:test";
import assert from "node:assert/strict";
import { buildBusinessIntelligence, type GrowthRecordInput } from "./intelligence.js";

const record = (id: string, recordType: GrowthRecordInput["recordType"], payload: Record<string, unknown>, recordedAt = "2026-11-01T00:00:00.000Z", source = "OWNER_ENTERED"): GrowthRecordInput => ({ id, recordType, payload, recordedAt, source });

test("empty input asks for data and never reports zero sales as a fact", () => {
  const result = buildBusinessIntelligence([]);
  assert.equal(result.recordCount, 0);
  assert.equal(result.dataStatus, "NO_VERIFIED_BUSINESS_DATA");
  assert.ok(result.insights.some(item => item.id === "sales-data-needed"));
});

test("sales baseline uses owner-entered net sales and orders", () => {
  const result = buildBusinessIntelligence([
    record("s1", "DAILY_SALES", { net: 1000, orders: 20 }, "2026-11-01T00:00:00.000Z"),
    record("s2", "DAILY_SALES", { net: 2000, orders: 30 }, "2026-11-02T00:00:00.000Z")
  ]);
  const baseline = result.insights.find(item => item.id === "sales-baseline");
  assert.ok(baseline);
  assert.match(baseline.finding, /₹3,000/);
  assert.match(baseline.finding, /50 orders/);
});

test("demo records are excluded from business intelligence", () => {
  const result = buildBusinessIntelligence([record("demo", "DAILY_SALES", { net: 9000, orders: 90 }, "2026-11-01T00:00:00.000Z", "DEMO")]);
  assert.equal(result.recordCount, 0);
  assert.equal(result.insights.find(item => item.id === "sales-data-needed")?.evidence.recordIds.length, 0);
});

test("menu contribution is not calculated without a complete price, cost and quantity", () => {
  const result = buildBusinessIntelligence([record("m1", "MENU_ITEM", { name: "Filter coffee", price: 20, qty: 50 })]);
  assert.equal(result.insights.some(item => item.id === "menu-lowest-unit-margin"), false);
});

test("latest retention snapshot is used rather than summing snapshots", () => {
  const result = buildBusinessIntelligence([
    record("r1", "RETENTION_SNAPSHOT", { issued: 10, redeemed: 4 }, "2026-11-02T00:00:00.000Z"),
    record("r2", "RETENTION_SNAPSHOT", { issued: 100, redeemed: 80 }, "2026-11-01T00:00:00.000Z")
  ]);
  const insight = result.insights.find(item => item.id === "latest-reward-redemption");
  assert.ok(insight);
  assert.match(insight.finding, /4 rewards redeemed from 10 issued/);
});
