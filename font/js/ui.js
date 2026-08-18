export function money(n){ return Number(n||0).toLocaleString("vi-VN"); }

export function esc(s){
  return String(s??"").replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}

export function badge(s){
  const ok=["PAID","SUCCESS","CONFIRMED","DELIVERED"].includes(String(s));
  const bad=["FAILED","PAYMENT_FAILED","CANCELLED"].includes(String(s));
  const cls = ok ? "status-ok" : bad ? "status-bad" : "";
  return `<span class="${cls}">${esc(s)}</span>`;
}

/* ===== Toast ===== */
function ensureToastHost(){
  let host = document.querySelector(".toast-wrap");
  if (!host){
    host = document.createElement("div");
    host.className = "toast-wrap";
    document.body.appendChild(host);
  }
  return host;
}

export function toast(type, title, msg, ms = 2600){
  const host = ensureToastHost();
  const t = document.createElement("div");
  t.className = `toast ${type || ""}`;

  const icon = type === "ok" ? "✓" : type === "warn" ? "!" : "×";
  t.innerHTML = `
    <div class="icon">${icon}</div>
    <div>
      <div class="title">${esc(title || "")}</div>
      <div class="msg">${esc(msg || "")}</div>
    </div>
    <button class="x" aria-label="close">✕</button>
  `;

  t.querySelector(".x").onclick = () => t.remove();
  host.appendChild(t);

  if (ms > 0){
    setTimeout(() => {
      if (t && t.parentNode) t.remove();
    }, ms);
  }
}

/* ===== Loading overlay ===== */
function ensureLoading(){
  let el = document.querySelector(".loading");
  if (!el){
    el = document.createElement("div");
    el.className = "loading";
    el.innerHTML = `
      <div class="loading__box">
        <div class="spinner"></div>
        <div class="loading__text" id="loadingLabel">Loading...</div>
      </div>
    `;
    document.body.appendChild(el);
  }
  return el;
}

export function setLoading(on, label="Working..."){
  const el = ensureLoading();
  const lab = el.querySelector("#loadingLabel");
  if (lab) lab.textContent = label;
  el.classList.toggle("show", !!on);
}

/* ===== Modal ===== */
function ensureModal(){
  let el = document.querySelector(".modal");
  if (!el){
    el = document.createElement("div");
    el.className = "modal";
    el.innerHTML = `
      <div class="modal-card">
        <div class="modal-head">
          <h3 id="modalTitle">Modal</h3>
          <button class="secondary" id="modalCloseBtn">Close</button>
        </div>
        <div class="modal-body" id="modalBody"></div>
        <div class="modal-foot" id="modalFoot"></div>
      </div>
    `;
    document.body.appendChild(el);

    // close on backdrop
    el.addEventListener("click", (e) => {
      if (e.target === el) closeModal();
    });

    el.querySelector("#modalCloseBtn").onclick = () => closeModal();
  }
  return el;
}

export function openModal({ title, bodyHtml, footHtml }){
  const el = ensureModal();
  el.querySelector("#modalTitle").textContent = title || "Modal";
  el.querySelector("#modalBody").innerHTML = bodyHtml || "";
  el.querySelector("#modalFoot").innerHTML = footHtml || "";
  el.classList.add("show");
  return el;
}

export function closeModal(){
  const el = document.querySelector(".modal");
  if (el) el.classList.remove("show");
}

// ===== CSV Export =====
export function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(v) {
  const s = (v === null || v === undefined) ? "" : String(v);
  const needs = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needs ? `"${escaped}"` : escaped;
}

export function toCSV(rows, columns) {
  // columns: [{ key, label, map?(row)->value }]
  const header = columns.map(c => csvEscape(c.label)).join(",");
  const lines = rows.map(r => columns.map(c => {
    const val = c.map ? c.map(r) : r[c.key];
    return csvEscape(val);
  }).join(","));
  return [header, ...lines].join("\n");
}

export function downloadCSV(filename, rows, columns) {
  const csv = toCSV(rows, columns);
  downloadText(filename, csv, "text/csv");
}