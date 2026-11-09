import { analyzeReviewThemes } from "./review-themes.js";
import { buildBusinessIntelligence, type GrowthRecordInput } from "./intelligence.js";

export type OverviewEvidence = {
  id: string;
  category: string;
  source: string;
  verified: boolean;
  observedAt: Date | string;
  expiresAt?: Date | string | null;
};
export type OverviewAction = {
  id: string;
  priority: "HIGH" | "MEDIUM" | "INFO";
  score: number;
  title: string;
  action: string;
  why: string;
  evidence: { source: string; recordIds: string[]; dateFrom: string | null; dateTo: string | null; calculation: string };
  confidence: "HIGH" | "MEDIUM" | "LOW";
  requiresOwnerApproval: true;
  status: "SUGGESTED";
};

const day = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
const rank = (score: number): OverviewAction["priority"] => score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "INFO";

/** Deterministic owner dashboard. It ranks only signals supported by saved records. */
export function buildGrowthOverview(input: {
  records: GrowthRecordInput[];
  evidence: OverviewEvidence[];
  generatedAt?: Date;
}) {
  const generatedAt = input.generatedAt ?? new Date();
  const records = input.records.filter(x => x.source !== "DEMO");
  const actions: OverviewAction[] = [];
  const add = (action: Omit<OverviewAction, "priority" | "requiresOwnerApproval" | "status">) => {
    actions.push({ ...action, priority: rank(action.score), requiresOwnerApproval: true, status: "SUGGESTED" });
  };

  const reviews = records.filter(x => x.recordType === "REVIEW_ITEM");
  const reviewAnalysis = analyzeReviewThemes(reviews.map(x => ({
    reviewText: x.payload.reviewText, rating: x.payload.rating, reviewDate: x.payload.reviewDate
  })));
  const negativeThemes = reviewAnalysis.themes.filter(x => x.negative > 0).sort((a,b) => b.negative-a.negative);
  if (negativeThemes.length) {
    const top = negativeThemes[0]!;
    const ids = reviews.filter(x => typeof x.payload.reviewText === "string" && x.payload.reviewText.trim()).map(x => x.id);
    add({
      id: "review-friction", score: Math.min(90, 45 + top.negative * 8),
      title: "Investigate a recurring review concern",
      action: "Read the negative review examples in the " + top.theme.toLowerCase().replaceAll("_"," ") + " theme, confirm the operational cause with staff, and record one corrective step. Do not reply or change operations automatically.",
      why: top.negative + " negative theme matches were detected for " + top.theme.toLowerCase().replaceAll("_"," ") + " in " + reviewAnalysis.textReviewCount + " written reviews.",
      evidence: { source: "SAVED_REVIEW_RECORDS", recordIds: ids.slice(0,50), dateFrom: reviewAnalysis.dateFrom, dateTo: reviewAnalysis.dateTo, calculation: "Bilingual keyword heuristic; negative theme matches counted. A review may match multiple themes." },
      confidence: reviewAnalysis.confidence === "MODERATE" ? "MEDIUM" : "LOW"
    });
  }

  const businessReport = buildBusinessIntelligence(records);
  const salesTrend = businessReport.insights.find(x => x.id === "sales-seven-day-comparison");
  if (salesTrend) {
    const match = salesTrend.finding.match(/\((-?\d+(?:\.\d+)?)%\)/);
    const pct = match ? Number(match[1]) : 0;
    add({
      id: "sales-trend-check", score: pct <= -10 ? 85 : 55,
      title: "Review the latest sales movement",
      action: "Compare the two recorded seven-day periods against POS closing totals, opening hours and promotion dates. Check for missing days before deciding on staffing, stock or pricing.",
      why: salesTrend.finding,
      evidence: { source: "OWNER_ENTERED_DAILY_SALES", recordIds: salesTrend.evidence.recordIds, dateFrom: salesTrend.evidence.dateRange?.from ?? null, dateTo: salesTrend.evidence.dateRange?.to ?? null, calculation: salesTrend.evidence.calculation },
      confidence: "MEDIUM"
    });
  }

  const negativeEvidence = input.evidence.filter(x => !x.verified || (x.expiresAt && new Date(x.expiresAt).getTime() < generatedAt.getTime()));
  if (negativeEvidence.length) {
    const expired = negativeEvidence.filter(x => x.expiresAt && new Date(x.expiresAt).getTime() < generatedAt.getTime());
    add({
      id: "refresh-profile-evidence", score: expired.length ? 65 : 45,
      title: "Refresh incomplete or expired profile evidence",
      action: "Open the profile health checklist and verify the listed fields. Refresh expired observations and confirm owner-supplied details before relying on the audit.",
      why: negativeEvidence.length + " saved evidence records are unverified or expired (" + expired.length + " expired).",
      evidence: { source: "BUSINESS_PROFILE_EVIDENCE", recordIds: negativeEvidence.map(x=>x.id).slice(0,50), dateFrom: negativeEvidence.length ? negativeEvidence.map(x=>day(x.observedAt)).sort()[0]! : null, dateTo: negativeEvidence.length ? negativeEvidence.map(x=>day(x.observedAt)).sort().at(-1)! : null, calculation: "Count of evidence rows where verified=false or expiresAt is before generation time." },
      confidence: "HIGH"
    });
  }

  const competitorGroups = new Map<string, GrowthRecordInput[]>();
  for (const item of records.filter(x=>x.recordType==="COMPETITOR")) {
    const name = String(item.payload.name ?? "").trim().toLowerCase();
    if (!name || item.payload.identityConfirmed !== true) continue;
    competitorGroups.set(name, [...(competitorGroups.get(name) ?? []), item]);
  }
  const repeatCompetitors = [...competitorGroups.values()].filter(items=>items.length>=2);
  if (repeatCompetitors.length) {
    const sample = repeatCompetitors[0]!;
    add({
      id: "competitor-observation-followup", score: 42,
      title: "Compare dated competitor observations",
      action: "Review the latest two dated snapshots for " + String(sample[0]!.payload.name) + " and validate whether any observed offer or public review-count change is relevant to your own positioning.",
      why: "At least two owner-confirmed public snapshots are saved for this competitor; this is an observation opportunity, not proof of market share or customer switching.",
      evidence: { source: "OWNER_RECORDED_PUBLIC_OBSERVATION", recordIds: sample.map(x=>x.id), dateFrom: sample.map(x=>day(x.recordedAt)).sort()[0]!, dateTo: sample.map(x=>day(x.recordedAt)).sort().at(-1)!, calculation: "Repeated snapshots grouped by owner-confirmed competitor identity." },
      confidence: "LOW"
    });
  }

  if (!records.some(x=>x.recordType==="DAILY_SALES" && x.source!=="DEMO")) {
    add({
      id: "capture-sales-baseline", score: 38,
      title: "Build a reliable sales baseline",
      action: "Enter daily net sales and order count for consecutive business dates, then reconcile them with POS closing totals.",
      why: "No non-demo daily sales records are currently available to compare sales trends.",
      evidence: { source: "DATA_GAP", recordIds: [], dateFrom: null, dateTo: null, calculation: "No DAILY_SALES records found in the selected business workspace." },
      confidence: "HIGH"
    });
  }
  if (!reviews.length) {
    add({
      id: "capture-customer-feedback", score: 32,
      title: "Start collecting customer feedback",
      action: "Import eligible Google reviews or enter owner-supplied review text so recurring customer themes can be analysed.",
      why: "No saved review records are available in this workspace.",
      evidence: { source: "DATA_GAP", recordIds: [], dateFrom: null, dateTo: null, calculation: "No REVIEW_ITEM records found in the selected business workspace." },
      confidence: "HIGH"
    });
  }

  const ranked = actions.sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id)).slice(0,3);
  return {
    engine: "LOCALBOOST_GROWTH_OVERVIEW_V1",
    generatedAt: generatedAt.toISOString(),
    businessData: { savedRecords: records.length, profileEvidence: input.evidence.length, reviewSample: reviewAnalysis.sampleSize },
    actions: ranked,
    rankingPolicy: "Deterministic priority score: 70-90 high, 40-69 medium, below 40 informational. Scores use only saved evidence frequency and rule-based signal strength; they are not predicted revenue impact.",
    guardrails: ["No demo records are used.", "No POS connection is implied; daily sales and menu inputs may be owner-entered.", "Google profile evidence is not a Google ranking or traffic metric.", "Competitor observations are owner-recorded public snapshots.", "Actions are suggestions only and require owner review; nothing is executed or published."]
  };
}
