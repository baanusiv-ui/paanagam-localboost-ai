export type InvestmentInput = {
  period: string;
  operatingCashFlow: number | null;
  grossProfit: number | null;
  cashReserve: number | null;
  requiredCashReserve: number | null;
  attributableIncrementalGrossProfit: number | null;
  marketingSpend: number | null;
  aiToolSpend: number | null;
  reinvestmentRatePercent: number;
  evidenceStatus: "VERIFIED" | "OWNER_ENTERED" | "INCOMPLETE" | "DEMO";
};
const validAmount = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0;
const money = (value: number) => Math.round(value * 100) / 100;

/** Conservative cash-aware budget guidance. It never authorises a purchase. */
export function calculateAiInvestment(input: InvestmentInput) {
  if (!/^\d{4}-\d{2}$/.test(input.period)) throw new Error("Period must use YYYY-MM format.");
  if (!Number.isFinite(input.reinvestmentRatePercent) || input.reinvestmentRatePercent < 0 || input.reinvestmentRatePercent > 30) {
    throw new Error("Reinvestment rate must be between 0 and 30 percent.");
  }
  const required = [input.operatingCashFlow, input.grossProfit, input.cashReserve, input.requiredCashReserve, input.marketingSpend, input.aiToolSpend];
  const missing = required.some(value => !validAmount(value));
  const trustworthy = input.evidenceStatus === "VERIFIED" || input.evidenceStatus === "OWNER_ENTERED";
  const limitations: string[] = [];
  if (input.evidenceStatus === "DEMO") limitations.push("Demo data is excluded from investment decisions.");
  if (input.evidenceStatus === "INCOMPLETE") limitations.push("Financial evidence is incomplete.");
  if (missing) limitations.push("Enter all financial inputs before calculating a safe budget.");
  if (!validAmount(input.attributableIncrementalGrossProfit)) limitations.push("Campaign-attributed incremental gross profit is not available; marketing ROI cannot be established.");
  if (!trustworthy || missing || !validAmount(input.attributableIncrementalGrossProfit)) {
    return {
      period: input.period, currency: "INR", status: "INSUFFICIENT_DATA",
      currentMarketingSpend: validAmount(input.marketingSpend) ? money(input.marketingSpend) : null,
      currentAiToolSpend: validAmount(input.aiToolSpend) ? money(input.aiToolSpend) : null,
      incrementalBudgetCeiling: 0, recommendedAiBudget: 0, roi: null, roas: null,
      limitations, purchaseAuthorised: false
    };
  }
  const cashAboveReserve = Math.max(0, input.cashReserve! - input.requiredCashReserve!);
  const operatingSurplus = Math.max(0, input.operatingCashFlow!);
  const cashAvailable = Math.min(cashAboveReserve, operatingSurplus);
  const reinvestmentPool = input.attributableIncrementalGrossProfit! * input.reinvestmentRatePercent / 100;
  const existingGrowthSpend = input.marketingSpend! + input.aiToolSpend!;
  const totalGrowthSpendCeiling = Math.min(cashAvailable, reinvestmentPool);
  const incrementalBudgetCeiling = Math.max(0, totalGrowthSpendCeiling - existingGrowthSpend);
  const roi = existingGrowthSpend > 0 ? money((input.attributableIncrementalGrossProfit! - existingGrowthSpend) / existingGrowthSpend * 100) : null;
  const roas = input.marketingSpend! > 0 ? money(input.attributableIncrementalGrossProfit! / input.marketingSpend!) : null;
  return {
    period: input.period, currency: "INR", status: "CALCULATED",
    currentMarketingSpend: money(input.marketingSpend!), currentAiToolSpend: money(input.aiToolSpend!),
    cashAboveReserve: money(cashAboveReserve), operatingSurplus: money(operatingSurplus), cashAvailable: money(cashAvailable),
    reinvestmentRatePercent: input.reinvestmentRatePercent, reinvestmentPool: money(reinvestmentPool),
    totalGrowthSpendCeiling: money(totalGrowthSpendCeiling), incrementalBudgetCeiling: money(incrementalBudgetCeiling),
    recommendedAiBudget: money(incrementalBudgetCeiling), roi, roas, limitations, purchaseAuthorised: false,
    methodology: [
      "Cash available is capped by both cash above the required reserve and positive operating cash flow.",
      "The growth-spend ceiling is the lower of available cash and the owner-selected share of campaign-attributed incremental gross profit.",
      "Existing marketing and AI-tool spending is deducted before calculating any additional budget.",
      "ROI uses incremental gross profit, not revenue, and is descriptive rather than proof of causation."
    ]
  };
}
