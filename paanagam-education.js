(() => {
  "use strict";
  const TOKEN="localboost_access_token", BUSINESS="localboost_business_id", CATEGORY="paanagam_education_fact";
  const API=()=>(window.LOCALBOOST_API_BASE||"").replace(/\/$/,"");
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let businessId=null, menu=[], evidence=[], active=false;
  async function api(path,options={}) {
    const token=sessionStorage.getItem(TOKEN);
    if(!token) throw new Error("Sign in to manage owner-approved facts.");
    const r=await fetch(API()+path,{...options,headers:{"content-type":"application/json",authorization:"Bearer "+token,...(options.headers||{})}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||"Request failed ("+r.status+")");
    return data;
  }
  const base=()=>"/v1/businesses/"+encodeURIComponent(businessId||"");
  const value=row=>row?.value&&typeof row.value==="object"?row.value:{};
  function status(msg,error=false){const n=$("pe-status");if(n){n.textContent=msg;n.classList.toggle("error",error);}}
  function itemId(x){return String(x.menu_item_id??x.menuItemId??x.id??"");}
  function itemName(x){return String(x.name??x.itemName??x.menu_item_name??"Unnamed menu item");}
  function latestFacts(){
    const rows=evidence.filter(x=>x.category===CATEGORY).sort((a,b)=>new Date(a.observedAt)-new Date(b.observedAt));
    const latest=new Map();
    for(const row of rows){const p=value(row);if(!p.factId)continue;const old=latest.get(p.factId);if(!old||new Date(row.observedAt)>=new Date(old.observedAt))latest.set(p.factId,row);}
    return [...latest.values()].sort((a,b)=>new Date(b.observedAt)-new Date(a.observedAt));
  }
  function render(){
    const select=$("pe-menu-item"),previous=select.value;
    select.innerHTML='<option value="">Select an active Paanagam menu item</option>'+menu.filter(x=>x.active!==false).map(x=>'<option value="'+esc(itemId(x))+'">'+esc(itemName(x))+'</option>').join("");
    if(menu.some(x=>itemId(x)===previous&&x.active!==false))select.value=previous;
    const facts=latestFacts(),approved=facts.filter(x=>value(x).status==="OWNER_APPROVED"),withdrawn=facts.length-approved.length;
    $("pe-menu-count").textContent=String(menu.filter(x=>x.active!==false).length);
    $("pe-approved-count").textContent=String(approved.length);
    $("pe-withdrawn-count").textContent=String(withdrawn);
    $("pe-facts").innerHTML=facts.length?facts.map(row=>{
      const p=value(row),isApproved=p.status==="OWNER_APPROVED";
      return '<article class="pe-fact"><div class="pe-fact-head"><strong>'+esc(p.menuItemName||"Menu item")+' · '+esc(p.topic||"Fact")+'</strong><span class="'+(isApproved?"pe-approved":"pe-withdrawn")+'">'+(isApproved?"Owner-approved":"Withdrawn")+'</span></div><p lang="ta">'+esc(p.textTa||"")+'</p><p>'+esc(p.textEn||"")+'</p><small>Version '+esc(p.factVersion||1)+' · Source: '+esc(p.evidenceRef||"Not supplied")+' · '+esc(new Date(row.observedAt).toLocaleDateString("en-IN"))+'</small>'+
        (isApproved?'<button type="button" class="primary-button" data-script="'+esc(p.factId)+'">Create education script draft</button> <button type="button" class="secondary-button" data-withdraw="'+esc(p.factId)+'">Withdraw this fact</button>':'')+'</article>';
    }).join(""):'<p class="pe-empty">No customer-facing facts have been owner-approved yet. POS menu records alone do not authorise recipe claims.</p>';
  }
  async function refresh(){
    if(!businessId)return;
    status("Loading Paanagam menu and owner-approved facts…");
    try{
      const [m,e]=await Promise.all([api(base()+"/growth-records?type=MENU_ITEM&limit=200"),api(base()+"/evidence")]);
      menu=(m.records||[]).filter(x=>x.source!=="DEMO").map(x=>x.payload||{});
      evidence=Array.isArray(e)?e:[];
      render();
      status(menu.length?"Loaded "+menu.length+" menu record(s). Only explicitly owner-approved facts can be used in future scripts.":"No POS menu records found. Connect and sync Paanagam POS first.");
    }catch(err){status(err.message,true);}
  }
  function install(){
    const nav=document.querySelector(".nav-list"),main=document.querySelector(".main");
    if(!nav||!main||$("paanagam-education-view"))return;
    const button=document.createElement("button");button.type="button";button.className="nav-item";button.innerHTML="<span>✎</span> Paanagam education facts";
    nav.insertBefore(button,nav.querySelector('[data-view="content"]')||null);
    const section=document.createElement("section");section.id="paanagam-education-view";section.className="view-panel hidden";
    section.innerHTML='<div class="section-heading"><div><h2>Paanagam customer education facts</h2><p>Build a verified fact library from active POS menu items. This does not expose internal recipe quantities or costs.</p></div><span class="tag pending-tag">Owner approval required</span></div>'+
      '<div class="pe-statusbar"><p id="pe-status" role="status">Select a business to load menu items.</p><button class="secondary-button" id="pe-refresh" type="button">Refresh</button></div>'+
      '<div class="pe-metrics"><article class="panel"><small>Active menu items</small><strong id="pe-menu-count">0</strong></article><article class="panel"><small>Current approved facts</small><strong id="pe-approved-count">0</strong></article><article class="panel"><small>Withdrawn / other</small><strong id="pe-withdrawn-count">0</strong></article></div>'+
      '<article class="panel pe-form-panel"><h3>Add an owner-approved customer fact</h3><p>Enter only a fact you have checked against the current Paanagam menu or approved recipe/SOP. Both language versions must say the same thing.</p><form id="pe-form" class="pe-form">'+
      '<label>Menu item<select id="pe-menu-item" required><option value="">Load menu first</option></select></label>'+
      '<label>Topic<select id="pe-topic"><option value="ingredients">Ingredients</option><option value="preparation">Preparation</option><option value="menu_description">Menu description</option><option value="serving">Serving</option></select></label>'+
      '<label>Evidence / recipe / SOP reference<input id="pe-evidence-ref" maxlength="180" required placeholder="e.g. Filter coffee SOP v1 · owner checked"></label>'+
      '<label>Tamil fact<textarea id="pe-text-ta" rows="3" maxlength="1000" required placeholder="உரிமையாளர் சரிபார்த்த உண்மைத் தகவல்"></textarea></label>'+
      '<label>English fact<textarea id="pe-text-en" rows="3" maxlength="1000" required placeholder="Owner-verified customer-facing fact"></textarea></label>'+
      '<p class="pe-warning">Do not enter health benefits, nutrition, allergen-free claims, medical claims, supplier claims, exact internal quantities, costing or stock details. Never copy internal BOM/SOP instructions verbatim.</p>'+
      '<button class="primary-button" type="submit">Save as owner-approved fact</button></form></article>'+
      '<article class="panel"><div class="panel-heading"><div><h3>Current fact register</h3><p>Withdrawn facts remain in the audit history and must not be used for new scripts.</p></div></div><div id="pe-facts" class="pe-facts"></div></article>'+
      '<article class="panel pe-script-preview hidden" id="pe-script-preview"><h3>Education script draft</h3><p class="pe-warning">Draft only · owner review required · not published</p><div id="pe-script-content"></div></article>'+
      '<p class="pe-footnote">Scripts are deterministic templates built only from the selected approved fact. Every saved draft cites the exact fact ID, version and evidence record; a separate owner review is required before any creative or post is produced.</p>';
    main.querySelector("main")?.append(section)||main.append(section);
    const show=()=>{document.querySelectorAll(".main > .view-panel").forEach(x=>x.classList.add("hidden"));section.classList.remove("hidden");document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x===button));const c=$("crumb-title"),t=$("page-title");if(c)c.textContent="Paanagam education facts";if(t)t.textContent="Customer education facts";if(businessId)refresh();};
    button.addEventListener("click",show);
    document.addEventListener("click",e=>{if(e.target.closest("[data-view], [data-go]"))section.classList.add("hidden");},true);
    $("pe-refresh").addEventListener("click",refresh);
    $("pe-form").addEventListener("submit",async e=>{
      e.preventDefault();
      const id=$("pe-menu-item").value,chosen=menu.find(x=>itemId(x)===id);
      const textTa=$("pe-text-ta").value.trim(),textEn=$("pe-text-en").value.trim(),ref=$("pe-evidence-ref").value.trim();
      if(!chosen||!textTa||!textEn||!ref)return status("Select a menu item and provide both language versions plus an evidence reference.",true);
      if(!confirm("Save these exact Tamil and English statements as owner-approved customer-facing facts for "+itemName(chosen)+"?"))return;
      const factId="paanagam:"+id+":"+Date.now();
      try{
        await api(base()+"/evidence",{method:"POST",body:JSON.stringify({category:CATEGORY,value:{factId,menuItemId:id,menuItemName:itemName(chosen),topic:$("pe-topic").value,factVersion:1,status:"OWNER_APPROVED",textTa,textEn,evidenceRef:ref,allowedClaims:[$("pe-topic").value],prohibitedClaims:["health benefit","nutrition","allergen-free","medical claim","supplier claim","internal recipe quantity","cost","stock"]},source:"OWNER_CONFIRMED",sourceLabel:"Explicit owner approval in Paanagam education facts",verified:true,observedAt:new Date().toISOString()})});
        e.target.reset();await refresh();status("Owner-approved fact saved. No script or post was generated or published.");
      }catch(err){status("Could not save fact: "+err.message,true);}
    });
    $("pe-facts").addEventListener("click",async e=>{
      const btn=e.target.closest("[data-withdraw]");if(!btn)return;
      const row=latestFacts().find(x=>value(x).factId===btn.dataset.withdraw);if(!row)return;
      const p=value(row);if(!confirm("Withdraw this customer-facing fact? Future scripts must not use it."))return;
      try{await api(base()+"/evidence",{method:"POST",body:JSON.stringify({category:CATEGORY,value:{...p,factVersion:Number(p.factVersion||1)+1,status:"WITHDRAWN",withdrawsEvidenceId:row.id},source:"OWNER_CONFIRMED",sourceLabel:"Owner withdrew customer-facing fact",verified:true,observedAt:new Date().toISOString()})});await refresh();status("Fact withdrawn. It remains in the evidence history and is excluded from active facts.");}
      catch(err){status("Could not withdraw fact: "+err.message,true);}
    });
    window.addEventListener("localboost:business-ready",e=>{businessId=e.detail?.businessId||sessionStorage.getItem(BUSINESS);if(!section.classList.contains("hidden"))refresh();});
    window.addEventListener("localboost:signed-out",()=>{businessId=null;menu=[];evidence=[];render();status("Signed out · private facts cleared.");});
    businessId=sessionStorage.getItem(BUSINESS);
  }
  install();
})();