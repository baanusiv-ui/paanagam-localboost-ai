export type PerformanceRecord = {
  id: string;
  recordType: string;
  payload: Record<string, unknown>;
  recordedAt: Date | string;
  source: string;
};
export type PerformanceGoal = {
  id: string;
  metric: "NET_SALES" | "REVIEW_COUNT" | "AVERAGE_RATING";
  targetValue: number;
  archivedAt?: Date | string | null;
};
export type PerformanceAction = {
  actionId: string;
  title: string;
  status: string;
  ownerNote?: string | null;
  completedAt?: Date | string | null;
  updatedAt?: Date | string;
};
const round = (value: number) => Math.round(value * 100) / 100;
const amount = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const dateOf = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
const monthOf = (value: Date | string) => dateOf(value).slice(0, 7);
const inMonth = (value: Date | string, month: string) => monthOf(value) === month;

/** Builds a descriptive monthly report from saved, non-demo business records only. */
export function buildGrowthPerformanceReport(
  month: string,
  records: PerformanceRecord[],
  goals: PerformanceGoal[],
  actions: PerformanceAction[],
  generatedAt = new Date()
) {
  if (!/^\d{4}-\d{2}$/.test(month) || Number(month.slice(5, 7)) < 1 || Number(month.slice(5, 7)) > 12) {
    throw new Error("Month must use YYYY-MM format.");
  }
  const eligible = records.filter(row => row.source !== "DEMO");
  const monthly = eligible.filter(row => inMonth(row.recordedAt, month));
  const salesRows = monthly.filter(row => row.recordType === "DAILY_SALES");
  const salesValues = salesRows.map(row => amount(row.payload.net ?? row.payload.netSales)).filter((value): value is number => value !== null);
  const datedSales = new Set(salesRows.filter(row => amount(row.payload.net ?? row.payload.netSales) !== null).map(row => dateOf(row.recordedAt)));
  const orderValues = salesRows.map(row => amount(row.payload.orders)).filter((value): value is number => value !== null);
  const netSales = salesValues.length ? round(salesValues.reduce((sum, value) => sum + value, 0)) : null;
  const orders = orderValues.length ? orderValues.reduce((sum, value) => sum + value, 0) : null;

  const reviews = monthly.filter(row => row.recordType === "REVIEW_ITEM");
  const ratings = reviews.map(row => amount(row.payload.rating)).filter((value): value is number => value !== null && value >= 1 && value <= 5);
  const reviewSources = reviews.reduce<Record<string, number>>((result, row) => {
    result[row.source] = (result[row.source] ?? 0) + 1;
    return result;
  }, {});

  const goalResults = goals.map(goal => {
    const actual = goal.metric === "NET_SALES" ? netSales
      : goal.metric === "REVIEW_COUNT" ? (reviews.length ? reviews.length : null)
      : ratings.length ? round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length) : null;
    const sampleSize = goal.metric === "NET_SALES" ? salesValues.length
      : goal.metric === "REVIEW_COUNT" ? reviews.length : ratings.length;
    return {
      id: goal.id, metric: goal.metric, targetValue: goal.targetValue, actualValue: actual,
      progressPercent: actual === null ? null : round(actual / goal.targetValue * 100),
      sampleSize, archived: Boolean(goal.archivedAt),
      status: actual === null ? "NO_DATA" : actual >= goal.targetValue ? "ACHIEVED" : "BELOW_TARGET"
    };
  });

  const completedActions = actions.filter(action => action.status === "COMPLETED" && action.completedAt && inMonth(action.completedAt, month))
    .sort((a, b) => dateOf(b.completedAt!) .localeCompare(dateOf(a.completedAt!)))
    .map(action => ({
      actionId: action.actionId, title: action.title, status: action.status,
      completedAt: new Date(action.completedAt!).toISOString(), ownerNote: action.ownerNote ?? null
    }));
  const statusCounts = actions.reduce<Record<string, number>>((counts, action) => {
    counts[action.status] = (counts[action.status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    month, generatedAt: generatedAt.toISOString(),
    sales: {
      netSales, salesRecordCount: salesValues.length, coverageDays: datedSales.size,
      orders, orderRecordCount: orderValues.length,
      averageOrderValue: netSales !== null && orders !== null && orders > 0 ? round(netSales / orders) : null,
      sourceCounts: salesRows.filter(row => amount(row.payload.net ?? row.payload.netSales) !== null)
        .reduce<Record<string, number>>((counts, row) => { counts[row.source] = (counts[row.source] ?? 0) + 1; return counts; }, {})
    },
    reviews: {
      reviewCount: reviews.length, averageRating: ratings.length ? round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length) : null,
      ratingSampleSize: ratings.length, sourceCounts: reviewSources
    },
    goals: goalResults,
    actions: { completedInMonth: completedActions.length, completed: completedActions, currentStatusCounts: statusCounts },
    methodology: [
      "Only saved records for this business and the selected calendar month are included.",
      "DEMO records are excluded. Missing evidence is reported as No data, not zero.",
      "Sales totals sum eligible saved daily sales values; coverage counts distinct dates with a valid net-sales value.",
      "Average order value is calculated only when both recorded net sales and recorded order counts are available.",
      "Review average uses valid 1–5 star ratings; its sample size is shown separately.",
      "Completed actions are counted by their saved completion date. Their completion does not establish that they caused a sales or review change."
    ],
    limitations: {
      recordLimit: 10000, actionLimit: 500,
      recordsMayBeIncompleteAtLimit: records.length >= 10000,
      actionsMayBeIncompleteAtLimit: actions.length >= 500
    }
  };
}
