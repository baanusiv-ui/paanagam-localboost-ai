(() => {
  "use strict";

  const API_BASE = (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\/$/, "");
  const TOKEN_KEY = "localboost_access_token";
  const BUSINESS_KEY = "localboost_business_id";
  const views = ["overview", "audit", "gbp", "seo", "menu", "sales", "retention", "competitors", "reviews", "content", "approvals", "goals", "consultant"];
  const titles = {
    overview: "Overview", audit: "Local presence audit", gbp: "GBP owner manager", seo: "Local SEO keywords", menu: "Menu intelligence", sales: "Sales analytics", retention: "Customer retention", competitors: "Competitors",
    reviews: "Reviews", content: "Campaign studio", approvals: "Approval centre", goals: "Growth goals", consultant: "Growth consultant"
  };
  let activeBusiness = null;
  let googleConnected = false;

  const $ = (selector) => document.querySelector(selector);
  const token = () => sessionStorage.getItem(TOKEN_KEY);

  async function api(path, options = {}) {
    const headers = { "content-type": "application/json", ...(options.headers || {}) };
    if (token()) headers.authorization = "Bearer " + token();
    const response = await fetch(API_BASE + path, { ...options, headers });
    const type = response.headers.get("content-type") || "";
    const payload = type.includes("application/json") ? await response.json() : null;
    if (!response.ok) {
      if (response.status === 401) signOut(false);
      throw new Error(payload?.error || "Request failed (" + response.status + ")");
    }
    return payload;
  }

  function message(id, text, isError = false) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("error", isError);
  }

  function showView(name) {
    if (!views.includes(name)) return;
    views.forEach(view => {
      const panel = document.getElementById(view + "-view");
      if (panel) panel.classList.toggle("hidden", view !== name);
    });
    document.querySelectorAll(".nav-item").forEach(button => {
      button.classList.toggle("active", button.dataset.view === name);
    });
    $("#crumb-title").textContent = titles[name];
    $("#page-title").textContent = name === "overview" ? "Good morning, Paanagam" : titles[name];
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setConnectionState(connected, label) {
    googleConnected = connected;
    const sidebar = $("#sidebar-google-status");
    if (sidebar) {
      const small = sidebar.querySelector("small");
      if (small) small.textContent = label;
      sidebar.classList.toggle("connected", connected);
    }
    $("#connect-google").disabled = !activeBusiness || !token();
    $("#connect-google").textContent = connected ? "Google connected" : "Connect Google";
  }

  function signOut(showMessage = true) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(BUSINESS_KEY);
    activeBusiness = null;
    window.dispatchEvent(new Event("localboost:signed-out"));
    $("#business-form").hidden = true;
    $("#logout-button").hidden = true;
    $("#login-button").hidden = false;
    $("#register-button").hidden = false;
    $("#session-status").textContent = "Not signed in";
    $("#data-mode").textContent = "DEMO DATA";
    $("#api-status").textContent = "API session closed";
    $("#auth-form").querySelectorAll("input").forEach(input => input.disabled = false);
    $("#business-form").hidden = true;
    setConnectionState(false, "Not connected");
    if (showMessage) message("auth-message", "You have signed out.");
  }

  function signedIn(user) {
    $("#logout-button").hidden = false;
    $("#login-button").hidden = true;
    $("#register-button").hidden = true;
    $("#session-status").textContent = "Signed in as " + user.email;
    $("#api-status").textContent = "API connected";
    $("#data-mode").textContent = "OWNER SESSION";
    document.querySelectorAll(".metric-card").forEach((card, index) => {
      const value = card.querySelector("strong");
      const note = card.querySelector("small");
      if (index === 0) { if (value) value.textContent = "—"; if (note) note.textContent = "Run your first evidence audit"; const bar = card.querySelector(".progress i"); if (bar) bar.style.width = "0%"; }
      if (index === 2) { if (value) value.textContent = "0"; if (note) note.textContent = "No saved content drafts yet"; }
      if (index === 3) { if (value) value.textContent = "0"; if (note) note.textContent = "No Google API evidence yet"; }
    });
  }

  async function refreshBusinesses() {
    const businesses = await api("/v1/businesses");
    if (!businesses.length) {
      activeBusiness = null;
      $("#business-form").hidden = false;
      $("#connect-google").disabled = true;
      $("#session-status").textContent = "Signed in · add your business";
      return;
    }
    const preferredId = sessionStorage.getItem(BUSINESS_KEY);
    activeBusiness = businesses.find(item => item.id === preferredId) || businesses[0];
    sessionStorage.setItem(BUSINESS_KEY, activeBusiness.id);
    $("#business-form").hidden = true;
    $("#business-switcher-name").textContent = activeBusiness.displayName;
    $("#page-title").textContent = activeBusiness.displayName + " · Growth overview";
    $("#connect-google").disabled = false;
    await refreshGoogleStatus();
    await loadAuditHistory();
    window.dispatchEvent(new CustomEvent("localboost:business-ready", { detail: { businessId: activeBusiness.id } }));
  }

  async function loadGoogleAccounts() {
    const picker = $("#google-picker");
    if (!picker || !activeBusiness || !googleConnected) return;
    picker.classList.remove("hidden");
    const select = $("#google-account-select");
    select.innerHTML = "";
    const loading = document.createElement("option");
    loading.value = "";
    loading.textContent = "Loading Google accounts…";
    select.append(loading);
    try {
      const result = await api("/v1/businesses/" + encodeURIComponent(activeBusiness.id) + "/google/accounts");
      select.innerHTML = "";
      if (!result.accounts.length) {
        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "No accessible Google accounts found";
        select.append(empty);
        return;
      }
      result.accounts.forEach(account => {
        const option = document.createElement("option");
        option.value = account.name || "";
        option.textContent = (account.accountName || account.name || "Google account") + " · " + (account.role || account.type || "Access");
        select.append(option);
      });
      message("google-import-message", "Choose the account that manages Paanagam.");
    } catch (error) {
      select.innerHTML = "";
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Could not load Google accounts";
      select.append(option);
      message("google-import-message", error.message, true);
    }
  }

  async function loadGoogleLocations() {
    const accountName = $("#google-account-select").value;
    if (!accountName || !activeBusiness) return message("google-import-message", "Select a Google account first.", true);
    const button = $("#load-google-locations");
    button.disabled = true;
    button.textContent = "Loading listings…";
    try {
      const result = await api("/v1/businesses/" + encodeURIComponent(activeBusiness.id) + "/google/locations?accountName=" + encodeURIComponent(accountName));
      const select = $("#google-location-select");
      select.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = result.locations.length ? "Select the Paanagam listing" : "No listings found in this account";
      select.append(placeholder);
      result.locations.forEach(location => {
        const option = document.createElement("option");
        option.value = location.name || "";
        const address = location.storefrontAddress?.locality || location.storefrontAddress?.administrativeArea || "";
        option.textContent = (location.title || location.name || "Unnamed listing") + (address ? " · " + address : "");
        select.append(option);
      });
      $("#import-google-location").disabled = true;
      message("google-import-message", result.locations.length + " accessible listing(s) found. Confirm the correct Paanagam listing.");
    } catch (error) {
      message("google-import-message", error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Find business listings";
    }
  }

  async function importGoogleLocation() {
    const accountName = $("#google-account-select").value;
    const locationName = $("#google-location-select").value;
    if (!accountName || !locationName || !activeBusiness) return;
    const button = $("#import-google-location");
    button.disabled = true;
    button.textContent = "Importing evidence…";
    try {
      const result = await api("/v1/businesses/" + encodeURIComponent(activeBusiness.id) + "/google/import", {
        method: "POST",
        body: JSON.stringify({ accountName, locationName })
      });
      message("google-import-message", result.imported + " evidence fields imported from the selected Google listing. No profile changes were made.");
      await runAudit();
    } catch (error) {
      message("google-import-message", error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Import selected listing evidence";
    }
  }

  async function refreshGoogleStatus() {
    if (!activeBusiness) return;
    const result = await api("/v1/businesses/" + encodeURIComponent(activeBusiness.id) + "/google");
    setConnectionState(result.connected, result.connected ? "Authorised connection" : "Not connected");
    $("#google-picker").classList.toggle("hidden", !result.connected);
    if (result.connected) await loadGoogleAccounts();
  }

  function renderAudit(audit) {
    const score = Number(audit.completeness || 0);
    const scoreCard = document.querySelector(".metric-card");
    if (scoreCard) {
      const value = scoreCard.querySelector("strong");
      if (value) value.textContent = score + "%";
      const progress = scoreCard.querySelector(".progress i");
      if (progress) progress.style.width = score + "%";
      const note = scoreCard.querySelector("small");
      if (note) note.textContent = "Evidence coverage · " + audit.status.toLowerCase();
    }
    const metricCards = document.querySelectorAll(".metric-card");
    if (metricCards[1]) {
      const value = metricCards[1].querySelector("strong");
      if (value) {
        value.textContent = googleConnected ? "Connected" : "Not connected";
        value.classList.add("metric-text");
      }
    }
    if (metricCards[3]) {
      const value = metricCards[3].querySelector("strong");
      if (value) value.textContent = String(audit.findings.filter(item => item.status === "verified").length);
      const note = metricCards[3].querySelector("small");
      if (note) note.textContent = "Google API-verified checklist items";
    }
    const resultPanel = $("#live-audit-results");
    if (resultPanel) {
      resultPanel.classList.remove("hidden");
      resultPanel.innerHTML = "";
      const heading = document.createElement("div");
      heading.className = "section-heading";
      const title = document.createElement("h3");
      title.textContent = "Latest evidence audit";
      const meta = document.createElement("span");
      meta.className = "tag " + (audit.status === "COMPLETED" ? "confirmed" : "pending-tag");
      meta.textContent = audit.status + " · " + score + "% coverage";
      heading.append(title, meta);
      resultPanel.append(heading);
      audit.findings.forEach(item => {
        const row = document.createElement("div");
        row.className = "check-row";
        const marker = document.createElement("span");
        marker.className = "check-icon " + (["verified", "owner_confirmed"].includes(item.status) ? "done" : "pending");
        marker.textContent = ["verified", "owner_confirmed"].includes(item.status) ? "✓" : "○";
        const detail = document.createElement("div");
        const label = document.createElement("strong");
        label.textContent = item.label;
        const note = document.createElement("small");
        note.textContent = item.recommendation;
        detail.append(label, note);
        const tag = document.createElement("span");
        tag.className = "tag " + (["verified", "owner_confirmed"].includes(item.status) ? "confirmed" : "pending-tag");
        tag.textContent = item.status.replaceAll("_", " ");
        row.append(marker, detail, tag);
        resultPanel.append(row);
      });
    }
  }

  async function loadAuditHistory() {
    if (!activeBusiness) return;
    const history = await api("/v1/businesses/" + encodeURIComponent(activeBusiness.id) + "/audits");
    if (history.length) {
      const latest = history[0];
      renderAudit({ completeness: latest.completeness, status: latest.status, findings: latest.findings });
      const notice = $(".notice");
      if (notice) notice.classList.add("hidden");
    }
  }

  async function runAudit() {
    if (!token() || !activeBusiness) {
      $("#connection-setup").scrollIntoView({ behavior: "smooth" });
      message("auth-message", "Sign in and create or select your business before running a live audit.", true);
      return;
    }
    const button = $("#run-audit");
    button.disabled = true;
    button.textContent = "Auditing…";
    try {
      const result = await api("/v1/businesses/" + encodeURIComponent(activeBusiness.id) + "/audits", { method: "POST", body: "{}" });
      renderAudit(result.audit);
      const notice = $(".notice");
      if (notice) notice.classList.add("hidden");
      showView("audit");
    } catch (error) {
      message("auth-message", error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "＋ Start a business audit";
    }
  }


  async function generateLocalSeo(event) {
    event.preventDefault();
    if (!activeBusiness || !token()) return message("seo-message", "Sign in and select a business first.", true);
    const locality = $("#seo-locality").value.trim();
    const services = $("#seo-services").value.split(",").map(value => value.trim()).filter(Boolean);
    if (!locality || !services.length) return message("seo-message", "Enter a target locality and at least one product or service.", true);
    const button = $("#seo-generate");
    button.disabled = true;
    button.textContent = "Generating…";
    message("seo-message", "Creating local keyword ideas…");
    try {
      const result = await api("/v1/businesses/" + encodeURIComponent(activeBusiness.id) + "/local-seo/keywords", {
        method: "POST",
        body: JSON.stringify({ locality, services, language: $("#seo-language").value })
      });
      const root = $("#seo-keyword-list");
      root.replaceChildren();
      result.suggestions.forEach(item => {
        const card = document.createElement("article");
        card.className = "gi-card";
        const head = document.createElement("div");
        head.className = "gi-card-head";
        const keyword = document.createElement("strong");
        keyword.textContent = item.keyword;
        const tag = document.createElement("span");
        tag.className = "tag " + (item.relevance === "HIGH" ? "confirmed" : "pending-tag");
        tag.textContent = item.relevance + " relevance";
        head.append(keyword, tag);
        const detail = document.createElement("p");
        detail.textContent = item.language + " · " + item.intent.replaceAll("_", " ").toLowerCase();
        const placement = document.createElement("small");
        placement.textContent = "Suggested placement: " + item.suggestedPlacement.join(" · ");
        card.append(head, detail, placement);
        root.append(card);
      });
      $("#seo-methodology").textContent = result.methodology;
      $("#seo-count").textContent = result.suggestions.length + " ideas";
      $("#seo-results").classList.remove("hidden");
      message("seo-message", "Generated and saved " + result.suggestions.length + " keyword ideas to this business workspace.");
    } catch (error) {
      message("seo-message", error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Generate keyword ideas";
    }
  }

  async function authenticate(mode) {
    const email = $("#owner-email").value.trim();
    const password = $("#owner-password").value;
    const name = $("#owner-name").value.trim();
    if (!email || !password) return message("auth-message", "Enter your email and password.", true);
    if (mode === "register" && (!name || password.length < 12)) return message("auth-message", "Enter your name and a password with at least 12 characters.", true);
    const path = mode === "register" ? "/v1/auth/register" : "/v1/auth/login";
    try {
      const result = await api(path, { method: "POST", body: JSON.stringify({ email, password, ...(mode === "register" ? { name } : {}) }) });
      sessionStorage.setItem(TOKEN_KEY, result.accessToken);
      signedIn(result.user);
      message("auth-message", mode === "register" ? "Account created." : "Signed in successfully.");
      await refreshBusinesses();
    } catch (error) {
      message("auth-message", error.message, true);
    }
  }

  async function createBusiness(event) {
    event.preventDefault();
    const website = $("#business-website").value.trim();
    const body = {
      displayName: $("#business-name").value.trim(),
      category: $("#business-category").value.trim() || undefined,
      address: $("#business-address").value.trim() || undefined,
      phone: $("#business-phone").value.trim() || undefined,
      website: website || undefined,
      countryCode: "IN"
    };
    try {
      const result = await api("/v1/businesses", { method: "POST", body: JSON.stringify(body) });
      activeBusiness = result.business;
      sessionStorage.setItem(BUSINESS_KEY, activeBusiness.id);
      message("business-message", "Business workspace saved.");
      $("#business-form").hidden = true;
      await refreshBusinesses();
      showView("overview");
    } catch (error) {
      message("business-message", error.message, true);
    }
  }

  async function connectGoogle() {
    if (!activeBusiness || !token()) return;
    const button = $("#connect-google");
    button.disabled = true;
    button.textContent = "Preparing…";
    try {
      const result = await api("/v1/google/connect/" + encodeURIComponent(activeBusiness.id) + "/url", { method: "POST", body: "{}" });
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      message("auth-message", error.message, true);
      button.disabled = false;
      button.textContent = "Connect Google";
    }
  }

  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
  document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => showView(button.dataset.go)));
  $("#run-audit").addEventListener("click", runAudit);
  $("#local-seo-form").addEventListener("submit", generateLocalSeo);
  $("#connect-google").addEventListener("click", connectGoogle);
  $("#load-google-locations").addEventListener("click", loadGoogleLocations);
  $("#google-location-select").addEventListener("change", () => { $("#import-google-location").disabled = !$("#google-location-select").value; });
  $("#import-google-location").addEventListener("click", importGoogleLocation);
  $("#dismiss-notice").addEventListener("click", () => $(".notice").classList.add("hidden"));
  $("#auth-form").addEventListener("submit", event => { event.preventDefault(); authenticate("login"); });
  $("#register-button").addEventListener("click", () => authenticate("register"));
  $("#logout-button").addEventListener("click", () => signOut());
  $("#business-form").addEventListener("submit", createBusiness);

  $("#make-draft").addEventListener("click", () => {
    const topic = $("#content-topic").value.trim();
    const tone = $("#content-tone").value;
    const language = $("#content-language")?.value || "ta";
    const output = $("#draft-output");
    if (!topic) { $("#content-topic").focus(); return; }
    const tamil = "ஒரு நல்ல நாளை ஒரு நல்ல காபியுடன் தொடங்குங்கள்! ☕\n\nபானகத்தில் " + topic + " — உங்கள் நாளில் ஒரு சின்ன மகிழ்ச்சி. நண்பர்களுடன் பகிர்ந்து கொள்ளுங்கள்!";
    const english = "Make your day a little brighter with Paanagam. ☕\n\nDiscover " + topic + " at Paanagam — a little moment worth sharing with friends.";
    const copy = language === "en" ? english : language === "both" ? tamil + "\n\n" + english : tamil;
    output.textContent = "DRAFT — OWNER REVIEW REQUIRED\n\n" + copy + "\n\nTone: " + tone + "\nLanguage: " + language + "\n\nThis is a locally generated template, not AI research. Verify all product, price and offer claims before approval. Nothing is published.";
    output.classList.remove("hidden");
  });

  async function initialise() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("meta") === "connected") {
      window.history.replaceState({}, "", window.location.pathname);
      message("auth-message", "Meta authorised. Select the correct Facebook Page in Creative Studio to complete the connection.");
    } else if (params.get("meta") === "cancelled") {
      window.history.replaceState({}, "", window.location.pathname);
      message("auth-message", "Meta connection was cancelled.");
    } else if (params.get("meta") === "error") {
      window.history.replaceState({}, "", window.location.pathname);
      message("auth-message", "Meta authorisation could not be completed. Check the Meta app settings and try again.", true);
    }
    if (params.get("google") === "connected") {
      window.history.replaceState({}, "", window.location.pathname);
      message("auth-message", "Google authorisation completed. Choose the correct Google account and Paanagam listing below to import read-only profile evidence.");
    }
    if (!token()) {
      $("#api-status").textContent = "Sign in to connect API";
      return;
    }
    try {
      const result = await api("/v1/me");
      signedIn(result.user);
      await refreshBusinesses();
    } catch (error) {
      message("auth-message", "Could not restore session: " + error.message, true);
    }
  }

  initialise();
})();