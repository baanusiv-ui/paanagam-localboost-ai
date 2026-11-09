export type GrowthRecordInput = {
  id: string;
  recordType: "MENU_ITEM" | "DAILY_SALES" | "RETENTION_SNAPSHOT" | "CAMPAIGN_DRAFT";
  payload: Record<string, unknown>;
  recordedAt: Date | string;
  source?: string;
};

export type IntelligenceInsight = {
  id: string;
  priority: "HIGH" | "MEDIUM" | "INFO";
  title: string;
  finding: string;
  evidence: { source: string; recordIds: string[]; dateRange?: { from: string; to: string }; calculation: string };
  recommendation: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  requiresOwnerApproval: true;
  status: "SUGGESTED";
};

const numeric = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const dateOf = (value: Date | string): string => new Date(value).toISOString().slice(0, 10);
const money = (value: number): string => "₹" + value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function buildBusinessIntelligence(records: GrowthRecordInput[]) {
  const usable = records.filter(record => record.source !== "DEMO");
  const sales = usable.filter(record => record.recordType === "DAILY_SALES").map(record => ({
    record, date: dateOf(record.recordedAt),
    net: numeric(record.payload.net ?? record.payload.netSales),
    orders: numeric(record.payload.orders)
  })).filter(item => item.net !== null && item.orders !== null).sort((a, b) => a.date.localeCompare(b.date));
  const menu = usable.filter(record => record.recordType === "MENU_ITEM").map(record => ({
    record, name: String(record.payload.name ?? record.payload.itemName ?? "Unnamed item"),
    price: numeric(record.payload.price ?? record.payload.sellingPrice),
    cost: numeric(record.payload.cost ?? record.payload.unitCost),
    qty: numeric(record.payload.qty ?? record.payload.quantitySold ?? record.payload.unitsSold)
  }));
  const retention = usable.filter(record => record.recordType === "RETENTION_SNAPSHOT").sort((a, b) => dateOf(b.recordedAt).localeCompare(dateOf(a.recordedAt)));
  const insights: IntelligenceInsight[] = [];

  if (!sales.length) {
    insights.push({
      id: "sales-data-needed", priority: "INFO", title: "Sales baseline not available",
      finding: "No complete owner-entered daily sales records are available for analysis.",
      evidence: { source: "OWNER_ENTERED", recordIds: [], calculation: "Requires net sales and order count for at least one business date." },
      recommendation: "Enter dated daily net sales and order totals. Keep discounts and refunds on the same accounting basis for comparable reporting.",
      confidence: "HIGH", requiresOwnerApproval: true, status: "SUGGESTED"
    });
  } else {
    const total = sales.reduce((sum, item) => sum + (item.net ?? 0), 0);
    const orders = sales.reduce((sum, item) => sum + (item.orders ?? 0), 0);
    const latest = sales[sales.length - 1]!;
    insights.push({
      id: "sales-baseline", priority: "INFO", title: "Recorded sales baseline",
      finding: sales.length + " recorded business dates show " + money(total) + " net sales across " + orders + " orders; average order value is " + money(orders ? total / orders : 0) + ".",
      evidence: { source: "OWNER_ENTERED", recordIds: sales.map(item => item.record.id), dateRange: { from: sales[0]!.date, to: latest.date }, calculation: "Sum of recorded net sales; sum of orders; average order value = net sales ÷ orders." },
      recommendation: "Use this as an owner-entered baseline only. Reconcile the totals with the POS before making staffing, pricing or purchasing decisions.",
      confidence: "HIGH", requiresOwnerApproval: true, status: "SUGGESTED"
    });
    if (sales.length >= 14) {
      const previous = sales.slice(-14, -7), recent = sales.slice(-7);
      const previousTotal = previous.reduce((sum, item) => sum + (item.net ?? 0), 0);
      const recentTotal = recent.reduce((sum, item) => sum + (item.net ?? 0), 0);
      if (previous.length === 7 && recent.length === 7 && previousTotal > 0) {
        const change = ((recentTotal - previousTotal) / previousTotal) * 100;
        insights.push({
          id: "sales-seven-day-comparison", priority: change < -10 ? "HIGH" : "MEDIUM",
          title: "Seven-day sales comparison",
          finding: "The latest 7 recorded dates total " + money(recentTotal) + " versus " + money(previousTotal) + " for the preceding 7 recorded dates (" + (change >= 0 ? "+" : "") + change.toFixed(1) + "%).",
          evidence: { source: "OWNER_ENTERED", recordIds: [...previous, ...recent].map(item => item.record.id), dateRange: { from: previous[0]!.date, to: recent[6]!.date }, calculation: "(latest 7 recorded dates − previous 7 recorded dates) ÷ previous 7 recorded dates × 100." },
          recommendation: "Check day-of-week mix, closures, promotions and data completeness before treating this as a sustained trend.",
          confidence: "MEDIUM", requiresOwnerApproval: true, status: "SUGGESTED"
        });
      }
    }
  }

  const menuWithQty = menu.filter(item => item.qty !== null);
  if (menuWithQty.length) {
    const ranked = menuWithQty.slice().sort((a, b) => (b.qty ?? 0) - (a.qty ?? 0));
    const leader = ranked[0]!;
    insights.push({
      id: "menu-volume-leader", priority: "INFO", title: "Highest recorded menu volume",
      finding: leader.name + " has the highest entered quantity at " + leader.qty + " units.",
      evidence: { source: "OWNER_ENTERED", recordIds: ranked.map(item => item.record.id), calculation: "Sorted menu records by entered quantity; this is not a POS-verified sales ranking." },
      recommendation: "Validate quantities against the POS and review availability during the periods this item is sold.",
      confidence: "MEDIUM", requiresOwnerApproval: true, status: "SUGGESTED"
    });
  } else {
    insights.push({
      id: "menu-data-needed", priority: "INFO", title: "Menu performance data needed",
      finding: "No menu item quantities are available to compare item volume.",
      evidence: { source: "OWNER_ENTERED", recordIds: [], calculation: "Requires menu item name and quantity sold." },
      recommendation: "Enter menu item quantities for a consistent date range. Avoid ranking items from incomplete periods.",
      confidence: "HIGH", requiresOwnerApproval: true, status: "SUGGESTED"
    });
  }

  const costed = menu.filter(item => item.price !== null && item.cost !== null && item.qty !== null);
  if (costed.length) {
    const lowest = costed.slice().sort((a, b) => ((a.price! - a.cost!) / (a.price! || 1)) - ((b.price! - b.cost!) / (b.price! || 1)))[0]!;
    insights.push({
      id: "menu-lowest-unit-margin", priority: "MEDIUM", title: "Lowest supplied unit contribution rate",
      finding: lowest.name + " has a supplied unit contribution of " + money(lowest.price! - lowest.cost!) + " (" + (lowest.price! > 0 ? ((lowest.price! - lowest.cost!) / lowest.price! * 100).toFixed(1) : "not meaningful") + "% of selling price).",
      evidence: { source: "OWNER_ENTERED", recordIds: costed.map(item => item.record.id), calculation: "(selling price − supplied unit cost) ÷ selling price. Excludes any costs not included in the supplied unit cost." },
      recommendation: "Validate recipe yield, packaging, wastage, tax basis and cost effective date before considering a price or recipe change.",
      confidence: "LOW", requiresOwnerApproval: true, status: "SUGGESTED"
    });
  }

  if (retention.length) {
    const latest = retention[0]!;
    const issued = numeric(latest.payload.issued);
    const redeemed = numeric(latest.payload.redeemed);
    if (issued !== null && redeemed !== null && issued > 0) {
      insights.push({
        id: "latest-reward-redemption", priority: "INFO", title: "Latest reward redemption snapshot",
        finding: "The latest retention snapshot records " + redeemed + " rewards redeemed from " + issued + " issued (" + (redeemed / issued * 100).toFixed(1) + "%).",
        evidence: { source: "OWNER_ENTERED", recordIds: [latest.id], dateRange: { from: dateOf(latest.recordedAt), to: dateOf(latest.recordedAt) }, calculation: "Rewards redeemed ÷ rewards issued in the latest dated snapshot." },
        recommendation: "Compare future dated snapshots using the same counting period; do not add active-member snapshots across dates.",
        confidence: "MEDIUM", requiresOwnerApproval: true, status: "SUGGESTED"
      });
    }
  }

  return {
    engine: "PAANAGAM_INTELLIGENCE_RULES_V1",
    generatedAt: new Date().toISOString(),
    dataStatus: usable.length ? "OWNER_DATA_AVAILABLE" : "NO_VERIFIED_BUSINESS_DATA",
    recordCount: usable.length,
    sourcePolicy: "DEMO records are excluded. Current inputs are owner-entered; no POS connection is implied.",
    insights
  };
}
