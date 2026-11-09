(() => {
  "use strict";

  const LEGACY_KEY = "localboost_growth_workspace_v1";
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
  let data = emptyData();
  let activeBusinessId = null;
  let remoteReady = false;
  let syncInProgress = false;
  const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
  const safe = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  const today = new Date().toLocaleDateString("en-CA");
  const API_BASE = (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\/$/, "");

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
    if (!remoteReady || !activeBusinessId) throw new Error("Connect to the cloud workspace before saving.");
    const recordedAt = item.created || item.date || new Date().toISOString();
    const result = await remoteApi(businessPath() + "/growth-records", {
      method: "POST",
      body: JSON.stringify({ type, externalId: recordExternalId(type, item, index), payload: item, recordedAt })
    });
    item._recordId = result?.record?.id || item._recordId;
    return result?.record || null;
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
    data = emptyData();
    renderAll();
    setSyncStatus("Connecting to the selected cloud workspace…");
    try {
      const path = businessPath();
      let cloud = await fetchAllGrowthRecords(path);
      if (cloud.truncated) {
        setSyncStatus("Cloud workspace contains more than 10,000 records; older records remain in the database.", true);
      }
      const scopedKey = "localboost_growth_workspace_v2:" + businessId;
      const scoped = localStorage.getItem(scopedKey) !== null ? readLocal(scopedKey) : emptyData();
      const legacy = localStorage.getItem(LEGACY_KEY) !== null ? readLocal(LEGACY_KEY) : emptyData();
      const localCandidates = {
        MENU_ITEM: [...scoped.menu, ...legacy.menu],
        DAILY_SALES: [...scoped.sales, ...legacy.sales],
        RETENTION_SNAPSHOT: [...scoped.retention, ...legacy.retention],
        CAMPAIGN_DRAFT: [...scoped.drafts, ...legacy.drafts]
      };
      const localCount = Object.values(localCandidates).reduce((sum, items) => sum + items.length, 0);
      let imported = 0, skipped = 0;
      if (localCount) {
        const cloudIds = new Set(cloud.records.map(record => record.recordType + ":" + record.externalId));
        const pending = [];
        for (const [type, items] of Object.entries(localCandidates)) {
          for (const [index, item] of items.entries()) {
            const externalId = recordExternalId(type, item, index);
            if (cloudIds.has(type + ":" + externalId)) { skipped++; continue; }
            if (!pending.some(row => row.type === type && row.externalId === externalId)) pending.push({ type, item, index, externalId });
          }
        }
        const legacyCount = Object.values(legacy).reduce((sum, items) => sum + items.length, 0);
        const assignmentNote = legacyCount
          ? "\n\nThis includes " + legacyCount + " older unassigned record(s). Confirm that they belong to this selected business before importing."
          : "";
        const approved = pending.length && window.confirm(
          "Legacy data migration preview\n\nSelected business: " + businessId +
          "\nRecords found on this PC: " + localCount +
          "\nNew records to import: " + pending.length +
          "\nAlready present in cloud (will not be overwritten): " + skipped +
          assignmentNote +
          "\n\nImport these records to the cloud database now? Your local copies will not be deleted."
        );
        if (approved) {
          for (const row of pending) {
            await syncRecord(row.type, row.item, row.index);
            imported++;
          }
        }
      }
      cloud = await fetchAllGrowthRecords(path);
      const grouped = { MENU_ITEM: [], DAILY_SALES: [], RETENTION_SNAPSHOT: [], CAMPAIGN_DRAFT: [] };
      for (const record of cloud.records) {
        if (grouped[record.recordType]) grouped[record.recordType].push({ ...record.payload, _id: record.externalId, _recordId: record.id });
      }
      data = {
        menu: grouped.MENU_ITEM,
        sales: grouped.DAILY_SALES,
        retention: grouped.RETENTION_SNAPSHOT,
        drafts: grouped.CAMPAIGN_DRAFT
      };
      remoteReady = true;
      renderAll();
      const remainingLocal = localCount && imported === 0 && skipped < localCount
        ? " · PC legacy records were left untouched; import was not approved"
        : "";
      setSyncStatus("Cloud database connected · " + cloud.records.length + " server record(s)" +
        (cloud.truncated ? " · first 10,000 displayed; older records remain on server" : "") +
        (imported ? " · " + imported + " legacy record(s) imported" : "") +
        (skipped ? " · " + skipped + " duplicate record(s) skipped" : "") +
        remainingLocal + " · cloud is the source of truth");
      await loadServerIntelligence();
      await loadDataStatus();
      await loadMenuSalesIntelligence();
    } catch (error) {
      remoteReady = false;
      data = emptyData();
      renderAll();
      setSyncStatus("Cloud workspace unavailable · no local fallback is being used. Existing PC data is preserved and can be imported after the connection is restored. (" + error.message + ")", true);
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
      const menuItems=menu.items||[];
      const costedItems=menuItems.filter(x=>x.unitContribution!==null&&x.unitContribution!==undefined);
      const costedContribution=costedItems.reduce((sum,x)=>sum+Number(x.unitContribution||0),0);
      const costedSales=costedItems.reduce((sum,x)=>sum+Number(x.grossSales||0),0);
      const contributionMargin=costedSales>0?costedContribution/costedSales*100:null;
      const costCoverage=menuItems.length?(costedItems.length/menuItems.length*100).toFixed(0)+'%':'0%';
      const rankedContribution=costedItems.slice().sort((a,b)=>Number(b.unitContribution)-Number(a.unitContribution));
      const itemRows=menuItems.map(x=>'<tr><td>'+safe(x.name)+'</td><td>'+Number(x.units||0).toLocaleString("en-IN")+'</td><td>'+(x.grossSales===null?'Not available':money(x.grossSales))+'</td><td>'+(x.unitContribution===null?'Not costed':money(x.unitContribution))+'</td><td>'+(x.unitContribution===null||!Number(x.grossSales)?'—':(Number(x.unitContribution)/Number(x.grossSales)*100).toFixed(1)+'%')+'</td></tr>').join("");
      const topContribution=rankedContribution.slice(0,3).map(x=>'<tr><td>'+safe(x.name)+'</td><td>'+money(x.unitContribution)+'</td><td>'+Number(x.units||0).toLocaleString("en-IN")+'</td></tr>').join("");
      menuRoot.innerHTML='<div class="section-heading"><div><h3>Menu profitability & mix</h3><p>Last 30 days · owner-entered quantities · not POS-verified</p></div><span class="tag pending-tag">'+menu.itemCount+' item(s)</span></div><div class="metric-grid"><article class="metric-card"><div class="metric-top">Costed contribution*</div><strong>'+(costedItems.length?money(costedContribution):'No data')+'</strong><small>'+costedItems.length+' of '+menuItems.length+' items costed</small></article><article class="metric-card"><div class="metric-top">Contribution margin*</div><strong>'+(contributionMargin===null?'No data':contributionMargin.toFixed(1)+'%')+'</strong><small>Costed items only</small></article><article class="metric-card"><div class="metric-top">Cost coverage</div><strong>'+costCoverage+'</strong><small>Items with price and unit cost</small></article></div>'+(topContribution?'<h4>Highest recorded contribution</h4><div class="table-scroll"><table><thead><tr><th>Menu item</th><th>Contribution*</th><th>Units</th></tr></thead><tbody>'+topContribution+'</tbody></table></div>':'<p class="empty-copy">Add selling price, unit cost and dated quantities to calculate menu contribution.</p>')+(itemRows?'<h4>Menu item register</h4><div class="table-scroll"><table><thead><tr><th>Item</th><th>Units</th><th>Indicative sales</th><th>Contribution*</th><th>Margin*</th></tr></thead><tbody>'+itemRows+'</tbody></table></div>':'<p class="empty-copy">No dated menu quantities are available for this period.</p>')+'<p class="footnote">*Contribution is (selling price − supplied unit cost) × units; margin is contribution ÷ indicative sales. Totals include only items with both price and cost. This is not full profit: labour, rent, utilities, wastage and other overheads are excluded. Indicative sales are not reconciled receipts.</p>';
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
    const redemptionRate = sums.issued > 0 ? (sums.redeemed / sums.issued * 100).toFixed(1) + "%" : "No data";
    const activePoints = sorted.slice(0,14).reverse().filter(x => Number.isFinite(Number(x.active)));
    let activeChart = '<div class="lb-chart-empty">Add dated active-member snapshots to see the retention trend.</div>';
    if (activePoints.length) {
      const w=720,h=180,l=36,r=20,t=14,b=34;
      const values=activePoints.map(x=>Math.max(0,Number(x.active)));
      const max=Math.max(1,...values);
      const px=i=>l+(activePoints.length===1?(w-l-r)/2:i*(w-l-r)/(activePoints.length-1));
      const py=v=>t+(max-v)/max*(h-t-b);
      const line=activePoints.map((x,i)=>(i?"L":"M")+px(i).toFixed(1)+" "+py(Number(x.active)).toFixed(1)).join(" ");
      const area=line+" L "+px(activePoints.length-1).toFixed(1)+" "+(h-b)+" L "+px(0).toFixed(1)+" "+(h-b)+" Z";
      const dots=activePoints.map((x,i)=>'<circle cx="'+px(i).toFixed(1)+'" cy="'+py(Number(x.active)).toFixed(1)+'" r="4"><title>'+safe(x.date)+': '+Number(x.active)+'</title></circle>').join("");
      const labels=activePoints.map((x,i)=>'<text x="'+px(i).toFixed(1)+'" y="'+(h-10)+'" text-anchor="middle">'+safe(String(x.date||"").slice(5))+'</text>').join("");
      activeChart='<div class="lb-chart-wrap"><div class="lb-chart-legend"><span><i></i> Active members · dated snapshots</span><small>Latest '+activePoints.length+' records</small></div><svg class="lb-sales-chart" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Active member snapshot trend"><line x1="'+l+'" y1="'+t+'" x2="'+(w-r)+'" y2="'+t+'"/><line x1="'+l+'" y1="'+((h-b+t)/2)+'" x2="'+(w-r)+'" y2="'+((h-b+t)/2)+'"/><line x1="'+l+'" y1="'+(h-b)+'" x2="'+(w-r)+'" y2="'+(h-b)+'"/><path class="lb-chart-area" d="'+area+'"/><path class="lb-chart-line" d="'+line+'"/>'+dots+labels+'</svg></div>';
    }
    $("retention-summary").innerHTML = data.retention.length
      ? '<div class="retention-grid"><div><strong>' + sums.fresh.toLocaleString("en-IN") + '</strong><small>New members · sum of entries</small></div><div><strong>' + latestActive.toLocaleString("en-IN") + '</strong><small>Active members · latest snapshot</small></div><div><strong>' + sums.issued.toLocaleString("en-IN") + '</strong><small>Rewards issued · sum</small></div><div><strong>' + redemptionRate + '</strong><small>Reward redemption rate · combined entries</small></div></div>'+activeChart+'<p class="footnote">New members and reward counts are summed across dated owner-entered entries. Active-member counts are point-in-time snapshots and are never added across dates. This is aggregate loyalty tracking, not identified customer-level retention or cohort analysis.</p>'
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
      saveGrowthEntry("CAMPAIGN_DRAFT", item, Number(button.dataset.index)).then(ok => { if (ok) renderDrafts(); else item.status = "Pending"; });
    }));
  }
  function renderAll() { renderMenu(); renderSales(); renderRetention(); renderDrafts(); }

  async function saveGrowthEntry(type, item, index = 0) {
    if (!remoteReady || !activeBusinessId) {
      setSyncStatus("Not saved · sign in and connect to the cloud workspace first.", true);
      return false;
    }
    try {
      await syncRecord(type, item, index);
      return true;
    } catch (error) {
      setSyncStatus("Cloud save failed · nothing was saved locally (" + error.message + ")", true);
      return false;
    }
  }

  $("menu-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const name = $("menu-name").value.trim(), price = Number($("menu-price").value), costText = $("menu-cost").value, qty = Number($("menu-qty").value || 0);
    if (!name || !Number.isFinite(price) || price < 0 || (costText && (!Number.isFinite(Number(costText)) || Number(costText) < 0)) || qty < 0) return;
    const item = { _id: "menu:" + Date.now() + ":" + data.menu.length, name, price, cost: costText === "" ? null : Number(costText), qty, source: "OWNER_ENTERED", created: new Date().toISOString() };
    if (!await saveGrowthEntry("MENU_ITEM", item, data.menu.length)) return;
    data.menu.push(item); renderMenu(); await loadMenuSalesIntelligence();
    event.target.reset(); $("menu-qty").value = "0";
  });
  $("sales-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const item = { date:$("sales-date").value, net:Number($("sales-net").value), orders:Number($("sales-orders").value), discounts:Number($("sales-discounts").value||0), refunds:Number($("sales-refunds").value||0) };
    if (!item.date || Object.values(item).some(v => typeof v === "number" && (!Number.isFinite(v) || v < 0))) return;
    if (!await saveGrowthEntry("DAILY_SALES", item)) return;
    data.sales = data.sales.filter(x => x.date !== item.date); data.sales.push(item); renderSales(); await loadMenuSalesIntelligence();
    $("sales-net").value = ""; $("sales-orders").value = "";
  });
  $("retention-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const item = { date:$("retention-date").value, fresh:Number($("retention-new").value), active:Number($("retention-active").value), issued:Number($("retention-issued").value||0), redeemed:Number($("retention-redeemed").value||0) };
    if (!item.date || Object.values(item).some(v => typeof v === "number" && (!Number.isFinite(v) || v < 0))) return;
    if (!await saveGrowthEntry("RETENTION_SNAPSHOT", item)) return;
    data.retention = data.retention.filter(x => x.date !== item.date); data.retention.push(item); renderRetention();
  });
  $("save-draft")?.addEventListener("click", async () => {
    const output = $("draft-output");
    if (!output || output.classList.contains("hidden") || !output.textContent.trim()) return;
    const item = { _id: "draft:" + Date.now() + ":" + data.drafts.length, topic:$("content-topic").value.trim(), language:$("content-language")?.value || "Tamil", text:output.textContent, status:"Pending", created:new Date().toISOString() };
    if (!await saveGrowthEntry("CAMPAIGN_DRAFT", item, data.drafts.length)) return;
    data.drafts.push(item); renderDrafts();
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