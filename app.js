(() => {
  "use strict";

  const API_BASE = (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\/$/, "");
  const TOKEN_KEY = "localboost_access_token";
  const BUSINESS_KEY = "localboost_business_id";
  const views = ["overview", "audit", "competitors", "reviews", "content", "approvals"];
  const titles = {
    overview: "Overview", audit: "Local presence audit", competitors: "Competitors",
    reviews: "Reviews", content: "Content studio", approvals: "Approval centre"
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
    $("#data-mode").textContent = "LIVE OWNER DATA";
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
  }

  async function refreshGoogleStatus() {
    if (!activeBusiness) return;
    const result = await api("/v1/businesses/" + encodeURIComponent(activeBusiness.id) + "/google");
    setConnectionState(result.connected, result.connected ? "Authorised connection" : "Not connected");
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
  $("#connect-google").addEventListener("click", connectGoogle);
  $("#dismiss-notice").addEventListener("click", () => $(".notice").classList.add("hidden"));
  $("#auth-form").addEventListener("submit", event => { event.preventDefault(); authenticate("login"); });
  $("#register-button").addEventListener("click", () => authenticate("register"));
  $("#logout-button").addEventListener("click", () => signOut());
  $("#business-form").addEventListener("submit", createBusiness);

  $("#make-draft").addEventListener("click", () => {
    const topic = $("#content-topic").value.trim();
    const tone = $("#content-tone").value;
    const output = $("#draft-output");
    if (!topic) { $("#content-topic").focus(); return; }
    output.textContent = "SAMPLE DRAFT — REVIEW BEFORE USE\n\nஒரு நல்ல நாளை ஒரு நல்ல காபியுடன் தொடங்குங்கள்! ☕\n\nபானகத்தில் " + topic + " — உங்கள் நாளில் ஒரு சின்ன மகிழ்ச்சி. நண்பர்களுடன் பகிர்ந்து கொள்ளுங்கள்!\n\nTone: " + tone + "\n\nNote: This is a locally generated template, not verified AI research or a published post. Verify every claim before approval.";
    output.classList.remove("hidden");
  });

  async function initialise() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      window.history.replaceState({}, "", window.location.pathname);
      message("auth-message", "Google authorisation completed. Profile data import is the next integration step.");
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