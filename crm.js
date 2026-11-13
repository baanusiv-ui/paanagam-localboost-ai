(() => {
  "use strict";
  const API=(window.LOCALBOOST_API_BASE||"http://localhost:4100").replace(/\/$/,"");
  const TOKEN="localboost_access_token",BUSINESS="localboost_business_id";
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let businessId=null, cursor=null, selectedCustomer=null, installed=false, loading=false;
  const base=()=>"/v1/businesses/"+encodeURIComponent(businessId||"");
  const api=async(path,options={})=>{
    const headers={"content-type":"application/json",accept:"application/json",...(options.headers||{})};
    const token=sessionStorage.getItem(TOKEN);if(token)headers.authorization="Bearer "+token;
    const response=await fetch(API+path,{...options,headers});
    const data=response.status===204?null:await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.error||"Request failed ("+response.status+")");
    return data;
  };
  const date=value=>value?new Date(value).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"Not recorded";
  function status(message,error=false){const el=$("crm-status");if(el){el.textContent=message;el.classList.toggle("error",error);}}
  function requireWorkspace(){if(!businessId||!sessionStorage.getItem(TOKEN)){status("Sign in and select a business to use CRM.",true);return false;}return true;}
  function install(){
    if(installed)return;
    const nav=document.querySelector(".nav-list"),main=document.querySelector(".main");
    if(!nav||!main)return;
    installed=true;
    const button=document.createElement("button");button.type="button";button.className="nav-item";button.dataset.crmNav="true";button.innerHTML="<span>♙</span> Customer CRM";
    nav.insertBefore(button,nav.querySelector("[data-view='retention']")||nav.querySelector("[data-view='competitors']")||null);
    const section=document.createElement("section");section.id="crm-workspace";section.className="view-panel hidden";
    section.innerHTML=`
      <div class="section-heading"><div><h2>Customer CRM</h2><p>Business-owned customer profiles, contact preferences and a traceable customer history.</p></div><span class="tag pending-tag">Private · consent-aware</span></div>
      <div class="crm-status panel" id="crm-status" role="status">Sign in and select a business to load customer records.</div>
      <div class="crm-layout">
        <div class="crm-left">
          <article class="panel">
            <div class="panel-heading"><div><h3>Add a customer</h3><p>Phone must include country code, e.g. +919876543210.</p></div></div>
            <form id="crm-create-form" class="crm-form">
              <label>Name (optional)<input id="crm-new-name" maxlength="120" placeholder="Customer name"></label>
              <label>Phone in E.164 format<input id="crm-new-phone" maxlength="20" placeholder="+919876543210"></label>
              <label>Email (optional)<input id="crm-new-email" type="email" maxlength="254" placeholder="name@example.com"></label>
              <button class="primary-button" type="submit">Save customer</button>
            </form>
          </article>
          <article class="panel">
            <div class="panel-heading"><div><h3>Customer directory</h3><p>Search this business's customer records.</p></div><span class="tag" id="crm-count">0 loaded</span></div>
            <form id="crm-search-form" class="crm-search">
              <input id="crm-search" maxlength="120" placeholder="Search name, phone or email" aria-label="Search customers">
              <select id="crm-filter-status" aria-label="Customer status"><option value="ACTIVE">Active</option><option value="BLOCKED">Blocked</option><option value="DELETED">Deleted</option></select>
              <button class="secondary-button" type="submit">Search</button>
            </form>
            <div id="crm-customer-list" class="crm-customer-list"><p class="empty-copy">Customer records will appear here.</p></div>
            <button class="secondary-button crm-load-more" id="crm-load-more" type="button" hidden>Load more</button>
          </article>
        </div>
        <article class="panel crm-detail" id="crm-customer-detail" aria-live="polite"><div class="crm-empty"><strong>Select a customer</strong><p>Customer profile, contact consent and recorded activity will appear here.</p></div></article>
      </div>
      <article class="panel crm-retention"><div class="panel-heading"><div><h3>Privacy &amp; data retention</h3><p>Choose how long inactive customer records are retained.</p></div><span class="tag">Manual review</span></div><div class="crm-retention-controls"><label>Retention period<select id="crm-retention-months"><option value="12">12 months</option><option value="18">18 months</option><option value="24">24 months</option><option value="36">36 months</option><option value="48">48 months</option><option value="60">60 months</option><option value="72">72 months</option><option value="84">84 months</option></select></label><button class="secondary-button" id="crm-retention-save" type="button">Save period</button><button class="secondary-button" id="crm-retention-preview-output" type="button">Preview expired records</button></div><div id="crm-retention-preview-output" class="crm-retention-preview" aria-live="polite">No records will be deleted automatically.</div><button class="danger-button" id="crm-retention-apply" type="button" disabled>Erase previewed expired records</button><p class="footnote">Preview is limited to the first 500 matching records. Applying deletion requires typing an exact confirmation phrase. Automatic deletion is disabled.</p></article><p class="footnote">Marketing consent is separate from service consent. Purchases never imply permission to send marketing. No messages are sent from this screen.</p>`;
    main.append(section);
    button.addEventListener("click",show);
    document.addEventListener("click",event=>{if(event.target.closest("[data-view],[data-gi-nav]"))section.classList.add("hidden");},true);
    $("crm-create-form").addEventListener("submit",createCustomer);
    $("crm-search-form").addEventListener("submit",event=>{event.preventDefault();loadCustomers(true);});
    $("crm-load-more").addEventListener("click",()=>loadCustomers(false));
    $("crm-customer-list").addEventListener("click",event=>{const target=event.target.closest("[data-crm-customer]");if(target)loadCustomer(target.dataset.crmCustomer);});
    $("crm-customer-detail").addEventListener("click",event=>{const action=event.target.closest("[data-crm-action]")?.dataset.crmAction;if(action==="export")exportCustomer();if(action==="erase")eraseCustomer();});
    $("crm-retention-save").addEventListener("click",saveRetention);
    $("crm-retention-preview-btn").addEventListener("click",previewRetention);
    $("crm-retention-apply").addEventListener("click",applyRetention);
    $("crm-customer-detail").addEventListener("submit",event=>{
      if(event.target.id==="crm-profile-form"){event.preventDefault();saveProfile();}
      if(event.target.id==="crm-consent-form"){event.preventDefault();saveConsent();}
    });
  }
  function show(){
    document.querySelectorAll(".view-panel").forEach(node=>node.classList.add("hidden"));
    document.querySelectorAll(".nav-item").forEach(node=>node.classList.toggle("active",node.dataset.crmNav==="true"));
    $("crm-workspace").classList.remove("hidden");
    if($("crumb-title"))$("crumb-title").textContent="Customer CRM";
    if($("page-title"))$("page-title").textContent="Customer CRM";
    if(businessId){loadCustomers(true);loadRetention();}
  }
  async function loadCustomers(reset=true){
    if(!requireWorkspace()||loading)return;
    loading=true;
    const list=$("crm-customer-list"),more=$("crm-load-more");
    if(reset){cursor=null;list.innerHTML='<p class="empty-copy">Loading customer records…</p>';}
    const q=$("crm-search").value.trim(),statusValue=$("crm-filter-status").value;
    const query=new URLSearchParams({status:statusValue,limit:"50"});if(q)query.set("q",q);if(!reset&&cursor)query.set("cursor",cursor);
    try{
      const result=await api(base()+"/customers?"+query.toString());
      const rows=result.customers||[];
      if(reset)list.innerHTML="";
      if(!rows.length&&reset)list.innerHTML='<p class="empty-copy">No matching customer records. Add a customer using the form above.</p>';
      rows.forEach(customer=>{
        const card=document.createElement("button");card.type="button";card.className="crm-customer-row";card.dataset.crmCustomer=customer.id;
        card.innerHTML='<strong>'+esc(customer.name||"Unnamed customer")+'</strong><span>'+esc(customer.phoneE164||customer.email||"No contact")+'</span><small>Last seen: '+esc(date(customer.lastSeenAt))+'</small>';
        list.append(card);
      });
      cursor=result.nextCursor||null;more.hidden=!cursor;
      $("crm-count").textContent=list.querySelectorAll("[data-crm-customer]").length+" loaded";
      status("Customer list loaded for the selected business.");
    }catch(error){if(reset)list.innerHTML='<p class="empty-copy">'+esc(error.message)+'</p>';status(error.message,true);}
    finally{loading=false;}
  }
  async function createCustomer(event){
    event.preventDefault();if(!requireWorkspace())return;
    const button=event.submitter;button.disabled=true;
    try{
      const payload={name:$("crm-new-name").value.trim()||undefined,phone:$("crm-new-phone").value.trim()||undefined,email:$("crm-new-email").value.trim()||undefined,source:"OWNER_ENTERED"};
      const result=await api(base()+"/customers",{method:"POST",body:JSON.stringify(payload)});
      event.target.reset();await loadCustomers(true);await loadCustomer(result.customer.id);status("Customer profile saved. No marketing message was sent.");
    }catch(error){status(error.message,true);}
    finally{button.disabled=false;}
  }
  async function loadCustomer(id){
    if(!requireWorkspace())return;
    const root=$("crm-customer-detail");root.innerHTML='<p class="empty-copy">Loading customer profile…</p>';
    try{
      const result=await api(base()+"/customers/"+encodeURIComponent(id));
      selectedCustomer=result.customer;renderCustomer(result.customer);
    }catch(error){root.innerHTML='<p class="empty-copy">'+esc(error.message)+'</p>';status(error.message,true);}
  }
  function renderCustomer(customer){
    const root=$("crm-customer-detail"),consents=customer.consents||[],events=customer.events||[];
    const consentRows=consents.map(row=>'<li><strong>'+esc(row.purpose)+' · '+esc(row.channel)+'</strong><span class="'+(row.granted?"crm-granted":"crm-revoked")+'">'+(row.granted?"Granted":"Revoked")+'</span><small>'+esc(date(row.capturedAt))+' · '+esc(row.source)+'</small>'+(row.evidence?'<small>'+esc(row.evidence)+'</small>':"")+'</li>').join("");
    const eventRows=events.map(row=>'<li><strong>'+esc(row.eventType.replaceAll("_"," "))+'</strong><small>'+esc(date(row.occurredAt))+' · '+esc(row.source)+'</small></li>').join("");
    root.innerHTML='<div class="panel-heading"><div><h3>Customer profile</h3><p>Created '+esc(date(customer.createdAt))+'</p></div><span class="tag">'+esc(customer.status)+'</span></div>'+
      '<form id="crm-profile-form" class="crm-form"><label>Name<input id="crm-edit-name" maxlength="120" value="'+esc(customer.name||"")+'"></label><label>Phone (E.164)<input id="crm-edit-phone" maxlength="20" value="'+esc(customer.phoneE164||"")+'"></label><label>Email<input id="crm-edit-email" type="email" maxlength="254" value="'+esc(customer.email||"")+'"></label><button class="secondary-button" type="submit">Save profile changes</button></form>'+
      '<section class="crm-subsection"><h4>Consent history</h4><p class="footnote">Each grant or revocation is appended as a new record. Revocation does not erase previous evidence.</p><ul class="crm-history">'+(consentRows||'<li class="crm-muted">No consent recorded. No marketing permission is assumed.</li>')+'</ul>'+
      '<form id="crm-consent-form" class="crm-form"><label>Channel<select id="crm-consent-channel"><option value="WHATSAPP">WhatsApp</option><option value="SMS">SMS</option><option value="EMAIL">Email</option></select></label><label>Purpose<select id="crm-consent-purpose"><option value="SERVICE">Service messages</option><option value="MARKETING">Marketing</option></select></label><label>Decision<select id="crm-consent-granted"><option value="true">Grant consent</option><option value="false">Revoke consent</option></select></label><label>Evidence / capture note<input id="crm-consent-evidence" maxlength="1000" required placeholder="How and when was this preference confirmed?"></label><button class="secondary-button" type="submit">Record consent decision</button></form></section>'+
      '<section class="crm-subsection"><h4>Customer activity</h4><ul class="crm-history">'+(eventRows||'<li class="crm-muted">No activity events recorded.</li>')+'</ul></section>';
  }
  async function saveProfile(){
    if(!selectedCustomer||!requireWorkspace())return;
    try{
      const payload={name:$("crm-edit-name").value.trim()||null,phone:$("crm-edit-phone").value.trim()||null,email:$("crm-edit-email").value.trim()||null};
      await api(base()+"/customers/"+encodeURIComponent(selectedCustomer.id),{method:"PATCH",body:JSON.stringify(payload)});
      await loadCustomer(selectedCustomer.id);await loadCustomers(true);status("Customer profile updated.");
    }catch(error){status(error.message,true);}
  }
  async function saveConsent(){
    if(!selectedCustomer||!requireWorkspace())return;
    try{
      const payload={channel:$("crm-consent-channel").value,purpose:$("crm-consent-purpose").value,granted:$("crm-consent-granted").value==="true",source:"OWNER_CONFIRMED",evidence:$("crm-consent-evidence").value.trim()};
      await api(base()+"/customers/"+encodeURIComponent(selectedCustomer.id)+"/consents",{method:"POST",body:JSON.stringify(payload)});
      await loadCustomer(selectedCustomer.id);status("Consent decision saved to the audit history. No message was sent.");
    }catch(error){status(error.message,true);}
  }
  async function exportCustomer(){
    if(!selectedCustomer||!requireWorkspace())return;
    try{
      const result=await api(base()+"/customers/"+encodeURIComponent(selectedCustomer.id)+"/export");
      const blob=new Blob([JSON.stringify(result,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob),anchor=document.createElement("a");
      anchor.href=url;anchor.download="localboost-customer-"+selectedCustomer.id+".json";anchor.click();URL.revokeObjectURL(url);
      status("Customer data export prepared.");
    }catch(error){status(error.message,true);}
  }
  async function eraseCustomer(){
    if(!selectedCustomer||!requireWorkspace())return;
    const phrase=window.prompt('This permanently erases the customer profile, consent history and associated events. Type DELETE CUSTOMER to continue.');
    if(phrase!=="DELETE CUSTOMER")return;
    try{
      await api(base()+"/customers/"+encodeURIComponent(selectedCustomer.id),{method:"DELETE",body:JSON.stringify({confirmation:phrase})});
      selectedCustomer=null;await loadCustomers(true);
      $("crm-customer-detail").innerHTML='<div class="crm-empty"><strong>Customer erased</strong><p>The profile and associated personal data were permanently deleted.</p></div>';
      status("Customer data permanently erased.");
    }catch(error){status(error.message,true);}
  }
  async function loadRetention(){
    if(!requireWorkspace())return;
    try{const result=await api(base()+"/crm-retention");$("crm-retention-months").value=String(result.retentionMonths);}
    catch(error){status(error.message,true);}
  }
  async function saveRetention(){
    if(!requireWorkspace())return;
    try{
      const result=await api(base()+"/crm-retention",{method:"PATCH",body:JSON.stringify({retentionMonths:Number($("crm-retention-months").value)})});
      status("Retention period saved: "+result.retentionMonths+" months. Automatic deletion remains off.");
      $("crm-retention-preview-output").textContent="Run a fresh preview to see records older than this period.";
      $("crm-retention-apply").disabled=true;
    }catch(error){status(error.message,true);}
  }
  async function previewRetention(){
    if(!requireWorkspace())return;
    const preview=$("crm-retention-preview-output");preview.textContent="Checking expired records…";
    try{
      const result=await api(base()+"/crm-retention/preview");
      preview.textContent=result.count+" candidate records older than "+result.retentionMonths+" months. "+(result.capped?"Showing first 500; apply works in batches.":"");
      if(result.customers.length){
        const list=document.createElement("ul");list.className="crm-history";
        result.customers.forEach(row=>{const item=document.createElement("li");item.textContent=(row.name||"Unnamed")+" · "+(row.phoneE164||row.email||"No contact");list.append(item);});
        preview.append(list);
      }
      $("crm-retention-apply").disabled=result.count===0;
      $("crm-retention-apply").dataset.previewCount=String(result.count);
    }catch(error){preview.textContent=error.message;status(error.message,true);}
  }
  async function applyRetention(){
    if(!requireWorkspace())return;
    if(Number($("crm-retention-apply").dataset.previewCount||0)===0)return;
    const phrase=window.prompt('This permanently erases customer profiles and related CRM events older than the configured retention period. Type DELETE EXPIRED CUSTOMER DATA to continue.');
    if(phrase!=="DELETE EXPIRED CUSTOMER DATA")return;
    try{
      const result=await api(base()+"/crm-retention/apply",{method:"POST",body:JSON.stringify({confirmation:phrase})});
      $("crm-retention-preview-output").textContent=result.deleted+" expired customer records erased.";
      $("crm-retention-apply").disabled=true;delete $("crm-retention-apply").dataset.previewCount;
      await loadCustomers(true);status("Retention cleanup completed. "+result.deleted+" customer records erased.");
    }catch(error){status(error.message,true);}
  }
  function ready(event){
    businessId=event.detail?.businessId||sessionStorage.getItem(BUSINESS);
    selectedCustomer=null;
    install();
    const detail=$("crm-customer-detail");
    if(detail)detail.innerHTML='<div class="crm-empty"><strong>Select a customer</strong><p>Customer profile, contact consent and recorded activity will appear here.</p></div>';
    if(businessId&&!$("crm-workspace").classList.contains("hidden"))loadCustomers(true);
  }
  window.addEventListener("localboost:business-ready",ready);
  window.addEventListener("localboost:signed-out",()=>{
    businessId=null;cursor=null;selectedCustomer=null;
    const list=$("crm-customer-list"),detail=$("crm-customer-detail");
    if(list)list.innerHTML='<p class="empty-copy">Sign in and select a business to load customer records.</p>';
    if(detail)detail.innerHTML='<div class="crm-empty"><strong>Private workspace cleared</strong><p>Sign in again to view customer records.</p></div>';
    status("Signed out · private customer data cleared from this page.");
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install);else install();
  const saved=sessionStorage.getItem(BUSINESS);if(saved){businessId=saved;install();}
})();