(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const API = () => (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\/$/, "");
  const TOKEN="localboost_access_token", BUSINESS="localboost_business_id";
  let posts=[];
  const businessId=()=>sessionStorage.getItem(BUSINESS);
  const auth=()=>({authorization:"Bearer "+sessionStorage.getItem(TOKEN)});
  const base=()=>"/v1/businesses/"+encodeURIComponent(businessId());
  async function api(path,options={}) {
    const response=await fetch(API()+path,{...options,headers:{"content-type":"application/json",...auth(),...(options.headers||{})}});
    const type=response.headers.get("content-type")||"";
    const data=type.includes("application/json")?await response.json():null;
    if(!response.ok)throw new Error(data?.error||"Request failed ("+response.status+")");
    return data;
  }
  function statusMessage(text,error=false){const el=$("meta-connection-status");if(el){el.textContent=text;el.classList.toggle("error",error);}}
  async function loadMeta(){
    if(!businessId()||!sessionStorage.getItem(TOKEN))return;
    try{
      const result=await api(base()+"/meta");
      const badge=$("meta-connection-badge"), connect=$("meta-connect"), disconnect=$("meta-disconnect");
      if(result.connected){
        badge.textContent="Connected";badge.className="tag confirmed";
        statusMessage("Connected Page: "+result.connection.pageName+(result.connection.instagramUsername?" · Instagram @"+result.connection.instagramUsername:" · No linked Instagram professional account found."));
        connect.textContent="Reconnect Meta";disconnect.hidden=false;
      }else{
        badge.textContent="Not connected";badge.className="tag pending-tag";
        statusMessage(result.configured?"Connect the Facebook Page that manages this business.":"Meta app credentials are not configured on the API yet.");
        connect.textContent="Connect Facebook";disconnect.hidden=true;
      }
      if(result.pageSelectionPending) await loadPages();
    }catch(e){statusMessage("Meta connection status unavailable: "+e.message,true);}
  }
  async function loadPages(){
    const wrap=$("meta-page-picker"),select=$("meta-page-select"),button=$("meta-select-page");
    wrap.classList.remove("hidden");select.innerHTML="<option value=''>Loading Pages…</option>";button.disabled=true;
    try{
      const result=await api(base()+"/meta/pages");
      select.innerHTML="";
      if(!result.pages.length){select.innerHTML="<option value=''>No accessible Pages found</option>";return;}
      select.innerHTML="<option value=''>Choose a Page…</option>";
      result.pages.forEach(page=>{const option=document.createElement("option");option.value=page.id;option.textContent=page.name+(page.instagramUsername?" · @"+page.instagramUsername:" · no linked Instagram");select.append(option);});
      select.addEventListener("change",()=>{button.disabled=!select.value;});
      statusMessage("Meta authorised. Select the business's correct Facebook Page to finish linking.");
    }catch(e){select.innerHTML="<option value=''>Could not load Pages</option>";statusMessage(e.message,true);}
  }
  function approvalMessage(text,error=false){const el=$("approval-message");if(el){el.textContent=text;el.classList.toggle("error",error);}}
  async function loadPosts(){
    const list=$("approval-list");if(!list||!businessId()||!sessionStorage.getItem(TOKEN))return;
    try{const result=await api(base()+"/social-posts");posts=result.posts||[];renderPosts();}
    catch(e){list.textContent="Could not load approval queue: "+e.message;}
  }
  function renderPosts(){
    const list=$("approval-list");if(!list)return;
    if(!posts.length){list.innerHTML='<p class="empty-copy">No social posts yet. Save a Facebook or Instagram draft in Creative Studio.</p>';return;}
    list.innerHTML='<div class="social-post-list">'+posts.map(post=>'<article class="social-post-card" data-post="'+post.id+'"><div class="social-post-head"><strong>'+post.channel+' · '+post.status+'</strong><span class="social-post-state">'+new Date(post.createdAt).toLocaleString()+'</span></div><p class="social-post-caption"></p>'+(post.asset?'<img class="social-post-image" data-asset="'+post.asset.id+'" alt="Campaign artwork">':'<small class="footnote">Text-only post</small>')+(post.publishError?'<p class="social-post-error"></p>':'')+(post.externalPostId?'<p class="social-post-state">Meta post ID: '+post.externalPostId+'</p>':'')+'<div class="social-post-actions">'+((post.status==="DRAFT"||post.status==="REJECTED"||post.status==="FAILED")?'<button class="secondary-button" data-action="approve" data-id="'+post.id+'">Approve draft</button>':'')+(post.status==="APPROVED"?'<button class="primary-button" data-action="publish" data-id="'+post.id+'">Publish now</button><button class="secondary-button" data-action="reject" data-id="'+post.id+'">Reject</button>':'')+'</div></article>').join("")+'</div>';
    list.querySelectorAll(".social-post-card").forEach(card=>{
      const post=posts.find(item=>item.id===card.dataset.post);
      const caption=card.querySelector(".social-post-caption");if(caption)caption.textContent=post.caption;
      const error=card.querySelector(".social-post-error");if(error)error.textContent=post.publishError;
    });
    list.querySelectorAll("img[data-asset]").forEach(async img=>{try{const response=await fetch(API()+base()+"/creative-assets/"+encodeURIComponent(img.dataset.asset)+"/content",{headers:auth()});if(!response.ok)throw new Error();img.src=URL.createObjectURL(await response.blob());}catch{img.alt="Image unavailable";}});
  }
  $("meta-connect")?.addEventListener("click",async()=>{
    const button=$("meta-connect");button.disabled=true;
    try{const result=await api("/v1/meta/connect/"+encodeURIComponent(businessId())+"/url",{method:"POST",body:"{}"});window.location.assign(result.authorizationUrl);}
    catch(e){statusMessage(e.message,true);button.disabled=false;}
  });
  $("meta-select-page")?.addEventListener("click",async()=>{
    const button=$("meta-select-page");button.disabled=true;
    try{const result=await api(base()+"/meta/page",{method:"POST",body:JSON.stringify({pageId:$("meta-page-select").value})});$("meta-page-picker").classList.add("hidden");statusMessage("Connected "+result.page.name+(result.page.instagramUsername?" and Instagram @"+result.page.instagramUsername:"")+".");await loadMeta();await loadPosts();}
    catch(e){statusMessage(e.message,true);button.disabled=false;}
  });
  $("meta-disconnect")?.addEventListener("click",async()=>{
    if(!window.confirm("Disconnect this business from Facebook and Instagram? Existing published posts will not be deleted."))return;
    try{await api(base()+"/meta",{method:"DELETE"});statusMessage("Meta connection removed. Existing posts remain published.");await loadMeta();}
    catch(e){statusMessage(e.message,true);}
  });
  $("approval-list")?.addEventListener("click",async event=>{
    const button=event.target.closest("button[data-action]");if(!button)return;
    const id=button.dataset.id,action=button.dataset.action,post=posts.find(item=>item.id===id);if(!post)return;
    if(action==="publish"&&!window.confirm("Publish this exact "+post.channel+" post now? This action sends it to Meta immediately."))return;
    button.disabled=true;
    try{
      const result=await api(base()+"/social-posts/"+encodeURIComponent(id)+"/"+action,{method:"POST",body:"{}"});
      approvalMessage(action==="publish"?(result.published?"Post published successfully.":"Publishing completed.") : action==="approve"?"Owner approval recorded. Nothing has been published.":"Draft rejected.");
      await loadPosts();
    }catch(e){approvalMessage(e.message,true);await loadPosts();}
    finally{button.disabled=false;}
  });
  window.addEventListener("localboost:business-ready",()=>{void loadMeta();void loadPosts();});
  window.addEventListener("localboost:signed-out",()=>{posts=[];renderPosts();statusMessage("Sign in to manage Meta publishing.");if($("meta-connection-badge"))$("meta-connection-badge").textContent="Not connected";});
  if(businessId()){void loadMeta();void loadPosts();}
})();