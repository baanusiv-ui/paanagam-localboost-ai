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
        return '<article class="social-post-card"><div class="social-post-head"><strong>'+esc(t.modelId)+'</strong><span class="tag '+(t.status==="SUCCEEDED"?"confirmed":"pending-tag")+'">'+esc(t.status)+'</span></div><p>'+esc(t.prompt)+'</p><small>'+esc(resolution)+' · '+esc(cost)+' estimated credits · '+esc(new Date(t.createdAt).toLocaleString())+'</small>'+media+(t.errorMessage?'<p class="footnote">'+esc(t.errorMessage)+'</p>':"")+'<div class="form-actions">'+(t.status==="DRAFT"?'<button type="button" class="secondary-button" data-generate="'+esc(t.id)+'" data-kind="'+(isImage?"image":"video")+'"'+(generationEnabled?"":" disabled title=\"Paid generation is paused.\"")+'">Generate '+(isImage?"image":"video")+' · '+esc(cost)+' credits</button>':"")+(pending?'<button type="button" class="secondary-button" data-refresh="'+esc(t.id)+'">Check status</button>':"")+(t.status==="SUCCEEDED"&&!approved?'<button type="button" class="secondary-button" data-approve="'+esc(t.id)+'" data-kind="'+(isImage?"image":"video")+'">Approve '+(isImage?"image":"video")+'</button>':"")+(approved?'<span class="tag confirmed">Owner approved · not published</span>':"")+(isImage&&t.status==="SUCCEEDED"&&assetId?'<button type="button" class="secondary-button" data-use-campaign="'+esc(assetId)+'" data-prompt="'+esc(t.prompt)+'">Use in campaign</button>':"")+'</div></article>';
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
      if(!result.task?.id)throw new Error("LocalBoost did not return a saved image draft ID.");
      await loadTasks();
      message("poyo-image-message","Image prompt saved as a draft. No provider request was sent and no credits were used. Review it, then click Generate image on the saved task when ready.");
    }catch(err){message("poyo-image-message","Could not save image draft: "+err.message,true);}
    finally{button.disabled=false;}
  });

  async function handleTaskAction(e){
    const button=e.target.closest("button");if(!button)return;
    const generate=button.dataset.generate,approve=button.dataset.approve,refresh=button.dataset.refresh,useCampaign=button.dataset.useCampaign,id=generate||approve||refresh;if(useCampaign){window.dispatchEvent(new CustomEvent("localboost:poyo-asset-selected",{detail:{assetId:useCampaign,prompt:button.dataset.prompt||""}}));message("poyo-image-message","Saved image handed to Campaign Studio. Review the generated caption before saving.");return;}if(!id)return;
    button.disabled=true;const kind=button.dataset.kind||"video",noun=kind==="image"?"image":"video";
    try{
      if(generate){
        if(!generationEnabled)throw new Error("Paid generation is paused.");
        const result=await api(base()+"/poyo/tasks/"+encodeURIComponent(id)+"/submit",{method:"POST",body:"{}"});
        message(kind==="image"?"poyo-image-message":"poyo-studio-message","PoYo "+noun+" job submitted. Estimated cost: "+(result.estimatedCredits??"not supplied")+" credits. Waiting for preview…");
      }else if(approve){
        await api(base()+"/poyo/tasks/"+encodeURIComponent(id)+"/approve",{method:"POST",body:"{}"});
        message(kind==="image"?"poyo-image-message":"poyo-studio-message","Owner approval recorded. The "+noun+" has not been published.");
      }else{
        await api(base()+"/poyo/tasks/"+encodeURIComponent(id)+"/refresh",{method:"POST",body:"{}"});
        message(kind==="image"?"poyo-image-message":"poyo-studio-message",noun+" job status refreshed.");
      }
      // The action above already submitted/refreshed this task. Fetch saved task state only;
      // do not immediately call the provider status endpoint a second time (PoYo rate-limits it).
      await loadTasks();
    }catch(err){message(kind==="image"?"poyo-image-message":"poyo-studio-message","PoYo action failed: "+err.message,true);}finally{if(button.isConnected)button.disabled=false;}
  }
  $("poyo-task-list")?.addEventListener("click",handleTaskAction);
  $("poyo-image-task-list")?.addEventListener("click",handleTaskAction);
  $("poyo-refresh")?.addEventListener("click",()=>loadTasks({refreshPending:true}));
  $("poyo-image-refresh")?.addEventListener("click",()=>loadTasks({refreshPending:true}));
  async function init(){if(!businessId()||!token())return;await loadModels();await loadTasks({refreshPending:true});}
  window.addEventListener("localboost:business-ready",init);
  window.addEventListener("localboost:signed-out",()=>{
    if(pollTimer){clearInterval(pollTimer);pollTimer=null;}revokeMediaUrls();
    if($("poyo-task-list"))$("poyo-task-list").innerHTML='<p class="empty-copy">Sign in to view PoYo video jobs.</p>';
    if($("poyo-image-task-list"))$("poyo-image-task-list").innerHTML='<p class="empty-copy">Sign in to view image jobs.</p>';
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

/* Guided Content Studio navigation. Existing feature nodes are moved, not rebuilt,
   so their original event handlers, IDs, forms and approval safeguards remain intact. */
(() => {
  "use strict";
  function setupContentStudio() {
    const root=document.getElementById("content-view");
    const engine=document.getElementById("poyo-creative-panel");
    if(!root||!engine||root.dataset.guidedStudio==="ready")return;
    const campaign=root.querySelector(".creative-layout");
    const image=document.getElementById("poyo-image-panel");
    const videoForm=engine.querySelector("#poyo-draft-form")?.closest(".panel");
    const videoJobs=document.getElementById("poyo-task-list")?.closest(".panel");
    if(!campaign||!image||!videoForm||!videoJobs)return;
    const distributionSettings=document.getElementById("content-distribution-settings");
    const imageCreate=document.createElement("div");imageCreate.className="panel";
    const imageHeader=image?.querySelector(".panel-heading");
    const imageForm=image?.querySelector("#poyo-image-form");
    const imageMessage=document.getElementById("poyo-image-message");
    const campaignPreview=document.getElementById("creative-preview");
    const campaignForm=document.getElementById("creative-form");
    const campaignOutput=document.createElement("label");
    campaignOutput.className="lb-campaign-output-choice";
    campaignOutput.htmlFor="creative-output-type";
    campaignOutput.innerHTML='Create as<select id="creative-output-type"><option value="image">Image</option><option value="video">Video</option></select>';
    if(campaignForm){
      const generateButton=campaignForm.querySelector("#creative-generate");
      if(generateButton)generateButton.insertAdjacentElement("beforebegin",campaignOutput);
      else campaignForm.append(campaignOutput);
    }
    if(imageHeader)imageCreate.append(imageHeader);
    if(imageForm)imageCreate.append(imageForm);
    if(imageMessage)imageCreate.append(imageMessage);
    const imageOutputTitle=document.createElement("h3");
    imageOutputTitle.textContent="Campaign copy & image artwork";
    imageOutputTitle.className="lb-studio-output-title";
    imageCreate.append(imageOutputTitle);
    const videoOutputTitle=document.createElement("h3");
    videoOutputTitle.textContent="Campaign copy & video brief";
    videoOutputTitle.className="lb-studio-output-title";
    if(campaignPreview)campaignPreview.hidden=true;
    const imageJobsPanel=document.createElement("div");imageJobsPanel.className="panel";
    const imageJobsHeader=document.createElement("div");imageJobsHeader.className="panel-heading";
    imageJobsHeader.innerHTML='<div><h3>Image generation queue</h3><p>Generate and review campaign images here. Paid generation starts only when you press Generate.</p></div>';
    const imageJobsList=document.getElementById("poyo-image-task-list");
    imageJobsPanel.append(imageJobsHeader);if(imageJobsList)imageJobsPanel.append(imageJobsList);
    /* Keep the task cards and their Generate actions beside the image prompt. */
    imageCreate.append(imageJobsPanel);
    const videoPrompt=videoForm.querySelector("#poyo-prompt");
    const outputType=document.getElementById("creative-output-type");
    const routeCampaignOutput=(activate=false)=>{
      if(!campaignPreview)return;
      const target=outputType?.value==="video"&&videoForm?videoForm:imageCreate;
      const title=target===videoForm?videoOutputTitle:imageOutputTitle;
      target.append(title,campaignPreview);
      campaignPreview.hidden=campaignPreview.classList.contains("hidden");
      campaignPreview.classList.toggle("lb-video-campaign-output",target===videoForm);
      /* After a successful copy-generation submit, open the destination tab.
         The preview remains in the selected pane; this makes the move visible
         instead of leaving the result inside a hidden tab. */
      if(activate){
        const destination=target===videoForm?"Create video":"Create image";
        const tab=[...root.querySelectorAll(".lb-studio-tab")].find(button=>button.textContent===destination);
        if(tab)tab.click();
      }
    };
    if(outputType)outputType.addEventListener("change",()=>routeCampaignOutput(false));
    if(campaignForm){
      campaignForm.addEventListener("submit",()=>{
        window.setTimeout(()=>routeCampaignOutput(true),0);
      });
    }
    let lastCampaignImageBrief = null;
    const imageStyleLabel=document.createElement("label");
    imageStyleLabel.className="lb-image-style-choice";
    imageStyleLabel.htmlFor="poyo-image-style";
    imageStyleLabel.textContent="Artwork style preset";
    const imageStyle=document.createElement("select");
    imageStyle.id="poyo-image-style";
    imageStyle.innerHTML='<option value="photo">Premium café product photography</option><option value="cute-cups">Cute illustrated tea & coffee characters</option>';
    imageStyleLabel.appendChild(imageStyle);
    const imagePromptField=document.getElementById("poyo-image-prompt");
    const presetImageForm=document.getElementById("poyo-image-form");

    const randomCreativeButton=document.createElement("button");
    randomCreativeButton.type="button";
    randomCreativeButton.className="secondary-button";
    randomCreativeButton.textContent="✦ Surprise me · Random creative prompt";
    randomCreativeButton.title="Create a fresh commercial art direction without generating an image or spending credits";
    imageStyleLabel.insertAdjacentElement("afterend",randomCreativeButton);
    const promptLabel=imagePromptField?.closest("label");
    if(promptLabel)promptLabel.insertAdjacentElement("beforebegin",imageStyleLabel);
    else if(presetImageForm)presetImageForm.insertBefore(imageStyleLabel,presetImageForm.firstChild);
    const buildPaanagamImagePrompt = (d={}) => {
      const selectedStyle=document.getElementById("poyo-image-style")?.value||"photo";
      if(selectedStyle==="cute-cups"){
        const topic=String(d.topic||"Tea and coffee moments at Paanagam").trim();
        const facts=String(d.offer||"").trim();
        return [
          "Create a delightful, premium-quality, cute illustrated social-media campaign image for PAANAGAM (பானகம்), a South Indian tea and coffee café.",
          "MAIN SCENE: Two adorable anthropomorphic drink cups sitting side by side on a warm wooden café counter: one transparent glass cup filled with rich amber South Indian tea, and one elegant ivory ceramic cup filled with creamy South Indian filter coffee with a beautiful latte-art heart. Give both cups expressive friendly cartoon faces, sparkling eyes, joyful smiles and tiny simple arms. The cups should feel charming, wholesome and instantly lovable, like polished character illustration for a family-friendly café brand.",
          "REFERENCE STYLE: Match the visual language of a cheerful café greeting-card illustration: hand-painted warm wooden hanging sign, soft golden bokeh lights, lush subtle green leaves, coffee beans scattered naturally, small heart doodles and delicate steam curls. Rich warm colours, inviting depth and a polished, highly shareable Instagram aesthetic.",
          "PAANAGAM BRAND PALETTE: mustard yellow, warm ivory, deep coffee brown, leaf green and restrained red accents. Keep the atmosphere rooted in a welcoming South Indian neighbourhood café, not a generic western coffee chain.",
          "COMPOSITION: Portrait 9:16 Instagram Reel cover. Place the two friendly drink characters in the lower-middle foreground, large and clearly visible, with balanced breathing room. Include a tasteful blank wooden signboard near the top and small blank message cards held by the cups, with absolutely no writing on them. Keep every important object fully inside the frame.",
          "ILLUSTRATION QUALITY: Beautifully rendered 2D-meets-3D storybook illustration, soft painterly textures, rounded appealing shapes, warm cinematic lighting, glossy but believable tea and coffee surfaces, crisp edges, expressive faces, professional commercial character design. Cute, not childish or cluttered.",
          "CAMPAIGN SUBJECT: "+topic+".",
          facts?"FACTS FOR CONTEXT ONLY (do not write these into the image): "+facts:"",
          "TEXT CONTROL: Do not generate any text, letters, Tamil or English characters, numbers, logos, watermarks, labels or fake brand marks. Keep the signboard and cards completely blank so LocalBoost can add correct Tamil and English copy as editable text later.",
          "STRICT NEGATIVE INSTRUCTIONS: No misspelled text, pseudo-letters, gibberish, extra cups, duplicate faces, malformed hands, extra limbs, distorted handles, spills, unrelated food, photorealistic human faces, dark horror mood, clutter, stock-photo watermark or UI elements.",
          "FINAL INTENT: A heartwarming, instantly recognisable Tea & Coffee character illustration that makes viewers smile and feels distinctive to Paanagam."
        ].filter(Boolean).join("\\n\\n");
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

    const pickRandom=(items)=>items[Math.floor(Math.random()*items.length)];
    const buildRandomCommercialPrompt=(d={})=>{
      const shop=String(d.businessName||d.shopName||d.brandName||"PAANAGAM (பானகம்)").trim();
      const topic=String(d.topic||"Paanagam café campaign").trim();
      const caption=String(d.caption||"").trim();
      const brief=String(d.designerBrief||d.brief||"").trim();
      const subject=topic||"the exact featured Paanagam product";
      const concepts=[
        {name:"Signature filter-coffee hero",kind:"product",scene:"A freshly poured South Indian filter coffee in a traditional stainless-steel tumbler and dabarah, captured at the exact moment a silky stream settles into the cup. Show delicate steam, crema-like bubbles and authentic metal reflections. Coffee is the unmistakable hero."},
        {name:"Coffee bean and decoction story",kind:"ingredient",scene:"An art-directed ingredient story showing roasted coffee beans, freshly ground coffee, a traditional South Indian metal filter and a small glass of rich decoction arranged in a tactile, editorial still life. Every ingredient and tool is realistic and purposeful."},
        {name:"Iced coffee refreshment",kind:"product",scene:"A chilled coffee in a clear elegant glass, beads of condensation, visible ice and creamy coffee layers, photographed in bright natural light with a restrained café background. Make the drink look genuinely cold, refreshing and delicious."},
        {name:"Tea pour moment",kind:"product",scene:"A dramatic yet authentic South Indian tea-pouring moment into a glass or traditional cup, with a graceful amber tea stream, delicate natural movement and warm highlights. Keep the vessel and liquid physically believable."},
        {name:"Kulhad chai product portrait",kind:"product",scene:"A rustic earthen kulhad filled with rich steaming chai, tactile clay texture, subtle tea surface detail and a softly blurred tea-garden-inspired setting. The cup is the single hero."},
        {name:"Food menu hero",kind:"food",scene:"A mouth-watering editorial food photograph of the exact dish in the campaign brief, served in appropriate South Indian tableware. Show realistic texture, appetising detail and a carefully styled but restrained garnish. Do not add dishes that were not specified."},
        {name:"Crispy snack close-up",kind:"food",scene:"An extreme appetising close-up of the exact snack or fried item in the brief, showing crisp golden texture, delicate crumbs and natural highlights. Use authentic serving paper or a simple plate, never a cluttered spread."},
        {name:"Combo meal overhead",kind:"food",scene:"A beautifully organised overhead food composition of the exact combo specified in the brief. Each component is clearly visible in its own realistic serving vessel, with balanced spacing and an inviting South Indian meal aesthetic. Do not invent extra items."},
        {name:"Packaging and takeaway identity",kind:"packaging",scene:"A premium product-packaging visualisation for the featured Paanagam item: thoughtfully designed takeaway cup, food box or carry bag with realistic paper, print, folds and closures. Use the brand palette and reserve a clean logo placement; do not invent product claims."},
        {name:"New product launch key visual",kind:"campaign",scene:"A high-impact launch-campaign key visual built around one unmistakable hero product. Use a bold focal point, expressive lighting, confident negative space and a refined visual metaphor that makes the product feel new and desirable."},
        {name:"Limited-time offer creative",kind:"campaign",scene:"A polished promotional art direction for a limited-time café offer, with the featured product as the hero and a clear uncluttered area reserved for editable offer copy, price and dates. Do not invent or render any offer details."},
        {name:"Festival and seasonal campaign",kind:"campaign",scene:"A tasteful South Indian seasonal celebration expressed through subtle festive materials, warm lamps, fresh flowers or regional decorative details around the exact featured product. Keep the product dominant and avoid clichés or excessive decoration."},
        {name:"Tamil heritage brand storytelling",kind:"story",scene:"A cinematic editorial scene connecting a South Indian coffee or tea ritual with everyday Tamil culture: traditional brass or stainless-steel details, kolam-inspired geometry, warm wood and authentic local atmosphere. Keep the featured product central."},
        {name:"Behind-the-counter craft",kind:"story",scene:"A documentary-style close-up of the craft behind the featured drink or dish: precise preparation, authentic utensils, realistic ingredients and a clean working counter. Show hands only if they are natural and anatomically correct; focus on genuine process."},
        {name:"Lifestyle serving moment",kind:"lifestyle",scene:"A warm, candid café lifestyle scene where the exact featured drink or dish is beautifully presented on a table in a welcoming South Indian neighbourhood café. Human presence may appear softly in context, but the product remains the clear focal point."},
        {name:"Creative illustrated product character",kind:"illustration",scene:"A charming, premium hand-crafted illustration that turns the exact featured cup or food item into a friendly expressive character while preserving its recognisable shape and ingredients. Wholesome, stylish and suitable for a family-friendly café campaign."},
        {name:"Storefront and architectural identity",kind:"architecture",scene:"A distinctive contemporary South Indian café frontage combining warm ivory plaster, mustard accents, dark walnut, tactile terracotta and inviting light. Include the brand name only as a carefully designed sign element; create a believable, buildable space."},
        {name:"Café interior atmosphere",kind:"architecture",scene:"An inviting small-footprint café interior with a thoughtful service counter, warm practical lighting, natural textures, compact seating and a strong brand wall. Show realistic circulation and human-scale proportions, not an oversized luxury restaurant."},
        {name:"Graphic editorial product poster",kind:"graphic",scene:"A modern editorial poster composition using a large photorealistic cut-out of the exact featured product, bold geometric colour fields, subtle texture and generous negative space for editable Tamil and English campaign typography."},
        {name:"Minimal premium product still life",kind:"product",scene:"A minimal luxury still life of the exact featured product on a sculptural plinth or tactile natural surface. Strong shape, beautiful material contrast, controlled shadows and refined colour blocking create a memorable product portrait."}
      ];
      const concept=pickRandom(concepts);
      const lighting=pickRandom([
        "soft golden-hour window light with gentle directional shadows",
        "dramatic low-key studio lighting with controlled warm highlights",
        "bright, fresh morning daylight with natural colour and soft shadows",
        "moody café tungsten glow with subtle amber reflections",
        "clean diffused editorial studio light with accurate product colour",
        "sunlit tropical daylight with delicate leaf shadows"
      ]);
      const camera=pickRandom([
        "tight 85mm macro-style product portrait with shallow natural depth of field",
        "45-degree editorial food-photography angle at table height",
        "clean overhead flat-lay with deliberate geometric spacing",
        "50mm eye-level commercial lifestyle perspective",
        "low three-quarter hero angle with realistic scale and controlled perspective",
        "cinematic close-up with foreground depth and a softly separated background"
      ]);
      const composition=pickRandom([
        "one dominant hero subject, simple visual hierarchy and generous negative space",
        "editorial asymmetry with balanced supporting ingredients and a clear focal point",
        "bold central product framing with a refined graphic background",
        "layered foreground, middle-ground and softly separated background, without clutter"
      ]);
      const palette=pickRandom([
        "mustard yellow, warm ivory, dark walnut and coffee brown",
        "terracotta, leaf green, warm cream and natural clay",
        "deep espresso, copper, amber and soft charcoal",
        "fresh ivory, pale wood, muted green and golden highlights",
        "rich coffee brown, toasted caramel and restrained brass"
      ]);
      const format=String(d.format||"9:16").toLowerCase()==="feed"?"1:1":(["16:9","9:16"].includes(d.format)?d.format:"9:16");
      const signage=concept.kind==="architecture";
      return [
        "Create an original, premium commercial visual for "+shop+".",
        "RANDOM CREATIVE CATEGORY: "+concept.kind.toUpperCase()+" — "+concept.name+".",
        "HERO SUBJECT: "+subject+". Depict the exact product, dish, drink or experience named in the campaign brief. If the topic is broad, choose one clear Paanagam product rather than combining unrelated products.",
        "SCENE AND ART DIRECTION: "+concept.scene,
        brief?"CAMPAIGN ART DIRECTION: "+brief:"",
        "BRAND PERSONALITY: Contemporary South Indian neighbourhood café, rooted in Tamil culture; welcoming, memorable, premium but approachable.",
        "COLOUR DIRECTION: "+palette+". Use Paanagam brand colours thoughtfully rather than forcing every colour into every scene.",
        "LIGHTING: "+lighting+".",
        "CAMERA: "+camera+".",
        "COMPOSITION: "+composition+". Adapt framing to the subject; keep the hero fully visible and important details away from crop edges. Create visual depth without distracting props.",
        "FORMAT: "+format+" aspect ratio, designed for a social promotional slide. For product portraits, prioritise the product; for campaigns, preserve a clean text-safe area; for architecture, show the full relevant space.",
        "MATERIAL AND PRODUCT ACCURACY: Photorealistic liquid, food texture, steam, metal, ceramic, clay, paper and wood. Correct proportions, believable serving vessels and natural reflections. Never add ingredients, menu items, packaging features or claims that are not in the brief.",
        "BRAND MARK CONTROL: "+(signage?"The PAANAGAM name may appear only as a correctly spelled architectural sign.":"Do not force a storefront, billboard or signboard into this concept. Keep the product itself central.")+" Do not fabricate logos or Tamil lettering.",
        "TEXT CONTROL: Do not render captions, slogans, prices, offer details, dates, phone numbers, pseudo-letters or watermarks. Leave suitable clean space for approved editable Tamil and English overlays in LocalBoost.",
        caption?"CAPTION CONTEXT ONLY — use the message to guide emotion and visual intent; do not reproduce it as image text: "+caption:"",
        "NEGATIVE PROMPT: no generic billboard unless the selected concept is architecture, no unrelated props or extra dishes, no duplicate products, no malformed cups or utensils, no distorted food, no fake logos, no gibberish typography, no plastic CGI look, no excessive decoration, no stock watermark.",
        "FINAL RESULT: A distinctive, scroll-stopping, professionally art-directed creative that clearly communicates the selected product or campaign idea at first glance."
      ].filter(Boolean).join("\n\n").slice(0,4000);
    };
    randomCreativeButton.addEventListener("click",()=>{
      if(!imagePromptField)return;
      const brief=lastCampaignImageBrief||{
        topic:document.getElementById("creative-topic")?.value?.trim()||"neighbourhood café campaign",
        caption:document.getElementById("creative-caption")?.value?.trim()||"",
        businessName:document.querySelector("[data-business-name]")?.textContent?.trim()||"PAANAGAM (பானகம்)",
        format:document.getElementById("poyo-image-size")?.value||"9:16"
      };
      imagePromptField.value=buildRandomCommercialPrompt(brief);
      imagePromptField.dispatchEvent(new Event("input",{bubbles:true}));
      const paired=document.getElementById("creative-matched-image-prompt");
      if(paired)paired.value=imagePromptField.value;
      const message=document.getElementById("poyo-image-message");
      if(message)message.textContent="A new random commercial concept is ready. Edit the prompt or save it as a draft. No image was generated and no credits were used.";
    });
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
        paired.oninput=()=>{imagePrompt.value=paired.value;imagePrompt.dispatchEvent(new Event("input",{bubbles:true}));window.dispatchEvent(new CustomEvent("localboost:campaign-image-prompt-updated",{detail:{prompt:paired.value}}));};
        window.dispatchEvent(new CustomEvent("localboost:campaign-image-prompt-updated",{detail:{prompt:imagePrompt.value}}));
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
    const integrations=document.getElementById("design-integrations-panel");
    const meta=root.querySelector(".meta-connection-panel");

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
    const activateTab=(id,moveFocus)=>{
      const pane=paneMap[id];if(!pane)return;
      Object.entries(paneMap).forEach(([key,p])=>{p.hidden=key!==id;});
      nav.querySelectorAll('[role="tab"]').forEach(tab=>{
        const active=tab.id==="lb-studio-tab-"+id;
        tab.setAttribute("aria-selected",String(active));tab.tabIndex=active?0:-1;
        if(active&&moveFocus)tab.focus();
      });
    };
    specs.forEach(([id,label,node],index)=>{
      const pane=document.createElement("section");
      pane.className="lb-studio-pane";
      pane.id="lb-studio-"+id;
      pane.setAttribute("role","tabpanel");
      pane.setAttribute("aria-labelledby","lb-studio-tab-"+id);
      pane.tabIndex=0;
      pane.hidden=index!==0;
      if(node)pane.appendChild(node);
      paneMap[id]=pane;
      panes.appendChild(pane);
      const tab=document.createElement("button");
      tab.type="button";tab.className="lb-studio-tab";
      tab.id="lb-studio-tab-"+id;
      tab.textContent=label;tab.setAttribute("role","tab");
      tab.setAttribute("aria-controls",pane.id);
      tab.setAttribute("aria-selected",index===0?"true":"false");
      tab.tabIndex=index===0?0:-1;
      tab.addEventListener("click",()=>activateTab(id,false));
      tab.addEventListener("keydown",event=>{
        const tabs=[...nav.querySelectorAll('[role="tab"]')], current=tabs.indexOf(tab);
        let next=current;
        if(event.key==="ArrowRight")next=(current+1)%tabs.length;
        else if(event.key==="ArrowLeft")next=(current+tabs.length-1)%tabs.length;
        else if(event.key==="Home")next=0;
        else if(event.key==="End")next=tabs.length-1;
        else return;
        event.preventDefault();activateTab(specs[next][0],true);
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
    if(distributionSettings)settings.append(distributionSettings);
    if(integrations)settings.append(integrations);
    if(meta)settings.append(meta);
    settings.append(advanced);

    /* Remove the obsolete static navigation and empty wrappers only after all
       live feature nodes have been moved into the new, single tab structure. */
    root.querySelectorAll(".lb-studio-nav").forEach(existing=>existing.remove());
    const heading=root.querySelector(".section-heading");
    if(heading)heading.insertAdjacentElement("afterend",nav);
    nav.insertAdjacentElement("afterend",panes);
    root.querySelectorAll('.lb-studio-pane[id^="studio-pane-"]').forEach(pane=>pane.remove());
    root.dataset.guidedStudio="ready";

    /* The engine wrapper now only carries advanced provider information. */
    engine.querySelector(".panel-heading")?.remove();
    const generationState=document.getElementById("poyo-generation-state");
    if(generationState)advanced.append(generationState);
    engine.hidden=true;
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setupContentStudio,{once:true});
  else setupContentStudio();
})();