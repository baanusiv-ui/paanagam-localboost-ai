(() => {
  "use strict";
  const API = (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\/$/, "");
  const TOKEN = "localboost_access_token", BUSINESS = "localboost_business_id";
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const dateText = value => value ? new Date(value).toLocaleString() : "Not recorded";
  const safeUrl = value => { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };
  let businessId = null, businessName = "Selected business";
  let records = { COMPETITOR: [], LOCAL_KEYWORD: [], REVIEW_ITEM: [], GOOGLE_CONTENT: [] };
  const base = () => "/v1/businesses/" + encodeURIComponent(businessId || "");
  const makeId = prefix => prefix + ":" + (window.crypto?.randomUUID ? crypto.randomUUID() : Date.now() + ":" + Math.random().toString(36).slice(2));
  async function api(path, options = {}) {
    const headers = { "content-type": "application/json", ...(options.headers || {}) };
    const token = sessionStorage.getItem(TOKEN); if (token) headers.authorization = "Bearer " + token;
    const response = await fetch(API + path, { ...options, headers });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Request failed (" + response.status + ")");
    return payload;
  }
  async function list(type) {
    const result = await api(base() + "/growth-records?type=" + type + "&limit=200");
    return (result.records || []).map(row => ({ ...row.payload, _externalId: row.externalId, _recordId: row.id, _recordedAt: row.recordedAt, _source: row.source }));
  }
  async function save(type, payload, externalId) {
    const result = await api(base() + "/growth-records", { method:"POST", body:JSON.stringify({ type, externalId, payload:{ ...payload, provenance:payload.provenance || "OWNER_ENTERED" }, recordedAt:payload.observedAt || payload.createdAt || new Date().toISOString() }) });
    return result.record;
  }
  function message(text, error = false) { const node=$("gi-status"); if(node){node.textContent=text;node.classList.toggle("error",error);} }
  function sourceLabel(item) {
    const source = item?.provenance || item?._source || "OWNER_ENTERED";
    return ({GOOGLE_API:"Google Business Profile API",OWNER_CONFIRMED:"Owner-confirmed",OWNER_ENTERED:"Owner-entered",PUBLIC_OBSERVATION:"Owner-recorded public observation",AI_SUGGESTION:"AI suggestion",DEMO:"Demo data"})[source] || source;
  }
  function meta(item) { return '<small class="gi-meta">Source: '+esc(sourceLabel(item))+' · Recorded: '+esc(dateText(item._recordedAt || item.observedAt || item.createdAt))+'</small>'; }
  function renderAudit(audit) {
    const root=$("gi-audit-results"); if(!root)return;
    if(!audit){root.innerHTML='<p class="empty-copy">Run an audit to calculate current profile completeness.</p>';return;}
    const findings=Array.isArray(audit.findings)?audit.findings:[];
    root.innerHTML='<div class="gi-score"><strong>'+esc(audit.completeness)+'%</strong><span>Profile completeness<br><small>Checklist coverage only · not a Google ranking score</small></span></div><div class="gi-progress"><i style="width:'+Math.max(0,Math.min(100,Number(audit.completeness)||0))+'%"></i></div>'+
      findings.map(item=>'<article class="gi-row"><div><strong>'+esc(item.label)+'</strong><small>'+esc(item.recommendation)+'</small><small>Source: '+esc(item.source||"No evidence")+' · Observed: '+esc(dateText(item.observedAt))+'</small></div><span class="tag '+(["verified","owner_confirmed"].includes(item.status)?"confirmed":"pending-tag")+'">'+esc(item.status.replaceAll("_"," "))+'</span></article>').join("");
  }
  async function refreshEvidence() {
    const evidence=await api(base()+"/evidence");
    const counts=evidence.reduce((a,x)=>(a[x.source]=(a[x.source]||0)+1,a),{});
    const latest=evidence[0]?.observedAt;
    $("gi-evidence-status").innerHTML='<strong>Evidence freshness</strong><p>'+evidence.length+' evidence record(s) · '+Object.entries(counts).map(([k,v])=>esc(k)+': '+v).join(" · ")+'</p><small>Latest observation: '+esc(dateText(latest))+'</small>'+
      (evidence.some(x=>x.expiresAt&&new Date(x.expiresAt)<=new Date())?'<p class="error">Expired evidence exists and should be refreshed.</p>':"");
  }
  async function runAudit() {
    if(!businessId)return message("Sign in and select a business before running an audit.",true);
    const button=$("gi-run-audit");button.disabled=true;button.textContent="Auditing…";
    try { const result=await api(base()+"/audits",{method:"POST",body:"{}"});renderAudit(result.audit);message("Audit saved. "+result.audit.completeness+"% of checklist fields have current verified or owner-confirmed evidence.");await refreshEvidence(); }
    catch(error){message(error.message,true);} finally{button.disabled=false;button.textContent="Run profile audit";}
  }
  async function loadAudit(){const audits=await api(base()+"/audits");renderAudit(audits[0]||null);}
  function renderCompetitors(){
    const root=$("gi-competitor-list");if(!root)return;
    if(!records.COMPETITOR.length){root.innerHTML='<p class="empty-copy">No competitors recorded. Add a competitor, confirm its public identity and save a dated source snapshot.</p>';return;}
    const groups=new Map();
    records.COMPETITOR.forEach(item=>{
      const key=String(item.name||"").trim().toLocaleLowerCase().replace(/\\s+/g," ");
      if(!key)return;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(item);
    });
    const ordered=[...groups.values()].map(items=>items.sort((a,b)=>new Date(b.observedAt||b._recordedAt||0)-new Date(a.observedAt||a._recordedAt||0)));
    const numeric=value=>value===null||value===undefined||String(value).trim()===""?null:Number(value);
    const change=(current,previous,suffix,digits=0)=>{
      const a=numeric(current),b=numeric(previous);
      if(a===null||b===null||!Number.isFinite(a)||!Number.isFinite(b))return "No comparable prior snapshot";
      const delta=a-b;
      return (delta>0?"+":delta<0?"":"")+delta.toFixed(digits)+suffix+" since prior snapshot";
    };
    root.innerHTML=ordered.map(items=>{
      const latest=items[0],previous=items[1],url=safeUrl(latest.url);
      const history=items.slice(0,5).map(item=>'<li><span>'+esc((item.observedAt||item._recordedAt||"").slice(0,10)||"Date not recorded")+'</span><span>Rating '+esc(item.rating||"—")+' · Reviews '+esc(item.reviewCount||"—")+'</span></li>').join("");
      return '<article class="gi-card gi-competitor-card"><div class="gi-card-head"><strong>'+esc(latest.name)+'</strong><span class="tag '+(latest.identityConfirmed?"confirmed":"pending-tag")+'">'+(latest.identityConfirmed?"Owner-confirmed identity":"Identity not confirmed")+'</span></div>'+
        '<p>'+esc([latest.category,latest.area].filter(Boolean).join(" · ")||"Category / area not recorded")+'</p>'+
        '<div class="gi-compare"><span>Latest rating: '+esc(latest.rating||"Not recorded")+'</span><span>Review count: '+esc(latest.reviewCount||"Not recorded")+'</span><span>Offer: '+esc(latest.offer||"Not recorded")+'</span></div>'+
        '<div class="gi-change-grid"><div><small>Recorded rating change</small><strong>'+esc(previous?change(latest.rating,previous.rating,"",1):"One snapshot only")+'</strong></div><div><small>Recorded review-count change</small><strong>'+esc(previous?change(latest.reviewCount,previous.reviewCount,"",0):"One snapshot only")+'</strong></div></div>'+
        '<p>'+esc(latest.notes||"No observation notes supplied.")+'</p>'+
        (url?'<a href="'+esc(url)+'" target="_blank" rel="noopener">Open latest public source ↗</a>':'<small>Public source URL unavailable</small>')+
        '<details class="gi-history"><summary>'+items.length+' dated snapshot(s) · view history</summary><ul>'+history+'</ul></details>'+
        '<small class="gi-meta">Latest snapshot: '+esc(dateText(latest.observedAt||latest._recordedAt))+' · '+esc(sourceLabel(latest))+'</small></article>';
    }).join("");
  }
  function renderKeywords(){
    const root=$("gi-keyword-list");if(!records.LOCAL_KEYWORD.length){root.innerHTML='<p class="empty-copy">No keywords saved yet. Search volume and ranking are not inferred.</p>';return;}
    root.innerHTML=records.LOCAL_KEYWORD.map(x=>'<article class="gi-row"><div><strong>'+esc(x.phrase)+'</strong><small>'+esc(x.language)+' · '+esc(x.intent||"Intent not classified")+'</small><small>'+esc(x.notes||"No evidence note supplied")+'</small>'+meta(x)+'</div><span class="tag pending-tag">Idea · not rank data</span></article>').join("");
  }
  function renderReviews(){
    const root=$("gi-review-list");if(!records.REVIEW_ITEM.length){root.innerHTML='<p class="empty-copy">No customer reviews have been supplied or imported.</p>';return;}
    root.innerHTML=records.REVIEW_ITEM.map(x=>'<article class="gi-card"><div class="gi-card-head"><strong>'+esc(x.rating?x.rating+" / 5":"Rating not supplied")+'</strong><span class="tag pending-tag">'+esc(x.status||"DRAFT")+'</span></div><p>'+esc(x.reviewText)+'</p><small>Review date: '+esc(x.reviewDate||"Not supplied")+' · Source: '+esc(x.reviewSource||"Owner supplied")+'</small><label>Reply draft<textarea data-reply="'+esc(x._externalId)+'" rows="3">'+esc(x.replyDraft||"")+'</textarea></label><div class="gi-actions"><button class="secondary-button" data-save-reply="'+esc(x._externalId)+'">Save reply draft</button></div>'+meta(x)+'</article>').join("");
    root.querySelectorAll("[data-save-reply]").forEach(button=>button.addEventListener("click",async()=>{
      const item=records.REVIEW_ITEM.find(x=>x._externalId===button.dataset.saveReply);
      const area=Array.from(root.querySelectorAll("[data-reply]")).find(x=>x.dataset.reply===button.dataset.saveReply);
      const text=area?.value.trim();if(!item||!text)return message("Enter a reply draft first.",true);
      try{await save("REVIEW_ITEM",{...item,replyDraft:text,status:"REPLY_DRAFT",replyUpdatedAt:new Date().toISOString()},item._externalId);await reloadType("REVIEW_ITEM");message("Reply draft saved. It has not been sent to Google.");}catch(error){message(error.message,true);}
    }));
  }
  function renderContent(){
    const root=$("gi-content-list");if(!records.GOOGLE_CONTENT.length){root.innerHTML='<p class="empty-copy">No Google Business Profile content drafts yet.</p>';return;}
    const sorted=records.GOOGLE_CONTENT.slice().sort((a,b)=>String(a.publishDate||"").localeCompare(String(b.publishDate||"")));
    root.innerHTML=sorted.map(x=>'<article class="gi-card"><div class="gi-card-head"><strong>'+esc(x.topic)+'</strong><span class="tag '+(x.status==="APPROVED_FOR_MANUAL_PUBLISH"?"confirmed":"pending-tag")+'">'+esc(x.status)+'</span></div><p>'+esc(x.copy)+'</p><small>Language: '+esc(x.language)+' · Planned date: '+esc(x.publishDate||"Not scheduled")+'</small>'+meta(x)+
      (x.status==="DRAFT"?'<div class="gi-actions"><button class="secondary-button" data-approve-content="'+esc(x._externalId)+'">Approve exact draft</button><button class="quiet-button" data-reject-content="'+esc(x._externalId)+'">Reject</button></div>':"")+
      (x.status==="APPROVED_FOR_MANUAL_PUBLISH"?'<p class="footnote">Owner-approved for manual publishing · not published or scheduled automatically.</p>':"")+(x.status==="REJECTED"?'<p class="footnote">Rejected by owner · not published.</p>':"")+'</article>').join("");
    root.querySelectorAll("[data-approve-content],[data-reject-content]").forEach(button=>button.addEventListener("click",async()=>{
      const item=records.GOOGLE_CONTENT.find(x=>x._externalId===(button.dataset.approveContent||button.dataset.rejectContent));if(!item||item.status!=="DRAFT")return;
      const approved=Boolean(button.dataset.approveContent),next={...item,status:approved?"APPROVED_FOR_MANUAL_PUBLISH":"REJECTED",decisionAt:new Date().toISOString(),decision:"OWNER_"+(approved?"APPROVED":"REJECTED")};
      try{await save("GOOGLE_CONTENT",next,item._externalId);await reloadType("GOOGLE_CONTENT");message(approved?"Draft approved for manual publishing. Nothing was published.":"Draft rejected. Nothing was published.");}catch(error){message(error.message,true);}
    }));
  }
  async function reloadType(type){records[type]=await list(type);({COMPETITOR:renderCompetitors,LOCAL_KEYWORD:renderKeywords,REVIEW_ITEM:renderReviews,GOOGLE_CONTENT:renderContent})[type]();}
  async function refreshAll(){
    if(!businessId)return;
    try{await Promise.all([loadAudit(),refreshEvidence(),...Object.keys(records).map(reloadType)]);message("Loaded business-scoped records for "+businessName+". No external actions are enabled.");}
    catch(error){message(error.message,true);}
  }
  function requireWorkspace(){if(!businessId||!sessionStorage.getItem(TOKEN)){message("Sign in and select your business to save growth intelligence records.",true);return false;}return true;}
  function setupForms(){
    $("gi-competitor-form").addEventListener("submit",async e=>{e.preventDefault();if(!requireWorkspace())return;
      const observedDate=$("gi-comp-date").value;
      const x={name:$("gi-comp-name").value.trim(),category:$("gi-comp-category").value.trim(),area:$("gi-comp-area").value.trim(),url:$("gi-comp-url").value.trim(),rating:$("gi-comp-rating").value||null,reviewCount:$("gi-comp-reviews").value||null,offer:$("gi-comp-offer").value.trim(),notes:$("gi-comp-notes").value.trim(),identityConfirmed:$("gi-comp-identity").checked,provenance:"PUBLIC_OBSERVATION",observedAt:new Date(observedDate+"T12:00:00").toISOString()};
      if(!x.name||!safeUrl(x.url)||!x.identityConfirmed||!observedDate)return message("Confirm the competitor identity, public URL and observation date.",true);
      try{await save("COMPETITOR",x,makeId("competitor"));e.target.reset();$("gi-comp-date").value=new Date().toISOString().slice(0,10);await reloadType("COMPETITOR");message("Dated public observation saved. Comparisons use only the snapshots you entered; no competitor ranking is inferred.");}catch(err){message(err.message,true);}
    });
    $("gi-keyword-form").addEventListener("submit",async e=>{e.preventDefault();if(!requireWorkspace())return;
      const x={phrase:$("gi-keyword-phrase").value.trim(),language:$("gi-keyword-language").value,intent:$("gi-keyword-intent").value,notes:$("gi-keyword-notes").value.trim(),provenance:"OWNER_ENTERED",createdAt:new Date().toISOString()};
      if(!x.phrase)return;try{await save("LOCAL_KEYWORD",x,makeId("keyword"));e.target.reset();await reloadType("LOCAL_KEYWORD");message("Keyword idea saved. Search volume and rank have not been measured.");}catch(err){message(err.message,true);}
    });
    $("gi-review-form").addEventListener("submit",async e=>{e.preventDefault();if(!requireWorkspace())return;
      const x={reviewText:$("gi-review-text").value.trim(),rating:$("gi-review-rating").value||null,reviewDate:$("gi-review-date").value||null,reviewSource:$("gi-review-source").value.trim()||"Owner supplied",provenance:"OWNER_ENTERED",status:"REVIEW_CAPTURED",createdAt:new Date().toISOString()};
      if(!x.reviewText)return;try{await save("REVIEW_ITEM",x,makeId("review"));e.target.reset();await reloadType("REVIEW_ITEM");message("Review record saved. No reply was sent.");}catch(err){message(err.message,true);}
    });
    $("gi-content-form").addEventListener("submit",async e=>{e.preventDefault();if(!requireWorkspace())return;
      const x={topic:$("gi-content-topic").value.trim(),language:$("gi-content-language").value,publishDate:$("gi-content-date").value||null,copy:$("gi-content-copy").value.trim(),status:"DRAFT",provenance:"OWNER_ENTERED",createdAt:new Date().toISOString()};
      if(!x.topic||!x.copy)return;try{await save("GOOGLE_CONTENT",x,makeId("google-content"));e.target.reset();await reloadType("GOOGLE_CONTENT");message("Content draft saved to approval queue. It is not scheduled or published.");}catch(err){message(err.message,true);}
    });
    $("gi-run-audit").addEventListener("click",runAudit);
  }
  function show(){
    document.querySelectorAll(".view-panel").forEach(x=>x.classList.add("hidden"));
    document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.hasAttribute("data-gi-nav")));
    $("growth-intelligence-view").classList.remove("hidden");$("crumb-title").textContent="Growth intelligence";$("page-title").textContent=businessName+" · Growth intelligence";
    if(businessId)refreshAll();
  }
  function install(){
    const nav=document.querySelector(".nav-list"),main=document.querySelector(".main");if(!nav||!main||$("growth-intelligence-view"))return;
    const button=document.createElement("button");button.className="nav-item";button.type="button";button.dataset.giNav="true";button.innerHTML="<span>✦</span> Growth intelligence";
    nav.insertBefore(button,nav.querySelector("[data-view='consultant']")||null);button.addEventListener("click",show);
    const section=document.createElement("section");section.className="view-panel hidden";section.id="growth-intelligence-view";
    section.innerHTML = `
      <div class="section-heading"><div><h2>Local growth intelligence</h2><p>Evidence-led profile health, competitors, keywords, reviews and Google content.</p></div><span class="tag pending-tag">Owner workspace</span></div>
      <div class="gi-status panel" id="gi-status" role="status">Sign in and select a business to load its private workspace.</div>
      <div class="gi-tabs" role="tablist"><button class="active" data-gi-tab="health">Google health</button><button data-gi-tab="competitors">Competitors</button><button data-gi-tab="keywords">Local keywords</button><button data-gi-tab="reviews">Reviews</button><button data-gi-tab="content">Content calendar</button></div>
      <div class="gi-panel" data-gi-panel="health"><div class="gi-grid"><article class="panel"><div class="panel-heading"><div><h3>Google Business Profile health</h3><p>Checklist completeness from current evidence.</p></div><span class="tag confirmed">Read-only</span></div><button class="primary-button" id="gi-run-audit">Run profile audit</button><div id="gi-audit-results" class="gi-results"><p class="empty-copy">Run an audit to calculate completeness.</p></div></article><article class="panel" id="gi-evidence-status"><strong>Evidence freshness</strong><p>No evidence loaded.</p></article></div><p class="footnote">Completeness is the share of checklist fields with current verified or owner-confirmed evidence. It is not a Google ranking, search visibility or traffic score.</p></div>
      <div class="gi-panel hidden" data-gi-panel="competitors"><div class="panel"><h3>Register a local competitor</h3><p class="footnote">Record only a public observation you can verify. No private data or invented rankings.</p><form id="gi-competitor-form" class="gi-form"><label>Business name<input id="gi-comp-name" required maxlength="160"></label><label>Category<input id="gi-comp-category" maxlength="120" placeholder="Cafe, bakery, restaurant"></label><label>Area / locality<input id="gi-comp-area" maxlength="160"></label><label>Public profile URL<input id="gi-comp-url" type="url" required maxlength="500" placeholder="https://"></label><label>Observation date<input id="gi-comp-date" type="date" required></label><label>Rating (optional)<input id="gi-comp-rating" type="number" min="0" max="5" step=".1"></label><label>Review count (optional)<input id="gi-comp-reviews" type="number" min="0" step="1"></label><label>Current offer observed<input id="gi-comp-offer" maxlength="300"></label><label>Observation notes<textarea id="gi-comp-notes" rows="2" maxlength="1000"></textarea></label><label class="gi-check"><input id="gi-comp-identity" type="checkbox" required> I confirmed this is the correct public business profile</label><button class="primary-button">Save dated competitor snapshot</button></form></div><div class="panel"><h3>Competitor comparison</h3><div id="gi-competitor-list"><p class="empty-copy">No competitors recorded.</p></div></div></div>
      <div class="gi-panel hidden" data-gi-panel="keywords"><div class="panel"><h3>Local keyword workspace</h3><p class="footnote">Save Tamil and English phrases with intent. Search volume and position are not inferred.</p><form id="gi-keyword-form" class="gi-form"><label>Search phrase<input id="gi-keyword-phrase" required maxlength="180" placeholder="நாமக்கல் ஃபில்டர் காபி"></label><label>Language<select id="gi-keyword-language"><option>Tamil</option><option>English</option><option>Tamil + English</option></select></label><label>Intent<select id="gi-keyword-intent"><option>Local discovery</option><option>Product search</option><option>Visit / directions</option><option>Brand search</option></select></label><label>Evidence / notes<textarea id="gi-keyword-notes" rows="2" maxlength="500"></textarea></label><button class="primary-button">Save keyword idea</button></form></div><div class="panel"><h3>Saved keyword ideas</h3><div id="gi-keyword-list"><p class="empty-copy">No keywords saved yet.</p></div></div></div>
      <div class="gi-panel hidden" data-gi-panel="reviews"><div class="panel"><h3>Review intelligence</h3><p class="footnote">Add a real review supplied by the owner. Do not enter customer names or contact details. Google import is not assumed available.</p><form id="gi-review-form" class="gi-form"><label>Review text<textarea id="gi-review-text" rows="3" required maxlength="4000"></textarea></label><label>Rating (optional)<input id="gi-review-rating" type="number" min="1" max="5" step="1"></label><label>Review date<input id="gi-review-date" type="date"></label><label>Source note<input id="gi-review-source" maxlength="180" placeholder="Owner-provided Google review / supplied export"></label><button class="primary-button">Save review for analysis</button></form></div><div class="panel"><h3>Review reply drafts</h3><div id="gi-review-list"><p class="empty-copy">No review records available.</p></div><p class="footnote">Reply drafts are private suggestions. Saving does not send them to Google.</p></div></div>
      <div class="gi-panel hidden" data-gi-panel="content"><div class="panel"><h3>Google Business Profile content calendar</h3><p class="footnote">Create and plan posts. Approval is recorded here; automatic publishing and scheduling are not connected.</p><form id="gi-content-form" class="gi-form"><label>Post topic<input id="gi-content-topic" required maxlength="180" placeholder="Filter coffee / festival offer"></label><label>Language<select id="gi-content-language"><option>Tamil</option><option>English</option><option>Tamil + English</option></select></label><label>Planned publish date<input id="gi-content-date" type="date"></label><label>Exact post copy<textarea id="gi-content-copy" rows="4" required maxlength="5000"></textarea></label><button class="primary-button">Save content draft</button></form></div><div class="panel"><h3>Drafts and approval status</h3><div id="gi-content-list"><p class="empty-copy">No content drafts yet.</p></div></div></div>`;
    const footer=main.querySelector("footer");main.insertBefore(section,footer||null);
    $("gi-comp-date").value=new Date().toISOString().slice(0,10);
    const openCompetitors=$("open-gi-competitors");
    if(openCompetitors)openCompetitors.addEventListener("click",()=>{show();section.querySelector('[data-gi-tab="competitors"]')?.click();});
    section.querySelectorAll("[data-gi-tab]").forEach(tab=>tab.addEventListener("click",()=>{
      section.querySelectorAll("[data-gi-tab]").forEach(x=>x.classList.toggle("active",x===tab));
      section.querySelectorAll("[data-gi-panel]").forEach(x=>x.classList.toggle("hidden",x.dataset.giPanel!==tab.dataset.giTab));
    }));
    document.addEventListener("click",event=>{const old=event.target.closest("[data-view]");if(old)section.classList.add("hidden");},true);
    setupForms();
  }
  window.addEventListener("localboost:business-ready",event=>{businessId=event.detail?.businessId||sessionStorage.getItem(BUSINESS);businessName=$("business-switcher-name")?.textContent||businessName;if(businessId)refreshAll();});
  install();
  if(sessionStorage.getItem(BUSINESS)){businessId=sessionStorage.getItem(BUSINESS);businessName=$("business-switcher-name")?.textContent||businessName;}
})();