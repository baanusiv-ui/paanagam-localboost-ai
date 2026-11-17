export type MenuSalesRecord = { id: string; recordType: "MENU_ITEM" | "DAILY_SALES" | "MENU_ITEM_SALES"; payload: Record<string, unknown>; recordedAt: Date | string; source?: string };
const number = (value: unknown): number | null => { if (value === null || value === undefined || value === "") return null; const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null; };
const dateText = (value: unknown, fallback: Date | string): string => { const raw = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback; const d = new Date(raw); return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0,10); };
const money = (n: number) => Math.round(n * 100) / 100;
export function buildMenuSalesIntelligence(records: MenuSalesRecord[], from?: string, to?: string) {
  const validRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  const usable = records.filter(r => r.source !== "DEMO");
  const sales = usable.filter(r => r.recordType === "DAILY_SALES").map(r => ({
    r,
    date: dateText(r.payload.business_date ?? r.payload.date, r.recordedAt),
    net: number(r.payload.net_sales ?? r.payload.net ?? r.payload.netSales),
    orders: number(r.payload.order_count ?? r.payload.orders)
  })).filter(x => x.date && validRange(x.date) && x.net !== null && x.orders !== null).sort((a,b)=>a.date.localeCompare(b.date));
  const menu = usable.filter(r => r.recordType === "MENU_ITEM" || r.recordType === "MENU_ITEM_SALES").map(r => ({
    r,
    name: String(r.payload.item_name ?? r.payload.menu_item_name ?? r.payload.name ?? r.payload.itemName ?? "").trim(),
    qty: number(r.payload.quantity_sold ?? r.payload.quantity ?? r.payload.qty ?? r.payload.quantitySold ?? r.payload.unitsSold),
    price: number(r.payload.unit_selling_price ?? r.payload.selling_price ?? r.payload.price ?? r.payload.sellingPrice),
    cost: number(r.payload.unit_cost ?? r.payload.cost ?? r.payload.unitCost ?? r.payload.estimated_food_cost),
    gross: number(r.payload.gross_sales ?? r.payload.gross),
    net: number(r.payload.net_item_sales ?? r.payload.net_sales ?? r.payload.net),
    discount: number(r.payload.allocated_discount ?? r.payload.discount_allocation ?? r.payload.discount),
    date: dateText(r.payload.business_date ?? r.payload.date, r.recordedAt),
    periodStart: String((r.payload._source as Record<string, unknown> | undefined)?.periodStart ?? ""),
    periodEnd: String((r.payload._source as Record<string, unknown> | undefined)?.periodEnd ?? "")
  })).filter(x => {
    if (!x.name || x.qty === null) return false;
    if (x.periodStart || x.periodEnd) return (!from || (x.periodEnd || x.periodStart) >= from) && (!to || (x.periodStart || x.periodEnd) <= to);
    return validRange(x.date);
  });
  const items = new Map<string,{name:string;units:number;grossSales:number|null;netSales:number|null;discounts:number;unitContribution:number|null;records:string[]}>();
  for (const x of menu) {
    const key=x.name.toLocaleLowerCase();
    const row=items.get(key)||{name:x.name,units:0,grossSales:null,netSales:null,discounts:0,unitContribution:null,records:[]};
    row.units+=x.qty!;
    const gross = x.gross ?? (x.price === null ? null : x.price*x.qty!);
    const net = x.net ?? (gross === null ? null : gross-(x.discount ?? 0));
    if(gross!==null) row.grossSales=(row.grossSales??0)+gross;
    if(net!==null) row.netSales=(row.netSales??0)+net;
    if(x.discount!==null) row.discounts+=x.discount;
    if(x.price!==null&&x.cost!==null) row.unitContribution=(row.unitContribution??0)+(x.price-x.cost)*x.qty!;
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
  const costed=ranked.filter(x=>x.unitContribution!==null);
  const posRows=usable.filter(r=>r.source==="PAANAGAM_POS_READ_ONLY").length;
  return { generatedAt:new Date().toISOString(), range:{from:from??(days[0]?.date||null),to:to??(days[days.length-1]?.date||null)}, sourcePolicy:"DEMO records excluded. POS-imported summaries retain source provenance; owner-entered menu records are not POS-verified.", sales:{recordCount:sales.length,coverageDays:days.length,netSales:days.length?money(days.reduce((s,d)=>s+d.netSales,0)):null,orders:days.length?days.reduce((s,d)=>s+d.orders,0):null,averageOrderValue:days.length&&days.reduce((s,d)=>s+d.orders,0)>0?money(days.reduce((s,d)=>s+d.netSales,0)/days.reduce((s,d)=>s+d.orders,0)):null,daily:days.map(d=>({...d,netSales:money(d.netSales)})),weekly:[...weeks.values()].sort((a,b)=>a.weekStart.localeCompare(b.weekStart)).map(w=>({...w,netSales:money(w.netSales)}))},menu:{itemCount:ranked.length,items:ranked.map(x=>({...x,grossSales:x.grossSales===null?null:money(x.grossSales),netSales:x.netSales===null?null:money(x.netSales),discounts:money(x.discounts),unitContribution:x.unitContribution===null?null:money(x.unitContribution)})),topSellers:ranked.length>=2?ranked.slice(0,5):ranked,bottomSellers:ranked.length>=2?ranked.slice(-5).reverse():[],costedItemCount:costed.length},dayparts:{available:dayparts.size>0,items:[...dayparts.values()].map(x=>({...x,netSales:money(x.netSales)})).sort((a,b)=>b.netSales-a.netSales),note:dayparts.size?"Calculated only from explicitly supplied daypart aggregates.":"No daypart aggregates supplied; no time-of-day split is inferred."},dataProvenance:{posImportedRecordCount:posRows,ownerEnteredRecordCount:usable.length-posRows},limitations:["Menu item quantities use POS line-item summaries when available; owner-entered snapshots remain separately identified.","Daily and weekly sales use supplied business dates and net sales; missing dates are not treated as zero.","Menu item net sales use source-provided net values when available; otherwise supplied gross and discount values are used.","Contribution is shown only for items with both supplied price and unit cost.","Daypart analysis requires explicit daypart aggregates.","Recipe-level food cost, FIFO COGS and net profit are not inferred from sales summaries."] };
}
