(() => {
  "use strict";

  const LEGACY_KEY = "localboost_growth_workspace_v1";
  const KEY_PREFIX = "localboost_growth_workspace_v2:";
  const TOKEN_KEY = "localboost_access_token";
  const BUSINESS_KEY = "localboost_business_id";
  const $ = id => document.getElementById(id);
  const emptyData = () => ({ menu: [], sales: [], retention: [], drafts: [] });
  const parseData = raw => {
    try {
      const value = JSON.parse(raw);
      return {
        menu: Array.isArray(value?.menu) ? value.menu : [],
        sales: Array.isArray(value?.sales) ? value.sales : [],
        retention: Array.isArray(value?.retention) ? value.retention : [],
        drafts: Array.isArray(value?.drafts) ? value.drafts : []
      };
    } catch { return emptyData(); }
  };
  const readLocal = key => parseData(localStorage.getItem(key));
  let data = readLocal(LEGACY_KEY);
  let activeBusinessId = null;
  let remoteReady = false;
  let syncInProgress = false;
  const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
  const safe = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  const today = new Date().toLocaleDateString("en-CA");
  const API_BASE = (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\/$/, "");

  const scopedKey = businessId => KEY_PREFIX + businessId;
  const save = () => {
    const key = activeBusinessId ? scopedKey(activeBusinessId) : LEGACY_KEY;
    localStorage.setItem(key, JSON.stringify(data));
  };
  const setSyncStatus = (text, isError = false) => {
    const note = $("#cloud-sync-status");
    if (!note) return;
    note.textContent = text;
    note.classList.toggle("error", isError);
  };
  const remoteApi = async (path, options = {}) => {
    const headers = { "content-type": "application/json", ...(options.headers || {}) };
    const auth = sessionStorage.getItem(TOKEN_KEY);
    if (auth) headers.authorization = "Bearer " + auth;
    const response = await fetch(API_BASE + path, { ...options, headers });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Cloud sync failed (" + response.status + ")");
    return payload;
  };
  const businessPath = () => "/v1/businesses/" + encodeURIComponent(activeBusinessId || "");
  const localGroups = () => ({
    MENU_ITEM: data.menu,
    DAILY_SALES: data.sales,
    RETENTION_SNAPSHOT: data.retention,
    CAMPAIGN_DRAFT: data.drafts
  });
  function recordExternalId(type, item, index) {
    if (type === "DAILY_SALES") return "sales:" + item.date;
    if (type === "RETENTION_SNAPSHOT") return "retention:" + item.date;
    if (!item._id) item._id = type.toLowerCase() + ":" + Date.now() + ":" + index;
    return item._id;
  }
  async function syncRecord(type, item, index = 0) {
    if (!remoteReady || !activeBusinessId) return false;
    const recordedAt = item.created || item.date || new Date().toISOString();
    try {
      const result = await remoteApi(businessPath() + "/growth-records", {
        method: "POST",
        body: JSON.stringify({ type, externalId: recordExternalId(type, item, index), payload: item, recordedAt })
      });
      item._recordId = result?.record?.id || item._recordId;
      save();
      return true;
    } catch (error) {
      setSyncStatus("Cloud sync pending · saved on this device (" + error.message + ")", true);
      return false;
    }
  }
  async function loadDataStatus() {
    const root = $("data-freshness-status");
    if (!root || !activeBusinessId) return;
    try {
      const status = await remoteApi(businessPath() + "/data-status");
      const sourceCounts = status.evidence?.sourceCounts || {};
      const growthCounts = status.growthRecords?.sourceCounts || {};
      const googleText = status.google?.connectionSaved
        ? "Google Business Profile: connection saved" + (status.google.hasBusinessManageScope ? " · business.manage scope recorded" : " · required scope not confirmed; reconnect or verify access")
        : "Google Business Profile: not connected";
      const evidenceText = "Evidence: " + (status.evidence?.sampledCount || 0) + " records · " +
        (sourceCounts.GOOGLE_API || 0) + " Google API · " + (sourceCounts.OWNER_CONFIRMED || 0) + " owner-confirmed · " +
        (sourceCounts.PUBLIC_OBSERVATION || 0) + " public observations · " + (sourceCounts.DEMO || 0) + " demo";
      const growthText = "Growth workspace: " + (status.growthRecords?.sampledCount || 0) + " records · " +
        (growthCounts.OWNER_ENTERED || 0) + " owner-entered";
      const freshness = status.evidence?.latestObservedAt
        ? "Latest evidence: " + new Date(status.evidence.latestObservedAt).toLocaleString()
        : "No evidence has been recorded yet";
      root.textContent = [googleText, evidenceText, growthText, freshness,
        status.evidence?.expiredCount ? status.evidence.expiredCount + " expired evidence record(s) need review" : "",
        status.limits?.metricsAreNotExhaustiveWhenSampleLimitReached ? "Showing a capped sample; totals may be higher." : ""
      ].filter(Boolean).join(" · ");
    } catch (error) {
      root.textContent = "Data freshness status unavailable: " + error.message;
    }
  }
  async function loadServerIntelligence() {
    const root = $("insight-list");
    if (!root || !activeBusinessId) return;
    try {
      const report = await remoteApi(businessPath() + "/intelligence");
      root.innerHTML = '<div class="insight-list-items">' + report.insights.map(item =>
        '<article class="draft-card"><div class="draft-card-head"><strong>' + safe(item.title) + '</strong><span class="tag ' + (item.priority === "HIGH" ? "pending-tag" : "confirmed") + '">' + safe(item.priority) + '</span></div><p>' + safe(item.finding) + '</p><small>Source: ' + safe(item.evidence.source) + ' · Confidence: ' + safe(item.confidence) + '</small><p>' + safe(item.recommendation) + '</p><small>Evidence: ' + safe(item.evidence.calculation) + '</small><p class="footnote">Suggested only · owner approval required · no automatic action.</p></article>'
      ).join("") + '</div><p class="footnote">Engine: ' + safe(report.engine) + ' · ' + report.recordCount + ' owner-entered record(s) · ' + safe(report.dataStatus) + '</p>';
    } catch (error) {
      root.textContent = "Could not load server intelligence: " + error.message;
    }
  }
  async function loadLocalAiConsultant() {
    const root = $("ai-consultant-output");
    const statusNode = $("local-ai-status");
    const button = $("generate-ai-consultant");
    if (!root || !activeBusinessId) {
      if (root) root.textContent = "Sign in and select a business before asking the local AI consultant.";
      return;
    }
    button.disabled = true;
    button.textContent = "Checking local AI…";
    root.textContent = "Checking the private Ollama service on this PC…";
    try {
      const status = await remoteApi("/v1/ai/status");
      statusNode.textContent = status.reachable && status.modelInstalled ? "Local model ready" : "Local model not ready";
      statusNode.className = "tag " + (status.reachable && status.modelInstalled ? "confirmed" : "pending-tag");
      if (!status.configured || !status.reachable || !status.modelInstalled) {
        root.textContent = status.message || "Install and start Ollama, then check OLLAMA_BASE_URL and OLLAMA_MODEL in backend/.env.";
        return;
      }
      button.textContent = "Generating…";
      const result = await remoteApi(businessPath() + "/consultant", {
        method: "POST",
        body: JSON.stringify({ language: $("ai-consultant-language")?.value || "Tamil + English" })
      });
      const recommendations = Array.isArray(result.recommendations) ? result.recommendations : [];
      root.innerHTML = '<article class="draft-card"><div class="draft-card-head"><strong>AI business summary</strong><span class="tag confirmed">' + safe(result.provider) + '</span></div><p>' + safe(result.executiveSummary) + '</p></article>' +
        recommendations.map(item => '<article class="draft-card"><div class="draft-card-head"><strong>' + safe(item.title) + '</strong><span class="tag ' + (item.priority === "HIGH" ? "pending-tag" : "confirmed") + '">' + safe(item.priority) + '</span></div><p>' + safe(item.action) + '</p><small>Why: ' + safe(item.reason) + ' · Confidence: ' + safe(item.confidence) + '</small><small>Evidence record IDs: ' + safe((item.evidenceIds || []).join(", ") || "No direct record cited") + '</small><p class="footnote">Suggestion only · owner approval required · no external action performed.</p></article>').join("") +
        '<p class="footnote">' + safe(result.disclaimer) + ' · Model: ' + safe(result.model) + ' · ' + safe(new Date(result.generatedAt).toLocaleString()) + '</p>';
    } catch (error) {
      statusNode.textContent = "Local AI unavailable";
      statusNode.className = "tag pending-tag";
      root.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Ask local AI consultant";
    }
  }

  async function fetchAllGrowthRecords(path) {
    const records = [];
    let cursor = null;
    const maxPages = 50;
    for (let page = 0; page < maxPages; page++) {
      const query = new URLSearchParams({ limit: "200" });
      if (cursor) query.set("cursor", cursor);
      const result = await remoteApi(path + "/growth-records?" + query.toString());
      records.push(...(result.records || []));
      cursor = result.nextCursor || null;
      if (!cursor) return { records, truncated: false };
    }
    return { records, truncated: Boolean(cursor) };
  }

  async function hydrateCloudWorkspace(event) {
    const businessId = event?.detail?.businessId || sessionStorage.getItem(BUSINESS_KEY);
    if (!businessId || !sessionStorage.getItem(TOKEN_KEY)) return;
    if (syncInProgress) return;
    syncInProgress = true;
    remoteReady = false;
    activeBusinessId = businessId;
    sessionStorage.setItem(BUSINESS_KEY, businessId);
    const key = scopedKey(businessId);
    const hasScopedData = localStorage.getItem(key) !== null;
    if (hasScopedData) {
      data = readLocal(key);
    } else if (localStorage.getItem("localboost_legacy_workspace_migrated") !== "yes") {
      // Migrate the old unscoped workspace once, into the first business selected after this update.
      data = readLocal(LEGACY_KEY);
      if (Object.values(data).some(items => items.length)) localStorage.setItem(key, JSON.stringify(data));
      localStorage.setItem("localboost_legacy_workspace_migrated", "yes");
    } else {
      data = emptyData();
    }
    setSyncStatus("Checking the selected business workspace…");
    try {
      const path = businessPath();
      const initial = await fetchAllGrowthRecords(path);
      remoteReady = true;
      const existing = new Set(initial.records.map(record => record.recordType + ":" + record.externalId));
      const paginationTruncated = initial.truncated;
      const groups = localGroups();
      let migrated = 0;
      for (const [type, items] of Object.entries(groups)) {
        for (const [index, item] of items.entries()) {
          const externalId = recordExternalId(type, item, index);
          if (!existing.has(type + ":" + externalId)) {
            const ok = await syncRecord(type, item, index);
            if (ok) migrated++;
          }
        }
      }
      const latest = await fetchAllGrowthRecords(path);
      const grouped = { MENU_ITEM: [], DAILY_SALES: [], RETENTION_SNAPSHOT: [], CAMPAIGN_DRAFT: [] };
      for (const record of latest.records) {
        if (grouped[record.recordType]) grouped[record.recordType].push({ ...record.payload, _id: record.externalId, _recordId: record.id });
      }
      // The server is canonical for records already synced; local-only records remain available for retry.
      const remoteIds = new Set(latest.records.map(record => record.recordType + ":" + record.externalId));
      const localOnly = { MENU_ITEM: [], DAILY_SALES: [], RETENTION_SNAPSHOT: [], CAMPAIGN_DRAFT: [] };
      for (const [type, items] of Object.entries(groups)) {
        for (const [index, item] of items.entries()) {
          const externalId = recordExternalId(type, item, index);
          if (!remoteIds.has(type + ":" + externalId)) localOnly[type].push(item);
        }
      }
      data = {
        menu: [...grouped.MENU_ITEM, ...localOnly.MENU_ITEM],
        sales: [...grouped.DAILY_SALES, ...localOnly.DAILY_SALES],
        retention: [...grouped.RETENTION_SNAPSHOT, ...localOnly.RETENTION_SNAPSHOT],
        drafts: [...grouped.CAMPAIGN_DRAFT, ...localOnly.CAMPAIGN_DRAFT]
      };
      save();
      remoteReady = true;
      renderAll();
      const pendingCount = Object.values(localOnly).reduce((total, items) => total + items.length, 0);
      setSyncStatus("Cloud database connected · " + latest.records.length + " server record(s)" + ((paginationTruncated || latest.truncated) ? " · showing first 10,000 server records; older records remain on server" : "") + (migrated ? " · " + migrated + " local record(s) migrated" : "") + (pendingCount ? " · retrying " + pendingCount + " device-only record(s)" : " · all records synced") + " · owner-entered data");
      await loadServerIntelligence();
      await loadDataStatus();
      // Retry any device-only records after the server has become available.
      let remaining = 0;
      for (const [type, items] of Object.entries(localOnly)) {
        for (const [index, item] of items.entries()) if (!await syncRecord(type, item, index)) remaining++;
      }
      setSyncStatus("Cloud database connected · " + latest.records.length + " server record(s)" + (latest.truncated ? " · showing first 10,000 server records; older records remain on server" : "") + (remaining ? " · " + remaining + " device-only record(s) still pending" : " · all local records synced") + " · owner-entered data", remaining > 0);
    } catch (error) {
      remoteReady = false;
      setSyncStatus("Cloud sync unavailable · local data remains on this device (" + error.message + ")", true);
      renderAll();
    } finally {
      syncInProgress = false;
    }
  }

  window.addEventListener("localboost:business-ready", hydrateCloudWorkspace);
  if ($("sales-date")) $("sales-date").value = today;
  if ($("retention-date")) $("retention-date").value = today;

  function table(target, headers, rows) {
    const root = $(target); if (!root) return;
    if (!rows.length) { root.innerHTML = '<p class="empty-copy">No records entered yet.</p>'; return; }
    root.innerHTML = '<div class="table-scroll"><table><thead><tr>' + headers.map(h => '<th>' + safe(h) + '</th>').join("") + '</tr></thead><tbody>' +
      rows.map(row => '<tr>' + row.map(cell => '<td>' + safe(cell) + '</td>').join("") + '</tr>').join("") + '</tbody></table></div>';
  }
  function renderMenu() {
    table("menu-table", ["Item", "Price", "Unit cost", "Units", "Contribution / unit", "Source"], data.menu.map(item => [
      item.name, money(item.price), item.cost == null ? "Not supplied" : money(item.cost), item.qty,
      item.cost == null ? "Not calculated" : money(item.price - item.cost), "Owner-entered · not POS verified"
    ]));
  }
  function renderSalesTrendChart(rows) {
    const points = (rows || []).filter(row => Number.isFinite(Number(row.netSales)) && row.date).slice().sort((a,b) => a.date.localeCompare(b.date)).slice(-14);
    if (!points.length) return '<div class="lb-chart-empty">Add dated daily sales summaries to see the trend chart.</div>';
    const w=720,h=220,l=54,r=18,t=18,b=42,values=points.map(x=>Math.max(0,Number(x.netSales))),max=Math.max(1,...values);
    const px=i=>l+(points.length===1?(w-l-r)/2:i*(w-l-r)/(points.length-1)),py=v=>t+(max-v)/max*(h-t-b);
    const coords=points.map((p,i)=>[px(i),py(Number(p.netSales))]);
    const path=coords.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
    const area=path+" L "+coords[coords.length-1][0].toFixed(1)+","+(h-b)+" L "+coords[0][0].toFixed(1)+","+(h-b)+" Z";
    const guides=[0,.5,1].map(f=>{const yy=t+f*(h-t-b);return '<line x1="'+l+'" y1="'+yy+'" x2="'+(w-r)+'" y2="'+yy+'"/><text x="'+(l-9)+'" y="'+(yy+3)+'" text-anchor="end">'+safe(Math.round(max*(1-f)).toLocaleString("en-IN"))+'</text>';}).join("");
    const dots=coords.map((p,i)=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="4"><title>'+safe(points[i].date)+' · '+money(points[i].netSales)+'</title></circle>').join("");
    const labels=points.map((p,i)=>i===0||i===points.length-1||i===Math.floor((points.length-1)/2)?'<text x="'+px(i)+'" y="'+(h-13)+'" text-anchor="middle">'+safe(p.date.slice(5))+'</text>':"").join("");
    return '<div class="lb-chart-wrap"><div class="lb-chart-legend"><span><i></i> Recorded net sales</span><small>₹ · latest '+points.length+' dated records</small></div><svg class="lb-sales-chart" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Daily net sales trend">'+guides+'<path class="lb-chart-area" d="'+area+'"/><path class="lb-chart-line" d="'+path+'"/>'+dots+labels+'</svg></div>';
  }
  function renderWeeklyBars(rows) {
    const points=(rows||[]).filter(row=>Number.isFinite(Number(row.netSales))).slice().sort((a,b)=>String(a.weekStart).localeCompare(String(b.weekStart))).slice(-8);
    if(!points.length)return '<p class="empty-copy">Weekly comparison appears after daily summaries are recorded.</p>';
    const max=Math.max(1,...points.map(x=>Number(x.netSales)));
    return '<div class="lb-week-bars">'+points.map(p=>'<div class="lb-week-bar"><div class="lb-week-value">'+safe(money(p.netSales))+'</div><div class="lb-week-track"><i style="height:'+Math.max(3,Number(p.netSales)/max*100).toFixed(1)+'%"></i></div><small>'+safe(String(p.weekStart||"").slice(5))+'</small></div>').join("")+'</div>';
  }
  async function loadMenuSalesIntelligence() {
    if (!activeBusinessId || !remoteReady) return;
    const menuView = $("menu-view"), salesView = $("sales-view");
    if (!menuView || !salesView) return;
    let menuRoot = $("menu-sales-mix"), salesRoot = $("sales-trend-intelligence");
    if (!menuRoot) { menuRoot=document.createElement("section"); menuRoot.id="menu-sales-mix"; menuRoot.className="panel"; menuView.appendChild(menuRoot); }
    if (!salesRoot) { salesRoot=document.createElement("section"); salesRoot.id="sales-trend-intelligence"; salesRoot.className="panel"; salesView.appendChild(salesRoot); }
    menuRoot.innerHTML='<h3>Recorded menu mix</h3><p class="empty-copy">Loading saved menu records…</p>';
    salesRoot.innerHTML='<h3>Sales trend intelligence</h3><p class="empty-copy">Loading saved daily summaries…</p>';
    try {
      const end=new Date(); const start=new Date(end); start.setDate(start.getDate()-29);
      const from=start.toLocaleDateString("en-CA"),to=end.toLocaleDateString("en-CA");
      const report=await remoteApi(businessPath()+"/menu-sales-intelligence?from="+encodeURIComponent(from)+"&to="+encodeURIComponent(to));
      const menu=report.menu||{},sales=report.sales||{},dayparts=report.dayparts||{};
      const itemRows=(menu.items||[]).map(x=>'<tr><td>'+safe(x.name)+'</td><td>'+x.units+'</td><td>'+(x.grossSales===null?'Not available':money(x.grossSales))+'</td><td>'+(x.unitContribution===null?'Not costed':money(x.unitContribution))+'</td></tr>').join("");
      menuRoot.innerHTML='<div class="section-heading"><div><h3>Recorded menu mix</h3><p>Last 30 days · owner-entered quantities · not POS-verified</p></div><span class="tag pending-tag">'+menu.itemCount+' item(s)</span></div>'+(itemRows?'<div class="table-scroll"><table><thead><tr><th>Item</th><th>Units</th><th>Indicative sales</th><th>Contribution*</th></tr></thead><tbody>'+itemRows+'</tbody></table></div>':'<p class="empty-copy">No dated menu quantities are available for this period.</p>')+'<p class="footnote">*Contribution uses supplied selling price minus supplied unit cost, multiplied by units. It is not full profit. Indicative sales are not reconciled receipts.</p>';
      const dailyRows=(sales.daily||[]).slice(-14).reverse().map(x=>'<tr><td>'+safe(x.date)+'</td><td>'+money(x.netSales)+'</td><td>'+x.orders+'</td></tr>').join("");
      const weeklyRows=(sales.weekly||[]).slice(-8).reverse().map(x=>'<tr><td>Week of '+safe(x.weekStart)+'</td><td>'+money(x.netSales)+'</td><td>'+x.orders+'</td><td>'+x.days+'</td></tr>').join("");
      const partRows=(dayparts.items||[]).map(x=>'<tr><td>'+safe(x.name)+'</td><td>'+money(x.netSales)+'</td><td>'+x.orders+'</td></tr>').join("");
      salesRoot.innerHTML='<div class="section-heading"><div><h3>Sales trend intelligence</h3><p>'+safe(from)+' to '+safe(to)+' · saved daily summaries</p></div><span class="tag pending-tag">'+sales.coverageDays+' recorded day(s)</span></div><div class="metric-grid"><article class="metric-card"><div class="metric-top">Net sales</div><strong>'+money(sales.netSales||0)+'</strong><small>Saved summaries only</small></article><article class="metric-card"><div class="metric-top">Orders</div><strong>'+Number(sales.orders||0).toLocaleString("en-IN")+'</strong><small>Saved summaries only</small></article><article class="metric-card"><div class="metric-top">Average order value</div><strong>'+(sales.averageOrderValue===null?'No data':money(sales.averageOrderValue))+'</strong><small>Net sales ÷ orders</small></article></div><h4>Daily sales trend</h4>'+renderSalesTrendChart(sales.daily||[])+'<h4>Daily sales register · latest 14 records</h4>'+(dailyRows?'<div class="table-scroll"><table><thead><tr><th>Date</th><th>Net sales</th><th>Orders</th></tr></thead><tbody>'+dailyRows+'</tbody></table></div>':'<p class="empty-copy">No daily sales summaries in this period.</p>')+'<h4>Weekly sales comparison</h4>'+renderWeeklyBars(sales.weekly||[])+'<h4>Weekly register</h4>'+(weeklyRows?'<div class="table-scroll"><table><thead><tr><th>Week start</th><th>Net sales</th><th>Orders</th><th>Recorded days</th></tr></thead><tbody>'+weeklyRows+'</tbody></table></div>':'<p class="empty-copy">No weekly sales totals available.</p>')+'<h4>Daypart analysis</h4>'+(partRows?'<div class="table-scroll"><table><thead><tr><th>Daypart</th><th>Net sales</th><th>Orders</th></tr></thead><tbody>'+partRows+'</tbody></table></div>':'<p class="empty-copy">'+safe(dayparts.note||"No explicit daypart data supplied.")+'</p>')+'<p class="footnote">'+safe((report.limitations||[]).join(" "))+(report.limits?.mayBeIncomplete?" Retrieval limit reached; records may be incomplete.":"")+'</p>';
    } catch(error) {
      menuRoot.innerHTML='<h3>Recorded menu mix</h3><p class="empty-copy">Unavailable: '+safe(error.message)+'</p>';
      salesRoot.innerHTML='<h3>Sales trend intelligence</h3><p class="empty-copy">Unavailable: '+safe(error.message)+'</p>';
    }
  }

  function renderSales() {
    const total = data.sales.reduce((sum, item) => sum + Number(item.net || 0), 0);
    const orders = data.sales.reduce((sum, item) => sum + Number(item.orders || 0), 0);
    if ($("sales-days")) $("sales-days").textContent = String(data.sales.length);
    if ($("sales-total")) $("sales-total").textContent = money(total);
    if ($("sales-order-total")) $("sales-order-total").textContent = String(orders);
    if ($("sales-aov")) $("sales-aov").textContent = money(orders ? total / orders : 0);
    table("sales-table", ["Date", "Net sales", "Orders", "Discounts", "Refunds", "Source"], data.sales.slice().sort((a,b) => b.date.localeCompare(a.date)).map(x => [x.date, money(x.net), x.orders, money(x.discounts), money(x.refunds), "Owner-entered · not POS verified"]));
  }
  function renderRetention() {
    const sorted = data.retention.slice().sort((a,b) => b.date.localeCompare(a.date));
    const sums = data.retention.reduce((a,x) => ({ fresh:a.fresh+Number(x.fresh||0), issued:a.issued+Number(x.issued||0), redeemed:a.redeemed+Number(x.redeemed||0) }), {fresh:0,issued:0,redeemed:0});
    const latestActive = sorted.length ? Number(sorted[0].active || 0) : 0;
    $("retention-summary").innerHTML = data.retention.length
      ? '<div class="retention-grid"><div><strong>' + sums.fresh + '</strong><small>New members (sum of dated entries)</small></div><div><strong>' + latestActive + '</strong><small>Active members · latest snapshot only</small></div><div><strong>' + sums.issued + '</strong><small>Rewards issued (sum)</small></div><div><strong>' + sums.redeemed + '</strong><small>Rewards redeemed (sum)</small></div></div><p class="footnote">Active-member counts are point-in-time snapshots and are never added across dates.</p>'
      : '<p class="empty-copy">No aggregates entered.</p>';
    table("retention-table", ["Date","New","Active snapshot","Issued","Redeemed"], sorted.map(x => [x.date,x.fresh,x.active,x.issued,x.redeemed]));
  }
  function renderDrafts() {
    const root = $("approval-list"); if (!root) return;
    const pending = data.drafts.filter(d => d.status === "Pending");
    const count = document.querySelector(".nav-item[data-view='approvals'] .count");
    if (count) count.textContent = String(pending.length);
    const overview = $("overview-drafts"); if (overview) overview.textContent = String(pending.length);
    if (!data.drafts.length) { root.innerHTML = '<p class="empty-copy">No saved drafts. Create one in Campaign Studio.</p>'; return; }
    root.innerHTML = data.drafts.slice().reverse().map((d,index) => '<article class="draft-card"><div class="draft-card-head"><strong>' + safe(d.topic) + '</strong><span class="tag ' + (d.status === "Pending" ? "pending-tag" : "confirmed") + '">' + safe(d.status) + '</span></div><small>' + safe(d.created) + ' · ' + safe(d.language) + ' · Saved draft · not published</small><p>' + safe(d.text) + '</p>' + (d.status === "Pending" ? '<button class="secondary-button draft-approve" data-index="' + (data.drafts.length - 1 - index) + '">Mark reviewed locally</button>' : '') + '</article>').join("");
    root.querySelectorAll(".draft-approve").forEach(button => button.addEventListener("click", () => {
      const item = data.drafts[Number(button.dataset.index)];
      if (!item) return;
      item.status = "Reviewed locally";
      save(); renderDrafts();
    }));
  }
  function renderAll() { renderMenu(); renderSales(); renderRetention(); renderDrafts(); }

  $("menu-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const name = $("menu-name").value.trim(), price = Number($("menu-price").value), costText = $("menu-cost").value, qty = Number($("menu-qty").value || 0);
    if (!name || !Number.isFinite(price) || price < 0 || (costText && (!Number.isFinite(Number(costText)) || Number(costText) < 0)) || qty < 0) return;
    const item = { _id: "menu:" + Date.now() + ":" + data.menu.length, name, price, cost: costText === "" ? null : Number(costText), qty, source: "OWNER_ENTERED", created: new Date().toISOString() };
    data.menu.push(item); save(); renderMenu(); await syncRecord("MENU_ITEM", item, data.menu.length - 1); await loadMenuSalesIntelligence();
    event.target.reset(); $("menu-qty").value = "0";
  });
  $("sales-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const item = { date:$("sales-date").value, net:Number($("sales-net").value), orders:Number($("sales-orders").value), discounts:Number($("sales-discounts").value||0), refunds:Number($("sales-refunds").value||0) };
    if (!item.date || Object.values(item).some(v => typeof v === "number" && (!Number.isFinite(v) || v < 0))) return;
    data.sales = data.sales.filter(x => x.date !== item.date); data.sales.push(item); save(); renderSales(); await syncRecord("DAILY_SALES", item); await loadMenuSalesIntelligence();
    $("sales-net").value = ""; $("sales-orders").value = "";
  });
  $("retention-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const item = { date:$("retention-date").value, fresh:Number($("retention-new").value), active:Number($("retention-active").value), issued:Number($("retention-issued").value||0), redeemed:Number($("retention-redeemed").value||0) };
    if (!item.date || Object.values(item).some(v => typeof v === "number" && (!Number.isFinite(v) || v < 0))) return;
    data.retention = data.retention.filter(x => x.date !== item.date); data.retention.push(item); save(); renderRetention(); await syncRecord("RETENTION_SNAPSHOT", item);
  });
  $("save-draft")?.addEventListener("click", async () => {
    const output = $("draft-output");
    if (!output || output.classList.contains("hidden") || !output.textContent.trim()) return;
    const item = { _id: "draft:" + Date.now() + ":" + data.drafts.length, topic:$("content-topic").value.trim(), language:$("content-language")?.value || "Tamil", text:output.textContent, status:"Pending", created:new Date().toISOString() };
    data.drafts.push(item); save(); renderDrafts(); await syncRecord("CAMPAIGN_DRAFT", item, data.drafts.length - 1);
    $("save-draft").disabled = true; $("save-draft").textContent = "Saved to approval centre";
  });
  $("make-draft")?.addEventListener("click", () => {
    const button = $("save-draft");
    if (button) { button.disabled = false; button.textContent = "Save draft to approval centre"; }
  });
  $("generate-insights")?.addEventListener("click", loadServerIntelligence);
  $("generate-ai-consultant")?.addEventListener("click", loadLocalAiConsultant);
  renderAll();
})();