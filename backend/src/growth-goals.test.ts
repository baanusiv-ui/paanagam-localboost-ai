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
 const empty=calculateGrowthGoal(goal("REVIEW_COUNT",10),[],new Date("2026-11-10T00:00:00.000Z"));assert.equal(empty.actualValue,0);assert.equal(empty.sampleSize,0);
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
