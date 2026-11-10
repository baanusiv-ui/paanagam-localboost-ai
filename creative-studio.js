(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const API = () => (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\/$/, "");
  const TOKEN = "localboost_access_token", BUSINESS = "localboost_business_id";
  let drafts = [], current = null, ready = false, generatedImageDataUrl = "";
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
    list.innerHTML = drafts.map((d,i) => '<article class="creative-card"><div class="creative-card-top"><span class="tag '+(d.status==="REVIEWED"?"confirmed":"pending-tag")+'">'+esc(d.status||"DRAFT")+'</span><small>'+esc(d.platform||"Social")+' · '+esc(d.format||"Feed")+'</small></div><h3>'+esc(d.topic)+'</h3><p>'+esc(d.caption||"")+'</p>'+(d.assetId?'<img class="creative-card-image" data-asset-id="'+esc(d.assetId)+'" alt="'+esc(d.topic||"Campaign artwork")+'">':(d.assetUrl?'<a href="'+esc(d.assetUrl)+'" target="_blank" rel="noopener">Open attached creative</a>':'<small class="footnote">No image asset attached</small>'))+'<div class="creative-card-actions"><button type="button" data-copy="'+i+'" class="secondary-button">Copy caption</button><button type="button" data-approve="'+i+'" class="secondary-button" '+(d.status==="REVIEWED"?"disabled":"")+'>'+ (d.status==="REVIEWED"?"Reviewed":"Mark reviewed")+'</button></div></article>').join("") || '<p class="empty-copy">No saved creative drafts in this business workspace.</p>';
    const count=$("creative-count"); if(count) count.textContent=String(drafts.length);
    hydrateAssetImages();
  }
  async function hydrateAssetImages() {
    for (const img of document.querySelectorAll("#creative-library img[data-asset-id]")) {
      const id=img.dataset.assetId;
      if (!id || img.dataset.loaded === "true") continue;
      img.dataset.loaded="true";
      try {
        const response=await fetch(API()+base()+"/creative-assets/"+encodeURIComponent(id)+"/content",{headers:{authorization:"Bearer "+sessionStorage.getItem(TOKEN)}});
        if(!response.ok) throw new Error("Asset unavailable");
        const url=URL.createObjectURL(await response.blob());
        if(img.isConnected) img.src=url; else URL.revokeObjectURL(url);
      } catch { img.alt="Saved artwork could not be loaded"; img.classList.add("asset-unavailable"); }
    }
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
      generatedImageDataUrl="";
      const imagePreview=$("creative-image-preview"); if(imagePreview){imagePreview.src="";imagePreview.classList.add("hidden");}
      $("creative-image-generate").disabled=false; $("creative-image-download").disabled=true; $("creative-image-save").disabled=true;
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
  $("creative-image-generate")?.addEventListener("click",async()=>{
    if(!ready||!current){setMessage("Generate campaign copy first, then create its artwork.",true);return;}
    const button=$("creative-image-generate"); button.disabled=true;
    setMessage("Generating campaign artwork. This uses the configured image provider and may incur API charges…");
    try{
      const result=await api(base()+"/creative/image",{method:"POST",body:JSON.stringify({
        topic:current.topic,offer:current.offer,creativeBrief:current.designerBrief,
        language:current.language,format:({feed:"SQUARE",portrait:"PORTRAIT",story:"STORY"})[$("creative-format").value]
      })});
      generatedImageDataUrl=result.imageDataUrl||"";
      if(!generatedImageDataUrl) throw new Error("Image provider returned no preview.");
      const preview=$("creative-image-preview"); preview.src=generatedImageDataUrl; preview.classList.remove("hidden");
      $("creative-image-download").disabled=false; $("creative-image-save").disabled=false;
      setMessage("Artwork generated · "+result.model+". Save it to the selected business library to keep it in the cloud.");
    }catch(err){setMessage("Image generation failed: "+err.message,true);}
    finally{button.disabled=false;}
  });
  $("creative-image-save")?.addEventListener("click",async()=>{
    if(!ready||!current||!generatedImageDataUrl)return;
    const match=generatedImageDataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if(!match){setMessage("Generated artwork format is not supported for secure storage.",true);return;}
    const button=$("creative-image-save"); button.disabled=true;
    setMessage("Saving artwork to the selected business library…");
    try{
      const result=await api(base()+"/creative-assets",{method:"POST",body:JSON.stringify({fileName:"localboost-"+Date.now()+(match[1]==="image/jpeg"?".jpg":match[1]==="image/webp"?".webp":".png"),mimeType:match[1],dataBase64:match[2],altText:current.topic})});
      current.assetId=result.asset.id; current.assetName=result.asset.fileName; current.assetUrl="";
      setMessage("Artwork saved to the selected business workspace ("+(result.asset.byteSize/1024).toFixed(0)+" KB). Save the campaign draft next.");
    }catch(err){setMessage("Artwork save failed: "+err.message,true);button.disabled=false;}
  });
  $("creative-image-download")?.addEventListener("click",()=>{
    if(!generatedImageDataUrl)return;
    const a=document.createElement("a"); a.href=generatedImageDataUrl; a.download="localboost-campaign-artwork.png"; document.body.appendChild(a); a.click(); a.remove();
  });
  $("creative-save")?.addEventListener("click",async()=>{
    if(!ready||!current)return;
    const assetUrl=$("creative-asset-url").value.trim();
    if(assetUrl&&!/^https:\/\//i.test(assetUrl)){setMessage("Image asset must use an https:// URL.",true);return;}
    current.assetUrl=assetUrl; current.updatedAt=new Date().toISOString();
    try{
      await api(base()+"/growth-records",{method:"POST",body:JSON.stringify({type:"CAMPAIGN_DRAFT",externalId:current.id,payload:current,recordedAt:current.updatedAt})});
      const channels = current.platform === "Instagram + Facebook" ? ["FACEBOOK","INSTAGRAM"] : current.platform === "Instagram" ? ["INSTAGRAM"] : current.platform === "Facebook" ? ["FACEBOOK"] : [];
      const queued = [], skipped = [];
      for (const channel of channels) {
        if (channel === "INSTAGRAM" && !current.assetId) { skipped.push("Instagram needs a saved JPEG/PNG image"); continue; }
        await api(base()+"/social-posts",{method:"POST",body:JSON.stringify({channel,caption:current.caption,assetId:current.assetId||undefined})});
        queued.push(channel);
      }
      drafts.unshift({...current}); current=null; $("creative-save").disabled=true; $("creative-preview").classList.add("hidden"); $("creative-form").reset(); render();
      setMessage("Draft saved. "+queued.length+" social post(s) added to Approval Centre; nothing has been approved or published."+(skipped.length?" "+skipped.join("; ")+".":""));
    }catch(err){setMessage("Save failed: "+err.message,true);}
  });
  $("creative-library")?.addEventListener("click",async e=>{
    const copy=e.target.dataset.copy, approve=e.target.dataset.approve;
    if(copy!==undefined){const d=drafts[Number(copy)]; if(d) navigator.clipboard?.writeText(d.caption||"").then(()=>setMessage("Caption copied."),()=>setMessage("Copy unavailable in this browser.",true));}
    if(approve!==undefined){const d=drafts[Number(approve)];if(!d||d.status==="REVIEWED")return;const next={...d,status:"REVIEWED",reviewedAt:new Date().toISOString(),approvalNote:"Marked reviewed in the creative library; this is not publishing approval."};try{await api(base()+"/growth-records",{method:"POST",body:JSON.stringify({type:"CAMPAIGN_DRAFT",externalId:d.id,payload:next,recordedAt:next.approvedAt})});drafts[Number(approve)]=next;render();setMessage("Marked reviewed. Use the separate Approval Centre to approve and manually publish a social post.");}catch(err){setMessage("Approval save failed: "+err.message,true);}}
  });
  window.addEventListener("localboost:business-ready",load);
  window.addEventListener("localboost:signed-out",()=>{drafts=[];current=null;ready=false;render();setMessage("Signed out. Cloud creative library is locked.");});
  if(businessId()) load();
})();