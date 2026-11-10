(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const API = () => (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\/$/, "");
  const TOKEN = "localboost_access_token", BUSINESS = "localboost_business_id";
  let drafts = [], current = null, ready = false;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const businessId = () => sessionStorage.getItem(BUSINESS);
  async function api(path, options = {}) {
    const token = sessionStorage.getItem(TOKEN);
    if (!token || !businessId()) throw new Error("Sign in and select a business workspace first.");
    const response = await fetch(API() + path, { ...options, headers: { "content-type":"application/json", authorization:"Bearer " + token, ...(options.headers || {}) } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Request failed (" + response.status + ")");
    return payload;
  }
  const base = () => "/v1/businesses/" + encodeURIComponent(businessId());
  const setMessage = (text, error = false) => { const el=$("creative-message"); if(el){el.textContent=text;el.classList.toggle("error",error);} };
  function render() {
    const list=$("creative-library");
    if (!list) return;
    list.innerHTML = drafts.map((d,i) => '<article class="creative-card"><div class="creative-card-top"><span class="tag '+(d.status==="APPROVED"?"confirmed":"pending-tag")+'">'+esc(d.status||"DRAFT")+'</span><small>'+esc(d.platform||"Social")+' · '+esc(d.format||"Feed")+'</small></div><h3>'+esc(d.topic)+'</h3><p>'+esc(d.caption||"")+'</p>'+(d.assetUrl?'<a href="'+esc(d.assetUrl)+'" target="_blank" rel="noopener">Open attached creative</a>':'<small class="footnote">No image asset attached</small>')+'<div class="creative-card-actions"><button type="button" data-copy="'+i+'" class="secondary-button">Copy caption</button><button type="button" data-approve="'+i+'" class="secondary-button" '+(d.status==="APPROVED"?"disabled":"")+'>'+ (d.status==="APPROVED"?"Owner approved":"Approve draft")+'</button></div></article>').join("") || '<p class="empty-copy">No saved creative drafts in this business workspace.</p>';
    const count=$("creative-count"); if(count) count.textContent=String(drafts.length);
  }
  async function load() {
    ready=false; drafts=[]; current=null; render();
    if (!businessId() || !sessionStorage.getItem(TOKEN)) { setMessage("Sign in and select a business to use the cloud creative library.",true); return; }
    try {
      const result=await api(base()+"/growth-records?type=CAMPAIGN_DRAFT&limit=200");
      drafts=(result.records||[]).filter(r=>r.externalId.startsWith("creative-studio:")).map(r=>r.payload).sort((a,b)=>String(b.updatedAt||b.createdAt||"").localeCompare(String(a.updatedAt||a.createdAt||"")));
      ready=true; render(); setMessage("Business cloud library loaded · "+drafts.length+" saved drafts.");
    } catch(e) { setMessage("Creative library unavailable: "+e.message,true); }
  }
  $("creative-form")?.addEventListener("submit",async e=>{
    e.preventDefault();
    if(!ready){setMessage("Wait for the selected business cloud library to load.",true);return;}
    const topic=$("creative-topic").value.trim(), offer=$("creative-offer").value.trim();
    const language=$("creative-language").value, platform=$("creative-platform").value, format=$("creative-format").value, tone=$("creative-tone").value;
    const map={ta:"Tamil",en:"English",both:"Tamil + English"};
    const formatMap={feed:"SQUARE",portrait:"PORTRAIT",story:"STORY"};
    const toneMap={"warm":"WARM","traditional":"TRADITIONAL","offer":"OFFER_LED"};
    $("creative-generate").disabled=true; setMessage("Generating copy with the configured Local AI service…");
    try {
      const result=await api(base()+"/google-content/draft",{method:"POST",body:JSON.stringify({topic,offer,language:map[language],format:formatMap[format],tone:toneMap[tone]})});
      current={id:"creative-studio:"+((crypto.randomUUID&&crypto.randomUUID())||Date.now()),kind:"LOCALBOOST_SOCIAL_CREATIVE",topic,offer,platform,format,language:map[language],caption:result.postCopy||result.caption||result.copy||result.postText||"",headline:result.headline||"",designerBrief:result.creativeBrief||result.imageBrief||result.designerBrief||"",assetUrl:"",status:"DRAFT",provenance:"LOCAL_AI_DRAFT",createdAt:new Date().toISOString()};
      if(!current.caption) current.caption=JSON.stringify(result,null,2);
      $("creative-preview").classList.remove("hidden");
      $("creative-preview-copy").textContent=current.caption;
      $("creative-preview-brief").textContent=current.designerBrief||"No separate image brief was returned by the drafting service.";
      $("creative-asset-url").value="";
      $("creative-save").disabled=false;
      setMessage("Draft generated. Review the copy and attach a finished image asset before saving if available.");
    } catch(err){setMessage("Generation failed: "+err.message,true);}
    finally{$("creative-generate").disabled=false;}
  });
  $("creative-save")?.addEventListener("click",async()=>{
    if(!ready||!current)return;
    const assetUrl=$("creative-asset-url").value.trim();
    if(assetUrl&&!/^https:\/\//i.test(assetUrl)){setMessage("Image asset must use an https:// URL.",true);return;}
    current.assetUrl=assetUrl; current.updatedAt=new Date().toISOString();
    try{
      await api(base()+"/growth-records",{method:"POST",body:JSON.stringify({type:"CAMPAIGN_DRAFT",externalId:current.id,payload:current,recordedAt:current.updatedAt})});
      drafts.unshift({...current}); current=null; $("creative-save").disabled=true; $("creative-preview").classList.add("hidden"); $("creative-form").reset(); render(); setMessage("Draft saved to the selected business cloud library. It has not been published or scheduled.");
    }catch(err){setMessage("Save failed: "+err.message,true);}
  });
  $("creative-library")?.addEventListener("click",async e=>{
    const copy=e.target.dataset.copy, approve=e.target.dataset.approve;
    if(copy!==undefined){const d=drafts[Number(copy)]; if(d) navigator.clipboard?.writeText(d.caption||"").then(()=>setMessage("Caption copied."),()=>setMessage("Copy unavailable in this browser.",true));}
    if(approve!==undefined){const d=drafts[Number(approve)];if(!d||d.status==="APPROVED")return;const next={...d,status:"APPROVED",approvedAt:new Date().toISOString(),approvalNote:"Owner-approved for later manual publishing; no external action performed."};try{await api(base()+"/growth-records",{method:"POST",body:JSON.stringify({type:"CAMPAIGN_DRAFT",externalId:d.id,payload:next,recordedAt:next.approvedAt})});drafts[Number(approve)]=next;render();setMessage("Owner approval recorded. No post was published or scheduled.");}catch(err){setMessage("Approval save failed: "+err.message,true);}}
  });
  window.addEventListener("localboost:business-ready",load);
  window.addEventListener("localboost:signed-out",()=>{drafts=[];current=null;ready=false;render();setMessage("Signed out. Cloud creative library is locked.");});
  if(businessId()) load();
})();