(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const API = () => (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\/$/, "");
  const TOKEN = "localboost_access_token", BUSINESS = "localboost_business_id";
  const businessId = () => sessionStorage.getItem(BUSINESS), token = () => sessionStorage.getItem(TOKEN);
  const base = () => "/v1/businesses/" + encodeURIComponent(businessId());
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let modelCatalogue = [], generationEnabled = false, pollTimer = null, mediaUrls = [], pendingRefreshInFlight = false;
  async function api(path, options = {}) {
    if (!token() || !businessId()) throw new Error("Sign in and select a business workspace first.");
    const headers = { authorization: "Bearer " + token(), ...(options.body ? {"content-type":"application/json"} : {}), ...(options.headers || {}) };
    const response = await fetch(API() + path, { ...options, headers });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "Request failed (" + response.status + ")");
    return data;
  }
  function message(id, text, error = false) { const el=$(id); if(el){el.textContent=text;el.classList.toggle("error",error);} }
  function selectedVideoModel() { return $("poyo-video-mode")?.value === "IMAGE_TO_VIDEO" ? "wan2.2-image-to-video-fast" : "wan2.2-text-to-video-fast"; }

  function syncCreativeFormat(source) {
    const campaign=$("creative-format"), image=$("poyo-image-size"), video=$("poyo-aspect-ratio");
    const selected=source==="campaign" ? (campaign?.value==="feed"?"1:1":"9:16") :
      source==="image" ? image?.value : video?.value;
    if(!selected)return;
    if(campaign)campaign.value=selected==="1:1"?"feed":"story";
    if(image&&["1:1","9:16","16:9"].includes(selected))image.value=selected;
    if(video&&["1:1","9:16","16:9"].includes(selected))video.value=selected;
  }
  $("creative-format")?.addEventListener("change",()=>syncCreativeFormat("campaign"));
  $("poyo-image-size")?.addEventListener("change",()=>syncCreativeFormat("image"));
  $("poyo-aspect-ratio")?.addEventListener("change",()=>syncCreativeFormat("video"));
  syncCreativeFormat("campaign");
  function renderVideoModels() {
    const select=$("poyo-model-id"); if(!select)return;
    const rows=modelCatalogue.filter(m=>m.mediaType==="VIDEO"), selected=selectedVideoModel();
    select.innerHTML=rows.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+'</option>').join("")||'<option value="">WAN models unavailable</option>';
    select.value=rows.some(m=>m.id===selected)?selected:(rows[0]?.id||"");
    const imageMode=$("poyo-video-mode")?.value==="IMAGE_TO_VIDEO";
    if($("poyo-image-urls-wrap"))$("poyo-image-urls-wrap").hidden=!imageMode;
    if($("poyo-aspect-wrap"))$("poyo-aspect-wrap").hidden=imageMode;
  }
  async function loadModels() {
    if(!businessId()||!token())return;
    try {
      const [video,image]=await Promise.all([
        api("/v1/creative-integrations/poyo/models?mediaType=VIDEO"),
        api("/v1/creative-integrations/poyo/models?mediaType=IMAGE")
      ]);
      modelCatalogue=[...(video.models||[]),...(image.models||[])];
      generationEnabled=Boolean(video.generationEnabled||image.generationEnabled);
      const root=$("poyo-model-list");
      if(root)root.innerHTML=modelCatalogue.map(m=>{
        const isImage=m.mediaType==="IMAGE";
        const cost=isImage?"1K / 2K / 4K · 4 / 6 / 10 credits (estimated)":"480p · 6 credits (estimated)";
        return '<article class="metric-card"><div class="metric-top"><strong>'+esc(m.name)+'</strong><span class="tag '+(generationEnabled?"confirmed":"pending-tag")+'">'+(generationEnabled?"Configured":"Paused")+'</span></div><p>'+esc(m.provider)+' · '+esc((m.resolutions||[]).join(" / "))+'</p><p>'+esc((m.useCases||[]).join(" · "))+'</p><strong>'+cost+'</strong><p><a href="'+esc(m.documentationUrl)+'" target="_blank" rel="noopener noreferrer">PoYo model documentation</a></p></article>';
      }).join("")||'<p class="empty-copy">PoYo models unavailable.</p>';
      renderVideoModels();
      message("poyo-generation-state",generationEnabled?"PoYo is configured. Image and video generations use paid credits and require an administrator account.":"Drafts and previews are available. Paid generation is paused by the POYO_ENABLED safety flag.");
    } catch(e){message("poyo-studio-message","PoYo model catalogue unavailable: "+e.message,true);}
  }
  function revokeMediaUrls(){mediaUrls.forEach(url=>URL.revokeObjectURL(url));mediaUrls=[];}
  async function hydrateMedia() {
    for(const node of document.querySelectorAll("#poyo-task-list video[data-media-path],#poyo-image-task-list img[data-media-path]")){
      if(node.dataset.loaded==="true")continue; node.dataset.loaded="true";
      try{
        const response=await fetch(API()+node.dataset.mediaPath,{headers:{authorization:"Bearer "+token()}});
        if(!response.ok)throw new Error("Preview unavailable");
        const url=URL.createObjectURL(await response.blob());mediaUrls.push(url);
        if(node.isConnected)node.src=url;else URL.revokeObjectURL(url);
      }catch{node.dataset.loaded="error";}
    }
  }
  async function loadTasks({refreshPending=false}={}) {
    if(!businessId()||!token())return;
    try{
      let result=await api(base()+"/poyo/tasks"), tasks=result.tasks||[];
      if(refreshPending && !pendingRefreshInFlight){
        pendingRefreshInFlight=true;
        try{
          const pending=tasks.filter(t=>["SUBMITTED","PROCESSING"].includes(t.status));
          for(const task of pending){try{await api(base()+"/poyo/tasks/"+encodeURIComponent(task.id)+"/refresh",{method:"POST",body:"{}"});}catch{}}
          if(pending.length){result=await api(base()+"/poyo/tasks");tasks=result.tasks||[];}
        }finally{pendingRefreshInFlight=false;}
      }
      revokeMediaUrls();
      const renderTask=t=>{
        const pending=["SUBMITTED","PROCESSING"].includes(t.status), approved=Boolean(t.approvedAt);
        const preview=(t.outputUrls||[]).find(url=>typeof url==="string"&&url.includes("/poyo/assets/"));
        const isImage=t.mediaType==="IMAGE", resolution=isImage?(t.modelInput?.resolution||"2K"):"480p", assetId=preview?.split("/poyo/assets/")[1]?.split("/")[0]||"";
        const cost=t.estimatedCredits??(isImage?(resolution==="1K"?4:resolution==="4K"?10:6):6);
        const media=preview?(isImage?'<img alt="Generated campaign artwork preview" data-media-path="'+esc(preview)+'" style="display:block;width:100%;max-height:480px;object-fit:contain;margin-top:12px;border-radius:12px;background:#f3f0e9">':'<video controls playsinline preload="metadata" data-media-path="'+esc(preview)+'" style="display:block;width:100%;max-height:420px;margin-top:12px;border-radius:12px;background:#111"></video>'):"";
        return '<article class="social-post-card"><div class="social-post-head"><strong>'+esc(t.modelId)+'</strong><span class="tag '+(t.status==="SUCCEEDED"?"confirmed":"pending-tag")+'">'+esc(t.status)+'</span></div><p>'+esc(t.prompt)+'</p><small>'+esc(resolution)+' · '+esc(cost)+' estimated credits · '+esc(new Date(t.createdAt).toLocaleString())+'</small>'+media+(t.errorMessage?'<p class="footnote">'+esc(t.errorMessage)+'</p>':"")+'<div class="form-actions">'+(t.status==="DRAFT"?'<button type="button" class="secondary-button" data-generate="'+esc(t.id)+'" data-kind="'+(isImage?"image":"video")+'"'+(generationEnabled?"":" disabled title="Paid generation is paused."")+'">Generate '+(isImage?"image":"video")+' · '+esc(cost)+' credits</button>':"")+(pending?'<button type="button" class="secondary-button" data-refresh="'+esc(t.id)+'">Check status</button>':"")+(t.status==="SUCCEEDED"&&!approved?'<button type="button" class="secondary-button" data-approve="'+esc(t.id)+'" data-kind="'+(isImage?"image":"video")+'">Approve '+(isImage?"image":"video")+'</button>':"")+(approved?'<span class="tag confirmed">Owner approved · not published</span>':"")+(isImage&&t.status==="SUCCEEDED"&&assetId?'<button type="button" class="secondary-button" data-use-campaign="'+esc(assetId)+'" data-prompt="'+esc(t.prompt)+'">Use in campaign</button>':"")+'</div></article>';
      };
      const videos=tasks.filter(t=>t.mediaType==="VIDEO"), images=tasks.filter(t=>t.mediaType==="IMAGE");
      if($("poyo-task-list"))$("poyo-task-list").innerHTML=videos.map(renderTask).join("")||'<p class="empty-copy">No PoYo video drafts yet.</p>';
      if($("poyo-image-task-list"))$("poyo-image-task-list").innerHTML=images.map(renderTask).join("")||'<p class="empty-copy">No Nano Banana image drafts yet.</p>';
      await hydrateMedia();
      const hasPending=tasks.some(t=>["SUBMITTED","PROCESSING"].includes(t.status));
      if(hasPending&&!pollTimer)pollTimer=setInterval(()=>loadTasks({refreshPending:true}),10000);
      if(!hasPending&&pollTimer){clearInterval(pollTimer);pollTimer=null;}
    }catch(e){message("poyo-studio-message","PoYo jobs unavailable: "+e.message,true);}
  }
  $("poyo-video-mode")?.addEventListener("change",renderVideoModels);
  $("poyo-draft-form")?.addEventListener("submit",async e=>{
    e.preventDefault();const button=$("poyo-save-draft");if(!button)return;button.disabled=true;
    try{
      const mode=$("poyo-video-mode").value,modelId=selectedVideoModel(),prompt=$("poyo-prompt").value.trim();
      if(!prompt||prompt.length>800)throw new Error("Enter a prompt of up to 800 characters.");
      const modelInput={resolution:"480p"};
      if(mode==="TEXT_TO_VIDEO")modelInput.aspect_ratio=$("poyo-aspect-ratio").value;
      else{const urls=$("poyo-image-urls").value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);if(urls.length<1||urls.length>2||!urls.every(v=>/^https:\/\//i.test(v)))throw new Error("Enter one or two publicly accessible HTTPS image URLs.");modelInput.image_urls=urls;}
      await api(base()+"/poyo/tasks",{method:"POST",body:JSON.stringify({mediaType:"VIDEO",modelId,prompt,modelInput})});
      $("poyo-prompt").value="";if($("poyo-image-urls"))$("poyo-image-urls").value="";
      await loadTasks();message("poyo-studio-message","Video draft saved. No PoYo request was sent and no credits were used.");
    }catch(err){message("poyo-studio-message","Could not save video draft: "+err.message,true);}finally{button.disabled=false;}
  });
  $("poyo-image-form")?.addEventListener("submit",async e=>{
    e.preventDefault();const button=$("poyo-image-save");if(!button)return;button.disabled=true;
    try{
      const prompt=$("poyo-image-prompt").value.trim(),resolution=$("poyo-image-resolution").value;
      if(!prompt||prompt.length>4000)throw new Error("Image prompt must be between 1 and 4,000 characters.");
      const urls=$("poyo-image-refs").value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
      if(urls.length>10||!urls.every(v=>/^https:\/\//i.test(v)))throw new Error("Use up to 10 publicly accessible HTTPS reference URLs.");
      const modelInput={size:$("poyo-image-size").value,resolution,...(urls.length?{image_urls:urls}:{})};
      const result=await api(base()+"/poyo/tasks",{method:"POST",body:JSON.stringify({mediaType:"IMAGE",modelId:"nano-banana-2.1",prompt,modelInput})});
      const taskId=result.task?.id;
      if(!taskId)throw new Error("LocalBoost did not return a saved image draft ID.");
      const keepPrompt=$("poyo-image-form")?.dataset.keepPromptAfterSave === "true";
      if(!keepPrompt){$("poyo-image-prompt").value="";$("poyo-image-refs").value="";}
      if($("poyo-image-form")) delete $("poyo-image-form").dataset.keepPromptAfterSave;
      await loadTasks();
      message("poyo-image-message","Image prompt saved as a draft. No provider request was sent and no credits were used. Review it, then click Generate image on the saved task when ready.");\n\\n");
      }
      const topic=String(d.topic||"Paanagam café campaign").trim();
      const brief=String(d.designerBrief||d.brief||"").trim();
      const headline=String(d.headline||"").trim();
      const facts=String(d.offer||"").trim();
      const caption=String(d.caption||"").trim();
      const coffee=/coffee|filter|காபி|காபியும்/i.test(topic+" "+brief);
      const lines=[
        "Create a premium, photorealistic commercial food-and-beverage campaign photograph for PAANAGAM (பானகம்), an authentic South Indian café.",
        "CAMPAIGN SUBJECT: "+topic+".",
        headline?"CAMPAIGN CREATIVE DIRECTION (not text to render): "+headline:"",
        brief?"ART DIRECTION: "+brief:"",
        coffee?"HERO SUBJECT: One authentic South Indian stainless-steel filter-coffee tumbler with matching dabarah, filled with freshly brewed filter coffee. Show a realistic coffee surface, delicate natural steam and true-to-life stainless-steel reflections. Keep the tumbler and dabarah correctly shaped, proportional, clean and fully visible.":"HERO SUBJECT: Depict only the exact product, food or experience specified in the campaign brief. Preserve realistic proportions, ingredients, serving ware and material textures. Do not add unmentioned products or props.",
        "COMPOSITION: Vertical 9:16 portrait social creative. Professional three-quarter close-up at natural table height. One clear hero subject, visually dominant and tack-sharp. Place the subject around the central-lower area with balanced breathing room around it. Keep all important objects fully inside the frame; no accidental cropping. Use deliberate foreground, middle-ground and softly separated background.",
        "CAMERA: Premium full-frame commercial food photography, 50mm or 85mm lens perspective, natural optical depth of field, crisp fine detail on the hero subject, realistic perspective and no wide-angle distortion.",
        "LIGHTING: Soft directional early-morning window light from one side, warm natural highlights, controlled shadows, accurate white balance, subtle atmospheric depth and physically realistic reflections. Steam, if present, must look delicate and natural, never exaggerated.",
        "PAANAGAM ART DIRECTION: Warm mustard-yellow accents, warm ivory, dark walnut and restrained earthy tones. Welcoming, authentic South Indian café mood; premium but approachable for a Tamil Nadu neighbourhood audience. Use understated rustic café context, never a cluttered set.",
        "BACKGROUND: Tasteful café environment softly out of focus. Keep it quiet and low contrast so it cannot compete with the hero subject. No unrelated objects, busy patterns or distracting signage.",
        "IMAGE QUALITY: Extremely crisp, high-detail, photorealistic commercial advertising image; realistic food texture, metal, liquid, light and shadow; clean professional retouching; natural colour grading; balanced exposure; high dynamic range; 2K output.",
        "LAYOUT RULE: Do not render any words, letters, Tamil or English typography, captions, slogans, prices, offers, dates, logos, badges, watermarks, labels or UI. Leave clean negative space for LocalBoost to add approved brand text later as editable design layers.",
        "STRICT NEGATIVE INSTRUCTIONS: No people, hands or faces unless explicitly requested in the brief; no duplicate cups or products; no malformed utensils; no floating objects; no extra ingredients; no fake brand marks; no cartoon, illustration, 3D render, plastic CGI appearance, oversharpening, artificial steam, blur on the hero subject, distorted geometry or invented claims.",
        facts?"VERIFIED CAMPAIGN FACTS FOR CONTEXT ONLY (do not render as text or invent beyond these): "+facts:"",
        caption?"SEPARATE SOCIAL CAPTION CONTEXT — NOT IMAGE TEXT; do not write or render this caption in the image: "+caption:"",
        "FINAL INTENT: A single striking, authentic, premium Paanagam campaign photograph that looks captured by an experienced professional food-advertising photographer."
      ].filter(Boolean);
      return lines.join("\n\n");
    };
    imageStyle.addEventListener("change",()=>{
      if(!lastCampaignImageBrief||!imagePromptField)return;
      imagePromptField.value=buildPaanagamImagePrompt(lastCampaignImageBrief);
      imagePromptField.dispatchEvent(new Event("input",{bubbles:true}));
    });
    window.addEventListener("localboost:campaign-copy-ready",async event=>{
      const d=event.detail||{}, imagePrompt=document.getElementById("poyo-image-prompt"), imageSize=document.getElementById("poyo-image-size"), resolution=document.getElementById("poyo-image-resolution"), form=document.getElementById("poyo-image-form");
      if(!imagePrompt||!form||!d.topic)return;
      lastCampaignImageBrief=d;
      imagePrompt.value=buildPaanagamImagePrompt(d);
      imagePrompt.dispatchEvent(new Event("input",{bubbles:true}));
      const preview=document.getElementById("creative-preview");
      if(preview){
        let label=document.getElementById("creative-matched-prompt-label");
        let paired=document.getElementById("creative-matched-image-prompt");
        if(!label){label=document.createElement("label");label.id="creative-matched-prompt-label";label.htmlFor="creative-matched-image-prompt";label.textContent="Matching image prompt · edit before generation";preview.appendChild(label);}
        if(!paired){paired=document.createElement("textarea");paired.id="creative-matched-image-prompt";paired.rows=8;paired.maxLength=4000;paired.style.width="100%";preview.appendChild(paired);}
        paired.value=imagePrompt.value;
        paired.oninput=()=>{imagePrompt.value=paired.value;imagePrompt.dispatchEvent(new Event("input",{bubbles:true}));};
      }
      if(imageSize)imageSize.value=d.format==="feed"?"1:1":"9:16";
      if(resolution)resolution.value="2K";
      /* Prompt is prepared for owner review; image task creation/generation requires an explicit owner click. */
    });
    const syncCampaignBriefToImagePrompt=()=>{
      const brief=document.getElementById("creative-preview-brief")?.textContent?.trim();
      const imagePrompt=document.getElementById("poyo-image-prompt");
      if(brief&&imagePrompt){
        const currentTopic=document.getElementById("creative-topic")?.value?.trim()||"Paanagam café campaign";
        imagePrompt.value=buildPaanagamImagePrompt({topic:currentTopic,designerBrief:brief});
        imagePrompt.dispatchEvent(new Event("input",{bubbles:true}));
      }
    };
    /* PoYo image selection is handled once by Campaign Studio. */
    routeCampaignOutput();
    if(campaignPreview&&typeof MutationObserver!=="undefined"){
      const previewObserver=new MutationObserver(()=>{routeCampaignOutput();});
      previewObserver.observe(campaignPreview,{attributes:true,attributeFilter:["class"]});
    }
    if(videoForm&&videoPrompt){
      const useBrief=document.createElement("button");
      useBrief.type="button";useBrief.className="secondary-button lb-use-campaign-brief";
      useBrief.textContent="Use campaign brief in video prompt";
      useBrief.addEventListener("click",()=>{
        const brief=document.getElementById("creative-preview-brief")?.textContent?.trim();
        if(!brief){const msg=document.getElementById("poyo-studio-message");if(msg)msg.textContent="Generate campaign copy first to use its image brief.";return;}
        videoPrompt.value="Create a cinematic Paanagam video based on this approved campaign visual direction. "+brief+" Keep any text, menu facts and prices as editable overlays; do not invent product claims.";
        videoPrompt.dispatchEvent(new Event("input",{bubbles:true}));
        videoPrompt.focus();
      });
      videoPrompt.insertAdjacentElement("beforebegin",useBrief);
    }
    const imageJobs=image?.querySelector("#poyo-image-task-list")?.closest(".panel-heading")?.parentElement;
    const videoJobs=document.getElementById("poyo-task-list")?.closest(".panel");
    const integrations=document.getElementById("design-integrations-panel");
    const meta=root.querySelector(".meta-connection-panel");
    if(!campaign||!image||!videoForm||!videoJobs)return;
    root.dataset.guidedStudio="ready";

    const nav=document.createElement("div");
    nav.className="lb-studio-nav";
    nav.setAttribute("role","tablist");
    nav.setAttribute("aria-label","Content studio sections");
    const panes=document.createElement("div");
    panes.className="lb-studio-panes";
    const specs=[
      ["campaign","Campaign post",campaign],
      ["image","Create image",imageCreate],
      ["video","Create video",videoForm],
      ["library","Saved work",null],
      ["settings","Connections",null]
    ];
    const paneMap={};
    specs.forEach(([id,label,node],index)=>{
      const pane=document.createElement("section");
      pane.className="lb-studio-pane";
      pane.id="lb-studio-"+id;
      pane.hidden=index!==1;
      if(node)pane.appendChild(node);
      paneMap[id]=pane;
      panes.appendChild(pane);
      const tab=document.createElement("button");
      tab.type="button";tab.className="lb-studio-tab";
      tab.textContent=label;tab.setAttribute("role","tab");
      tab.setAttribute("aria-controls",pane.id);
      tab.setAttribute("aria-selected",index===1?"true":"false");
      tab.addEventListener("click",()=>{
        Object.entries(paneMap).forEach(([key,p])=>p.hidden=key!==id);
        nav.querySelectorAll("button").forEach(b=>b.setAttribute("aria-selected",b===tab?"true":"false"));
      });
      nav.appendChild(tab);
    });

    /* Keep provider catalogue available, but out of the everyday creation flow. */
    const modelList=document.getElementById("poyo-model-list");
    const advanced=document.createElement("details");
    advanced.className="lb-studio-advanced";
    const summary=document.createElement("summary");
    summary.textContent="Advanced · AI models, providers and estimated credits";
    advanced.append(summary);
    if(modelList)advanced.append(modelList);
    engine.insertBefore(advanced,engine.children[2]||null);

    const library=paneMap.library;
    const savedCopy=document.createElement("p");
    savedCopy.className="lb-studio-note";
    savedCopy.textContent="Your saved campaign drafts and generated previews. Nothing is published from this screen.";
    library.append(savedCopy);
    const creativeLibrary=campaign.querySelector("#creative-library")?.closest(".panel");
    if(creativeLibrary)library.append(creativeLibrary);
    library.append(videoJobs);

    const settings=paneMap.settings;
    const settingsCopy=document.createElement("p");
    settingsCopy.className="lb-studio-note";
    settingsCopy.textContent="Connect social accounts and optional design tools here. Publishing still requires separate approval.";
    settings.append(settingsCopy);
    if(integrations)settings.append(integrations);
    if(meta)settings.append(meta);
    settings.append(advanced);

    /* Move the existing content into one simple navigation without cloning IDs. */
    const heading=root.querySelector(".section-heading");
    if(heading)heading.insertAdjacentElement("afterend",nav);
    nav.insertAdjacentElement("afterend",panes);

    /* The engine wrapper now only carries advanced provider information. */
    engine.querySelector(".panel-heading")?.remove();
    const generationState=document.getElementById("poyo-generation-state");
    if(generationState)advanced.append(generationState);
    engine.hidden=true;
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setupContentStudio,{once:true});
  else setupContentStudio();
})();