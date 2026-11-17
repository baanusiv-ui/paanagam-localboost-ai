import test from "node:test";
import assert from "node:assert/strict";
import { buildMenuSalesIntelligence, type MenuSalesRecord } from "./menu-sales-intelligence.js";
const rec=(id:string,recordType:MenuSalesRecord["recordType"],payload:Record<string,unknown>,date="2026-11-01",source="OWNER_ENTERED"):MenuSalesRecord=>({id,recordType,payload,recordedAt:date+"T12:00:00.000Z",source});
test("daily and weekly sales plus AOV use saved records",()=>{const x=buildMenuSalesIntelligence([rec("s1","DAILY_SALES",{date:"2026-11-02",net:1000,orders:10}),rec("s2","DAILY_SALES",{date:"2026-11-03",net:500,orders:5})]);assert.equal(x.sales.netSales,1500);assert.equal(x.sales.orders,15);assert.equal(x.sales.averageOrderValue,100);assert.equal(x.sales.weekly.length,1);});
test("menu mix ranks units and contribution only when cost exists",()=>{const x=buildMenuSalesIntelligence([rec("m1","MENU_ITEM",{name:"Coffee",qty:20,price:20,cost:8}),rec("m2","MENU_ITEM",{name:"Tea",qty:10,price:15})]);assert.equal(x.menu.topSellers[0]?.name,"Coffee");assert.equal(x.menu.items[0]?.grossSales,400);assert.equal(x.menu.items[0]?.unitContribution,240);assert.equal(x.menu.items[1]?.unitContribution,null);});
test("demo records excluded and no daypart inferred",()=>{const x=buildMenuSalesIntelligence([rec("d","DAILY_SALES",{net:9999,orders:99},"2026-11-01","DEMO")]);assert.equal(x.sales.recordCount,0);assert.equal(x.dayparts.available,false);});
test("daypart shown only from explicit source fields",()=>{const x=buildMenuSalesIntelligence([rec("s","DAILY_SALES",{net:100,orders:5,dayparts:[{name:"Breakfast",net:60,orders:3},{name:"Evening",net:40,orders:2}]})]);assert.equal(x.dayparts.available,true);assert.equal(x.dayparts.items[0]?.name,"Breakfast");});
test("date range filters dated menu and sales rows",()=>{const x=buildMenuSalesIntelligence([rec("s1","DAILY_SALES",{date:"2026-11-01",net:10,orders:1}),rec("s2","DAILY_SALES",{date:"2026-11-02",net:20,orders:2})],"2026-11-02","2026-11-02");assert.equal(x.sales.netSales,20);});

test("Paanagam POS field names populate daily sales and item profitability inputs", () => {
  const x = buildMenuSalesIntelligence([
    rec("pos-day", "DAILY_SALES", { business_date: "2026-11-02", net_sales: 1200, order_count: 24 }, "2026-11-02", "PAANAGAM_POS_READ_ONLY"),
    rec("pos-item", "MENU_ITEM_SALES", { business_date: "2026-11-02", item_name: "Filter Coffee", quantity_sold: 10, gross_sales: 250, allocated_discount: 10, net_item_sales: 240, unit_selling_price: 25, unit_cost: 10 }, "2026-11-02", "PAANAGAM_POS_READ_ONLY")
  ]);
  assert.equal(x.sales.netSales, 1200);
  assert.equal(x.sales.orders, 24);
  assert.equal(x.sales.averageOrderValue, 50);
  assert.equal(x.menu.items[0]?.name, "Filter Coffee");
  assert.equal(x.menu.items[0]?.units, 10);
  assert.equal(x.menu.items[0]?.grossSales, 250);
  assert.equal(x.menu.items[0]?.netSales, 240);
  assert.equal(x.menu.items[0]?.unitContribution, 150);
  assert.equal(x.dataProvenance.posImportedRecordCount, 2);
});
