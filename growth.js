(() => {
  "use strict";
  const KEY = "localboost_growth_workspace_v1";
  const $ = id => document.getElementById(id);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { menu: [], sales: [], retention: [], drafts: [] }; } catch { return { menu: [], sales: [], retention: [], drafts: [] }; } };
  const data = read();
  const save = () => localStorage.setItem(KEY, JSON.stringify(data));
  const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
  const safe = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  const today = new Date().toLocaleDateString("en-CA");
  const API_BASE = (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\\/$/, "");
  const TOKEN_KEY = "localboost_access_token";
  const BUSINESS_KEY = "localboost_business_id";
  let remoteReady = false;
  const remoteApi = async (path, options = {}) => {
    const headers = { "content-type": "application/json", ...(options.headers || {}) };
    const auth = sessionStorage.getItem(TOKEN_KEY);
    if (auth) headers.authorization = "Bearer " + auth;
    const response = await fetch(API_BASE + path, { ...options, headers });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Cloud sync failed (" + response.status + ")");
    return payload;
  };
  const businessPath = () => "/v1/businesses/" + encodeURIComponent(sessionStorage.getItem(BUSINESS_KEY) || "");
  function recordExternalId(type, item, index) {
    if (type === "DAILY_SALES") return "sales:" + item.date;
    if (type === "RETENTION_SNAPSHOT") return "retention:" + item.date;
    if (!item._id) item._id = type.toLowerCase() + ":" + Date.now() + ":" + index;
    return item._id;
  }
  async function syncRecord(type, item, index = 0) {
    if (!remoteReady) return;
    const recordedAt = item.created || item.date || new Date().toISOString();
    try {
      await remoteApi(businessPath() + "/growth-records", { method: "POST", body: JSON.stringify({
        type, externalId: recordExternalId(type, item, index), payload: item, recordedAt
      }) });
    } catch (error) {
      const note = document.querySelector("#cloud-sync-status");
      if (note) note.textContent = "Cloud sync pending: " + error.message;
    }
  }
  async function hydrateCloudWorkspace() {
    const businessId = sessionStorage.getItem(BUSINESS_KEY);
    if (!businessId || !sessionStorage.getItem(TOKEN_KEY)) return;
    remoteReady = false;
    try {
      const path = businessPath();
      const current = await remoteApi(path + "/growth-records?limit=200");
      const records = current.records || [];
      if (!records.length) {
        for (const [index, item] of data.menu.entries()) await syncRecord("MENU_ITEM", item, index);
        for (const item of data.sales) await syncRecord("DAILY_SALES", item);
        for (const item of data.retention) await syncRecord("RETENTION_SNAPSHOT", item);
        for (const [index, item] of data.drafts.entries()) await syncRecord("CAMPAIGN_DRAFT", item, index);
      }
      const latest = await remoteApi(path + "/growth-records?limit=200");
      const grouped = { MENU_ITEM: [], DAILY_SALES: [], RETENTION_SNAPSHOT: [], CAMPAIGN_DRAFT: [] };
      for (const record of latest.records || []) {
        if (grouped[record.recordType]) grouped[record.recordType].push({ ...record.payload, _id: record.externalId, _recordId: record.id });
      }
      if ((latest.records || []).length) {
        data.menu = grouped.MENU_ITEM;
        data.sales = grouped.DAILY_SALES;
        data.retention = grouped.RETENTION_SNAPSHOT;
        data.drafts = grouped.CAMPAIGN_DRAFT;
        save();
      }
      remoteReady = true;
      renderAll();
      const status = document.querySelector("#cloud-sync-status");
      if (status) status.textContent = "Cloud database connected · owner-entered data";
      await loadServerIntelligence();
    } catch (error) {
      remoteReady = false;
      const status = document.querySelector("#cloud-sync-status");
      if (status) status.textContent = "Cloud sync unavailable · local data only (" + error.message + ")";
    }
  }
  async function loadServerIntelligence() {
    const root = $("insight-list");
    if (!root) return;
    try {
      const report = await remoteApi(businessPath() + "/intelligence");
      root.innerHTML = '<div class="insight-list-items">' + report.insights.map(item =>
        '<article class="draft-card"><div class="draft-card-head"><strong>' + safe(item.title) + '</strong><span class="tag ' + (item.priority === "HIGH" ? "pending-tag" : "confirmed") + '">' + safe(item.priority) + '</span></div><p>' + safe(item.finding) + '</p><small>Source: ' + safe(item.evidence.source) + ' · Confidence: ' + safe(item.confidence) + '</small><p>' + safe(item.recommendation) + '</p><small>Evidence: ' + safe(item.evidence.calculation) + '</small><p class="footnote">Suggested only · owner approval required · no automatic action.</p></article>'
      ).join("") + '</div><p class="footnote">Engine: ' + safe(report.engine) + ' · ' + report.recordCount + ' owner-entered record(s) · ' + safe(report.dataStatus) + '</p>';
    } catch (error) {
      root.textContent = "Could not load server intelligence: " + error.message;
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
    table("menu-table", ["Item", "Price", "Unit cost", "Units", "Contribution / unit"], data.menu.map(item => [
      item.name, money(item.price), item.cost == null ? "Not supplied" : money(item.cost), item.qty,
      item.cost == null ? "Not calculated" : money(item.price - item.cost)
    ]));
  }
  function renderSales() {
    const total = data.sales.reduce((sum, item) => sum + item.net, 0);
    const orders = data.sales.reduce((sum, item) => sum + item.orders, 0);
    $("sales-days").textContent = String(data.sales.length);
    $("sales-total").textContent = money(total);
    $("sales-order-total").textContent = String(orders);
    $("sales-aov").textContent = money(orders ? total / orders : 0);
    table("sales-table", ["Date", "Net sales", "Orders", "Discounts", "Refunds", "Source"], data.sales.slice().sort((a,b) => b.date.localeCompare(a.date)).map(x => [x.date, money(x.net), x.orders, money(x.discounts), money(x.refunds), "Owner-confirmed"]));
  }
  function renderRetention() {
    const sums = data.retention.reduce((a,x) => ({ fresh:a.fresh+x.fresh, active:a.active+x.active, issued:a.issued+x.issued, redeemed:a.redeemed+x.redeemed }), {fresh:0,active:0,issued:0,redeemed:0});
    $("retention-summary").innerHTML = data.retention.length
      ? '<div class="retention-grid"><div><strong>' + sums.fresh + '</strong><small>New members (sum)</small></div><div><strong>' + sums.active + '</strong><small>Active member counts (sum of snapshots)</small></div><div><strong>' + sums.issued + '</strong><small>Rewards issued</small></div><div><strong>' + sums.redeemed + '</strong><small>Rewards redeemed</small></div></div><p class="footnote">Active-member snapshots are not unique people across dates and should not be summed as a unique-member total.</p>'
      : '<p class="empty-copy">No aggregates entered.</p>';
    table("retention-table", ["Date","New","Active snapshot","Issued","Redeemed"], data.retention.map(x => [x.date,x.fresh,x.active,x.issued,x.redeemed]));
  }
  function renderDrafts() {
    const root = $("approval-list"); if (!root) return;
    const pending = data.drafts.filter(d => d.status === "Pending");
    const count = document.querySelector(".nav-item[data-view='approvals'] .count");
    if (count) count.textContent = String(pending.length);
    const overview = $("overview-drafts"); if (overview) overview.textContent = String(pending.length);
    if (!data.drafts.length) { root.innerHTML = '<p class="empty-copy">No saved drafts. Create one in Campaign Studio.</p>'; return; }
    root.innerHTML = data.drafts.slice().reverse().map((d,index) => '<article class="draft-card"><div class="draft-card-head"><strong>' + safe(d.topic) + '</strong><span class="tag ' + (d.status === "Pending" ? "pending-tag" : "confirmed") + '">' + safe(d.status) + '</span></div><small>' + safe(d.created) + ' · ' + safe(d.language) + ' · Local draft</small><p>' + safe(d.text) + '</p>' + (d.status === "Pending" ? '<button class="secondary-button draft-approve" data-index="' + (data.drafts.length - 1 - index) + '">Mark reviewed</button>' : '') + '</article>').join("");
    root.querySelectorAll(".draft-approve").forEach(button => button.addEventListener("click", () => {
      const item = data.drafts[Number(button.dataset.index)];
      if (!item) return;
      item.status = "Reviewed locally"; save(); renderDrafts();
    }));
  }
  function renderAll() { renderMenu(); renderSales(); renderRetention(); renderDrafts(); }

  $("menu-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const name = $("menu-name").value.trim(), price = Number($("menu-price").value), costText = $("menu-cost").value, qty = Number($("menu-qty").value || 0);
    if (!name || !Number.isFinite(price) || price < 0 || (costText && (!Number.isFinite(Number(costText)) || Number(costText) < 0)) || qty < 0) return;
    data.menu.push({ _id: "menu:" + Date.now() + ":" + data.menu.length, name, price, cost: costText === "" ? null : Number(costText), qty, source: "OWNER_CONFIRMED", created: new Date().toISOString() });
    save(); renderMenu(); syncRecord("MENU_ITEM", data.menu[data.menu.length - 1], data.menu.length - 1); event.target.reset(); $("menu-qty").value = "0";
  });
  $("sales-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const item = { date:$("sales-date").value, net:Number($("sales-net").value), orders:Number($("sales-orders").value), discounts:Number($("sales-discounts").value||0), refunds:Number($("sales-refunds").value||0) };
    if (!item.date || Object.values(item).some(v => typeof v === "number" && (!Number.isFinite(v) || v < 0))) return;
    data.sales = data.sales.filter(x => x.date !== item.date); data.sales.push(item); save(); renderSales(); syncRecord("DAILY_SALES", item);
    $("sales-net").value = ""; $("sales-orders").value = "";
  });
  $("retention-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const item = { date:$("retention-date").value, fresh:Number($("retention-new").value), active:Number($("retention-active").value), issued:Number($("retention-issued").value||0), redeemed:Number($("retention-redeemed").value||0) };
    if (!item.date || Object.values(item).some(v => typeof v === "number" && (!Number.isFinite(v) || v < 0))) return;
    data.retention = data.retention.filter(x => x.date !== item.date); data.retention.push(item); save(); renderRetention(); syncRecord("RETENTION_SNAPSHOT", item);
  });
  $("save-draft")?.addEventListener("click", () => {
    const output = $("draft-output");
    if (!output || output.classList.contains("hidden") || !output.textContent.trim()) return;
    data.drafts.push({ _id: "draft:" + Date.now() + ":" + data.drafts.length, topic:$("content-topic").value.trim(), language:$("content-language")?.value || "Tamil", text:output.textContent, status:"Pending", created:new Date().toISOString() });
    save(); renderDrafts(); syncRecord("CAMPAIGN_DRAFT", data.drafts[data.drafts.length - 1], data.drafts.length - 1); $("save-draft").disabled = true; $("save-draft").textContent = "Saved to approval centre";
  });
  $("make-draft")?.addEventListener("click", () => {
    const button = $("save-draft");
    if (button) { button.disabled = false; button.textContent = "Save draft to approval centre"; }
  });
  $("generate-insights")?.addEventListener("click", () => {
    const root = $("insight-list"); const items = [];
    if (!data.sales.length) items.push("No daily sales summaries are recorded. Add verified daily totals before drawing sales conclusions.");
    else {
      const total = data.sales.reduce((s,x)=>s+x.net,0), orders = data.sales.reduce((s,x)=>s+x.orders,0);
      items.push("Across " + data.sales.length + " recorded business dates, owner-entered net sales total " + money(total) + " from " + orders + " orders. Average order value is " + money(orders ? total/orders : 0) + ".");
      if (data.sales.length >= 2) {
        const sorted=data.sales.slice().sort((a,b)=>a.date.localeCompare(b.date));
        const first=sorted[0], last=sorted[sorted.length-1];
        items.push("First recorded date: " + first.date + " (" + money(first.net) + "); latest recorded date: " + last.date + " (" + money(last.net) + "). This is a date comparison, not proof of a trend.");
      }
    }
    if (!data.menu.length) items.push("No menu item data is entered. Add quantities and selling prices to identify item mix.");
    else {
      const ranked=data.menu.slice().sort((a,b)=>b.qty-a.qty);
      items.push("Highest recorded unit volume: " + ranked[0].name + " (" + ranked[0].qty + " units). This reflects only the entries in this browser.");
      const withCost=data.menu.filter(x=>x.cost!==null);
      if (withCost.length) {
        const best=withCost.slice().sort((a,b)=>(b.price-b.cost)-(a.price-a.cost))[0];
        items.push("Highest supplied contribution per unit: " + best.name + " at " + money(best.price-best.cost) + ". Validate recipe costing, waste, tax basis and effective date before using this for pricing.");
      } else items.push("No unit costs supplied. Contribution and menu profitability are not calculated.");
    }
    if (data.retention.length) items.push("Retention data has " + data.retention.length + " dated aggregate snapshots. Active-member snapshots must not be added together as unique members.");
    root.innerHTML = '<ul class="insight-list-items">' + items.map(x=>'<li>'+safe(x)+'</li>').join("") + '</ul><p class="footnote">Rules-based summary of browser-local owner entries only. Not AI-generated, not POS-verified and not a forecast.</p>';
  });
  renderAll();
  if (sessionStorage.getItem(TOKEN_KEY) && sessionStorage.getItem(BUSINESS_KEY)) hydrateCloudWorkspace();
})();