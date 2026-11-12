(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const API = () => (window.LOCALBOOST_API_BASE || "http://localhost:4100").replace(/\/$/, "");
  const TOKEN = "localboost_access_token", BUSINESS = "localboost_business_id";
  const businessId = () => sessionStorage.getItem(BUSINESS);
  const token = () => sessionStorage.getItem(TOKEN);
  const base = () => "/v1/businesses/" + encodeURIComponent(businessId());
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let modelCatalogue = [], generationEnabled = false, pollTimer = null, videoUrls = [];

  async function api(path, options = {}) {
    if (!token() || !businessId()) throw new Error("Sign in and select a business workspace first.");
    const headers = { authorization: "Bearer " + token(), ...(options.body ? {"content-type":"application/json"} : {}), ...(options.headers || {}) };
    const response = await fetch(API() + path, { ...options, headers });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "Request failed (" + response.status + ")");
    return data;
  }
  function message(text, error = false) {
    const el = $("poyo-studio-message");
    if (el) { el.textContent = text; el.classList.toggle("error", error); }
  }
  function selectedModelId() {
    return $("poyo-video-mode")?.value === "IMAGE_TO_VIDEO"
      ? "wan2.2-image-to-video-fast" : "wan2.2-text-to-video-fast";
  }
  function renderModelOptions() {
    const select = $("poyo-model-id");
    if (!select) return;
    const selected = selectedModelId();
    const available = modelCatalogue.filter(m => m.mediaType === "VIDEO");
    select.innerHTML = available.map(m => '<option value="' + esc(m.id) + '">' + esc(m.name) + '</option>').join("") || '<option value="">WAN 2.2 models unavailable</option>';
    select.value = available.some(m => m.id === selected) ? selected : (available[0]?.id || "");
    const imageMode = $("poyo-video-mode")?.value === "IMAGE_TO_VIDEO";
    if ($("poyo-image-urls-wrap")) $("poyo-image-urls-wrap").hidden = !imageMode;
    if ($("poyo-aspect-wrap")) $("poyo-aspect-wrap").hidden = imageMode;
  }
  async function loadModels() {
    if (!businessId() || !token()) return;
    try {
      const result = await api("/v1/creative-integrations/poyo/models?mediaType=VIDEO");
      modelCatalogue = result.models || [];
      generationEnabled = Boolean(result.generationEnabled);
      const root = $("poyo-model-list");
      if (root) root.innerHTML = modelCatalogue.map(m =>
        '<article class="metric-card"><div class="metric-top"><strong>' + esc(m.name) + '</strong><span class="tag ' + (generationEnabled ? "confirmed" : "pending-tag") + '">' + (generationEnabled ? "Configured" : "Paused") + '</span></div>' +
        '<p>' + esc(m.provider) + ' · ' + esc((m.resolutions || ["480p"]).join(" / ")) + '</p><p>' + esc((m.useCases || []).join(" · ")) + '</p>' +
        '<strong>480p · ' + esc(m.estimatedCredits ?? 6) + ' credits / generation</strong><p><a href="' + esc(m.documentationUrl) + '" target="_blank" rel="noopener noreferrer">PoYo model documentation</a></p></article>'
      ).join("") || '<p class="empty-copy">WAN 2.2 models are unavailable.</p>';
      renderModelOptions();
      const banner = $("poyo-generation-state");
      if (banner) banner.textContent = generationEnabled
        ? "PoYo is configured. Each 480p generation uses 6 credits and requires administrator access."
        : "Drafts and previews are available. Paid generation is paused by the POYO_ENABLED safety flag.";
    } catch (e) { message("PoYo model catalogue unavailable: " + e.message, true); }
  }

  function revokeVideoUrls() {
    videoUrls.forEach(url => URL.revokeObjectURL(url));
    videoUrls = [];
  }
  async function hydrateVideos() {
    for (const video of document.querySelectorAll("#poyo-task-list video[data-video-path]")) {
      if (video.dataset.loaded === "true") continue;
      video.dataset.loaded = "true";
      try {
        const response = await fetch(API() + video.dataset.videoPath, { headers: { authorization: "Bearer " + token() } });
        if (!response.ok) throw new Error("Video preview unavailable");
        const objectUrl = URL.createObjectURL(await response.blob());
        videoUrls.push(objectUrl);
        if (video.isConnected) video.src = objectUrl;
        else URL.revokeObjectURL(objectUrl);
      } catch { video.poster = ""; video.dataset.loaded = "error"; }
    }
  }
  async function loadTasks({refreshPending = false} = {}) {
    if (!businessId() || !token()) return;
    try {
      let result = await api(base() + "/poyo/tasks");
      let tasks = result.tasks || [];
      if (refreshPending) {
        const pending = tasks.filter(t => ["SUBMITTED", "PROCESSING"].includes(t.status));
        for (const task of pending) {
          try { await api(base() + "/poyo/tasks/" + encodeURIComponent(task.id) + "/refresh", {method:"POST", body:"{}"}); }
          catch { /* Keep the job visible; the next refresh can retry. */ }
        }
        if (pending.length) { result = await api(base() + "/poyo/tasks"); tasks = result.tasks || []; }
      }
      revokeVideoUrls();
      const root = $("poyo-task-list");
      if (root) root.innerHTML = tasks.map(t => {
        const pending = ["SUBMITTED", "PROCESSING"].includes(t.status);
        const approved = Boolean(t.approvedAt);
        const preview = (t.outputUrls || []).find(url => typeof url === "string" && url.includes("/poyo/assets/"));
        return '<article class="social-post-card"><div class="social-post-head"><strong>' + esc(t.modelId) + '</strong><span class="tag ' + (t.status === "SUCCEEDED" ? "confirmed" : "pending-tag") + '">' + esc(t.status) + '</span></div>' +
          '<p>' + esc(t.prompt) + '</p><small>480p · ' + esc(t.estimatedCredits ?? 6) + ' estimated credits · ' + esc(new Date(t.createdAt).toLocaleString()) + '</small>' +
          (preview ? '<video controls playsinline preload="metadata" data-video-path="' + esc(preview) + '" style="display:block;width:100%;max-height:420px;margin-top:12px;border-radius:12px;background:#111"></video>' : '') +
          (t.errorMessage ? '<p class="footnote">' + esc(t.errorMessage) + '</p>' : '') +
          '<div class="form-actions">' +
          (t.status === "DRAFT" && generationEnabled ? '<button type="button" class="secondary-button" data-generate="' + esc(t.id) + '">Generate · 6 credits</button>' : '') +
          (pending ? '<button type="button" class="secondary-button" data-refresh="' + esc(t.id) + '">Check status</button>' : '') +
          (t.status === "SUCCEEDED" && !approved ? '<button type="button" class="secondary-button" data-approve="' + esc(t.id) + '">Approve video</button>' : '') +
          (approved ? '<span class="tag confirmed">Owner approved · not published</span>' : '') +
          '</div></article>';
      }).join("") || '<p class="empty-copy">No PoYo video drafts yet.</p>';
      await hydrateVideos();
      const hasPending = tasks.some(t => ["SUBMITTED", "PROCESSING"].includes(t.status));
      if (hasPending && !pollTimer) pollTimer = setInterval(() => loadTasks({refreshPending:true}), 10000);
      if (!hasPending && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    } catch (e) { message("PoYo video jobs unavailable: " + e.message, true); }
  }

  $("poyo-video-mode")?.addEventListener("change", renderModelOptions);
  $("poyo-draft-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const button = $("poyo-save-draft");
    if (!button) return;
    button.disabled = true;
    try {
      const mode = $("poyo-video-mode").value;
      const modelId = mode === "IMAGE_TO_VIDEO" ? "wan2.2-image-to-video-fast" : "wan2.2-text-to-video-fast";
      const prompt = $("poyo-prompt").value.trim();
      if (!prompt || prompt.length > 800) throw new Error("Enter a prompt of up to 800 characters.");
      const modelInput = { resolution: "480p" };
      if (mode === "TEXT_TO_VIDEO") modelInput.aspect_ratio = $("poyo-aspect-ratio").value;
      else {
        const urls = $("poyo-image-urls").value.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
        if (urls.length < 1 || urls.length > 2 || !urls.every(v => /^https:\/\//i.test(v))) throw new Error("Enter one or two publicly accessible HTTPS image URLs.");
        modelInput.image_urls = urls;
      }
      await api(base() + "/poyo/tasks", {method:"POST", body:JSON.stringify({mediaType:"VIDEO", modelId, prompt, modelInput})});
      $("poyo-prompt").value = "";
      if ($("poyo-image-urls")) $("poyo-image-urls").value = "";
      await loadTasks();
      message("Video draft saved. No PoYo request was sent and no credits were used.");
    } catch (err) { message("Could not save video draft: " + err.message, true); }
    finally { button.disabled = false; }
  });

  $("poyo-task-list")?.addEventListener("click", async e => {
    const generate = e.target.closest("[data-generate]")?.dataset.generate;
    const approve = e.target.closest("[data-approve]")?.dataset.approve;
    const refresh = e.target.closest("[data-refresh]")?.dataset.refresh;
    const id = generate || approve || refresh;
    if (!id) return;
    const button = e.target.closest("button");
    if (button) button.disabled = true;
    try {
      if (generate) {
        if (!generationEnabled) throw new Error("Paid generation is paused.");
        const result = await api(base() + "/poyo/tasks/" + encodeURIComponent(id) + "/submit", {method:"POST", body:"{}"});
        message("PoYo job submitted. Estimated cost: " + (result.estimatedCredits ?? 6) + " credits. Waiting for video…");
      } else if (approve) {
        await api(base() + "/poyo/tasks/" + encodeURIComponent(id) + "/approve", {method:"POST", body:"{}"});
        message("Owner approval recorded. The video has not been published.");
      } else {
        await api(base() + "/poyo/tasks/" + encodeURIComponent(id) + "/refresh", {method:"POST", body:"{}"});
        message("Video job status refreshed.");
      }
      await loadTasks({refreshPending:true});
    } catch (err) { message("PoYo action failed: " + err.message, true); }
    finally { if (button?.isConnected) button.disabled = false; }
  });
  $("poyo-refresh")?.addEventListener("click", () => loadTasks({refreshPending:true}));
  async function init() {
    if (!businessId() || !token()) return;
    await loadModels();
    await loadTasks({refreshPending:true});
  }
  window.addEventListener("localboost:business-ready", init);
  window.addEventListener("localboost:signed-out", () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    revokeVideoUrls();
    const root = $("poyo-task-list");
    if (root) root.innerHTML = '<p class="empty-copy">Sign in to view PoYo video jobs.</p>';
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
