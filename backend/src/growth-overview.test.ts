import test from "node:test";
import assert from "node:assert/strict";
import { buildGrowthOverview } from "./growth-overview.js";

test("ranks evidence-backed review and sales signals and limits output to three", () => {
  const records = [
    ...Array.from({length:3},(_,i)=>({id:"r"+i,recordType:"REVIEW_ITEM" as const,payload:{reviewText:"slow service, bad service",rating:1,reviewDate:"2026-10-0"+(i+1)},recordedAt:"2026-10-0"+(i+1),source:"GOOGLE_API"})),
    ...Array.from({length:14},(_,i)=>({id:"s"+i,recordType:"DAILY_SALES" as const,payload:{net:i<7?1000:500,orders:10},recordedAt:new Date(Date.UTC(2026,9,1+i)).toISOString(),source:"OWNER_ENTERED"}))
  ];
  const evidence = [{id:"e1",category:"hours",source:"GOOGLE_API",verified:false,observedAt:"2026-10-01",expiresAt:"2026-10-02"}];
  const result=buildGrowthOverview({records,evidence,generatedAt:new Date("2026-11-01T00:00:00Z")});
  assert.equal(result.actions.length,3);
  assert.ok(result.actions.some(x=>x.id==="review-friction"));
  assert.ok(result.actions.some(x=>x.id==="sales-trend-check"));
  assert.ok(result.actions.some(x=>x.id==="refresh-profile-evidence"));
  assert.ok(result.actions.every(x=>x.requiresOwnerApproval && x.status==="SUGGESTED"));
});

test("excludes demo records and returns useful data-gap actions", () => {
  const result=buildGrowthOverview({records:[{id:"demo",recordType:"DAILY_SALES",payload:{net:9999,orders:99},recordedAt:"2026-10-01",source:"DEMO"}],evidence:[],generatedAt:new Date("2026-11-01T00:00:00Z")});
  assert.equal(result.businessData.savedRecords,0);
  assert.ok(result.actions.some(x=>x.id==="capture-sales-baseline"));
  assert.ok(result.actions.some(x=>x.id==="capture-customer-feedback"));
  assert.ok(result.guardrails.some(x=>x.includes("No demo records")));
});

test("flags expired or unverified profile evidence with provenance", () => {
  const result=buildGrowthOverview({records:[],evidence:[{id:"e1",category:"hours",source:"GOOGLE_API",verified:false,observedAt:"2026-10-01",expiresAt:"2026-10-02"}],generatedAt:new Date("2026-11-01T00:00:00Z")});
  const action=result.actions.find(x=>x.id==="refresh-profile-evidence");
  assert.ok(action);
  assert.match(action!.why,/1 saved evidence records/);
  assert.equal(action!.evidence.recordIds[0],"e1");
});
