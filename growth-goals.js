(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const API = () => (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\/$/, "");
  const token = () => sessionStorage.getItem("localboost_access_token");
  const business = () => sessionStorage.getItem("localboost_business_id");
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const labels = { NET_SALES: "Net sales", REVIEW_COUNT: "Review count", AVERAGE_RATING: "Average rating" };
  const money = value => "₹" + Number(value).toLocaleString("en-IN", {maximumFractionDigits:2});
  const metricValue = (metric,value) => metric==="NET_SALES"?money(value):metric==="AVERAGE_RATING"?Number(value).toFixed(2)+" / 5":Number(value).toLocaleString("en-IN");
  const currentMonth = () => new Date().toISOString().slice(0,7);
  let ready = false;
  async function api(path, options={}) {
    const response = await fetch(API()+path,{...options,headers:{"content-type":"application/json",authorization:"Bearer "+token(),...(options.headers||{})}});
    const payload=response.status===204?null:await response.json().catch(()=>null);
    if(!response.ok) throw new Error(payload?.error||"Request failed ("+response.status+")");
    return payload;
  }
  function say(text,error=false){const el=$("growth-goal-message");if(el){el.textContent=text;el.classList.toggle("error",error);}}
  function renderGoals(items){
    const root=$("growth-goal-list");if(!root)return;
    if(!items?.length){root.innerHTML='<p class="empty-copy">No targets saved for this month. Add one above to start tracking.</p>';return;}
    root.innerHTML=items.map(g=>{
      const pct=g.progressPercent===null?null:Math.max(0,Math.min(100,g.progressPercent));
      const state=g.status==="ACHIEVED"?"Achieved":g.status==="IN_PROGRESS"?"In progress":g.status==="BELOW_TARGET"?"Below target":"No data yet";
      return '<article class="goal-card"><div class="panel-heading"><div><h3>'+esc(labels[g.metric]||g.metric)+'</h3><p>'+esc(g.month)+' · '+esc(state)+'</p></div><button class="quiet-button" type="button" data-archive-goal="'+esc(g.id)+'">Archive</button></div><div class="goal-values"><strong>'+(g.actualValue===null?"No data":esc(metricValue(g.metric,g.actualValue)))+'</strong><span>Target '+esc(metricValue(g.metric,g.targetValue))+'</span></div><div class="progress"><i style="width:'+(pct===null?0:pct)+'%"></i></div><small>'+(pct===null?"Waiting for eligible saved records":esc(pct.toFixed(1)+"% of target · "+g.sampleSize+" records"))+'</small><p class="footnote">'+esc(g.note)+'</p></article>';
    }).join("");
  }
  function renderHistory(items){
    const root=$("growth-goal-history");if(!root)return;
    if(!items?.length){root.innerHTML='<p class="empty-copy">No historical goals yet.</p>';return;}
    root.innerHTML='<div class="goal-history">'+items.map(g=>'<div class="goal-history-row"><strong>'+esc(labels[g.metric]||g.metric)+'</strong><span>'+esc(g.month)+'</span><span>'+esc(g.actualValue===null?"No data":metricValue(g.metric,g.actualValue))+' / '+esc(metricValue(g.metric,g.targetValue))+'</span><span>'+esc(g.archived?"Archived":g.status.replaceAll("_"," "))+'</span></div>').join("")+'</div>';
  }
  async function load(){
    if(!token()||!business()){ready=false;renderGoals([]);renderHistory([]);say("Sign in and select a business to manage monthly targets.");return;}
    const month=$("growth-goal-month")?.value||currentMonth();
    try{
      const [current,history]=await Promise.all([
        api("/v1/businesses/"+encodeURIComponent(business())+"/growth-goals?month="+encodeURIComponent(month)),
        api("/v1/businesses/"+encodeURIComponent(business())+"/growth-goals/history?months=6")
      ]);
      renderGoals(current.goals);renderHistory(history.history);ready=true;
      say("Loaded "+current.goals.length+" active target(s). Actuals are based on saved owner records, not forecasts.");
    }catch(error){say(error.message,true);}
  }
  document.addEventListener("DOMContentLoaded",()=>{
    if(!$("growth-goal-form"))return;
    $("growth-goal-month").value=currentMonth();
    $("growth-goal-form").addEventListener("submit",async event=>{
      event.preventDefault();if(!token()||!business())return say("Sign in and select a business first.",true);
      const metric=$("growth-goal-metric").value,targetValue=Number($("growth-goal-target").value),month=$("growth-goal-month").value;
      if(!month||!Number.isFinite(targetValue)||targetValue<=0)return say("Enter a valid month and positive target.",true);
      if(metric==="AVERAGE_RATING"&&targetValue>5)return say("Average rating target cannot exceed 5.",true);
      if(metric==="REVIEW_COUNT"&&!Number.isInteger(targetValue))return say("Review count target must be a whole number.",true);
      try{await api("/v1/businesses/"+encodeURIComponent(business())+"/growth-goals",{method:"POST",body:JSON.stringify({metric,targetValue,month})});$("growth-goal-target").value="";say("Monthly target saved.");await load();}
      catch(error){say(error.message,true);}
    });
    $("growth-goal-month").addEventListener("change",load);
    $("refresh-growth-goals").addEventListener("click",load);
    $("growth-goal-list").addEventListener("click",async event=>{
      const button=event.target.closest("[data-archive-goal]");if(!button)return;
      if(!window.confirm("Archive this monthly target? It will remain in history."))return;
      try{await api("/v1/businesses/"+encodeURIComponent(business())+"/growth-goals/"+encodeURIComponent(button.dataset.archiveGoal),{method:"DELETE"});say("Target archived.");await load();}
      catch(error){say(error.message,true);}
    });
    window.addEventListener("localboost:business-ready",load);
    window.addEventListener("localboost:signed-out",()=>{ready=false;renderGoals([]);renderHistory([]);say("Signed out. Private growth goals cleared.");});
    if(token()&&business())load();
  });
})();