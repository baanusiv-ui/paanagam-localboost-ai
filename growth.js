(() => {
  "use strict";
  const KEY = "localboost_growth_workspace_v1";
  const $ = id => document.getElementById(id);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { menu: [], sales: [], retention: [], drafts: [] }; } catch { return { menu: [], sales: [], retention: [], drafts: [] }; } };
  const data = read();
  const save = () => localStorage.setItem(KEY, JSON.stringify(data));
  const money = value => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
  const safe = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  const today = new Date().toLocaleDateString("en-CA");
  if ($("sales-date")) $("sales-date").value = today;
  if ($("retention-date")) $("retention-date").value = today;

  function table(target, headers, rows) {
    const root = $(target); if (!root) return;
    if (!rows.length) { root.innerHTML = '<p class="empty-copy">No records entered yet.</p>'; return; }
    root.innerHTML = '<div class="table-scroll"><table><thead><tr>' + headers.map(h => '<th>' + safe(h) + '</th>').join("") + '</tr></thead><tbody>' +
      rows.map(row => '<tr>' + row.map(cell => '<td>' + safe(cell) + '</td>').join("") + '</tr>').join("") + '</tbody></table></div>';
  }
  function renderMenu() {
    table("menu-table", ["Item", "Price", "Unit cost", "Units", "Contribution / unit"], data.menu.map(item => [
      item.name, money(item.price), item.cost == null ? "Not supplied" : money(item.cost), item.qty,
      item.cost == null ? "Not calculated" : money(item.price - item.cost)
    ]));
  }
  function renderSales() {
    const total = data.sales.reduce((sum, item) => sum + item.net, 0);
    const orders = data.sales.reduce((sum, item) => sum + item.orders, 0);
    $("sales-days").textContent = String(data.sales.length);
    $("sales-total").textContent = money(total);
    $("sales-order-total").textContent = String(orders);
    $("sales-aov").textContent = money(orders ? total / orders : 0);
    table("sales-table", ["Date", "Net sales", "Orders", "Discounts", "Refunds", "Source"], data.sales.slice().sort((a,b) => b.date.localeCompare(a.date)).map(x => [x.date, money(x.net), x.orders, money(x.discounts), money(x.refunds), "Owner-confirmed"]));
  }
  function renderRetention() {
    const sums = data.retention.reduce((a,x) => ({ fresh:a.fresh+x.fresh, active:a.active+x.active, issued:a.issued+x.issued, redeemed:a.redeemed+x.redeemed }), {fresh:0,active:0,issued:0,redeemed:0});
    $("retention-summary").innerHTML = data.retention.length
      ? '<div class="retention-grid"><div><strong>' + sums.fresh + '</strong><small>New members (sum)</small></div><div><strong>' + sums.active + '</strong><small>Active member counts (sum of snapshots)</small></div><div><strong>' + sums.issued + '</strong><small>Rewards issued</small></div><div><strong>' + sums.redeemed + '</strong><small>Rewards redeemed</small></div></div><p class="footnote">Active-member snapshots are not unique people across dates and should not be summed as a unique-member total.</p>'
      : '<p class="empty-copy">No aggregates entered.</p>';
    table("retention-table", ["Date","New","Active snapshot","Issued","Redeemed"], data.retention.map(x => [x.date,x.fresh,x.active,x.issued,x.redeemed]));
  }
  function renderDrafts() {
    const root = $("approval-list"); if (!root) return;
    const pending = data.drafts.filter(d => d.status === "Pending");
    const count = document.querySelector(".nav-item[data-view='approvals'] .count");
    if (count) count.textContent = String(pending.length);
    const overview = $("overview-drafts"); if (overview) overview.textContent = String(pending.length);
    if (!data.drafts.length) { root.innerHTML = '<p class="empty-copy">No saved drafts. Create one in Campaign Studio.</p>'; return; }
    root.innerHTML = data.drafts.slice().reverse().map((d,index) => '<article class="draft-card"><div class="draft-card-head"><strong>' + safe(d.topic) + '</strong><span class="tag ' + (d.status === "Pending" ? "pending-tag" : "confirmed") + '">' + safe(d.status) + '</span></div><small>' + safe(d.created) + ' · ' + safe(d.language) + ' · Local draft</small><p>' + safe(d.text) + '</p>' + (d.status === "Pending" ? '<button class="secondary-button draft-approve" data-index="' + (data.drafts.length - 1 - index) + '">Mark reviewed</button>' : '') + '</article>').join("");
    root.querySelectorAll(".draft-approve").forEach(button => button.addEventListener("click", () => {
      const item = data.drafts[Number(button.dataset.index)];
      if (!item) return;
      item.status = "Reviewed locally"; save(); renderDrafts();
    }));
  }
  function renderAll() { renderMenu(); renderSales(); renderRetention(); renderDrafts(); }

  $("menu-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const name = $("menu-name").value.trim(), price = Number($("menu-price").value), costText = $("menu-cost").value, qty = Number($("menu-qty").value || 0);
    if (!name || !Number.isFinite(price) || price < 0 || (costText && (!Number.isFinite(Number(costText)) || Number(costText) < 0)) || qty < 0) return;
    data.menu.push({ name, price, cost: costText === "" ? null : Number(costText), qty, source: "OWNER_CONFIRMED", created: new Date().toISOString() });
    save(); renderMenu(); event.target.reset(); $("menu-qty").value = "0";
  });
  $("sales-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const item = { date:$("sales-date").value, net:Number($("sales-net").value), orders:Number($("sales-orders").value), discounts:Number($("sales-discounts").value||0), refunds:Number($("sales-refunds").value||0) };
    if (!item.date || Object.values(item).some(v => typeof v === "number" && (!Number.isFinite(v) || v < 0))) return;
    data.sales = data.sales.filter(x => x.date !== item.date); data.sales.push(item); save(); renderSales();
    $("sales-net").value = ""; $("sales-orders").value = "";
  });
  $("retention-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const item = { date:$("retention-date").value, fresh:Number($("retention-new").value), active:Number($("retention-active").value), issued:Number($("retention-issued").value||0), redeemed:Number($("retention-redeemed").value||0) };
    if (!item.date || Object.values(item).some(v => typeof v === "number" && (!Number.isFinite(v) || v < 0))) return;
    data.retention = data.retention.filter(x => x.date !== item.date); data.retention.push(item); save(); renderRetention();
  });
  $("save-draft")?.addEventListener("click", () => {
    const output = $("draft-output");
    if (!output || output.classList.contains("hidden") || !output.textContent.trim()) return;
    data.drafts.push({ topic:$("content-topic").value.trim(), language:$("content-language")?.value || "Tamil", text:output.textContent, status:"Pending", created:new Date().toLocaleString("en-IN") });
    save(); renderDrafts(); $("save-draft").disabled = true; $("save-draft").textContent = "Saved to approval centre";
  });
  $("make-draft")?.addEventListener("click", () => {
    const button = $("save-draft");
    if (button) { button.disabled = false; button.textContent = "Save draft to approval centre"; }
  });
  $("generate-insights")?.addEventListener("click", () => {
    const root = $("insight-list"); const items = [];
    if (!data.sales.length) items.push("No daily sales summaries are recorded. Add verified daily totals before drawing sales conclusions.");
    else {
      const total = data.sales.reduce((s,x)=>s+x.net,0), orders = data.sales.reduce((s,x)=>s+x.orders,0);
      items.push("Across " + data.sales.length + " recorded business dates, owner-entered net sales total " + money(total) + " from " + orders + " orders. Average order value is " + money(orders ? total/orders : 0) + ".");
      if (data.sales.length >= 2) {
        const sorted=data.sales.slice().sort((a,b)=>a.date.localeCompare(b.date));
        const first=sorted[0], last=sorted[sorted.length-1];
        items.push("First recorded date: " + first.date + " (" + money(first.net) + "); latest recorded date: " + last.date + " (" + money(last.net) + "). This is a date comparison, not proof of a trend.");
      }
    }
    if (!data.menu.length) items.push("No menu item data is entered. Add quantities and selling prices to identify item mix.");
    else {
      const ranked=data.menu.slice().sort((a,b)=>b.qty-a.qty);
      items.push("Highest recorded unit volume: " + ranked[0].name + " (" + ranked[0].qty + " units). This reflects only the entries in this browser.");
      const withCost=data.menu.filter(x=>x.cost!==null);
      if (withCost.length) {
        const best=withCost.slice().sort((a,b)=>(b.price-b.cost)-(a.price-a.cost))[0];
        items.push("Highest supplied contribution per unit: " + best.name + " at " + money(best.price-best.cost) + ". Validate recipe costing, waste, tax basis and effective date before using this for pricing.");
      } else items.push("No unit costs supplied. Contribution and menu profitability are not calculated.");
    }
    if (data.retention.length) items.push("Retention data has " + data.retention.length + " dated aggregate snapshots. Active-member snapshots must not be added together as unique members.");
    root.innerHTML = '<ul class="insight-list-items">' + items.map(x=>'<li>'+safe(x)+'</li>').join("") + '</ul><p class="footnote">Rules-based summary of browser-local owner entries only. Not AI-generated, not POS-verified and not a forecast.</p>';
  });
  renderAll();
})();