
const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "kvz_zakup_v1";

const state = {
  draft: {
    supplier: "",
    date: "",
    items: []
  },
  purchases: []
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseNum(v) {
  v = String(v ?? "").replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(n) {
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  return v.toLocaleString("ru-RU") + " ₽";
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data?.draft) state.draft = data.draft;
    if (Array.isArray(data?.purchases)) state.purchases = data.purchases;
  } catch {}
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clampDateToISO(input) {
  // Accept "YYYY-MM-DD" or "DD.MM.YYYY" and convert to ISO
  const s = String(input ?? "").trim();
  if (!s) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/;

  let m = s.match(iso);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(ru);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  // fallback: keep as is
  return s;
}

function draftTotal() {
  return state.draft.items.reduce((sum, it) => sum + it.qty * it.price, 0);
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

/* ----- Tabs ----- */
function showTab(tab) {
  if (tab === "buy") {
    $("pageBuy").classList.remove("hidden");
    $("pageHist").classList.add("hidden");
    $("tabBuy").classList.add("active");
    $("tabHist").classList.remove("active");
  } else {
    $("pageBuy").classList.add("hidden");
    $("pageHist").classList.remove("hidden");
    $("tabBuy").classList.remove("active");
    $("tabHist").classList.add("active");
  }
}

/* ----- Render BUY ----- */
function renderBuy() {
  $("inpSupplier").value = state.draft.supplier || "";
  $("inpDate").value = state.draft.date || todayISO();

  const list = $("buyList");
  list.innerHTML = "";

  for (const it of state.draft.items) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="itemTop">${esc(it.name)}</div>
      <div class="itemBottom">
        <div class="qty">${esc(it.qty)}</div>
        <div class="price">${money(it.price)}</div>
      </div>
    `;
    el.addEventListener("click", () => openModal(it.id));
    list.appendChild(el);
  }

  $("buyTotal").textContent = money(draftTotal());
}

/* ----- Render HISTORY ----- */
function renderHistory() {
  const root = $("histList");
  root.innerHTML = "";

  if (state.purchases.length === 0) return;

  const arr = state.purchases.slice().reverse();

  for (const p of arr) {
    const card = document.createElement("div");
    card.className = "hcard";

    const badgeClass = p.imported ? "badge ok" : "badge";
    const badgeText = p.imported ? "✓" : "⤓";

    card.innerHTML = `
      <div class="hhead">
        <div class="hleft">
          <div class="htitle">${esc(p.date)} • ${esc(p.supplier || "")}</div>
          <div class="hmeta">${p.items.length} • ${money(p.total)}</div>
        </div>
        <div class="hright">
          <div class="${badgeClass}" data-badge="1" title="${p.imported ? "Импортировано" : ""}">${badgeText}</div>
        </div>
      </div>
      <div class="hitems"></div>
      <div class="hbtns">
        <button class="sbtn primary ${p.imported ? "disabled" : ""}" data-act="import">Импорт</button>
        <button class="sbtn" data-act="del">Удалить</button>
      </div>
    `;

    const itemsBox = card.querySelector(".hitems");
    for (const it of p.items) {
      const row = document.createElement("div");
      row.className = "hrow";
      row.innerHTML = `
        <div class="n">${esc(it.name)}</div>
        <div class="r">${esc(it.qty)} • ${money(it.price)}</div>
      `;
      itemsBox.appendChild(row);
    }

    card.querySelector(".hhead").addEventListener("click", (e) => {
      // Don't toggle on badge clicks
      if (e.target && e.target.getAttribute("data-badge") === "1") return;
      card.classList.toggle("open");
    });

    // Import button
    const btnImport = card.querySelector('[data-act="import"]');
    btnImport.addEventListener("click", (e) => {
      e.stopPropagation();
      if (p.imported) return;
      doImport(p.id);
    });

    // Delete button
    const btnDel = card.querySelector('[data-act="del"]');
    btnDel.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm("Удалить?")) return;
      state.purchases = state.purchases.filter(x => x.id !== p.id);
      save();
      renderHistory();
    });

    // Long press on badge to reset imported
    const badge = card.querySelector('[data-badge="1"]');
    setupLongPress(badge, () => {
      if (!p.imported) return;
      if (!confirm("Сбросить импорт?")) return;
      const ref = state.purchases.find(x => x.id === p.id);
      if (!ref) return;
      ref.imported = false;
      ref.importedAt = null;
      save();
      renderHistory();
    });

    root.appendChild(card);
  }
}

/* ----- Long press helper ----- */
function setupLongPress(el, onLong) {
  let t = null;
  let fired = false;

  const start = (e) => {
    fired = false;
    // avoid iOS selection/context menu as much as possible
    if (e?.preventDefault) e.preventDefault();
    t = setTimeout(() => {
      fired = true;
      onLong();
    }, 550);
  };

  const end = (e) => {
    if (e?.preventDefault) e.preventDefault();
    clearTimeout(t);
  };

  el.addEventListener("touchstart", start, { passive: false });
  el.addEventListener("touchend", end, { passive: false });
  el.addEventListener("touchmove", end, { passive: false });
  el.addEventListener("mousedown", start);
  el.addEventListener("mouseup", end);
  el.addEventListener("mouseleave", end);
}

/* ----- Export / Import file ----- */
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function doImport(purchaseId) {
  const p = state.purchases.find(x => x.id === purchaseId);
  if (!p) return;

  const payload = {
    version: 1,
    purchaseId: p.id,
    supplier: p.supplier || "",
    date: p.date,
    items: p.items.map(i => ({ name: i.name, qty: i.qty, price: i.price }))
  };

  const safeDate = String(p.date || "").replaceAll(":", "-").replaceAll("/", "-");
  const filename = `zakup_import_${safeDate}_${p.id.slice(-6)}.json`;

  downloadFile(filename, JSON.stringify(payload, null, 2), "application/json");

  p.imported = true;
  p.importedAt = new Date().toISOString();
  save();
  renderHistory();
}

/* ----- Modal editor ----- */
let editingId = null;

function openModal(itemId) {
  editingId = itemId ?? null;
  const it = editingId ? state.draft.items.find(x => x.id === editingId) : null;

  $("mTitle").textContent = it ? "Изменить" : "Добавить";
  $("mName").value = it?.name ?? "";
  $("mQty").value = it ? String(it.qty).replace(".", ",") : "";
  $("mPrice").value = it ? String(it.price).replace(".", ",") : "";

  $("mDelete").classList.toggle("hidden", !it);

  $("modal").classList.remove("hidden");
  $("modal").setAttribute("aria-hidden", "false");
  setTimeout(() => $("mName").focus(), 50);
}

function closeModal() {
  $("modal").classList.add("hidden");
  $("modal").setAttribute("aria-hidden", "true");
  editingId = null;
}

function saveModal() {
  const name = $("mName").value.trim();
  const qty = parseNum($("mQty").value);
  const price = parseNum($("mPrice").value);

  if (!name) { alert("Название"); return; }
  if (qty <= 0) { alert("Кол-во"); return; }

  if (editingId) {
    const it = state.draft.items.find(x => x.id === editingId);
    if (!it) return;
    it.name = name;
    it.qty = qty;
    it.price = price;
  } else {
    state.draft.items.push({ id: uid(), name, qty, price });
  }

  save();
  renderBuy();
  closeModal();
}

function deleteModal() {
  if (!editingId) return;
  state.draft.items = state.draft.items.filter(x => x.id !== editingId);
  save();
  renderBuy();
  closeModal();
}

/* ----- Save purchase ----- */
function savePurchase() {
  const supplier = (state.draft.supplier || "").trim();
  const date = clampDateToISO($("inpDate").value) || todayISO();

  if (state.draft.items.length === 0) {
    alert("Пусто");
    return;
  }

  const items = state.draft.items.map(i => ({ name: i.name, qty: i.qty, price: i.price }));
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);

  state.purchases.push({
    id: uid(),
    supplier,
    date,
    items,
    total,
    imported: false,
    importedAt: null
  });

  state.draft.items = [];
  state.draft.date = todayISO();

  save();
  renderBuy();
  renderHistory();
}

/* ----- Init ----- */
function init() {
  load();

  if (!state.draft.date) state.draft.date = todayISO();

  $("inpSupplier").addEventListener("input", (e) => {
    state.draft.supplier = e.target.value;
    save();
  });

  $("inpDate").value = state.draft.date || todayISO();
  $("inpDate").addEventListener("change", (e) => {
    state.draft.date = clampDateToISO(e.target.value);
    e.target.value = state.draft.date;
    save();
  });

  $("btnAdd").addEventListener("click", () => openModal(null));
  $("btnSavePurchase").addEventListener("click", savePurchase);

  $("tabBuy").addEventListener("click", () => showTab("buy"));
  $("tabHist").addEventListener("click", () => showTab("hist"));

  $("mClose").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  $("mSave").addEventListener("click", saveModal);
  $("mDelete").addEventListener("click", deleteModal);

  renderBuy();
  renderHistory();
  showTab("buy");
}

init();
