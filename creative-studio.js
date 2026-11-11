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
  async function composeCampaignArtwork(sourceUrl) {
    const image = new Image(); image.src = sourceUrl;
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("Generated image could not be opened for layout.")); });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || 1024; canvas.height = image.naturalHeight || 1024;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser cannot compose the campaign artwork.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const scale = canvas.width / 1024, margin = 64 * scale, bandTop = canvas.height * 0.46;
    const solidTop = canvas.height * 0.60;
    const gradient = ctx.createLinearGradient(0, bandTop, 0, solidTop);
    gradient.addColorStop(0, "rgba(18,22,17,0)"); gradient.addColorStop(1, "rgba(18,22,17,1)");
    ctx.fillStyle = gradient; ctx.fillRect(0, bandTop, canvas.width, solidTop - bandTop);
    ctx.fillStyle = "#121611"; ctx.fillRect(0, solidTop, canvas.width, canvas.height - solidTop);
    const sourceText = [current?.topic || "", current?.offer || "", current?.designerBrief || ""].join(" ");
    const brand = /paanagam|பானகம்/i.test(sourceText) ? "PAANAGAM  ·  பானகம்" : "";
    const dateMatch = sourceText.match(/\b(\d{1,2}\s+[A-Za-z]+\s+20\d{2})\b/);
    let title = (current?.headline || current?.topic || "Campaign").replace(/\s*[–—-]\s*/g, " · ").trim();
    if (/grand opening/i.test(title)) title = "Grand Opening"; else if (title.length > 48) title = title.slice(0,45).trim() + "…";
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.font = "700 " + (48 * scale) + "px Arial, sans-serif"; ctx.fillStyle = "#fffaf0"; ctx.shadowColor = "rgba(0,0,0,.3)"; ctx.shadowBlur = 8 * scale;
    ctx.fillText(title, margin, canvas.height - margin - (dateMatch ? 42 : 18) * scale, canvas.width - margin * 2); ctx.shadowBlur = 0;
    if (dateMatch) { ctx.font = "600 " + (22 * scale) + "px Arial, sans-serif"; ctx.fillStyle = "#f2c66d"; ctx.fillText(dateMatch[1].toUpperCase(), margin, canvas.height - margin - 92 * scale); }
    if (brand) { ctx.font = "600 " + (20 * scale) + "px Arial, sans-serif"; ctx.fillStyle = "#f4d99d"; ctx.fillText(brand, margin, canvas.height - margin + 28 * scale); }
    return canvas.toDataURL("image/jpeg", 0.94);
  }
  $("creative-image-generate")?.addEventListener("click",async()=>{
    if(!ready||!current){setMessage("Generate campaign copy first, then create its artwork.",true);return;}
    const button=$("creative-image-generate"); button.disabled=true;
    setMessage("Generating campaign artwork. This uses the configured image provider and may incur API charges…");
    try{
      const result=await api(base()+"/creative/image",{method:"POST",body:JSON.stringify({
        topic:current.topic,offer:current.offer,creativeBrief:current.designerBrief,
        language:current.language,format:({feed:"SQUARE",portrait:"PORTRAIT",story:"STORY"})[$("creative-format").value]
      })});
      const sourceImage=result.imageDataUrl||"";
      if(!sourceImage) throw new Error("Image provider returned no preview.");
      generatedImageDataUrl=await composeCampaignArtwork(sourceImage);
      const preview=$("creative-image-preview"); preview.src=generatedImageDataUrl; preview.classList.remove("hidden");
      $("creative-image-download").disabled=false; $("creative-image-save").disabled=false;
      setMessage("Artwork generated · clean text layout added by LocalBoost · "+result.model+". Save it to the selected business library to keep it in the cloud.");
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
      const channels = current.format === "story" ? [] : (current.platform === "Instagram + Facebook" ? ["FACEBOOK","INSTAGRAM"] : current.platform === "Instagram" ? ["INSTAGRAM"] : current.platform === "Facebook" ? ["FACEBOOK"] : []);
      const queued = [], skipped = current.format === "story" ? ["Story/Reel publishing is not supported yet; this remains a creative-library draft"] : [];
      for (const channel of channels) {
        if (channel === "INSTAGRAM" && !current.assetId) { skipped.push("Instagram needs a saved JPEG/PNG image"); continue; }
        await api(base()+"/social-posts",{method:"POST",body:JSON.stringify({channel,caption:current.caption,sourceDraftId:current.id,assetId:current.assetId||undefined})});
        queued.push(channel);
      }
      drafts.unshift({...current}); current=null; $("creative-save").disabled=true; $("creative-preview").classList.add("hidden"); $("creative-form").reset(); render();
      setMessage("Draft saved. "+queued.length+" social post(s) added to Approval Centre; nothing has been approved or published."+(skipped.length?" "+skipped.join("; ")+".":""));
    }catch(err){setMessage("Save failed: "+err.message,true);}
  });
  $("creative-library")?.addEventListener("click",async e=>{
    const copy=e.target.dataset.copy, approve=e.target.dataset.approve;
    if(copy!==undefined){const d=drafts[Number(copy)]; if(d) navigator.clipboard?.writeText(d.caption||"").then(()=>setMessage("Caption copied."),()=>setMessage("Copy unavailable in this browser.",true));}
    if(approve!==undefined){const d=drafts[Number(approve)];if(!d||d.status==="REVIEWED")return;const next={...d,status:"REVIEWED",reviewedAt:new Date().toISOString(),approvalNote:"Marked reviewed in the creative library; this is not publishing approval."};try{await api(base()+"/growth-records",{method:"POST",body:JSON.stringify({type:"CAMPAIGN_DRAFT",externalId:d.id,payload:next,recordedAt:next.reviewedAt})});drafts[Number(approve)]=next;render();setMessage("Marked reviewed. Use the separate Approval Centre to approve and manually publish a social post.");}catch(err){setMessage("Approval save failed: "+err.message,true);}}
  });

  async function connectCanva() {
    const button=$("canva-connect");
    if(!button) return;
    button.disabled=true;
    button.textContent="Connecting…";
    try {
      const result=await api(base()+"/canva/connect");
      if(!result?.authorizationUrl || !result.authorizationUrl.startsWith("https://www.canva.com/")) {
        throw new Error("Canva did not return a valid authorisation URL.");
      }
      window.location.assign(result.authorizationUrl);
    } catch(err) {
      setMessage("Canva connection could not start: "+err.message,true);
      button.disabled=false;
      button.textContent="Connect Canva";
    }
  }

  let canvaContinuation = null;
  let canvaSearchTerm = "Paanagam";
  const isPaanagamDesign = design => /paanagam|பானகம்/i.test(String(design?.title || ""));
  const canvaQuery = term => ["Paanagam", String(term || "").trim().replace(/^paanagam\\s*/i, "")].filter(Boolean).join(" ");
  function renderCanvaDesigns(items, append = false) {
    const root = $("canva-design-list");
    if (!root) return;
    const paanagamItems = (items || []).filter(isPaanagamDesign);
    const cards = paanagamItems.map(design => {
      const title = esc(design.title || "Untitled Canva design");
      const thumb = design.thumbnail?.url ? '<img class="creative-card-image" src="' + esc(design.thumbnail.url) + '" alt="' + title + '" loading="lazy">' : "";
      const href = design.urls?.edit_url || design.urls?.view_url || "";
      return '<article class="creative-card">' + thumb + '<h3>' + title + '</h3><small>' + (design.updated_at ? 'Updated ' + esc(new Date(design.updated_at * 1000).toLocaleDateString()) : 'Canva design') + '</small>' + (href ? '<p><a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">Open in Canva ↗</a></p>' : '<small class="footnote">Canva did not provide an open link.</small>') + '</article>';
    }).join("");
    if (append) root.insertAdjacentHTML("beforeend", cards);
    else root.innerHTML = cards || '<p class="empty-copy">No Paanagam designs found. Rename the design in Canva to include “Paanagam” or “பானகம்”, then refresh.</p>';
  }
  function paanagamVisibleCount(items) { return (items || []).filter(isPaanagamDesign).length; }
  async function loadCanvaDesigns({ append = false, query = canvaSearchTerm } = {}) {
    const panel = $("canva-design-library");
    const message = $("canva-design-message");
    if (!panel || !businessId() || !sessionStorage.getItem(TOKEN)) return;
    panel.hidden = false;
    const button = $("canva-design-refresh");
    if (button) button.disabled = true;
    if (message) message.textContent = "Loading designs from Canva…";
    try {
      const params = new URLSearchParams({ limit: "25", ownership: "any", sort_by: "modified_descending" });
      params.set("query", canvaQuery(query));
      if (append && canvaContinuation) params.set("continuation", canvaContinuation);
      const result = await api(base() + "/canva/designs?" + params.toString());
      renderCanvaDesigns(result.items || [], append);
      canvaContinuation = result.continuation || null;
      const more = $("canva-design-more");
      if (more) more.hidden = !canvaContinuation;
      if (message) message.textContent = paanagamVisibleCount(result.items || []) + " Paanagam design(s) loaded.";
    } catch (err) {
      if (message) message.textContent = "Canva designs could not be loaded: " + err.message;
      if (!append) $("canva-design-list").innerHTML = '<p class="empty-copy">Design library unavailable. Check Canva permissions and reconnect if prompted.</p>';
    } finally { if (button) button.disabled = false; }
  }

  async function loadDesignIntegrations() {
    const panel=$("design-integrations-panel");
    if(!panel) return;
    try {
      const response=await fetch(API()+"/v1/creative-integrations/status",{headers:{authorization:"Bearer "+sessionStorage.getItem(TOKEN)}});
      if(!response.ok) { panel.hidden=true; return; }
      const status=await response.json();
      panel.hidden=!status.administrator;
      if(!status.administrator) return;
      $("design-integrations-access").textContent="Administrator access";
      const canva=status.providers?.canva||{}, adobe=status.providers?.adobeExpress||{};
      let canvaConnected=false;
      if(canva.enabled && businessId()) {
        try {
          const connection=await api(base()+"/canva/status");
          canvaConnected=Boolean(connection.connected);
        } catch { canvaConnected=false; }
      }
      $("canva-integration-status").textContent=canvaConnected?"Connected":(canva.configured?"Credentials configured":"Setup required");
      const connectButton=$("canva-connect"), disconnectButton=$("canva-disconnect");
      connectButton.hidden=canvaConnected;
      connectButton.disabled=!canva.enabled;
      connectButton.textContent=canva.enabled?"Connect Canva":"Canva credentials required";
      if(disconnectButton) disconnectButton.hidden=!canvaConnected;
      const designPanel = $("canva-design-library");
      if (designPanel) designPanel.hidden = !canvaConnected;
      if (canvaConnected) await loadCanvaDesigns();
      $("adobe-integration-status").textContent=adobe.configured?"Client ID configured":"Setup / approval required";
      $("adobe-open").disabled=!adobe.enabled;
      $("adobe-open").textContent=adobe.enabled?"Open Adobe Express":"Adobe SDK setup required";
    } catch { panel.hidden=true; }
  }

  $("canva-design-refresh")?.addEventListener("click", () => { canvaContinuation = null; loadCanvaDesigns({ append: false }); });
  $("canva-design-search-button")?.addEventListener("click", () => { canvaSearchTerm = $("canva-design-search")?.value.trim() || "Paanagam"; canvaContinuation = null; loadCanvaDesigns({ append: false, query: canvaSearchTerm }); });
  $("canva-design-search")?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("canva-design-search-button")?.click(); } });
  $("canva-design-more")?.addEventListener("click", () => loadCanvaDesigns({ append: true }));
  $("canva-connect")?.addEventListener("click",connectCanva);
  $("canva-disconnect")?.addEventListener("click",async()=>{
    if(!businessId() || !sessionStorage.getItem(TOKEN)) { setMessage("Sign in and select a business workspace first.",true); return; }
    if(!window.confirm("Disconnect Canva from this business workspace? Stored Canva tokens will be deleted. Your Canva designs will not be changed.")) return;
    const button=$("canva-disconnect"); button.disabled=true; button.textContent="Disconnecting…";
    try {
      await api(base()+"/canva/disconnect",{method:"DELETE"});
      setMessage("Canva disconnected from this business workspace.");
      await loadDesignIntegrations();
    } catch(err) {
      setMessage("Canva disconnect failed: "+err.message,true);
    } finally { button.disabled=false; button.textContent="Disconnect Canva"; }
  });
  window.addEventListener("localboost:business-ready",()=>{load();loadDesignIntegrations();});
  window.addEventListener("localboost:signed-out",()=>{drafts=[];current=null;ready=false;render();setMessage("Signed out. Cloud creative library is locked.");});
  if(businessId()) { load(); loadDesignIntegrations(); }
})();