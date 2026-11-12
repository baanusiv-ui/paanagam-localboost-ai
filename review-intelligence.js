(() => {
  "use strict";
  const TOKEN = "localboost_access_token";
  const BUSINESS = "localboost_business_id";
  const API = () => (window.LOCALBOOST_API_BASE || "").replace(/\/$/, "");
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let businessId = null, reviews = [], analysis = null, sourceStatus = null;

  async function api(path, options = {}) {
    const token = sessionStorage.getItem(TOKEN);
    if (!token) throw new Error("Sign in to view private customer feedback.");
    const response = await fetch(API() + path, { ...options, headers: {
      "content-type": "application/json", authorization: "Bearer " + token, ...(options.headers || {})
    }});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed (" + response.status + ")");
    return data;
  }
  const base = () => "/v1/businesses/" + encodeURIComponent(businessId || "");
  function status(message, error = false) {
    const node = $("ri-status"); if (!node) return;
    node.textContent = message; node.classList.toggle("error", error);
  }
  function fmtDate(value) {
    if (!value) return "Date not supplied";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date not supplied" : date.toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"});
  }
  function rating(value) { return Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 5 ? Number(value) + " / 5" : "No rating"; }
  function payload(row) { return row?.payload && typeof row.payload === "object" ? row.payload : {}; }
  function sourceName(row) {
    const p = payload(row);
    return p.reviewSource || (row.source === "GOOGLE_API" ? "Google Business Profile" : row.source === "META_API" ? "Meta" : "Owner supplied");
  }
  function sentimentFor(row) {
    const p = payload(row), text = String(p.reviewText || "").toLowerCase();
    if (Number(p.rating) >= 4) return "Positive";
    if (Number(p.rating) <= 2) return "Needs attention";
    if (/மோசம்|சரியில்லை|தாமதம்|அதிக விலை|bad|poor|worst|slow|dirty/.test(text)) return "Needs attention";
    return "Review";
  }
  function render() {
    const total = reviews.length;
    const written = reviews.filter(row => String(payload(row).reviewText || "").trim()).length;
    const avgRows = reviews.map(row => Number(payload(row).rating)).filter(n => Number.isFinite(n) && n >= 1 && n <= 5);
    const average = avgRows.length ? (avgRows.reduce((a,b)=>a+b,0)/avgRows.length).toFixed(2) : "—";
    $("ri-total").textContent = String(total);
    $("ri-written").textContent = String(written);
    $("ri-average").textContent = average === "—" ? "—" : average + " / 5";
    $("ri-period").textContent = analysis?.dateFrom && analysis?.dateTo ? fmtDate(analysis.dateFrom) + " – " + fmtDate(analysis.dateTo) : "Date range unavailable";
    const google = sourceStatus?.google;
    $("ri-google-state").textContent = google?.connectionSaved ? (google.hasBusinessManageScope ? "Connected · review scope present" : "Connected · review permission needs checking") : "Not connected";
    $("ri-google-state").className = "ri-source-state " + (google?.connectionSaved ? "ri-connected" : "");
    const metaCount = reviews.filter(row => sourceName(row).toLowerCase().includes("meta")).length;
    $("ri-meta-state").textContent = metaCount ? metaCount + " feedback items imported" : "No Meta feedback imported";
    $("ri-meta-note").textContent = "Only eligible Page/owned-content feedback can be shown; Instagram comments are not star-rated business reviews.";
    const sentiment = analysis?.sentiment || {positive:0,negative:0,neutral:0};
    $("ri-sentiment").innerHTML = [
      ["Positive",sentiment.positive],["Needs attention",sentiment.negative],["Neutral / unclear",sentiment.neutral]
    ].map(([label,count]) => '<div class="ri-sentiment-row"><span>'+esc(label)+'</span><strong>'+Number(count||0)+'</strong><i><b style="width:'+ (written ? Math.min(100,Number(count||0)/written*100) : 0) +'%"></b></i></div>').join("");
    $("ri-themes").innerHTML = (analysis?.themes || []).length ? analysis.themes.map(theme =>
      '<article class="ri-theme"><div><strong>'+esc(theme.theme.replaceAll("_"," ").toLowerCase())+'</strong><small>'+theme.count+' matching review(s) · '+theme.negative+' negative signal(s)</small></div><span>'+theme.count+'</span></article>'
    ).join("") : '<p class="ri-empty">No themes detected yet. Import authorised reviews or add verified feedback.</p>';
    const query = ($("ri-search")?.value || "").trim().toLowerCase();
    const sourceFilter = $("ri-source-filter")?.value || "all";
    const filtered = reviews.filter(row => {
      const p=payload(row), text=String(p.reviewText||"");
      const source=sourceName(row).toLowerCase();
      return (!query || text.toLowerCase().includes(query)) &&
        (sourceFilter==="all" || (sourceFilter==="google" && source.includes("google")) || (sourceFilter==="meta" && source.includes("meta")));
    });
    $("ri-evidence").innerHTML = filtered.length ? filtered.map(row => {
      const p=payload(row), text=String(p.reviewText||"").trim();
      return '<article class="ri-evidence-card"><div class="ri-evidence-top"><span>'+esc(sourceName(row))+'</span><span>'+esc(rating(p.rating))+'</span></div><p>'+ (text ? esc(text) : '<em>Rating-only feedback · no written comment</em>') +'</p><small>'+esc(fmtDate(p.reviewDate || row.recordedAt))+' · '+esc(sentimentFor(row))+'</small></article>';
    }).join("") : '<p class="ri-empty">No feedback matches this filter.</p>';
    $("ri-method").textContent = analysis ? "Analysis: " + analysis.method.replaceAll("_"," ").toLowerCase() + " · " + analysis.textReviewCount + " written / " + analysis.sampleSize + " total. This is directional keyword analysis, not a trained AI judgement." : "No analysis available.";
    $("ri-caveats").innerHTML = (analysis?.limitations || ["Small samples can be misleading. Read original feedback before acting."]).map(item=>"<li>"+esc(item)+"</li>").join("");
    const ideas = (analysis?.themes || []).filter(x=>x.count>0).slice(0,3);
    $("ri-education").innerHTML = ideas.length ? ideas.map(theme =>
      '<article class="ri-education-card"><strong>'+esc(theme.theme.replaceAll("_"," ").toLowerCase())+'</strong><p>Possible customer explainer topic: answer questions about this theme using Paanagam-approved menu, recipe and service facts only.</p><small>Evidence: '+theme.count+' matching feedback item(s). Owner fact-check required.</small></article>'
    ).join("") : '<p class="ri-empty">Educational topics will appear after verified feedback is available.</p>';
  }
  async function refresh() {
    if (!businessId) return;
    status("Loading review evidence…");
    try {
      const [records, themes, data] = await Promise.all([
        api(base()+"/growth-records?type=REVIEW_ITEM&limit=200"),
        api(base()+"/reviews/themes"),
        api(base()+"/data-status")
      ]);
      reviews = (records.records || []).filter(row => row.source !== "DEMO").sort((a,b)=>new Date(b.recordedAt)-new Date(a.recordedAt));
      analysis = themes; sourceStatus = data;
      render();
      status(reviews.length ? "Loaded "+reviews.length+" saved feedback item(s). Review every evidence item before deciding what to change." : "No imported reviews yet. Connect an authorised Google Business Profile or supply eligible feedback.");
    } catch (error) { status(error.message, true); }
  }
  async function importGoogle() {
    const button=$("ri-import-google"); button.disabled=true; status("Importing authorised Google Business Profile reviews…");
    try {
      const result=await api(base()+"/google/reviews/import",{method:"POST",body:"{}"});
      status("Google import complete: "+(result.importedCount ?? 0)+" imported. "+(result.totalReviewCount ?? "Unknown")+" total at source.");
      await refresh();
    } catch(error) { status(error.message,true); }
    finally { button.disabled=false; }
  }
  function install() {
    const nav=document.querySelector(".nav-list"), main=document.querySelector(".main");
    if(!nav||!main||$("review-intelligence-view")) return;
    const button=document.createElement("button"); button.type="button"; button.className="nav-item"; button.dataset.reviewIntelligenceNav="true"; button.innerHTML="<span>✳</span> Review intelligence";
    nav.insertBefore(button,nav.querySelector('[data-view="content"]')||null);
    const section=document.createElement("section"); section.className="view-panel hidden"; section.id="review-intelligence-view";
    section.innerHTML=`
      <div class="section-heading"><div><h2>Review Intelligence & Customer Voice</h2><p>Understand recurring customer feedback with source labels, sample sizes and original evidence.</p></div><span class="tag pending-tag">Evidence first · owner decision</span></div>
      <div class="ri-toolbar"><p id="ri-status" role="status">Sign in and select a business to load its private feedback.</p><div><button class="secondary-button" id="ri-refresh">Refresh</button><button class="primary-button" id="ri-import-google">Import Google reviews</button></div></div>
      <div class="ri-source-grid"><article class="panel ri-source"><span>Google Business Profile</span><strong id="ri-google-state">Checking connection…</strong><small>Official authorised review API only.</small></article><article class="panel ri-source"><span>Meta feedback</span><strong id="ri-meta-state">No Meta feedback imported</strong><small id="ri-meta-note">No scraping or private messages.</small></article></div>
      <div class="ri-metric-grid"><article class="panel"><small>Feedback items</small><strong id="ri-total">0</strong></article><article class="panel"><small>Written comments</small><strong id="ri-written">0</strong></article><article class="panel"><small>Average imported rating</small><strong id="ri-average">—</strong></article><article class="panel"><small>Review date range</small><strong id="ri-period">—</strong></article></div>
      <div class="ri-two-col"><article class="panel"><div class="panel-heading"><div><h3>Sentiment signals</h3><p>Text-only heuristic; rating is a tie-breaker.</p></div></div><div id="ri-sentiment"></div></article><article class="panel"><div class="panel-heading"><div><h3>Recurring themes</h3><p>One review may match more than one theme.</p></div></div><div id="ri-themes"></div></article></div>
      <article class="panel"><div class="panel-heading"><div><h3>Customer evidence</h3><p>Original comments remain visible so AI labels are never treated as proof.</p></div><div class="ri-filters"><input id="ri-search" type="search" placeholder="Search feedback"><select id="ri-source-filter"><option value="all">All sources</option><option value="google">Google</option><option value="meta">Meta</option></select></div></div><div id="ri-evidence" class="ri-evidence-list"></div></article>
      <article class="panel"><div class="panel-heading"><div><h3>Customer education opportunities</h3><p>Topics only; scripts must use approved Paanagam menu and recipe facts.</p></div></div><div id="ri-education" class="ri-education-list"></div></article>
      <details class="panel ri-method"><summary>Analysis method and limitations</summary><p id="ri-method"></p><ul id="ri-caveats"></ul></details>`;
    main.querySelector("main")?.append(section) || main.append(section);
    const show=()=>{document.querySelectorAll(".main > .view-panel").forEach(x=>x.classList.add("hidden")); section.classList.remove("hidden"); document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x===button)); const crumb=$("crumb-title"),title=$("page-title"); if(crumb)crumb.textContent="Review intelligence";if(title)title.textContent="Review intelligence";if(businessId)refresh();};
    button.addEventListener("click",show);
    // The core router only knows its built-in views; hide this extension view when a built-in route is selected.
    document.addEventListener("click",event=>{if(event.target.closest("[data-view], [data-go]"))section.classList.add("hidden");},true);
    $("ri-refresh").addEventListener("click",refresh);
    $("ri-import-google").addEventListener("click",importGoogle);
    $("ri-search").addEventListener("input",render);
    $("ri-source-filter").addEventListener("change",render);
    window.addEventListener("localboost:business-ready",event=>{businessId=event.detail?.businessId||sessionStorage.getItem(BUSINESS);});
    window.addEventListener("localboost:signed-out",()=>{businessId=null;reviews=[];analysis=null;sourceStatus=null;if($("ri-evidence")){render();status("Signed out · private review evidence cleared.");}});
    businessId=sessionStorage.getItem(BUSINESS);
  }
  install();
})();