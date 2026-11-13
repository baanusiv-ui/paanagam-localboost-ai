export type MenuSalesRecord = { id: string; recordType: "MENU_ITEM" | "DAILY_SALES"; payload: Record<string, unknown>; recordedAt: Date | string; source?: string };
const number = (value: unknown): number | null => { if (value === null || value === undefined || value === "") return null; const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null; };
const dateText = (value: unknown, fallback: Date | string): string => { const raw = typeof value === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(value) ? value : fallback; const d = new Date(raw); return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0,10); };
const money = (n: number) => Math.round(n * 100) / 100;

type MenuAccumulator = { name: string; units: number; grossSales: number | null; contributionTotal: number | null; pricedUnits: number; costedUnits: number; records: string[] };
function buildMenuEngineering(items: MenuAccumulator[]) {
  const totalUnits = items.reduce((sum, item) => sum + item.units, 0);
  const popularityThreshold = items.length ? (totalUnits / items.length) * 0.7 : 0;
  const fullyCosted = items.filter(item => item.units > 0 && item.costedUnits >= item.units - 0.000001 && item.contributionTotal !== null);
  const averageContributionPerUnit = fullyCosted.length
    ? fullyCosted.reduce((sum, item) => sum + (item.contributionTotal! / item.units), 0) / fullyCosted.length
    : null;
  const classified = items.map(item => {
    const completeCost = item.units > 0 && item.costedUnits >= item.units - 0.000001 && item.contributionTotal !== null;
    const contributionPerUnit = completeCost ? item.contributionTotal! / item.units : null;
    const popular = item.units > 0 && item.units >= popularityThreshold;
    let classification: "STAR" | "PLOWHORSE" | "PUZZLE" | "DOG" | "COST_MISSING" | "NO_SALES";
    if (item.units <= 0) classification = "NO_SALES";
    else if (!completeCost || averageContributionPerUnit === null) classification = "COST_MISSING";
    else if (popular && contributionPerUnit! >= averageContributionPerUnit) classification = "STAR";
    else if (popular) classification = "PLOWHORSE";
    else if (contributionPerUnit! >= averageContributionPerUnit) classification = "PUZZLE";
    else classification = "DOG";
    return {
      name: item.name, units: money(item.units),
      grossSales: item.grossSales === null ? null : money(item.grossSales),
      contributionPerUnit: contributionPerUnit === null ? null : money(contributionPerUnit),
      contributionTotal: completeCost ? money(item.contributionTotal!) : null,
      costCoveragePercent: item.units > 0 ? money((item.costedUnits / item.units) * 100) : null,
      classification, recordCount: item.records.length
    };
  }).sort((a,b) => b.units - a.units || a.name.localeCompare(b.name));
  return {
    method: "Popularity threshold = 70% of average units sold per listed item. Profitability threshold = average contribution per unit across fully costed items. This is a descriptive menu-engineering heuristic, not a forecast.",
    thresholds: { popularityUnits: money(popularityThreshold), averageContributionPerUnit: averageContributionPerUnit === null ? null : money(averageContributionPerUnit) },
    totalUnits: money(totalUnits),
    itemCount: items.length,
    classifiedCount: classified.filter(item => ["STAR","PLOWHORSE","PUZZLE","DOG"].includes(item.classification)).length,
    unclassifiedCount: classified.filter(item => ["COST_MISSING","NO_SALES"].includes(item.classification)).length,
    items: classified,
    limitations: [
      "An item is classified only when its unit cost covers all recorded units in the selected period.",
      "Popularity uses recorded item quantities; missing items or days can change the threshold.",
      "Contribution is selling price minus supplied unit cost; taxes, discounts, wastage and overhead are not inferred.",
      "No menu item or price is changed automatically."
    ]
  };
}

