import test from "node:test";
import assert from "node:assert/strict";
import { calculateGrowthGoal } from "./growth-goals.js";
const goal=(metric:"NET_SALES"|"REVIEW_COUNT"|"AVERAGE_RATING",targetValue:number)=>({id:"g1",metric,targetValue,monthStart:"2026-11-01T00:00:00.000Z"});
const row=(id:string,recordType:string,payload:Record<string,unknown>,recordedAt="2026-11-03T10:00:00.000Z",source="OWNER_ENTERED")=>({id,recordType,payload,recordedAt,source});
test("monthly sales target sums recorded net sales and excludes demo",()=>{
 const result=calculateGrowthGoal(goal("NET_SALES",10000),[row("1","DAILY_SALES",{netSales:2500,orders:20}),row("2","DAILY_SALES",{net:1500}),row("3","DAILY_SALES",{net:9000},"2026-11-04T10:00:00.000Z","DEMO")],new Date("2026-11-10T00:00:00.000Z"));
 assert.equal(result.actualValue,4000);assert.equal(result.progressPercent,40);assert.equal(result.sampleSize,2);assert.equal(result.status,"IN_PROGRESS");
});
test("review count is calendar-month scoped and does not infer zero from missing records",()=>{
 const result=calculateGrowthGoal(goal("REVIEW_COUNT",10),[row("1","REVIEW_ITEM",{rating:5}),row("2","REVIEW_ITEM",{rating:4},"2026-10-31T23:00:00.000Z")],new Date("2026-11-10T00:00:00.000Z"));
 assert.equal(result.actualValue,1);assert.equal(result.progressPercent,10);
 const empty=calculateGrowthGoal(goal("REVIEW_COUNT",10),[],new Date("2026-11-10T00:00:00.000Z"));assert.equal(empty.actualValue,null);assert.equal(empty.sampleSize,0);assert.equal(empty.status,"NO_DATA");
});
test("average rating uses valid ratings only and returns no data without samples",()=>{
 const result=calculateGrowthGoal(goal("AVERAGE_RATING",4.5),[row("1","REVIEW_ITEM",{rating:5}),row("2","REVIEW_ITEM",{rating:3}),row("3","REVIEW_ITEM",{rating:8})],new Date("2026-11-10T00:00:00.000Z"));
 assert.equal(result.actualValue,4);assert.equal(result.sampleSize,2);
 assert.equal(calculateGrowthGoal(goal("AVERAGE_RATING",4.5),[],new Date("2026-11-10T00:00:00.000Z")).status,"NO_DATA");
});
test("does not forecast or label future months as on track",()=>{
 const result=calculateGrowthGoal({...goal("NET_SALES",100),monthStart:"2026-12-01T00:00:00.000Z"},[],new Date("2026-11-10T00:00:00.000Z"));
 assert.equal(result.status,"NO_DATA");assert.equal(result.progressPercent,null);
});

import { buildGrowthGoalHistory } from "./growth-goals.js";
test("goal history includes prior months, excludes future months and retains archived goals",()=>{
 const goals=[
  {...goal("NET_SALES",1000),id:"nov",monthStart:"2026-11-01T00:00:00.000Z"},
  {...goal("NET_SALES",900),id:"oct",monthStart:"2026-10-01T00:00:00.000Z",archivedAt:"2026-10-20T00:00:00.000Z"},
  {...goal("NET_SALES",800),id:"dec",monthStart:"2026-12-01T00:00:00.000Z"}
 ];
 const history=buildGrowthGoalHistory(goals,[row("1","DAILY_SALES",{netSales:500},"2026-10-04T10:00:00.000Z")],new Date("2026-11-10T00:00:00.000Z"),2);
 assert.deepEqual(history.map(x=>x.id),["nov","oct"]);
 assert.equal(history[1].archived,true);
 assert.equal(history[1].actualValue,500);
});
test("goal history sorts metric entries within month and does not invent absent goals",()=>{
 const goals=[{...goal("REVIEW_COUNT",10),id:"reviews"},{...goal("NET_SALES",500),id:"sales"}];
 const history=buildGrowthGoalHistory(goals,[],new Date("2026-11-10T00:00:00.000Z"),1);
 assert.deepEqual(history.map(x=>x.id),["sales","reviews"]);
 assert.equal(history[0].actualValue,null);
});
