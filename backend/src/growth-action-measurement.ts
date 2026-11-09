import type { OverviewAction } from "./growth-overview.js";
import type { GrowthRecordInput } from "./intelligence.js";

type TrackingInput = { actionId: string; status: string; completedAt?: Date | string | null };
type WindowSummary = { from: string; to: string; sampleSize: number; coverageDays?: number; netSales?: number; orders?: number; averageOrderValue?: number; reviewCount?: number; averageRating?: number | null; negativeThemeMatches?: number };

const dateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
const numberValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const shift = (date: string, days: number) => {
  const value = new Date(date + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const inRange = (date: string, from: string, to: string) => date >= from && date <= to;
const round = (value: number) => Math.round(value * 100) / 100;

function salesWindow(records: GrowthRecordInput[], from: string, to: string): WindowSummary {
  const rows = records.filter(row => row.recordType === "DAILY_SALES" && row.source !== "DEMO")
    .map(row => ({ row, date: dateKey(row.recordedAt), net: numberValue(row.payload.net ?? row.payload.netSales), orders: numberValue(row.payload.orders) }))
    .filter(row => inRange(row.date, from, to) && row.net !== null && row.orders !== null);
  const unique = new Map(rows.map(row => [row.date, row]));
  const values = [...unique.values()];
  const netSales = values.reduce((sum, row) => sum + (row.net ?? 0), 0);
  const orders = values.reduce((sum, row) => sum + (row.orders ?? 0), 0);
  return { from, to, sampleSize: values.length, coverageDays: values.length, netSales: round(netSales), orders, averageOrderValue: orders ? round(netSales / orders) : null as unknown as number };
}

function reviewWindow(records: GrowthRecordInput[], from: string, to: string): WindowSummary {
  const rows = records.filter(row => row.recordType === "REVIEW_ITEM" && row.source !== "DEMO")
    .filter(row => inRange(typeof row.payload.reviewDate === "string" ? row.payload.reviewDate.slice(0, 10) : dateKey(row.recordedAt), from, to));
  const ratings = rows.map(row => numberValue(row.payload.rating)).filter((value): value is number => value !== null && value >= 1 && value <= 5);
  const negativeThemeMatches = rows.reduce((count, row) => {
    const text = typeof row.payload.reviewText === "string" ? row.payload.reviewText.toLowerCase() : "";
    return count + (/\b(bad|poor|slow|rude|dirty|cold|wrong|late|விலை அதிகம்|மோசம்|தாமதம்|மோசமான|சுத்தம் இல்லை)\b/.test(text) ? 1 : 0);
  }, 0);
  return { from, to, sampleSize: rows.length, reviewCount: rows.length, averageRating: ratings.length ? round(ratings.reduce((a,b)=>a+b,0)/ratings.length) : null, negativeThemeMatches };
}

/** Descriptive pre/post comparison only. It never attributes a change to the action. */
export function buildGrowthActionMeasurements(
  actions: Array<OverviewAction & { status?: string }>,
  tracking: TrackingInput[],
  records: GrowthRecordInput[],
  generatedAt = new Date()
) {
  const trackingById = new Map(tracking.map(item => [item.actionId, item]));
  return actions.map(action => {
    const saved = trackingById.get(action.id);
    const completedAt = saved?.completedAt ?? null;
    if ((saved?.status ?? action.status) !== "COMPLETED" || !completedAt) {
      return { ...action, measurement: { status: "NOT_READY", note: "Mark this action completed to start its observation window.", completedAt: null } };
    }
    const completedDate = dateKey(completedAt);
    const beforeFrom = shift(completedDate, -7), beforeTo = shift(completedDate, -1);
    const afterFrom = shift(completedDate, 1), afterTo = shift(completedDate, 7);
    const measurementWindowEnd = new Date(afterTo + "T23:59:59.999Z");
    if (generatedAt < measurementWindowEnd) {
      return { ...action, measurement: { status: "COLLECTING", completedAt: new Date(completedAt).toISOString(), before: null, after: null, windows: { before: { from: beforeFrom, to: beforeTo }, after: { from: afterFrom, to: afterTo } }, note: "The seven-day follow-up window is still in progress. No result is available yet." } };
    }
    if (action.id === "sales-trend-check" || action.id === "capture-sales-baseline") {
      const before = salesWindow(records, beforeFrom, beforeTo);
      const after = salesWindow(records, afterFrom, afterTo);
      if (before.coverageDays !== 7 || after.coverageDays !== 7) {
        return { ...action, measurement: { status: "INSUFFICIENT_DATA", completedAt: new Date(completedAt).toISOString(), before, after, note: "A comparable result needs one valid daily sales record for each of the seven dates in both windows." } };
      }
      const pct = before.netSales ? round(((after.netSales! - before.netSales) / before.netSales) * 100) : null;
      return { ...action, measurement: { status: "READY", metric: "NET_SALES", completedAt: new Date(completedAt).toISOString(), before, after, observedChangePercent: pct, note: "Observed seven-day sales change after the completion date. This is descriptive and does not prove the action caused the change." } };
    }
    if (action.id === "review-friction" || action.id === "capture-customer-feedback") {
      const before = reviewWindow(records, beforeFrom, beforeTo);
      const after = reviewWindow(records, afterFrom, afterTo);
      if (before.sampleSize < 3 || after.sampleSize < 3) {
        return { ...action, measurement: { status: "INSUFFICIENT_DATA", completedAt: new Date(completedAt).toISOString(), before, after, note: "At least three reviews in each seven-day window are needed for a basic descriptive comparison." } };
      }
      return { ...action, measurement: { status: "READY", metric: "REVIEW_FEEDBACK", completedAt: new Date(completedAt).toISOString(), before, after, note: "Review volume, average rating and directional negative-keyword matches are compared. Sample mix can differ; this does not prove causation." } };
    }
    return { ...action, measurement: { status: "NOT_SUPPORTED", completedAt: new Date(completedAt).toISOString(), note: "A reliable before/after metric is not yet defined for this action type. No impact score is inferred." } };
  });
}
