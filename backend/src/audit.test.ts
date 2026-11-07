import test from "node:test";
import assert from "node:assert/strict";
import { Evidence, EvidenceSource } from "@prisma/client";
import { buildAudit } from "./audit.js";

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: "evidence-1",
    businessId: "business-1",
    category: "business_name",
    value: { text: "Paanagam" },
    source: EvidenceSource.OWNER_CONFIRMED,
    sourceLabel: "Owner supplied",
    verified: true,
    observedAt: new Date("2026-11-07T10:00:00.000Z"),
    expiresAt: null,
    createdAt: new Date("2026-11-07T10:00:00.000Z"),
    ...overrides
  } as Evidence;
}

test("empty audit has zero checklist completeness", () => {
  const result = buildAudit([]);
  assert.equal(result.completeness, 0);
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.findings.length, 8);
});

test("owner-confirmed evidence counts as checklist coverage", () => {
  const result = buildAudit([evidence()]);
  assert.equal(result.completeness, 13);
  assert.equal(result.findings[0]?.status, "owner_confirmed");
  assert.deepEqual(result.evidenceIds, ["evidence-1"]);
});

test("public observations and demo data do not increase verified completeness", () => {
  const publicResult = buildAudit([evidence({ source: EvidenceSource.PUBLIC_OBSERVATION, verified: false })]);
  const demoResult = buildAudit([evidence({ source: EvidenceSource.DEMO, verified: false })]);
  assert.equal(publicResult.completeness, 0);
  assert.equal(publicResult.findings[0]?.status, "observed");
  assert.equal(demoResult.completeness, 0);
  assert.equal(demoResult.findings[0]?.status, "demo_only");
});

test("expired evidence is excluded from findings and audit references", () => {
  const result = buildAudit([evidence({ expiresAt: new Date("2020-01-01T00:00:00.000Z") })]);
  assert.equal(result.completeness, 0);
  assert.equal(result.findings[0]?.status, "missing");
  assert.deepEqual(result.evidenceIds, []);
});