export function buildMenuSalesIntelligence(records: MenuSalesRecord[], from?: string, to?: string) {
  const validRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const usable = records.filter(r => r.source !== "DEMO");
  const sales = usable.filter(r => r.recordType === "DAILY_SALES").map(r => ({ r, date: dateText(r.payload.date ?? r.payload.business_date, r.recordedAt), net: number(r.payload.net ?? r.payload.netSales), orders: number(r.payload.orders) })).filter(x => x.date && validRange(x.date) && x.net !== null && x.orders !== null).sort((a,b)=>a.date.localeCompare(b.date));
  const menu = usable.filter(r => r.recordType === "MENU_ITEM").map(r => ({ r, name: String(r.payload.name ?? r.payload.itemName ?? "").trim(), qty: number(r.payload.qty ?? r.payload.quantitySold ?? r.payload.unitsSold ?? r.payload.quantity), price: number(r.payload.price ?? r.payload.sellingPrice), cost: number(r.payload.cost ?? r.payload.unitCost), date: dateText(r.payload.date ?? r.payload.business_date, r.recordedAt) })).filter(x=>x.name && x.qty !== null && validRange(x.date));
  const items = new Map<string,MenuAccumulator>();
  for (const x of menu) {
    const key=x.name.toLocaleLowerCase();
    const row=items.get(key)||{name:x.name,units:0,grossSales:null,contributionTotal:null,pricedUnits:0,costedUnits:0,records:[]};
    row.units+=x.qty!;
    if(x.price!==null){row.grossSales=(row.grossSales??0)+x.price*x.qty!;row.pricedUnits+=x.qty!;}
    if(x.price!==null&&x.cost!==null){row.contributionTotal=(row.contributionTotal??0)+(x.price-x.cost)*x.qty!;row.costedUnits+=x.qty!;}
    row.records.push(x.r.id);
    items.set(key,row);
  }
  const ranked=[...items.values()].sort((a,b)=>b.units-a.units);
  const daily = new Map<string,{date:string;netSales:number;orders:number;records:string[]}>();
  for(const x of sales){const d=daily.get(x.date)||{date:x.date,netSales:0,orders:0,records:[]};d.netSales+=x.net!;d.orders+=x.orders!;d.records.push(x.r.id);daily.set(x.date,d);}
  const days=[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const weeks = new Map<string,{weekStart:string;netSales:number;orders:number;days:number}>();
  for(const d of days){const dt=new Date(d.date+"T00:00:00Z");dt.setUTCDate(dt.getUTCDate()-((dt.getUTCDay()+6)%7));const key=dt.toISOString().slice(0,10);const w=weeks.get(key)||{weekStart:key,netSales:0,orders:0,days:0};w.netSales+=d.netSales;w.orders+=d.orders;w.days++;weeks.set(key,w);}
  const dayparts = new Map<string,{name:string;netSales:number;orders:number;records:string[]}>();
  for(const x of sales){const raw=x.r.payload.dayparts; if(!Array.isArray(raw))continue; for(const p of raw){if(!p||typeof p!=="object")continue;const part=p as Record<string,unknown>;const name=String(part.name??part.daypart??"").trim();const net=number(part.netSales??part.net);const orders=number(part.orders);if(!name||net===null||orders===null)continue;const row=dayparts.get(name)||{name,netSales:0,orders:0,records:[]};row.netSales+=net;row.orders+=orders;row.records.push(x.r.id);dayparts.set(name,row);}}
  const costed=ranked.filter(x=>x.costedUnits>0);
  return {
    generatedAt:new Date().toISOString(),
    range:{from:from??(days[0]?.date||null),to:to??(days[days.length-1]?.date||null)},
    sourcePolicy:"DEMO records excluded. Figures use saved owner-entered or connected read-only records; POS records are never modified.",
    sales:{recordCount:sales.length,coverageDays:days.length,netSales:days.length?money(days.reduce((s,d)=>s+d.netSales,0)):null,orders:days.length?days.reduce((s,d)=>s+d.orders,0):null,averageOrderValue:days.length&&days.reduce((s,d)=>s+d.orders,0)>0?money(days.reduce((s,d)=>s+d.netSales,0)/days.reduce((s,d)=>s+d.orders,0)):null,daily:days.map(d=>({...d,netSales:money(d.netSales)})),weekly:[...weeks.values()].sort((a,b)=>a.weekStart.localeCompare(b.weekStart)).map(w=>({...w,netSales:money(w.netSales)}))},
    menu:{itemCount:ranked.length,items:ranked.map(x=>({...x,grossSales:x.grossSales===null?null:money(x.grossSales),unitContribution:x.contributionTotal===null?null:money(x.contributionTotal)})),topSellers:ranked.length>=2?ranked.slice(0,5):ranked,bottomSellers:ranked.length>=2?ranked.slice(-5).reverse():[],costedItemCount:costed.length},
    menuEngineering:buildMenuEngineering(ranked),
    dayparts:{available:dayparts.size>0,items:[...dayparts.values()].map(x=>({...x,netSales:money(x.netSales)})).sort((a,b)=>b.netSales-a.netSales),note:dayparts.size?"Calculated only from explicitly supplied daypart aggregates.":"No daypart aggregates supplied; no time-of-day split is inferred."},
    limitations:["Menu item quantities are saved snapshots, not independently verified unless their source is a connected POS integration.","Daily and weekly sales use complete saved daily summaries only; missing dates are not treated as zero.","Menu item gross sales are quantity × supplied selling price, not reconciled receipts.","Contribution is shown only when supplied price and unit cost cover all recorded units for the menu-engineering classification.","Daypart analysis requires explicit dayparts in daily-sales payloads."]
  };
}
