import test from "node:test";
import assert from "node:assert/strict";
import { mergeGrowthActionTracking } from "./growth-action-tracking.js";

test("merges saved workflow state while preserving generated action fields",()=>{
  const actions=[{id:"review-friction",status:"SUGGESTED",title:"Review concern",score:75},{id:"capture-sales-baseline",status:"SUGGESTED",title:"Sales baseline",score:38}];
  const merged=mergeGrowthActionTracking(actions,[{actionId:"review-friction",status:"IN_PROGRESS",ownerNote:"Discussed with shift lead",updatedAt:"2026-11-09T08:00:00.000Z"}]);
  assert.equal(merged[0]?.status,"IN_PROGRESS");
  assert.equal(merged[0]?.ownerNote,"Discussed with shift lead");
  assert.equal(merged[0]?.score,75);
  assert.equal(merged[1]?.status,"SUGGESTED");
  assert.equal(merged[1]?.ownerNote,"");
});

test("only matching action IDs receive tracking state",()=>{
  const merged=mergeGrowthActionTracking([{id:"new-signal",status:"SUGGESTED"}],[{actionId:"old-signal",status:"COMPLETED",ownerNote:null,updatedAt:"2026-11-08"}]);
  assert.equal(merged[0]?.status,"SUGGESTED");
  assert.equal(merged[0]?.trackingUpdatedAt,null);
});
