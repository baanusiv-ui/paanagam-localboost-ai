(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const API = () => (window.LOCALBOOST_API_BASE || "").replace(/\\/$/, "");
  const TOKEN = "localboost_access_token";
  const BUSINESS = "localboost_business_id";
  const RECORD_ID = "content-distribution:settings:v1";
  const CHANNELS = ["INSTAGRAM", "FACEBOOK", "WHATSAPP", "GOOGLE_BUSINESS", "YOUTUBE_SHORTS"];
  const DEFAULTS = {
    channels: CHANNELS,
    objectives: ["BRAND_AWARENESS", "ENGAGEMENT_FOLLOWERS", "LOCAL_CUSTOMER_ACQUISITION"],
    publishingMode: "APPROVAL_REQUIRED",
    language: "TA_FIRST_EN_SECOND",
    radiusKm: 30,
    workspace: "PAANAGAM"
  };
  let ready = false;
  let saved = null;
  const businessId = () => sessionStorage.getItem(BUSINESS);
  const auth = () => ({ authorization: "Bearer " + sessionStorage.getItem(TOKEN) });
  const base = () => "/v1/businesses/" + encodeURIComponent(businessId());
  const status = (message, error = false) => {
    const el = $("distribution-status");
    if (el) { el.textContent = message; el.classList.toggle("error", error); }
  };
  async function api(path, options = {}) {
    const response = await fetch(API() + path, {
      ...options,
      headers: { ...auth(), ...(options.body !== undefined ? { "content-type": "application/json" } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "Request failed (" + response.status + ")");
    return data;
  }
  function selectedChannels() {
    return CHANNELS.filter(channel => $("distribution-" + channel)?.checked);
  }
  function applySettings(settings) {
    const value = { ...DEFAULTS, ...(settings || {}) };
    CHANNELS.forEach(channel => {
      const input = $("distribution-" + channel);
      if (input) input.checked = value.channels.includes(channel);
    });
    const radius = $("distribution-radius");
    if (radius) radius.value = String(value.radiusKm || 30);
  }
  async function load() {
    ready = false;
    if (!businessId() || !sessionStorage.getItem(TOKEN)) {
      status("Sign in and select the Paanagam business workspace to save this strategy.", true);
      return;
    }
    status("Loading the saved Paanagam distribution strategy…");
    try {
      const result = await api(base() + "/growth-records?type=CAMPAIGN_DRAFT&limit=200");
      const record = (result.records || []).find(item => item.externalId === RECORD_ID);
      saved = record?.payload || null;
      applySettings(saved);
      ready = true;
      status(saved ? "Saved strategy loaded from this Paanagam business workspace." : "Default Paanagam strategy ready. Save to persist it to the business workspace.");
      renderReadiness();
    } catch (error) {
      status("Could not load distribution strategy: " + error.message, true);
    }
  }
  function renderReadiness() {
    const root = $("distribution-readiness");
    if (!root) return;
    const items = [
      ["Instagram", "Meta publishing", "Existing Meta approval queue; requires connected Page and linked Instagram account."],
      ["Facebook", "Meta publishing", "Existing Meta approval queue; requires connected Facebook Page."],
      ["Google Business", "Separate GBP workflow", "Use the existing GBP owner manager and its approval flow."],
      ["WhatsApp", "Not connected", "Strategy enabled; a compliant WhatsApp Business sharing/API integration is still required."],
      ["YouTube Shorts", "Not connected", "Strategy enabled; YouTube channel authorisation and video publishing integration are still required."]
    ];
    root.innerHTML = items.map(item => '<article class="metric-card"><div class="metric-top"><strong>' + item[0] + '</strong><span class="tag ' + (item[1] === "Not connected" ? "pending-tag" : "confirmed") + '">' + item[1] + '</span></div><small>' + item[2] + '</small></article>').join("");
  }
  $("distribution-save")?.addEventListener("click", async () => {
    if (!ready) { status("Wait until the selected business strategy has loaded.", true); return; }
    const channels = selectedChannels();
    if (!channels.length) { status("Select at least one distribution channel.", true); return; }
    const button = $("distribution-save");
    button.disabled = true;
    const payload = {
      ...DEFAULTS,
      channels,
      objectives: DEFAULTS.objectives,
      publishingMode: "APPROVAL_REQUIRED",
      language: "TA_FIRST_EN_SECOND",
      radiusKm: Math.max(1, Math.min(100, Number($("distribution-radius")?.value || 30))),
      updatedAt: new Date().toISOString()
    };
    try {
      await api(base() + "/growth-records", {
        method: "POST",
        body: JSON.stringify({ type: "CAMPAIGN_DRAFT", externalId: RECORD_ID, payload, recordedAt: payload.updatedAt })
      });
      saved = payload;
      status("Paanagam distribution strategy saved. Publishing remains approval-only; unconnected channels are not queued or published.");
      renderReadiness();
    } catch (error) {
      status("Save failed: " + error.message, true);
    } finally {
      button.disabled = false;
    }
  });
  window.addEventListener("localboost:business-ready", () => { void load(); });
  window.addEventListener("localboost:signed-out", () => {
    ready = false; saved = null; applySettings(DEFAULTS);
    status("Sign in and select the Paanagam business workspace to load this strategy.", true);
  });
  if (businessId()) void load();
  applySettings(DEFAULTS);
  renderReadiness();
})();