export type GrowthGoalMetric = "NET_SALES" | "REVIEW_COUNT" | "AVERAGE_RATING";
export type GoalRecord = {
  id: string; recordType: string; payload: Record<string, unknown>;
  recordedAt: Date | string; source: string;
};
export type GoalInput = {
  id: string; metric: GrowthGoalMetric; targetValue: number; monthStart: Date | string;
  createdAt?: Date | string; updatedAt?: Date | string; archivedAt?: Date | string | null;
};
const round=(n:number)=>Math.round(n*100)/100;
const dateKey=(v:Date|string)=>new Date(v).toISOString().slice(0,10);
const monthKey=(v:Date|string)=>dateKey(v).slice(0,7);
const amount=(v:unknown):number|null=>{if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;};
function recordDate(row:GoalRecord):string { return dateKey(row.recordedAt); }
/** Progress is calculated only from non-demo saved evidence within the selected calendar month. */
export function calculateGrowthGoal(goal:GoalInput, records:GoalRecord[], now=new Date()) {
  const month=monthKey(goal.monthStart);
  const relevant=records.filter(row=>row.source!=="DEMO" && monthKey(recordDate(row))===month);
  let actual:number|null=null, sampleSize=0, source:string;
  if(goal.metric==="NET_SALES"){
    const rows=relevant.filter(row=>row.recordType==="DAILY_SALES")
      .map(row=>amount(row.payload.net ?? row.payload.netSales)).filter((n):n is number=>n!==null);
    actual=rows.length?round(rows.reduce((a,b)=>a+b,0)):null; sampleSize=rows.length; source="SAVED_DAILY_SALES_RECORDS";
  } else {
    const reviews=relevant.filter(row=>row.recordType==="REVIEW_ITEM");
    if(goal.metric==="REVIEW_COUNT"){actual=reviews.length?reviews.length:null;sampleSize=reviews.length;source="SAVED_REVIEW_RECORDS";}
    else {const ratings=reviews.map(row=>amount(row.payload.rating)).filter((n):n is number=>n!==null&&n>=1&&n<=5);actual=ratings.length?round(ratings.reduce((a,b)=>a+b,0)/ratings.length):null;sampleSize=ratings.length;source="SAVED_REVIEW_RATINGS";}
  }
  const target=goal.targetValue;
  const progressPercent=actual===null?null:round(actual/target*100);
  const isCurrentMonth=month===monthKey(now);
  return {
    id:goal.id,metric:goal.metric,targetValue:target,month,
    actualValue:actual,progressPercent,remaining:actual===null?null:round(Math.max(0,target-actual)),
    sampleSize,source,status:actual===null?"NO_DATA":actual>=target?"ACHIEVED":isCurrentMonth?"IN_PROGRESS":"BELOW_TARGET",
    note:actual===null?"No eligible records are available for this metric and month.":goal.metric==="NET_SALES"?"Actual is the sum of recorded daily net sales; missing dates are not assumed to be zero.":goal.metric==="REVIEW_COUNT"?"Actual is the count of saved reviews in the selected month.":"Actual is the average of saved 1–5 star review ratings; rating-only sample size is shown.",
    updatedAt:goal.updatedAt??goal.createdAt??null
  };
}
