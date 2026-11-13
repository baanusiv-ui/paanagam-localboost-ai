(() => {
  "use strict";
  const API=(window.LOCALBOOST_API_BASE||"http://localhost:4100").replace(/\/$/,"");
  const TOKEN="localboost_access_token",BUSINESS="localboost_business_id";
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let businessId=null,installed=false,lastResult=null;
  const money=value=>value===null||value===undefined?"Not available":"₹"+Number(value).toLocaleString("en-IN",{maximumFractionDigits:2});
  const labels={STAR:"Star",PLOWHORSE:"Plowhorse",PUZZLE:"Puzzle",DOG:"Dog",COST_MISSING:"Cost missing",NO_SALES:"No recorded sales"};
  const advice={STAR:"Protect quality and consider featuring this item.",PLOWHORSE:"Review portion size and price without damaging demand.",PUZZLE:"Test menu placement, naming and product explanation.",DOG:"Check recipe, price and demand before deciding whether to change it.",COST_MISSING:"Complete and verify unit cost before making a profitability decision.",NO_SALES:"No units were recorded in this period."};
  async function request(from,to){
    const query=new URLSearchParams();if(from)query.set("from",from);if(to)query.set("to",to);
    const headers={accept:"application/json"};const token=sessionStorage.getItem(TOKEN);if(token)headers.authorization="Bearer "+token;
    const response=await fetch(API+"/v1/businesses/"+encodeURIComponent(businessId)+"/menu-sales-intelligence"+(query.size?"?"+query.toString():""),{headers});
    const data=await response.json().catch(()=>null);if(!response.ok)throw new Error(data?.error||"Menu engineering could not be loaded ("+response.status+")");return data;
  }
  function render(result){
    lastResult=result;const root=$("gi-menu-engineering-results");if(!root)return;
    const matrix=result.menuEngineering||{},items=matrix.items||[],thresholds=matrix.thresholds||{};
    const classified=items.filter(item=>["STAR","PLOWHORSE","PUZZLE","DOG"].includes(item.classification));
    const cards=items.map(item=>'<article class="me-item"><div class="me-item-head"><strong>'+esc(item.name)+'</strong><span class="me-tag me-'+esc(item.classification).toLowerCase()+'">'+esc(labels[item.classification]||item.classification)+'</span></div><div class="me-metrics"><span>Units<strong>'+Number(item.units).toLocaleString("en-IN")+'</strong></span><span>Sales<strong>'+esc(money(item.grossSales))+'</strong></span><span>Contribution / unit<strong>'+esc(money(item.contributionPerUnit))+'</strong></span><span>Cost coverage<strong>'+ (item.costCoveragePercent===null?"—":Number(item.costCoveragePercent).toFixed(1)+"%")+'</strong></span></div><p>'+esc(advice[item.classification]||"Review source data.")+'</p></article>').join("");
    const status=result.limits?.mayBeIncomplete?"Record limit reached; this result may not include every saved record.":"All available records within the API's current query limit were processed.";
    root.innerHTML='<div class="me-kpis"><article><small>Menu items</small><strong>'+Number(matrix.itemCount||0)+'</strong></article><article><small>Classified items</small><strong>'+Number(matrix.classifiedCount||0)+'</strong></article><article><small>Popularity threshold</small><strong>'+Number(thresholds.popularityUnits||0).toFixed(1)+' units</strong></article><article><small>Profit threshold</small><strong>'+esc(money(thresholds.averageContributionPerUnit))+' / unit</strong></article></div><p class="me-explain">'+esc(matrix.method||"Menu engineering requires item sales and verified costs.")+'</p>'+(items.length?'<div class="me-items">'+cards+'</div>':'<div class="me-empty">No menu-item sales records were found for this business and date range. Connect the read-only POS integration or import verified item-level records.</div>')+'<details class="me-details"><summary>Data quality and safeguards</summary><p>'+esc(result.sourcePolicy||"Saved business records only.")+'</p><p>'+esc(status)+'</p><ul>'+((matrix.limitations||[]).map(x=>'<li>'+esc(x)+'</li>').join(""))+'</ul><p>Menu engineering is an advisory analysis. It does not change menu prices, recipes, inventory, POS orders or publishing settings.</p></details>';
  }
  async function load(){
    if(!businessId)return;
    const root=$("gi-menu-engineering-results"),button=$("gi-menu-engineering-refresh");if(!root)return;
    const from=$("gi-menu-from")?.value||"",to=$("gi-menu-to")?.value||"";
    if(from&&to&&from>to){root.textContent="Start date must be on or before end date.";return;}
    if(button){button.disabled=true;button.textContent="Analysing…";}
    root.innerHTML='<p class="empty-copy">Calculating menu performance from saved records…</p>';
    try{render(await request(from,to));}
    catch(error){root.innerHTML='<p class="empty-copy">'+esc(error.message)+'</p>';}
    finally{if(button){button.disabled=false;button.textContent="Refresh analysis";}}
  }
  function install(){
    if(installed)return;const section=$("growth-intelligence-view"),tabs=section?.querySelector(".gi-tabs");if(!section||!tabs)return;
    installed=true;
    const tab=document.createElement("button");tab.type="button";tab.dataset.giTab="menu-engineering";tab.textContent="Menu engineering";tabs.append(tab);
    const panel=document.createElement("div");panel.className="gi-panel hidden";panel.dataset.giPanel="menu-engineering";
    panel.innerHTML='<div class="panel"><div class="panel-heading"><div><h3>Menu engineering matrix</h3><p>Identify high-volume and high-contribution menu items using saved business data.</p></div><span class="tag pending-tag">Advisory · read-only</span></div><div class="me-controls"><label>From<input id="gi-menu-from" type="date"></label><label>To<input id="gi-menu-to" type="date"></label><button class="secondary-button" id="gi-menu-engineering-refresh" type="button">Refresh analysis</button></div><div id="gi-menu-engineering-results" aria-live="polite"><p class="empty-copy">Select a business to analyse menu performance.</p></div></div>';
    section.append(panel);
    tab.addEventListener("click",()=>{tabs.querySelectorAll("[data-gi-tab]").forEach(x=>x.classList.toggle("active",x===tab));section.querySelectorAll("[data-gi-panel]").forEach(x=>x.classList.toggle("hidden",x.dataset.giPanel!=="menu-engineering"));if(businessId)load();});
    $("gi-menu-engineering-refresh").addEventListener("click",load);
  }
  function ready(event){businessId=event.detail?.businessId||sessionStorage.getItem(BUSINESS);install();if(businessId&&$("gi-menu-engineering-refresh")?.dataset.autoLoad!=="done"){ $("gi-menu-engineering-refresh").dataset.autoLoad="done"; }}
  window.addEventListener("localboost:business-ready",ready);
  window.addEventListener("localboost:signed-out",()=>{businessId=null;lastResult=null;const root=$("gi-menu-engineering-results");if(root)root.innerHTML='<p class="empty-copy">Sign in and select a business to load its private menu analysis.</p>';});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
  const saved=sessionStorage.getItem(BUSINESS);if(saved){businessId=saved;install();}
})();
