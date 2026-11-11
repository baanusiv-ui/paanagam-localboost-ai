(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const API = () => (window.LOCALBOOST_API_BASE || "").replace(/\/$/, "");
  const TOKEN = "localboost_access_token", BUSINESS = "localboost_business_id";
  let accounts = [], locations = [], posts = [];
  const auth = () => sessionStorage.getItem(TOKEN);
  const business = () => sessionStorage.getItem(BUSINESS);
  async function api(path, options = {}) {
    const response = await fetch(API() + path, { ...options, headers: {
      "content-type": "application/json", authorization: "Bearer " + auth(), ...(options.headers || {})
    }});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "கோரிக்கையை நிறைவேற்ற முடியவில்லை");
    return data;
  }
  const base = () => "/v1/businesses/" + encodeURIComponent(business() || "");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function status(msg, error = false) {
    const el = $("gbp-publish-status"); if (el) { el.textContent = msg; el.classList.toggle("error", error); }
  }
  function fillSelect(el, rows, label, value) {
    el.innerHTML = '<option value="">தேர்வு செய்யவும்</option>' + rows.map(x => '<option value="' + esc(x[value]) + '">' + esc(x[label]) + '</option>').join("");
  }
  async function loadAccounts() {
    if (!auth() || !business()) throw new Error("முதலில் LocalBoost-ல் உள்நுழைந்து பானகத்தைத் தேர்ந்தெடுக்கவும்.");
    const result = await api(base() + "/google/accounts");
    accounts = result.accounts || [];
    fillSelect($("gbp-google-account"), accounts, "accountName", "name");
    status(accounts.length ? "Google கணக்குகள் கிடைத்தன. பானகத்தின் கணக்கைத் தேர்ந்தெடுக்கவும்." : "இந்த Google கணக்கில் Business Profile கணக்கு இல்லை.", !accounts.length);
  }
  async function loadLocations() {
    const accountName = $("gbp-google-account").value;
    if (!accountName) return status("முதலில் Google கணக்கைத் தேர்ந்தெடுக்கவும்.", true);
    const result = await api(base() + "/google/locations?accountName=" + encodeURIComponent(accountName));
    locations = result.locations || [];
    fillSelect($("gbp-google-location"), locations.map(x => ({...x, title: x.title || x.name})), "title", "name");
    status(locations.length ? "பானகம் சுயவிவரத்தைத் தேர்ந்தெடுக்கவும்." : "இந்தக் கணக்கில் இடங்கள் கிடைக்கவில்லை.", !locations.length);
  }
  async function importLocation() {
    const accountName = $("gbp-google-account").value, locationName = $("gbp-google-location").value;
    if (!accountName || !locationName) return status("Google கணக்கும் பானகம் இடமும் இரண்டையும் தேர்ந்தெடுக்கவும்.", true);
    const result = await api(base() + "/google/import", {method:"POST", body:JSON.stringify({accountName, locationName})});
    status("இணைக்கப்பட்டது: " + (result.location?.title || locationName) + ". இப்போது Google பதிவை உருவாக்கலாம்.");
  }
  async function refreshPosts() {
    const result = await api(base() + "/google-posts");
    posts = result.posts || [];
    const root = $("gbp-google-post-list");
    root.innerHTML = posts.map(row => {
      const p = row.payload || {}, id = encodeURIComponent(row.id);
      const canApprove = ["DRAFT","REJECTED","FAILED"].includes(p.status);
      const canPublish = p.status === "APPROVED";
      return '<article class="gbp-draft"><strong>' + esc(p.status || "DRAFT") + '</strong><p>' + esc(p.summary) + '</p>' +
        (p.googlePostName ? '<small>' + esc(p.googlePostName) + '</small>' : '') +
        (p.publishError ? '<small class="error">' + esc(p.publishError) + '</small>' : '') +
        (canApprove ? '<button type="button" data-gbp-approve="' + id + '">எனது ஒப்புதல்</button>' : '') +
        (canPublish ? '<button type="button" data-gbp-publish="' + id + '">Google-ல் வெளியிடு</button>' : '') +
        '<button type="button" data-gbp-reject="' + id + '">நிராகரி</button></article>';
    }).join("") || '<p class="empty-copy">இன்னும் பதிவுகள் இல்லை.</p>';
  }
  $("gbp-google-load-accounts")?.addEventListener("click", () => loadAccounts().catch(e => status(e.message, true)));
  $("gbp-google-load-locations")?.addEventListener("click", () => loadLocations().catch(e => status(e.message, true)));
  $("gbp-google-import-location")?.addEventListener("click", () => importLocation().catch(e => status(e.message, true)));
  $("gbp-google-post-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const summary = $("gbp-google-summary").value.trim();
    if (!summary) return;
    try {
      await api(base() + "/google-posts/draft", {method:"POST", body:JSON.stringify({summary, languageCode:"ta"})});
      e.target.reset(); await refreshPosts();
      status("வரைவு சேமிக்கப்பட்டது. வெளியிடுவதற்கு முன் ஒப்புதல் அளிக்க வேண்டும்.");
    } catch(err) { status(err.message, true); }
  });
  $("gbp-google-post-list")?.addEventListener("click", async e => {
    const approve = e.target.dataset.gbpApprove, publish = e.target.dataset.gbpPublish, reject = e.target.dataset.gbpReject;
    const id = approve || publish || reject; if (!id) return;
    try {
      if (approve) await api(base() + "/google-posts/" + id + "/approve", {method:"POST", body:"{}"});
      if (reject) await api(base() + "/google-posts/" + id + "/reject", {method:"POST", body:"{}"});
      if (publish) {
        if (!confirm("இந்தப் பதிவை இப்போது Google Business Profile-ல் வெளியிடலாமா?")) return;
        await api(base() + "/google-posts/" + id + "/publish", {method:"POST", body:"{}"});
      }
      await refreshPosts();
      status(publish ? "Google வெளியீட்டு கோரிக்கை முடிந்தது." : approve ? "ஒப்புதல் சேமிக்கப்பட்டது. வெளியிட தனியாக பொத்தானை அழுத்தவும்." : "பதிவு நிராகரிக்கப்பட்டது.");
    } catch(err) { status(err.message, true); }
  });
  async function init() {
    if (!business() || !auth()) return;
    try { await refreshPosts(); } catch(e) { status(e.message, true); }
  }
  window.addEventListener("localboost:business-ready", init);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
