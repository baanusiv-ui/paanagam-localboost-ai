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
      const googleText = status.google?.authorised
        ? "Google Business Profile: authorised" + (status.google.hasBusinessManageScope ? " · business.manage scope present" : " · required scope not confirmed")
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
      const initial = await remoteApi(path + "/growth-records?limit=200");
      remoteReady = true;
      const existing = new Set((initial.records || []).map(record => record.recordType + ":" + record.externalId));
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
      const latest = await remoteApi(path + "/growth-records?limit=200");
      const grouped = { MENU_ITEM: [], DAILY_SALES: [], RETENTION_SNAPSHOT: [], CAMPAIGN_DRAFT: [] };
      for (const record of latest.records || []) {
        if (grouped[record.recordType]) grouped[record.recordType].push({ ...record.payload, _id: record.externalId, _recordId: record.id });
      }
      // The server is canonical for records already synced; local-only records remain available for retry.
      const remoteIds = new Set((latest.records || []).map(record => record.recordType + ":" + record.externalId));
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
      setSyncStatus("Cloud database connected · " + (latest.records || []).length + " server record(s)" + (migrated ? " · " + migrated + " local record(s) migrated" : "") + (pendingCount ? " · " + pendingCount + " device-only record(s) awaiting sync" : " · all records synced") + " · owner-entered data");
      await loadServerIntelligence();
      await loadDataStatus();
      // Retry any device-only records after the server has become available.
      for (const [type, items] of Object.entries(localOnly)) {
        for (const [index, item] of items.entries()) await syncRecord(type, item, index);
      }
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
    data.menu.push(item); save(); renderMenu(); await syncRecord("MENU_ITEM", item, data.menu.length - 1);
    event.target.reset(); $("menu-qty").value = "0";
  });
  $("sales-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const item = { date:$("sales-date").value, net:Number($("sales-net").value), orders:Number($("sales-orders").value), discounts:Number($("sales-discounts").value||0), refunds:Number($("sales-refunds").value||0) };
    if (!item.date || Object.values(item).some(v => typeof v === "number" && (!Number.isFinite(v) || v < 0))) return;
    data.sales = data.sales.filter(x => x.date !== item.date); data.sales.push(item); save(); renderSales(); await syncRecord("DAILY_SALES", item);
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
  renderAll();
})();