(() => {
  const views = ["overview", "audit", "competitors", "reviews", "content", "approvals"];
  const titles = {
    overview: "Overview",
    audit: "Local presence audit",
    competitors: "Competitors",
    reviews: "Reviews",
    content: "Content studio",
    approvals: "Approval centre"
  };

  function showView(name) {
    if (!views.includes(name)) return;
    views.forEach(view => {
      const panel = document.getElementById(view + "-view");
      if (panel) panel.classList.toggle("hidden", view !== name);
    });
    document.querySelectorAll(".nav-item").forEach(button => {
      button.classList.toggle("active", button.dataset.view === name);
    });
    document.getElementById("crumb-title").textContent = titles[name];
    document.getElementById("page-title").innerHTML =
      name === "overview" ? 'Good morning, Paanagam <span>✦</span>' : titles[name];
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  document.querySelectorAll("[data-go]").forEach(button => {
    button.addEventListener("click", () => showView(button.dataset.go));
  });

  document.getElementById("run-audit").addEventListener("click", () => showView("audit"));
  document.getElementById("dismiss-notice").addEventListener("click", () => {
    document.querySelector(".notice").classList.add("hidden");
  });

  document.getElementById("make-draft").addEventListener("click", () => {
    const topic = document.getElementById("content-topic").value.trim();
    const tone = document.getElementById("content-tone").value;
    const output = document.getElementById("draft-output");
    if (!topic) {
      document.getElementById("content-topic").focus();
      document.getElementById("content-topic").placeholder = "Please enter a topic first";
      return;
    }
    output.textContent =
      "SAMPLE DRAFT — REVIEW BEFORE USE\n\n" +
      "ஒரு நல்ல நாளை ஒரு நல்ல காபியுடன் தொடங்குங்கள்! ☕\n\n" +
      "பானகத்தில் " + topic + " — உங்கள் நாளில் ஒரு சின்ன மகிழ்ச்சி. " +
      "நண்பர்களுடன் பகிர்ந்து கொள்ளுங்கள்!\n\n" +
      "Tone: " + tone + "\n\n" +
      "Note: This is a locally generated template, not AI research or a published post. Verify all claims, details and availability before approval.";
    output.classList.remove("hidden");
  });
})();