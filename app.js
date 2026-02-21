/* KompVLZ Закупки — PWA (offline, localStorage)
   Rules:
   - Items are cards: name, qty (>=1), price (last number in input); empty => 0
   - Export: short => current purchase, long => backup all
   - Mark imported => archived/read-only
*/

const LS_KEY = "kompvlz_purchases_v1";
const APP_ID = "KompVLZ.Purchases";
const FORMAT_VERSION = 1;
const CURRENCY = "RUB";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const pageList = $("#pageList");
const pageEdit = $("#pageEdit");
const listEl = $("#list");
const btnNew = $("#btnNew");
const btnExportAll = $("#btnExportAll");

const inpDate = $("#inpDate");
const inpSupplier = $("#inpSupplier");
const itemsEl = $("#items");
const btnAddItem = $("#btnAddItem");
const btnExportOne = $("#btnExportOne");
const btnMarkImported = $("#btnMarkImported");
const btnDeletePurchase = $("#btnDeletePurchase");
const btnBackToList = $("#btnBackToList");
const editTitle = $("#editTitle");
const editMeta = $("#editMeta");
const sumTotal = $("#sumTotal");

const toast = $("#toast");

let state = loadState();
migrateState();
let currentId = null;
let currentFilter = "todo";

function nowIso() {
  return new Date().toISOString();
}
function pad2(n){ return String(n).padStart(2,"0"); }
function localIsoWithOffset(d = new Date()){
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  const abs = Math.abs(tz);
  const hh = pad2(Math.floor(abs / 60));
  const mm = pad2(abs % 60);
  const base = d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate())+"T"+pad2(d.getHours())+":"+pad2(d.getMinutes())+":"+pad2(d.getSeconds());
  return base + sign + hh + ":" + mm;
}
function todayYmd(){
  const d = new Date();
  return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
}
function randHex(len=6){
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a).map(x => x.toString(16).padStart(2,"0")).join("").slice(0,len);
}
function makeId(){
  const d = new Date();
  return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}_${randHex(6)}`;
}

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return { purchases: [] };
    const parsed = JSON.parse(raw);
    if(!parsed || !Array.isArray(parsed.purchases)) return { purchases: [] };
    return parsed;
  }catch{
    return { purchases: [] };
  }
}

function migrateState(){
  if(!state || !Array.isArray(state.purchases)) return;
  for(const p of state.purchases){
    if(typeof p.archived !== "boolean") p.archived = false;
  }
  saveState();
}

function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

function showToast(msg){
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 1600);
}

function money(n){
  const v = Number.isFinite(n) ? n : 0;
  // format with spaces
  const s = Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return s + " ₽";
}

function parseLastNumber(str){
  if(!str) return 0;
  // extract last number (allow spaces and commas)
  const matches = String(str).match(/(\d[\d\s.,]*)/g);
  if(!matches || matches.length === 0) return 0;
  const last = matches[matches.length - 1];
  const cleaned = last.replace(/\s+/g,"").replace(",", ".");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function calcPurchaseSum(p){
  return (p.items || []).reduce((acc,it) => acc + (Number(it.qty)||1) * (Number(it.price)||0), 0);
}

function setPage(which){
  if(which === "list"){
    pageList.classList.add("active");
    pageEdit.classList.remove("active");
  }else{
    pageList.classList.remove("active");
    pageEdit.classList.add("active");
  }
}

function getPurchase(id){
  return state.purchases.find(p => p.id === id) || null;
}

function ensureAtLeastOneItem(p){
  if(!Array.isArray(p.items)) p.items = [];
  if(p.items.length === 0){
    p.items.push({ name:"", qty:1, price:0 });
  }
}

function renderList(){
  listEl.innerHTML = "";
  let items = [...state.purchases];
  // sort: latest first by date then createdAt
  items.sort((a,b) => (b.date||"").localeCompare(a.date||"") || (b.createdAt||"").localeCompare(a.createdAt||""));
  if(currentFilter === "todo"){
    items = items.filter(p => !p.imported && !p.archived);
  }else if(currentFilter === "imp"){
    items = items.filter(p => !!p.imported && !p.archived);
  }else if(currentFilter === "arch"){
    items = items.filter(p => !!p.archived);
  }
  if(currentFilter !== "todo" && currentFilter !== "imp" && currentFilter !== "arch") currentFilter = "todo";

  if(items.length === 0){
    const empty = document.createElement("div");
    empty.style.padding = "18px 6px";
    empty.style.color = "var(--muted)";
    empty.textContent = "Пока пусто. Нажми + чтобы создать закупку.";
    listEl.appendChild(empty);
    return;
  }

  for(const p of items){
    const row = document.createElement("div");
    row.className = "purchaseRow " + (p.archived ? "archived" : (p.imported ? "done" : "todo")) + (currentFilter==="arch" ? " arch" : "");
    row.tabIndex = 0;

    const top = document.createElement("div");
    top.className = "purchaseTop";
    const date = document.createElement("div");
    date.className = "date";
    date.textContent = p.date || "—";
    const sum = document.createElement("div");
    sum.className = "sum";
    sum.textContent = money(calcPurchaseSum(p));
    top.appendChild(date); top.appendChild(sum);

    const bottom = document.createElement("div");
    bottom.className = "purchaseBottom";
    const supplier = document.createElement("div");
    supplier.textContent = (p.supplier && p.supplier.trim()) ? p.supplier.trim() : " ";
    const badge = document.createElement("div");
    badge.className = "badge " + (p.imported ? "done" : "todo");
    badge.textContent = p.imported ? "Импортировано" : "Не импортировано";
    bottom.appendChild(supplier);
    bottom.appendChild(badge);

    row.appendChild(top);
    row.appendChild(bottom);

    row.addEventListener("click", () => openPurchase(p.id));
    row.addEventListener("keydown", (e) => {
      if(e.key === "Enter" || e.key === " ") openPurchase(p.id);
    });

    listEl.appendChild(row);
  }
}

function renderEdit(){
  const p = getPurchase(currentId);
  if(!p) return;
  ensureAtLeastOneItem(p);

  editTitle.textContent = "Закупка";
  const sum = calcPurchaseSum(p);
  editMeta.textContent = `${p.imported ? "Импортировано" : "Не импортировано"} • ${money(sum)}`;

  inpDate.value = p.date || todayYmd();
  inpSupplier.value = p.supplier || "";

  const readOnly = !!p.imported;
  inpDate.disabled = readOnly;
  inpSupplier.disabled = readOnly;
  btnAddItem.disabled = readOnly;
  btnMarkImported.disabled = readOnly;

  itemsEl.innerHTML = "";

  p.items.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "itemRow";

    const name = document.createElement("input");
    name.className = "name";
    name.type = "text";
    name.placeholder = "";
    name.value = it.name || "";
    name.disabled = readOnly;

    const qty = document.createElement("input");
    qty.className = "qty";
    qty.inputMode = "numeric";
    qty.type = "text";
    qty.value = String(Math.max(1, Number(it.qty) || 1));
    qty.disabled = readOnly;

    const price = document.createElement("input");
    price.className = "price";
    price.inputMode = "numeric";
    price.type = "text";
    price.placeholder = "0";
    price.value = (it._rawPrice != null) ? String(it._rawPrice) : (it.price ? String(it.price) : "");
    price.disabled = readOnly;

    const del = document.createElement("button");
    del.className = "delBtn";
    del.textContent = "✖";
    del.title = "Удалить";
    del.disabled = readOnly;

    row.appendChild(name);
    row.appendChild(qty);
    row.appendChild(price);
    row.appendChild(del);

    itemsEl.appendChild(row);

    name.addEventListener("input", () => {
      it.name = name.value;
      touchPurchase();
    });

    qty.addEventListener("blur", () => {
      const n = parseLastNumber(qty.value);
      it.qty = Math.max(1, n || 1);
      qty.value = String(it.qty);
      touchPurchase();
    });

    price.addEventListener("input", () => {
      it._rawPrice = price.value;
      it.price = parseLastNumber(price.value);
      touchPurchase();
    });
    price.addEventListener("blur", () => {
      if (!price.value.trim()) {
        it._rawPrice = "";
        it.price = 0;
      } else {
        it.price = parseLastNumber(price.value);
      }
      touchPurchase();
      updateTotals();
    });

    // Enter from price => new row and focus name
    price.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addItemAndFocus();
      }
    });

    del.addEventListener("click", () => {
      p.items.splice(idx, 1);
      if (p.items.length === 0) p.items.push({ name: "", qty: 1, price: 0 });
      touchPurchase();
      renderEdit();
      updateTotals();
    });
  });

  updateTotals();
}

function updateTotals(){
  const p = getPurchase(currentId);
  if(!p) return;
  const sum = calcPurchaseSum(p);
  sumTotal.textContent = money(sum);
  editMeta.textContent = `${p.imported ? "Импортировано" : "Не импортировано"} • ${money(sum)}`;
}

function touchPurchase(){
  const p = getPurchase(currentId);
  if(!p) return;
  p.updatedAt = localIsoWithOffset(new Date());
  saveState();
  updateTotals();
}

function addItemAndFocus(){
  const p = getPurchase(currentId);
  if(!p || p.imported) return;
  p.items.push({ name:"", qty:1, price:0 });
  touchPurchase();
  renderEdit();
  // focus last name
  setTimeout(() => {
    const names = $$("#items input.name");
    const last = names[names.length - 1];
    if(last){
      last.scrollIntoView({ block: "center", behavior: "smooth" });
      last.focus();
      try{ last.click(); }catch{}
      try{ last.setSelectionRange(9999, 9999); }catch{}
    }
  }, 30);
}

function openPurchase(id){
  currentId = id;
  setPage("edit");
  renderEdit();
}

function newPurchase(){
  const id = makeId();
  const p = {
    id,
    date: todayYmd(),
    supplier: "",
    imported: false,
    importedAt: null,
    archived: false,
    createdAt: localIsoWithOffset(new Date()),
    updatedAt: localIsoWithOffset(new Date()),
    items: [{ name:"", qty:1, price:0 }]
  };
  state.purchases.push(p);
  saveState();
  renderList();
  openPurchase(id);
  setTimeout(() => {
    const first = $("#items input.name");
    if(first) first.focus();
  }, 30);
}

function backToList(){
  currentId = null;
  setPage("list");
  renderList();
}

// Export helpers
function downloadJson(filename, obj){
  downloadText(filename, JSON.stringify(obj, null, 2));
}

function downloadText(filename, text, mime="application/json"){
  const blob = new Blob([text], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function exportOne(){
  const p = getPurchase(currentId);
  if(!p) return;
  // Clean raw fields
  const cleanItems = (p.items||[]).map(it => ({
    name: (it.name||"").trim(),
    qty: Math.max(1, Number(it.qty)||1),
    price: Math.max(0, Number(it.price)||0),
    currency: CURRENCY
  }));
  const payload = {
    app: APP_ID,
    formatVersion: FORMAT_VERSION,
    exportedAt: localIsoWithOffset(new Date()),
    purchase: {
      id: p.id,
      date: p.date,
      supplier: (p.supplier||"").trim(),
      imported: !!p.imported,
      importedAt: p.importedAt,
      items: cleanItems
    }
  };
  const fname = `purchase_${p.date || todayYmd()}.json`;
  downloadText(fname, JSON.stringify(payload, null, 2));
  showToast("Экспорт: " + fname);
}

function exportAll(){
  const payload = {
    app: APP_ID,
    formatVersion: FORMAT_VERSION,
    exportedAt: localIsoWithOffset(new Date()),
    purchases: state.purchases.map(p => ({
      id: p.id,
      date: p.date,
      supplier: (p.supplier||"").trim(),
      imported: !!p.imported,
      importedAt: p.importedAt,
      items: (p.items||[]).map(it => ({
        name: (it.name||"").trim(),
        qty: Math.max(1, Number(it.qty)||1),
        price: Math.max(0, Number(it.price)||0),
        currency: CURRENCY
      }))
    }))
  };
  const fname = "purchases_backup.json";
  downloadText(fname, JSON.stringify(payload, null, 2));
  showToast("Экспорт: backup");
}

function markImported(){
  const p = getPurchase(currentId);
  if(!p || p.imported) return;
  p.imported = true;
  p.importedAt = localIsoWithOffset(new Date());
  touchPurchase();
  showToast("Импортировано");
  // lock view
  renderEdit();
}

function deleteCurrentPurchase(){
  const p = getPurchase(currentId);
  if(!p) return;
  const label = (p.supplier || "").trim();
  const msg = label ? `Удалить закупку: ${label}?` : "Удалить закупку?";
  if(!confirm(msg)) return;
  state.purchases = state.purchases.filter(x => x.id !== currentId);
  currentId = null;
  saveState();
  setPage("list");
  renderList();
}


function attachLongPress(btn, shortFn, longFn, ms=520){
  let t = null;
  let long = false;

  const start = (e) => {
    long = false;
    clearTimeout(t);
    t = setTimeout(() => {
      long = true;
      longFn();
      navigator.vibrate?.(20);
    }, ms);
  };
  const end = (e) => {
    clearTimeout(t);
    if(!long){
      shortFn();
    }
  };

  btn.addEventListener("pointerdown", start);
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointercancel", () => clearTimeout(t));
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}

// Chips
$$(".chip").forEach(ch => {
  ch.addEventListener("click", () => {
    $$(".chip").forEach(x => x.classList.remove("active"));
    ch.classList.add("active");
    currentFilter = ch.dataset.filter;
    renderList();
  });
});

// Buttons
btnNew.addEventListener("click", newPurchase);
btnAddItem.addEventListener("click", addItemAndFocus);
btnMarkImported.addEventListener("click", markImported);
btnDeletePurchase.addEventListener("click", deleteCurrentPurchase);
btnBackToList.addEventListener("click", () => { currentId = null; setPage("list"); renderList(); });
// Export buttons with long press
attachLongPress(btnExportOne, exportOne, exportAll);// Inputs
if(btnExportAll) attachLongPress(btnExportAll, exportAllForImport, exportAll);

inpDate.addEventListener("input", () => {
  const p = getPurchase(currentId);
  if(!p || p.imported) return;
  p.date = inpDate.value || todayYmd();
  touchPurchase();
});
inpSupplier.addEventListener("input", () => {
  const p = getPurchase(currentId);
  if(!p || p.imported) return;
  p.supplier = inpSupplier.value;
  touchPurchase();
});

// Simple back navigation
window.addEventListener("keydown", (e) => {
  if(e.key === "Escape" && pageEdit.classList.contains("active")) backToList();
});

// Tap brand to go back when in edit
document.querySelector(".brand").addEventListener("click", () => {
  if(pageEdit.classList.contains("active")) backToList();
});

// PWA install/sw
if("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}

renderList();


function exportAllTodo(){
  const todo = state.purchases.filter(p => !p.imported && !p.archived);
  if(todo.length === 0){ alert("Нет не импортированных."); return; }

  const payload = {
    app: APP_ID,
    version: FORMAT_VERSION,
    createdAt: localIsoWithOffset(new Date()),
    count: todo.length,
    purchases: todo.map(p => ({
      id: p.id,
      date: p.date,
      supplier: p.supplier || "",
      items: (p.items||[]).filter(i => (i.name||"").trim()).map(i => ({
        name: String(i.name||"").trim(),
        qty: Number(i.qty||0),
        price: Number(i.price||0)
      }))
    }))
  };

  const ymd = todayYmd();
  const filename = `zakup_all_${ymd}.json`;
  downloadJson(filename, payload);

  const t = localIsoWithOffset(new Date());
  for(const p of todo){
    p.imported = true;
    p.importedAt = t;
    p.updatedAt = t;
  }
  saveState();
  renderList();
  showToast("Экспортировано");
}

// Export ALL purchases (not archived) for KompVLZsklad import
function exportAllForImport(){
  const all = state.purchases.filter(p => !p.archived);
  if(all.length === 0){ alert("Нет закупок."); return; }

  const exportedAt = localIsoWithOffset(new Date());

  const purchases = all.map(p => ({
    id: p.id,
    date: p.date,
    supplier: (p.supplier||"").trim(),
    imported: !!p.imported,
    importedAt: p.importedAt,
    items: (p.items||[])
      .filter(i => (i.name||"").trim())
      .map(i => ({
        name: String(i.name||"").trim(),
        qty: Math.max(1, Number(i.qty)||1),
        price: Math.max(0, Number(i.price)||0),
        currency: CURRENCY
      }))
  }));

  // convenience: flattened lines for very simple importers
  const lines = [];
  for(const p of purchases){
    for(const it of (p.items||[])){
      lines.push({
        purchaseId: p.id,
        date: p.date,
        supplier: p.supplier,
        name: it.name,
        qty: it.qty,
        price: it.price,
        currency: it.currency
      });
    }
  }

  const payload = {
    app: APP_ID,
    format: "kompvlzsklad_import",
    formatVersion: FORMAT_VERSION,
    exportedAt,
    countPurchases: purchases.length,
    countLines: lines.length,
    purchases,
    lines
  };

  const ymd = todayYmd();
  const filename = `zakup_import_all_${ymd}.json`;
  downloadJson(filename, payload);
  showToast("Экспортировано для склада");
}
