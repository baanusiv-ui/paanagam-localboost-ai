import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateAiInvestment } from "./ai-investment.js";
const base = {
  period: "2026-11", operatingCashFlow: 30000, grossProfit: 80000, cashReserve: 50000,
  requiredCashReserve: 40000, attributableIncrementalGrossProfit: 20000,
  marketingSpend: 2000, aiToolSpend: 500, reinvestmentRatePercent: 10, evidenceStatus: "VERIFIED" as const
};
test("deducts existing spend from the smaller of cash and reinvestment pool", () => {
  const result = calculateAiInvestment(base);
  assert.equal(result.cashAvailable, 10000);
  assert.equal(result.reinvestmentPool, 2000);
  assert.equal(result.incrementalBudgetCeiling, 0);
  assert.equal(result.purchaseAuthorised, false);
});
test("demo data cannot authorise an investment recommendation", () => {
  const result = calculateAiInvestment({ ...base, evidenceStatus: "DEMO" });
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.recommendedAiBudget, 0);
});
test("missing attribution means no ROI or paid upgrade recommendation", () => {
  const result = calculateAiInvestment({ ...base, attributableIncrementalGrossProfit: null });
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.roi, null);
});
test("incremental budget never exceeds cash or reinvestment pool", () => {
  const result = calculateAiInvestment({ ...base, marketingSpend: 100, aiToolSpend: 100 });
  assert.equal(result.incrementalBudgetCeiling, 1800);
  assert.ok(result.incrementalBudgetCeiling <= result.cashAvailable);
  assert.ok(result.incrementalBudgetCeiling <= result.reinvestmentPool);
});
test("rejects invalid period and reinvestment rate", () => {
  assert.throws(() => calculateAiInvestment({ ...base, reinvestmentRatePercent: 31 }), /0 and 30/);
  assert.throws(() => calculateAiInvestment({ ...base, period: "November" }), /YYYY-MM/);
});
