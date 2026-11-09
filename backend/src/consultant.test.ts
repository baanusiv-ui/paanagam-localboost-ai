import test from "node:test";
import assert from "node:assert/strict";
import { buildConsultantMessages, parseConsultantOutput } from "./consultant.js";

const report = {
  engine: "PAANAGAM_INTELLIGENCE_RULES_V1",
  generatedAt: "2026-11-09T00:00:00.000Z",
  dataStatus: "OWNER_DATA_AVAILABLE",
  recordCount: 1,
  sourcePolicy: "Owner-entered only",
  insights: [{
    id: "sales-baseline",
    priority: "INFO" as const,
    title: "Recorded sales baseline",
    finding: "One recorded date shows ₹1,000 net sales across 10 orders.",
    evidence: { source: "OWNER_ENTERED", recordIds: ["rec-1"], calculation: "Sum net sales; sum orders." },
    recommendation: "Reconcile with POS.",
    confidence: "HIGH" as const
  }]
};

test("consultant prompt includes provenance and asks model not to change calculations", () => {
  const messages = buildConsultantMessages(report, "Tamil + English");
  assert.equal(messages.length, 2);
  assert.match(messages[0]!.content, /do not recalculate or change any numeric result/i);
  assert.match(messages[1]!.content, /OWNER_ENTERED/);
  assert.match(messages[0]!.content, /Tamil \+ English/);
});

test("consultant output is schema-checked and unknown evidence IDs are removed", () => {
  const raw = JSON.stringify({
    executiveSummary: "பதிவான தரவை முதலில் POS உடன் சரிபார்க்கவும்.",
    recommendations: [{
      title: "Reconcile sales",
      priority: "MEDIUM",
      action: "Compare the daily total with the POS close report.",
      reason: "The source is owner-entered.",
      evidenceIds: ["rec-1", "invented-id"],
      confidence: "HIGH"
    }]
  });
  const result = parseConsultantOutput(raw, ["rec-1"]);
  assert.deepEqual(result.recommendations[0]?.evidenceIds, ["rec-1"]);
});

test("invalid model JSON is rejected", () => {
  assert.throws(() => parseConsultantOutput("not json", ["rec-1"]));
});
