(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const API = () => (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\/$/, "");
  const TOKEN = "localboost_access_token", BUSINESS = "localboost_business_id";
  const businessId = () => sessionStorage.getItem(BUSINESS);
  const token = () => sessionStorage.getItem(TOKEN);
  const base = () => "/v1/businesses/" + encodeURIComponent(businessId());
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function api(path, options = {}) {
    const response = await fetch(API()+path,{...options,headers:{authorization:"Bearer "+token(),...(options.body?{"content-type":"application/json"}:{}),...(options.headers||{})}});
    const data=await response.json().catch(()=>null);
    if(!response.ok) throw new Error(data?.error||"Request failed ("+response.status+")");
    return data;
  }
  function message(text,error=false){const el=$("poyo-studio-message");if(el){el.textContent=text;el.classList.toggle("error",error);}}
  async function loadModels(){
    if(!businessId()||!token()) return;
    try{
      const result=await api("/v1/creative-integrations/poyo/models");
      const models=result.models||[];
      const root=$("poyo-model-list");
      if(root) root.innerHTML=models.map(m=>'<article class="metric-card"><div class="metric-top"><strong>'+esc(m.name)+'</strong><span class="tag pending-tag">Not enabled</span></div><p>'+esc(m.mediaType)+' · '+esc(m.provider)+'</p><p>'+esc((m.useCases||[]).join(" · "))+'</p><small>Schema '+(m.schemaVerified?"verified":"pending")+' · Price '+(m.priceVerified?"verified":"pending")+'</small><p><a href="'+esc(m.documentationUrl)+'" target="_blank" rel="noopener noreferrer">Model documentation</a></p></article>').join("")||'<p class="empty-copy">No model catalogue entries.</p>';
      const select=$("poyo-model-id"), previous=select?.value;
      if(select){select.innerHTML=models.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+' · '+esc(m.mediaType)+'</option>').join("");if(previous&&models.some(m=>m.id===previous))select.value=previous;}
      const banner=$("poyo-generation-state");
      if(banner) banner.textContent="Catalogue loaded from documentation. Paid generation is disabled until live model schemas, account availability and prices are verified.";
    }catch(e){message("PoYo model catalogue unavailable: "+e.message,true);}
  }
  async function loadTasks(){
    if(!businessId()||!token()) return;
    try{
      const result=await api(base()+"/poyo/tasks");
      const root=$("poyo-task-list");
      if(root) root.innerHTML=(result.tasks||[]).map(t=>'<article class="social-post-card"><div class="social-post-head"><strong>'+esc(t.modelId)+'</strong><span class="tag pending-tag">'+esc(t.status)+'</span></div><p>'+esc(t.prompt)+'</p><small>'+esc(t.mediaType)+' · '+esc(new Date(t.createdAt).toLocaleString())+'</small></article>').join("")||'<p class="empty-copy">No PoYo drafts yet.</p>';
    }catch(e){message("PoYo task list unavailable: "+e.message,true);}
  }
  $("poyo-draft-form")?.addEventListener("submit",async e=>{
    e.preventDefault();
    const button=$("poyo-save-draft");button.disabled=true;
    try{
      const mediaType=$("poyo-media-type").value, modelId=$("poyo-model-id").value, prompt=$("poyo-prompt").value.trim();
      if(!prompt) throw new Error("Enter a creative brief first.");
      await api(base()+"/poyo/tasks",{method:"POST",body:JSON.stringify({mediaType,modelId,prompt,modelInput:{prompt}})});
      e.target.reset(); await loadModels(); await loadTasks();
      message("PoYo creative brief saved as a draft. No provider request was sent and no credits were charged.");
    }catch(err){message("Could not save PoYo draft: "+err.message,true);}
    finally{button.disabled=false;}
  });
  async function init(){if(!businessId()||!token())return;await loadModels();await loadTasks();}
  window.addEventListener("localboost:business-ready",init);
  window.addEventListener("localboost:signed-out",()=>{const root=$("poyo-task-list");if(root)root.innerHTML='<p class="empty-copy">Sign in to view PoYo drafts.</p>';});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();