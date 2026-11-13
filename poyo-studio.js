(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const API = () => (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\/$/, "");
  const TOKEN = "localboost_access_token", BUSINESS = "localboost_business_id";
  const businessId = () => sessionStorage.getItem(BUSINESS), token = () => sessionStorage.getItem(TOKEN);
  const base = () => "/v1/businesses/" + encodeURIComponent(businessId());
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let modelCatalogue = [], generationEnabled = false, pollTimer = null, mediaUrls = [];
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
      if(refreshPending){
        const pending=tasks.filter(t=>["SUBMITTED","PROCESSING"].includes(t.status));
        for(const task of pending){try{await api(base()+"/poyo/tasks/"+encodeURIComponent(task.id)+"/refresh",{method:"POST",body:"{}"});}catch{}}
        if(pending.length){result=await api(base()+"/poyo/tasks");tasks=result.tasks||[];}
      }
      revokeMediaUrls();
      const renderTask=t=>{
        const pending=["SUBMITTED","PROCESSING"].includes(t.status), approved=Boolean(t.approvedAt);
        const preview=(t.outputUrls||[]).find(url=>typeof url==="string"&&url.includes("/poyo/assets/"));
        const isImage=t.mediaType==="IMAGE", resolution=isImage?(t.modelInput?.resolution||"2K"):"480p";
        const cost=t.estimatedCredits??(isImage?(resolution==="1K"?4:resolution==="4K"?10:6):6);
        const media=preview?(isImage?'<img alt="Generated campaign artwork preview" data-media-path="'+esc(preview)+'" style="display:block;width:100%;max-height:480px;object-fit:contain;margin-top:12px;border-radius:12px;background:#f3f0e9">':'<video controls playsinline preload="metadata" data-media-path="'+esc(preview)+'" style="display:block;width:100%;max-height:420px;margin-top:12px;border-radius:12px;background:#111"></video>'):"";
        return '<article class="social-post-card"><div class="social-post-head"><strong>'+esc(t.modelId)+'</strong><span class="tag '+(t.status==="SUCCEEDED"?"confirmed":"pending-tag")+'">'+esc(t.status)+'</span></div><p>'+esc(t.prompt)+'</p><small>'+esc(resolution)+' · '+esc(cost)+' estimated credits · '+esc(new Date(t.createdAt).toLocaleString())+'</small>'+media+(t.errorMessage?'<p class="footnote">'+esc(t.errorMessage)+'</p>':"")+'<div class="form-actions">'+(t.status==="DRAFT"&&generationEnabled?'<button type="button" class="secondary-button" data-generate="'+esc(t.id)+'" data-kind="'+(isImage?"image":"video")+'">Generate · '+esc(cost)+' credits</button>':"")+(pending?'<button type="button" class="secondary-button" data-refresh="'+esc(t.id)+'">Check status</button>':"")+(t.status==="SUCCEEDED"&&!approved?'<button type="button" class="secondary-button" data-approve="'+esc(t.id)+'" data-kind="'+(isImage?"image":"video")+'">Approve '+(isImage?"image":"video")+'</button>':"")+(approved?'<span class="tag confirmed">Owner approved · not published</span>':"")+'</div></article>';
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
      if(!prompt||prompt.length>800)throw new Error("Enter an image prompt of up to 800 characters.");
      const urls=$("poyo-image-refs").value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
      if(urls.length>10||!urls.every(v=>/^https:\/\//i.test(v)))throw new Error("Use up to 10 publicly accessible HTTPS reference URLs.");
      const modelInput={size:$("poyo-image-size").value,resolution,...(urls.length?{image_urls:urls}:{})};
      const result=await api(base()+"/poyo/tasks",{method:"POST",body:JSON.stringify({mediaType:"IMAGE",modelId:"nano-banana-2.1",prompt,modelInput})});
      $("poyo-image-prompt").value="";$("poyo-image-refs").value="";
      await loadTasks();message("poyo-image-message","Image draft saved. Estimated "+(result.task?.estimatedCredits??(resolution==="1K"?4:resolution==="4K"?10:6))+" credits. No PoYo request was sent and no credits were used.");
    }catch(err){message("poyo-image-message","Could not save image draft: "+err.message,true);}finally{button.disabled=false;}
  });
  async function handleTaskAction(e){
    const button=e.target.closest("button");if(!button)return;
    const generate=button.dataset.generate,approve=button.dataset.approve,refresh=button.dataset.refresh,id=generate||approve||refresh;if(!id)return;
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
      await loadTasks({refreshPending:true});
    }catch(err){message(kind==="image"?"poyo-image-message":"poyo-studio-message","PoYo action failed: "+err.message,true);}finally{if(button.isConnected)button.disabled=false;}
  }
  $("poyo-task-list")?.addEventListener("click",handleTaskAction);
  $("poyo-image-task-list")?.addEventListener("click",e=>{
    const generate=e.target.closest("[data-generate]");
    if(generate){const cost=generate.textContent.match(/[0-9]+/);if(!confirm("Submit this image generation to PoYo? Estimated cost: "+(cost?.[0]||"shown")+" credits. This may use paid credits."))return;}
    handleTaskAction(e);
  });
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