/* ============================================================
   Tomelin Gestão Financeira — SPA (vanilla JS, sem dependências)
   ============================================================ */

// Cache de lançamentos por ID — evita JSON.stringify em onclick (quebra com aspas)
const _LANC_CACHE = new Map();
const State = {
  token: localStorage.getItem("tom_token") || null,
  ultimo_acesso: null,
  ultimo_acesso_ip: null,
  emoji: localStorage.getItem("tom_emoji") || "👤",
  uid: null,
  nome: localStorage.getItem("tom_nome") || "",
  email: localStorage.getItem("tom_email") || "",
  view: "dashboard",
  cats: [], contas: [], contatos: [],
  sidebarOpen: false,
};

const $ = (s, r = document) => r.querySelector(s);
const root = () => document.getElementById("root");
const modalRoot = () => document.getElementById("modal-root");

/* ---------- formatação ---------- */
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (v) => BRL.format(Number(v || 0));
const money0 = (v) => BRL.format(Number(v || 0)).replace(/,\d\d$/, "");
/* ---------- tema claro/escuro ---------- */
function temaAtual() { return localStorage.getItem("tom_tema") || "light"; }
function aplicarTema(t) { document.documentElement.classList.toggle("dark", t === "dark"); localStorage.setItem("tom_tema", t); }
function chartInk() {
  return document.documentElement.classList.contains("dark")
    ? { grid: "#20364E", axis: "#7F94A9", label: "#AFC2D6", strong: "#E9F0F7" }
    : { grid: "#EEF1F3", axis: "#7E8C9A", label: "#45586B", strong: "#082D51" };
}
function toggleTema() {
  aplicarTema(temaAtual() === "dark" ? "light" : "dark");
  if (State.token) { renderApp(); marcarNav(); setView(State.view); atualizarBadge(); }
  else renderLogin();
}

function dataBR(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}
function dataBRcurto(iso) {
  if (!iso) return "—";
  const [, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}`;
}
function hojeISO() { return new Date().toISOString().slice(0, 10); }
function diasEntre(iso) {
  const hoje = new Date(hojeISO());
  const alvo = new Date(iso.split("T")[0]);
  return Math.round((alvo - hoje) / 86400000);
}

/* ---------- ícones SVG (sem emoji) ---------- */
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1"/><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2Z"/><circle cx="17" cy="13" r="1.3"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  trendUp: '<path d="M3 17 9 11l4 4 8-8"/><path d="M17 7h4v4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  alert: '<path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  tag: '<path d="M12 2H2v10l9.3 9.3a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8Z"/><circle cx="7" cy="7" r="1.5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  bank: '<path d="M3 21h18M4 10h16M12 3 3 8h18ZM6 10v8M10 10v8M14 10v8M18 10v8"/>',
  whatsapp: '<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.4A10 10 0 1 0 12 2Z"/><path d="M8.5 8c-.3 0-.7.1-1 .5-.4.4-1 1-1 2.3s1 2.7 1.2 2.9c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.8.5 0 1.6-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.1-.3-.2-.6-.4l-2-1c-.3-.1-.5-.1-.7.1l-.7.9c-.1.2-.3.2-.5.1-.7-.3-1.5-.7-2.4-1.8-.7-.8-1.1-1.6-1.3-1.9-.1-.2 0-.3.1-.5l.5-.6c.1-.2.2-.3.3-.5 0-.2 0-.4-.1-.5l-.8-2c-.2-.5-.4-.5-.6-.5Z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  car: '<path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13M5 13h14v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><circle cx="7.5" cy="15.5" r=".6"/><circle cx="16.5" cy="15.5" r=".6"/>',
  receipt: '<path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1Z"/><path d="M9 8h6M9 12h6"/>',
  cog: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  pie: '<path d="M21.2 15.9A10 10 0 1 1 8 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10Z"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3Z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.4H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 6.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  logoMini: '',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};
function icon(name, cls = "") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</svg>`;
}
const LOGO_MARK = '<img class="brand-mark" src="/static/icons/logo-mark.png" alt="Tomelin" width="164" height="217">';
const LOGO_LOCKUP = '<img class="login-lockup" src="/static/icons/logo-lockup.png" alt="Tomelin Gestão Financeira">';
const SVG_HOUSE = '<svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 80 L100 20 L180 80 L180 150 L20 150 Z" fill="white" opacity=".6"/><rect x="70" y="100" width="30" height="50" fill="white" opacity=".8"/><rect x="120" y="85" width="35" height="30" fill="white" opacity=".5"/><circle cx="160" cy="35" r="18" fill="white" opacity=".3"/></svg>';

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (State.token) headers.Authorization = `Bearer ${State.token}`;
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) { logout(); throw new Error("Sessão expirada"); }
  if (!res.ok) {
    let msg = "Erro na operação.";
    try { const j = await res.json(); msg = j.detail || msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function abrirPDF(path) {
  try {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${State.token}` } });
    if (!res.ok) throw new Error("Falha ao gerar PDF");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { toast(e.message, "err"); }
}

/* ---------- Logos (upload local reduzido p/ data URI, ou URL) ---------- */
let LOGO_BUF = "";
function campoLogo(hint) {
  return `<div class="campo full"><label>Logo (opcional)</label>
    <div style="display:flex;gap:12px;align-items:center">
      <div id="logo-prev" class="lg-av lg-big"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <input type="file" accept="image/*" onchange="escolherLogo(this)">
        <input id="logo-url" placeholder="URL da imagem" oninput="logoURLInput(this.value)">
      </div>
      <button class="btn-icon" title="Remover logo" onclick="limparLogo()">${icon("trash")}</button>
    </div>
    <div class="meta">${hint || "PNG/JPG. A imagem é reduzida e guardada no próprio sistema."}</div>
  </div>`;
}
function initLogo(val) {
  LOGO_BUF = val || "";
  const u = document.getElementById("logo-url");
  if (u && LOGO_BUF && !LOGO_BUF.startsWith("data:")) u.value = LOGO_BUF;
  pintarLogo();
}
function pintarLogo() {
  const b = document.getElementById("logo-prev");
  if (b) b.innerHTML = LOGO_BUF ? `<img src="${LOGO_BUF}" alt="">` : `<span class="lg-ph">logo</span>`;
}
async function escolherLogo(input) {
  const f = input.files && input.files[0]; if (!f) return;
  try { LOGO_BUF = await lerLogo(f); const u = document.getElementById("logo-url"); if (u) u.value = ""; pintarLogo(); }
  catch { toast("Não consegui ler a imagem", "err"); }
}
function logoURLInput(v) { LOGO_BUF = (v || "").trim(); pintarLogo(); }
function limparLogo() { LOGO_BUF = ""; const u = document.getElementById("logo-url"); if (u) u.value = ""; pintarLogo(); }
function lerLogo(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 160; let w = img.width, h = img.height;
        const sc = Math.min(1, max / Math.max(w, h));
        w = Math.max(1, Math.round(w * sc)); h = Math.max(1, Math.round(h * sc));
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        try { res(cv.toDataURL("image/png")); } catch { res(r.result); }
      };
      img.onerror = () => rej(); img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
function avatarLogo(logo, nome, size = 34) {
  const ini = (nome || "?").trim().replace(/[^A-Za-zÀ-ÿ0-9]/g, "").slice(0, 2).toUpperCase() || "?";
  return logo
    ? `<span class="lg-av" style="width:${size}px;height:${size}px"><img src="${logo}" alt=""></span>`
    : `<span class="lg-av lg-ini" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px">${ini}</span>`;
}

/* ---------- toast ---------- */
function toast(msg, tipo = "") {
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  const ic = tipo === "ok" ? "checkCircle" : tipo === "err" ? "alert" : "bell";
  el.innerHTML = icon(ic) + `<span>${msg}</span>`;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateX(20px)"; setTimeout(() => el.remove(), 200); }, 3200);
}

/* ---------- modal ---------- */
function abrirModal(html, cls = "") {
  const ov = document.createElement("div");
  ov.className = "overlay " + cls;
  ov.innerHTML = html;
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) fecharModal(); });
  modalRoot().appendChild(ov);
  return ov;
}
function fecharModal() { modalRoot().innerHTML = ""; }

/* ---------- auth ---------- */
function logout() {
  State.token = null; localStorage.clear();
  render();
}
async function fazerLogin(e) {
  e.preventDefault();
  const email = $("#l-email").value.trim();
  const senha = $("#l-senha").value;
  const btn = $("#l-btn"); const erro = $("#l-erro");
  erro.classList.add("hidden"); btn.disabled = true;
  btn.innerHTML = icon("refresh", "spin") + "Entrando...";
  try {
    const r = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, senha }) });
    State.token = r.token; State.nome = r.nome; State.email = r.email;
    State.ultimo_acesso = r.ultimo_acesso || null;
    State.ultimo_acesso_ip = r.ultimo_acesso_ip || null;
    State.emoji = r.emoji || "👤";
    State.uid = r.id || null;
    localStorage.setItem("tom_token", r.token);
    localStorage.setItem("tom_emoji", r.emoji || "👤");
    localStorage.setItem("tom_nome", r.nome);
    localStorage.setItem("tom_email", r.email);
    await render();
  } catch (err) {
    erro.textContent = err.message; erro.classList.remove("hidden");
    btn.disabled = false; btn.innerHTML = "Entrar";
  }
}

function toggleSenha() {
  const i = document.getElementById("l-senha");
  if (i) i.type = i.type === "password" ? "text" : "password";
}

function _statusLogin() {
  fetch("/api/auth/status").then(r => r.json()).then(d => {
    const el = document.getElementById("lp-status");
    if (el) el.innerHTML = '<svg viewBox="0 0 8 8" width="8" height="8" style="margin-right:6px"><circle cx="4" cy="4" r="3.5" fill="#3E9079"/></svg> Sistema online &nbsp;·&nbsp; ' + d.total_lancamentos + ' lançamentos registrados';
  }).catch(() => {});
}

function renderLogin() {
  const IMGS = [
    "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=900&q=80",
    "https://images.unsplash.com/photo-1607863680198-23d4b2565df0?w=900&q=80",
    "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=900&q=80",
    "https://images.unsplash.com/photo-1579621970588-a35d0e7ab9b6?w=900&q=80",
    "https://images.unsplash.com/photo-1518458028785-8fbcd101ebb9?w=900&q=80",
  ];
  const img = IMGS[Math.floor(Math.random() * IMGS.length)];
  const ua = _ultimoAcesso();

  // SVG icons inline para os cards (sem emoji)
  const svgWallet = '<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="1.8" width="28" height="28"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>';
  const svgUsers = '<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="1.8" width="28" height="28"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>';
  const svgDoc = '<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="1.8" width="28" height="28"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>';
  const svgShield = '<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="1.8" width="28" height="28"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

  root().innerHTML =
    '<div class="login-split">' +
      '<div class="login-photo" style="background-image:url(\'' + img + '\')">' +
        '<div class="login-photo-overlay"></div>' +
        '<div class="login-photo-content">' +
          '<div class="lp-logo">' + LOGO_LOCKUP + '</div>' +
          '<div class="lp-tagline">' +
            '<div class="lp-t1">UNINDO TUDO</div>' +
            '<div class="lp-t2">CONTROLANDO TUDO</div>' +
          '</div>' +
          '<div class="lp-cards">' +
            '<div class="lp-card"><span class="lp-card-ic">' + svgWallet + '</span><div><b>Controle total</b><br>Receitas, despesas e patrimônio</div></div>' +
            '<div class="lp-card"><span class="lp-card-ic">' + svgUsers + '</span><div><b>Para toda família</b><br>Cada membro com seu acesso</div></div>' +
            '<div class="lp-card"><span class="lp-card-ic">' + svgDoc + '</span><div><b>Relatórios em PDF</b><br>Balancete e patrimônio</div></div>' +
          '</div>' +
          '<div id="lp-status" class="lp-status">' + svgShield + ' <span>Verificando sistema...</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="login-form-side">' +
        '<div class="login-form-wrap">' +
          '<div class="lf-header">' +
            '<div class="lf-logo-sm">' + LOGO_LOCKUP + '</div>' +
            '<h2 class="lf-titulo">Acesse sua conta</h2>' +
            '<p class="lf-sub">Gestão financeira da família</p>' +
          '</div>' +
          (ua ? '<div class="lf-ultimo-acesso">' + icon("clock") + ' ' + ua + '</div>' : '') +
          '<form onsubmit="fazerLogin(event)" autocomplete="on">' +
            '<div class="campo"><label>E-mail</label>' +
              '<input id="l-email" type="email" autocomplete="username" placeholder="seu@email.com.br" required></div>' +
            '<div class="campo" style="position:relative"><label>Senha</label>' +
              '<input id="l-senha" type="password" autocomplete="current-password" placeholder="••••••••" required>' +
              '<button type="button" class="btn-ver-senha" onclick="toggleSenha()" title="Mostrar senha">' + icon("eye") + '</button></div>' +
            '<div id="l-erro" class="login-erro hidden"></div>' +
            '<button id="l-btn" type="submit" class="btn btn-primary btn-login">' +
              icon("send") + '<span id="l-btn-txt">Entrar</span></button>' +
          '</form>' +
          '<div class="lf-footer">' +
            '<span>Tomelin Gestao Financeira</span>' +
            '<span>v1.0</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  _statusLogin();
}

/* ============================================================
   APP SHELL
   ============================================================ */
const NAV = [
  { sec: "Painel" },
  { id: "dashboard", nome: "Visão geral", ic: "dashboard", sub: "Resumo do mês e indicadores" },
  { id: "vencimentos", nome: "Vencimentos", ic: "alert", sub: "Contas atrasadas e a vencer", badge: true },
  { id: "relatorios", nome: "Relatórios", ic: "pie", sub: "Balancete, patrimônio e projeções" },
  { sec: "Movimentação" },
  { id: "receber", nome: "Contas a receber", ic: "arrowDown", sub: "Recebimentos previstos e realizados" },
  { id: "pagar", nome: "Contas a pagar", ic: "arrowUp", sub: "Pagamentos previstos e realizados" },
  { id: "lancamentos", nome: "Todos os lançamentos", ic: "wallet", sub: "Histórico completo de movimentações" },
  { id: "compras", nome: "Compras e cartões", ic: "receipt", sub: "Itens comprados e parcelas do cartão" },
  { sec: "Patrimônio" },
  { id: "veiculos", nome: "Veículos", ic: "car", sub: "Carros e financiamentos (FIPE ou valor fixo)" },
  { sec: "Cadastros" },
  { id: "contas", nome: "Contas e carteiras", ic: "bank", sub: "Saldos por conta bancária" },
  { id: "categorias", nome: "Categorias", ic: "tag", sub: "Classificação de receitas e despesas" },
  { id: "contatos", nome: "Contatos", ic: "users", sub: "Recebo de · Pago para" },
  { sec: "Integrações" },
  { id: "whatsapp", nome: "WhatsApp", ic: "whatsapp", sub: "Alertas e comandos no grupo de controle" },
  { id: "usuarios", nome: "Família", ic: "users", sub: "Maisa, Jackson e membros da família" },
  { id: "configuracoes", nome: "Configurações", ic: "cog", sub: "WhatsApp, FIPE, alertas, PDFs" },
];
const META = Object.fromEntries(NAV.filter(n => n.id).map(n => [n.id, n]));

let VENC_BADGE = 0;

function renderApp() {
  const inic = (State.nome || "T").trim().charAt(0).toUpperCase();
  root().innerHTML = `
  <div class="app">
    <div class="backdrop" id="bd" onclick="toggleSidebar(false)"></div>
    <aside class="sidebar" id="sb">
      <div class="sb-brand">
        <span class="sb-logo">${LOGO_MARK}</span>
        <div><div class="t">Tomelin</div><div class="s">Gestão Financeira</div></div>
      </div>
      <nav class="sb-nav">
        ${NAV.map(n => n.sec
          ? `<div class="sb-sec">${n.sec}</div>`
          : `<a class="nav-item" data-id="${n.id}" onclick="setView('${n.id}')">
               ${icon(n.ic)}<span>${n.nome}</span>
               ${n.badge ? `<span class="nav-badge hidden" id="badge-venc"></span>` : ""}
             </a>`).join("")}
      </nav>
      <div class="sb-foot">
        <div class="sb-avatar">${inic}</div>
        <div style="min-width:0">
          <div class="nm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${State.nome || "Usuário"}</div>
          <div class="em" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${State.email}</div>
        </div>
        <button title="Meu histórico de logins" onclick="meuHistoricoLogin()" style="padding:6px">${icon("clock")}</button>
        <button title="Sair" onclick="logout()">${icon("logout")}</button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="menu-btn" onclick="toggleSidebar(true)">${icon("menu")}</button>
        <div>
          <h2 id="tb-title">Visão geral</h2>
          <div class="sub" id="tb-sub"></div>
        </div>
        <div class="grow"></div>
        <button class="btn-icon" title="Tema claro/escuro" onclick="toggleTema()">${icon(temaAtual() === "dark" ? "sun" : "moon")}</button>
        <button class="btn-icon" title="Atualizar" onclick="setView(State.view)">${icon("refresh")}</button>
      </header>
      <main class="content" id="view"></main>
    </div>
  </div>`;
}

function toggleSidebar(open) {
  State.sidebarOpen = open;
  $("#sb").classList.toggle("open", open);
  $("#bd").classList.toggle("show", open);
}

function marcarNav() {
  document.querySelectorAll(".nav-item").forEach(a => {
    a.classList.toggle("on", a.dataset.id === State.view ||
      (["pagar", "receber"].includes(State.view) && a.dataset.id === State.view));
  });
  const m = META[State.view] || {};
  $("#tb-title").textContent = m.nome || "";
  $("#tb-sub").textContent = m.sub || "";
}

async function setView(id) {
  State.view = id;
  toggleSidebar(false);
  marcarNav();
  const v = $("#view");
  v.innerHTML = `<div class="empty" style="padding:80px">${icon("refresh", "spin")}<p>Carregando...</p></div>`;
  try {
    if (id === "dashboard") await viewDashboard(v);
    else if (id === "vencimentos") await viewVencimentos(v);
    else if (id === "pagar") await viewLancamentos(v, "despesa");
    else if (id === "receber") await viewLancamentos(v, "receita");
    else if (id === "lancamentos") await viewLancamentos(v, null);
    else if (id === "compras") await viewCompras(v);
    else if (id === "contas") await viewContas(v);
    else if (id === "categorias") await viewCategorias(v);
    else if (id === "contatos") await viewContatos(v);
    else if (id === "veiculos") await viewVeiculos(v);
    else if (id === "relatorios") await viewRelatorios(v);
    else if (id === "whatsapp") await viewWhatsapp(v);
    else if (id === "usuarios") await viewUsuarios(v);
    else if (id === "configuracoes") await viewConfiguracoes(v);
  } catch (e) {
    v.innerHTML = `<div class="empty" style="padding:60px">${icon("alert")}<p>${e.message}</p></div>`;
  }
}

async function carregarRefs() {
  const [cats, contas, contatos] = await Promise.all([
    api("/api/categorias"), api("/api/contas"), api("/api/contatos"),
  ]);
  State.cats = cats; State.contas = contas; State.contatos = contatos;
}

async function atualizarBadge() {
  try {
    const v = await api("/api/dashboard/vencimentos?dias=3");
    VENC_BADGE = v.atrasados.length + v.proximos.length;
    const b = $("#badge-venc");
    if (b) { b.textContent = VENC_BADGE; b.classList.toggle("hidden", VENC_BADGE === 0); }
  } catch {}
}

/* ============================================================
   GRÁFICOS SVG (desenhados à mão, sem libs)
   ============================================================ */
function barChart(dados) {
  const W = 660, H = 280, pad = { t: 20, r: 12, b: 34, l: 54 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = Math.max(1, ...dados.flatMap(d => [d.receitas, d.despesas]));
  const step = niceStep(max), topo = Math.ceil(max / step) * step;
  const y = (v) => pad.t + ih - (v / topo) * ih;
  const bw = iw / dados.length;
  const barW = Math.min(26, bw / 3.2);

  const CINK = chartInk();
  let grid = "", bars = "";
  for (let i = 0; i <= topo; i += step) {
    const yy = y(i);
    grid += `<line x1="${pad.l}" y1="${yy}" x2="${W - pad.r}" y2="${yy}" stroke="${CINK.grid}"/>
             <text x="${pad.l - 8}" y="${yy + 4}" text-anchor="end" font-size="10.5" fill="${CINK.axis}">${money0(i)}</text>`;
  }
  dados.forEach((d, i) => {
    const cx = pad.l + bw * i + bw / 2;
    const x1 = cx - barW - 3, x2 = cx + 3;
    const rH = ih - (y(d.receitas) - pad.t), dH = ih - (y(d.despesas) - pad.t);
    bars += `
      <rect x="${x1}" y="${y(d.receitas)}" width="${barW}" height="${Math.max(1, rH)}" rx="4" fill="url(#gGreen)">
        <title>${d.label} · Receitas ${money(d.receitas)}</title></rect>
      <rect x="${x2}" y="${y(d.despesas)}" width="${barW}" height="${Math.max(1, dH)}" rx="4" fill="url(#gDesp)">
        <title>${d.label} · Despesas ${money(d.despesas)}</title></rect>
      <text x="${cx}" y="${H - 12}" text-anchor="middle" font-size="11" fill="${CINK.label}" font-weight="600">${d.label}</text>`;
  });
  return `
  <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" font-family="Inter">
    <defs>
      <linearGradient id="gGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5E9B86"/><stop offset="1" stop-color="#2F817A"/></linearGradient>
      <linearGradient id="gDesp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D8C07A"/><stop offset="1" stop-color="#C9A94E"/></linearGradient>
    </defs>
    ${grid}${bars}
  </svg>
  <div class="chart-legend">
    <span class="lg"><span class="dot" style="background:#2F817A"></span>Receitas</span>
    <span class="lg"><span class="dot" style="background:#C9A94E"></span>Despesas</span>
  </div>`;
}
function niceStep(max) {
  const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const m = n >= 5 ? 5 : n >= 2 ? 2 : 1;
  return Math.max(1, m * mag);
}

function donut(dados) {
  if (!dados.length) return `<div class="empty">${icon("pie")}<p>Sem despesas categorizadas neste mês.</p></div>`;
  const total = dados.reduce((s, d) => s + d.valor, 0);
  const R = 78, r = 48, cx = 100, cy = 100;
  let ang = -Math.PI / 2, segs = "";
  dados.slice(0, 8).forEach(d => {
    const frac = d.valor / total, a2 = ang + frac * 2 * Math.PI;
    const large = frac > 0.5 ? 1 : 0;
    const p = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    const [x1, y1] = p(ang, R), [x2, y2] = p(a2, R);
    const [x3, y3] = p(a2, r), [x4, y4] = p(ang, r);
    segs += `<path d="M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${large} 0 ${x4} ${y4} Z"
              fill="${d.cor}" stroke="#fff" stroke-width="2"><title>${d.nome} · ${money(d.valor)} (${(frac*100).toFixed(0)}%)</title></path>`;
    ang = a2;
  });
  const leg = dados.slice(0, 8).map(d =>
    `<span class="lg"><span class="dot" style="background:${d.cor}"></span>${d.nome} · <b style="color:${chartInk().strong}">${money0(d.valor)}</b></span>`).join("");
  return `
  <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
    <svg viewBox="0 0 200 200" style="width:180px;height:180px;flex-shrink:0" font-family="Inter">
      ${segs}
      <text x="100" y="94" text-anchor="middle" font-size="11" fill="${chartInk().axis}">Total mês</text>
      <text x="100" y="114" text-anchor="middle" font-size="17" font-weight="800" fill="${chartInk().strong}">${money0(total)}</text>
    </svg>
    <div class="chart-legend" style="flex-direction:column;gap:9px;margin:0;flex:1;min-width:170px">${leg}</div>
  </div>`;
}

/* ============================================================
   VIEW: DASHBOARD
   ============================================================ */
async function viewDashboard(v) {
  const [k, fluxo, desp, venc, jur, pat] = await Promise.all([
    api("/api/dashboard/kpis"),
    api("/api/dashboard/fluxo?meses=6"),
    api("/api/dashboard/despesas-categoria"),
    api("/api/dashboard/vencimentos?dias=7"),
    api("/api/relatorios/juros"),
    api("/api/relatorios/patrimonio"),
  ]);
  const kpiCard = (cls, ic, lab, val, meta, extra='') => `
    <div class="kpi ${cls}">
      <div class="lab"><span class="i i-${cls}">${icon(ic)}</span>${lab}</div>
      <div class="val mono-num">${val}</div>
      <div class="meta">${meta}</div>
      ${extra}
    </div>`;

  const lista = (arr, vazio) => arr.length ? arr.map(l => {
    const d = l.vencimento ? diasEntre(l.vencimento) : null;
    const atras = l.status === "atrasado";
    const quando = atras ? `Venceu ${dataBRcurto(l.vencimento)} · há ${Math.abs(d)}d`
      : d === 0 ? "Vence hoje" : d === 1 ? "Vence amanhã" : `Vence em ${d} dias`;
    const rec = l.tipo === "receita";
    return `<div class="venc-item">
      <span class="venc-ico ${atras ? 'i-red' : rec ? 'i-green' : 'i-amber'}">${icon(rec ? "arrowDown" : "arrowUp")}</span>
      <div class="d"><div class="n">${l.descricao}</div><div class="w">${quando}${l.categoria ? " · " + l.categoria : ""}</div></div>
      <div class="vv ${rec ? 'val-rec' : 'val-desp'}">${money(l.valor)}</div>
    </div>`;
  }).join("") : `<div class="empty">${icon("checkCircle")}<p>${vazio}</p></div>`;

  const saldoPos = k.saldo >= 0;
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  v.innerHTML = `
    <div class="dash-boas-vindas">
      <div class="bv-avatar">${State.emoji || "👤"}</div>
      <div class="bv-text">
        <h2>${saudacao}, ${State.nome ? State.nome.split(" ")[0] : "Jackson"}!</h2>
        <p>Aqui está o resumo financeiro da família Tomelin hoje.</p>
      </div>
      <div class="bv-deco">${SVG_HOUSE}</div>
    </div>
    <div class="kpi-grid">
      ${kpiCard("navy", "cash", "Saldo atual", money(k.saldo), saldoPos ? "Somando todas as contas" : "Atenção: saldo negativo", `<div class="kpi-deco"><svg viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="45" cy="45" r="30" fill="white" opacity=".5"/><circle cx="45" cy="45" r="20" fill="white" opacity=".4"/><text x="45" y="52" text-anchor="middle" font-size="20" fill="white" opacity=".7" font-family="serif">$</text></svg></div>`)}
      ${kpiCard("green", "trendUp", "Receitas do mês", money(k.receitas_mes), "Competência no mês corrente")}
      ${kpiCard("gold", "arrowUp", "Despesas do mês", money(k.despesas_mes), "Competência no mês corrente")}
      ${kpiCard("teal", "clock", "A pagar", money(k.a_pagar), k.pagar_vencido > 0 ? `${money(k.pagar_vencido)} já vencido` : "Nenhum vencido")}
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <div class="card-h">
          <span class="card-ico i-red">${icon("trendUp")}</span>
          <div class="grow"><h3>Juros pagos no ano</h3><div class="sub">Controle do custo financeiro</div></div>
          <button class="btn btn-ghost btn-sm" onclick="setView('relatorios')">Detalhes</button>
        </div>
        <div class="val mono-num" style="font-size:26px;color:var(--red);margin:4px 0 2px">${money(jur.juros_pago_ano)}</div>
        <div class="meta">No mês: <b>${money(jur.juros_mes)}</b> · Ainda a pagar: <b>${money(jur.juros_a_pagar)}</b>${jur.multa_ano ? ` · Multas: <b>${money(jur.multa_ano)}</b>` : ""}</div>
      </div>
      <div class="card card-pad">
        <div class="card-h">
          <span class="card-ico i-navy">${icon("car")}</span>
          <div class="grow"><h3>Patrimônio líquido</h3><div class="sub">Contas + veículos − financiamentos</div></div>
          <button class="btn btn-ghost btn-sm" onclick="setView('relatorios')">Relatórios</button>
        </div>
        <div class="val mono-num" style="font-size:26px;color:var(--navy);margin:4px 0 2px">${money(pat.patrimonio_liquido)}</div>
        <div class="meta">Contas: <b>${money(pat.total_contas)}</b> · Veículos: <b>${money(pat.total_veiculos)}</b>${pat.total_financiamentos ? ` · Falta pagar: <b>${money(pat.total_financiamentos)}</b>` : ""}</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <div class="card-h">
          <span class="card-ico i-navy">${icon("trendUp")}</span>
          <div class="grow"><h3>Fluxo de caixa — últimos 6 meses</h3></div>
        </div>
        ${barChart(fluxo)}
      </div>
      <div class="card card-pad">
        <div class="card-h">
          <span class="card-ico i-gold">${icon("pie")}</span>
          <div class="grow"><h3>Despesas por categoria</h3></div>
        </div>
        ${donut(desp)}
      </div>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <div class="card-h">
          <span class="card-ico i-green">${icon("arrowDown")}</span>
          <div class="grow"><h3>Próximos recebimentos</h3></div>
          <button class="btn btn-ghost btn-sm" onclick="setView('receber')">Ver todos</button>
        </div>
        <div class="venc-list">${lista([...venc.atrasados, ...venc.proximos].filter(x => x.tipo === "receita"), "Nenhum recebimento próximo.")}</div>
      </div>
      <div class="card card-pad">
        <div class="card-h">
          <span class="card-ico i-red">${icon("arrowUp")}</span>
          <div class="grow"><h3>Próximos pagamentos</h3></div>
          <button class="btn btn-ghost btn-sm" onclick="setView('pagar')">Ver todos</button>
        </div>
        <div class="venc-list">${lista([...venc.atrasados, ...venc.proximos].filter(x => x.tipo === "despesa"), "Nenhum pagamento próximo.")}</div>
      </div>
    </div>`;

  // popup de aviso financeiro (uma vez por sessão)
  const totalAlerta = venc.atrasados.length + venc.proximos.filter(x => diasEntre(x.vencimento) <= 3).length;
  if (totalAlerta > 0 && !sessionStorage.getItem("tom_popup")) {
    sessionStorage.setItem("tom_popup", "1");
    popupVencimentos(venc);
  }
}

function popupVencimentos(venc) {
  const itens = [...venc.atrasados, ...venc.proximos.filter(x => diasEntre(x.vencimento) <= 3)];
  const totalPagar = itens.filter(x => x.tipo === "despesa").reduce((s, x) => s + x.valor, 0);
  const linhas = itens.map(l => {
    const atras = l.status === "atrasado";
    const rec = l.tipo === "receita";
    const d = diasEntre(l.vencimento);
    const quando = atras ? `há ${Math.abs(d)}d` : d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d}d`;
    return `<div class="venc-item">
      <span class="venc-ico ${atras ? 'i-red' : rec ? 'i-green' : 'i-amber'}">${icon(rec ? "arrowDown" : "arrowUp")}</span>
      <div class="d"><div class="n">${l.descricao}</div><div class="w">${rec ? "A receber" : "A pagar"} · ${dataBRcurto(l.vencimento)} (${quando})</div></div>
      <div class="vv ${rec ? 'val-rec' : 'val-desp'}">${money(l.valor)}</div>
    </div>`;
  }).join("");
  abrirModal(`
    <div class="modal">
      <div class="popup-hero">
        ${icon("alert")}
        <div><div class="t">Você tem ${itens.length} vencimento(s) para atenção</div>
        <div class="s">${money(totalPagar)} a pagar nos próximos dias</div></div>
      </div>
      <div class="popup-body venc-list">${linhas}</div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Depois</button>
        <button class="btn btn-primary" onclick="fecharModal();setView('vencimentos')">Ver vencimentos</button>
      </div>
    </div>`, "popup-venc");
}

/* ============================================================
   VIEW: LANÇAMENTOS (a pagar / a receber / todos)
   ============================================================ */
const FILTRO = { status: "", busca: "", cat: "" };

async function viewLancamentos(v, tipoFixo) {
  await carregarRefs();
  const titulo = tipoFixo === "despesa" ? "Contas a pagar" : tipoFixo === "receita" ? "Contas a receber" : "Todos os lançamentos";
  const cats = State.cats.filter(c => !tipoFixo || c.tipo === tipoFixo);
  v.innerHTML = `
    <div class="toolbar">
      <div class="seg" id="seg-status">
        <button data-s="" class="on" onclick="filtroStatus('')">Todos</button>
        <button data-s="pendente" onclick="filtroStatus('pendente')">Pendentes</button>
        <button data-s="atrasado" onclick="filtroStatus('atrasado')">Atrasados</button>
        <button data-s="pago" onclick="filtroStatus('pago')">Pagos</button>
      </div>
      <div class="search"><span>${icon("search")}</span>
        <input class="search-i" id="busca" placeholder="Buscar descrição..." oninput="debBusca(this.value)">
      </div>
      <select id="fcat" onchange="filtroCat(this.value)">
        <option value="">Todas categorias</option>
        ${cats.map(c => `<option value="${c.id}">${c.nome}</option>`).join("")}
      </select>
      <div class="grow"></div>
      <button class="btn btn-ghost" onclick="exportarCSV('${tipoFixo || ''}')">${icon("download")}Exportar</button>
      <button class="btn ${tipoFixo === 'receita' ? 'btn-green' : 'btn-primary'}" onclick="formLancamento(null,'${tipoFixo || 'despesa'}')">${icon("plus")}Novo ${tipoFixo === 'receita' ? 'recebimento' : tipoFixo === 'despesa' ? 'pagamento' : 'lançamento'}</button>
      <button class="btn btn-ghost" onclick="abrirLeitorNFe()">${icon("receipt")}Ler Nota Fiscal</button>
    </div>
    <div class="card"><div class="tbl-wrap"><table id="tbl">
      <thead><tr>
        <th>Descrição</th><th>Categoria</th>${tipoFixo ? "" : "<th>Tipo</th>"}
        <th>Vencimento</th><th>Situação</th><th class="num">Valor</th><th style="width:120px"></th>
      </tr></thead>
      <tbody id="tb"></tbody>
    </table></div></div>`;
  FILTRO.status = ""; FILTRO.busca = ""; FILTRO.cat = "";
  window._tipoFixo = tipoFixo;
  await recarregarTabela();
}

let _debTimer;
function debBusca(val) { clearTimeout(_debTimer); _debTimer = setTimeout(() => { FILTRO.busca = val; recarregarTabela(); }, 300); }
function filtroStatus(s) {
  FILTRO.status = s;
  document.querySelectorAll("#seg-status button").forEach(b => b.classList.toggle("on", b.dataset.s === s));
  recarregarTabela();
}
function filtroCat(c) { FILTRO.cat = c; recarregarTabela(); }

async function recarregarTabela() {
  const tf = window._tipoFixo;
  let q = "?limite=500";
  if (tf) q += `&tipo=${tf}`;
  if (FILTRO.status) q += `&status=${FILTRO.status}`;
  if (FILTRO.busca) q += `&busca=${encodeURIComponent(FILTRO.busca)}`;
  if (FILTRO.cat) q += `&categoria_id=${FILTRO.cat}`;
  const itens = await api("/api/lancamentos" + q);
  itens.forEach(l => _LANC_CACHE.set(l.id, l));
  const tb = $("#tb");
  if (!itens.length) {
    tb.innerHTML = `<tr><td colspan="7"><div class="empty">${icon("wallet")}<p>Nenhum lançamento encontrado.</p></div></td></tr>`;
    return;
  }
  tb.innerHTML = itens.map(l => {
    const rec = l.tipo === "receita";
    const catCor = (State.cats.find(c => c.id === l.categoria_id) || {}).cor || "#7E8C9A";
    const podeBaixar = l.status !== "pago";
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:10px">${l.contato_logo ? avatarLogo(l.contato_logo, l.contato_nome || l.descricao, 30) : ""}<div><div class="cell-desc">${l.descricao}</div>${l.conta_nome ? `<div class="cell-sub">${l.conta_nome}</div>` : ""}${l.status || l.data_vencimento || l.categoria_nome ? `<div class="mob-meta"><span class="tag ${l.status}">${l.status === 'pago' ? 'Pago' : l.status === 'atrasado' ? 'Atrasado' : 'Pendente'}</span>${l.data_vencimento ? `<span class="mob-sub">${dataBR(l.data_vencimento)}</span>` : ""}${l.categoria_nome ? `<span class="mob-sub">${l.categoria_nome}</span>` : ""}</div>` : ""}</div></div></td>
      <td class="hide-mob">${l.categoria_nome ? `<span class="cat-chip"><span class="dot" style="background:${catCor}"></span>${l.categoria_nome}</span>` : "—"}</td>
      ${tf ? "" : `<td class="hide-mob"><span class="tag ${rec ? 'rec' : 'desp'}">${rec ? 'Receita' : 'Despesa'}</span></td>`}
      <td class="hide-mob">${dataBR(l.data_vencimento)}</td>
      <td class="hide-mob"><span class="tag ${l.status}">${l.status === 'pago' ? 'Pago' : l.status === 'atrasado' ? 'Atrasado' : 'Pendente'}</span></td>
      <td class="num ${rec ? 'val-rec' : 'val-desp'}"><span class="hide-mob">${rec ? '+' : '−'} </span>${money(l.valor)}</td>
      <td>
        <div style="display:flex;gap:5px;justify-content:flex-end">
          ${podeBaixar ? `<button class="btn-icon" title="Dar baixa" onclick="formBaixaId(${l.id})">${icon("check")}</button>`
                       : `<button class="btn-icon" title="Estornar" onclick="estornar(${l.id})">${icon("refresh")}</button>`}
          <button class="btn-icon" title="Recibo em PDF" onclick="abrirPDF('/api/lancamentos/${l.id}/recibo.pdf')">${icon("receipt")}</button>
          <button class="btn-icon" title="Recibo estilo cupom" onclick="abrirPDF('/api/lancamentos/${l.id}/recibo.pdf?estilo=matricial')">${icon("terminal")}</button>
          <button class="btn-icon" title="Enviar recibo no WhatsApp" onclick="reciboWhats(${l.id})">${icon("whatsapp")}</button>
          <button class="btn-icon" title="Editar" onclick="formLancamentoId(${l.id})">${icon("edit")}</button>
          <button class="btn-icon" title="Excluir" onclick="excluirLanc(${l.id})">${icon("trash")}</button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

function exportarCSV(tf) {
  const rows = [...document.querySelectorAll("#tbl tbody tr")].map(tr =>
    [...tr.querySelectorAll("td")].slice(0, -1).map(td => `"${td.innerText.replace(/\s+/g, ' ').trim()}"`).join(";"));
  const head = ["Descrição", "Categoria", ...(tf ? [] : ["Tipo"]), "Vencimento", "Situação", "Valor"].join(";");
  const csv = "\uFEFF" + head + "\n" + rows.join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `lancamentos-tomelin-${hojeISO()}.csv`; a.click();
  toast("CSV exportado", "ok");
}

/* ---------- form lançamento ---------- */
function formLancamento(l, tipo, pre) {
  if (pre && !l) l = pre; // pré-preenchimento vindo da NF-e
  const ed = !!l;
  const cats = State.cats.filter(c => c.tipo === (l ? l.tipo : tipo));
  abrirModal(`
    <div class="modal">
      <div class="modal-h"><span class="card-ico ${tipo === 'receita' ? 'i-green' : 'i-red'}">${icon(tipo === 'receita' ? 'arrowDown' : 'arrowUp')}</span>
        <h3>${ed ? 'Editar' : 'Novo'} ${tipo === 'receita' ? 'recebimento' : 'pagamento'}</h3>
        <button onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b"><div class="frm">
        <input type="hidden" id="f-tipo" value="${tipo}">
        <div class="campo full"><label>Descrição</label><input id="f-desc" value="${ed ? l.descricao : ''}" placeholder="Descrição do lançamento"></div>
        <div class="campo"><label>Valor (R$)</label><input id="f-valor" type="number" step="0.01" value="${ed ? l.valor : ''}" placeholder="0,00"></div>
        <div class="campo"><label>Categoria</label><select id="f-cat"><option value="">—</option>${cats.map(c => `<option value="${c.id}" ${ed && l.categoria_id === c.id ? 'selected' : ''}>${c.nome}</option>`).join("")}</select></div>
        <div class="campo"><label>Vencimento</label><input id="f-venc" type="date" value="${ed && l.vencimento ? l.vencimento.split('T')[0] : hojeISO()}"></div>
        <div class="campo"><label>Competência</label><input id="f-comp" type="date" value="${ed && l.data_competencia ? l.data_competencia.split('T')[0] : hojeISO()}"></div>
        <div class="campo"><label>Conta / carteira</label><select id="f-conta"><option value="">—</option>${State.contas.map(c => `<option value="${c.id}" ${ed && l.conta_id === c.id ? 'selected' : ''}>${c.nome}</option>`).join("")}</select></div>
        <div class="campo"><label>Recebo de / Pago para</label><select id="f-contato"><option value="">—</option>${State.contatos.map(c => `<option value="${c.id}" ${ed && l.contato_id === c.id ? 'selected' : ''}>${c.nome}</option>`).join("")}</select></div>
        <div class="campo full"><label>Situação</label>
          <select id="f-pago"><option value="">Pendente (a ${tipo === 'receita' ? 'receber' : 'pagar'})</option>
          <option value="1" ${ed && l.data_pagamento ? 'selected' : ''}>Já ${tipo === 'receita' ? 'recebido' : 'pago'}</option></select></div>
        <div class="campo"><label>Juros (R$)</label><input id="f-juros" type="number" step="0.01" value="${ed && l.juros && +l.juros ? l.juros : ''}" placeholder="0,00"></div>
        <div class="campo"><label>Multa (R$)</label><input id="f-multa" type="number" step="0.01" value="${ed && l.multa && +l.multa ? l.multa : ''}" placeholder="0,00"></div>
        <div class="campo full"><label>Observação</label><textarea id="f-obs" placeholder="Opcional">${ed && l.obs ? l.obs : ''}</textarea></div>
      </div></div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn ${tipo === 'receita' ? 'btn-green' : 'btn-primary'}" onclick="salvarLanc(${ed ? l.id : 'null'})">${icon("check")}Salvar</button>
      </div>
    </div>`);
}

async function salvarLanc(id) {
  const pago = $("#f-pago").value;
  const body = {
    descricao: $("#f-desc").value.trim(),
    tipo: $("#f-tipo").value,
    valor: parseFloat($("#f-valor").value || "0"),
    categoria_id: +$("#f-cat").value || null,
    conta_id: +$("#f-conta").value || null,
    contato_id: +$("#f-contato").value || null,
    data_vencimento: $("#f-venc").value || null,
    data_competencia: $("#f-comp").value || null,
    data_pagamento: pago ? ($("#f-venc").value || hojeISO()) : null,
    obs: $("#f-obs").value.trim() || null,
    juros: parseFloat($("#f-juros").value || "0"),
    multa: parseFloat($("#f-multa").value || "0"),
  };
  if (!body.descricao || !body.valor) { toast("Preencha descrição e valor.", "err"); return; }
  try {
    if (id) await api(`/api/lancamentos/${id}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/lancamentos", { method: "POST", body: JSON.stringify(body) });
    fecharModal(); toast("Lançamento salvo", "ok");
    await recarregarTabela(); atualizarBadge();
  } catch (e) { toast(e.message, "err"); }
}


// Wrappers seguros para onclick — buscam o objeto do cache global em vez de
// embutir JSON.stringify() (que quebra quando há apóstrofos nos dados)
function formBaixaId(id) {
  const l = _LANC_CACHE.get(id);
  if (!l) { toast("Recarregue a página e tente novamente.", "err"); return; }
  formBaixa(l);
}
function formLancamentoId(id) {
  const l = _LANC_CACHE.get(id);
  if (!l) { toast("Recarregue a página e tente novamente.", "err"); return; }
  formLancamento(l, l.tipo);
}


// Cache genérico para edições seguras (evita JSON.stringify em onclick)
const _CACHE = { contas:{}, cats:{}, contatos:{}, veiculos:{}, usuarios:{} };

function _editarConta(id)      { const o = _CACHE.contas[id];    if (o) formConta(o);     else toast("Recarregue a página.", "err"); }
function _editarCategoria(id)  { const o = _CACHE.cats[id];      if (o) formCategoria(o); else toast("Recarregue a página.", "err"); }
function _editarContato(id)    { const o = _CACHE.contatos[id];  if (o) formContato(o);   else toast("Recarregue a página.", "err"); }
function _editarVeiculo(id)    { const o = _CACHE.veiculos[id];  if (o) formVeiculo(o);   else toast("Recarregue a página.", "err"); }
function _editarUsuario(id)    { const o = _CACHE.usuarios[id];  if (o) formUsuario(o);   else toast("Recarregue a página.", "err"); }

function formBaixa(l) {
  const rec = l.tipo === "receita";
  abrirModal(`
    <div class="modal" style="max-width:420px">
      <div class="modal-h"><span class="card-ico i-green">${icon("checkCircle")}</span>
        <h3>Dar baixa</h3><button onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b">
        <p style="margin-bottom:16px;color:var(--ink-2)">Confirmar ${rec ? 'recebimento' : 'pagamento'} de <b>${l.descricao}</b> no valor de <b class="${rec ? 'val-rec' : 'val-desp'}">${money(l.valor)}</b>?</p>
        <div class="frm">
          <div class="campo"><label>Data</label><input id="b-data" type="date" value="${hojeISO()}"></div>
          <div class="campo"><label>Conta</label><select id="b-conta"><option value="">Manter</option>${State.contas.map(c => `<option value="${c.id}" ${l.conta_id === c.id ? 'selected' : ''}>${c.nome}</option>`).join("")}</select></div>
          <div class="campo"><label>Juros (R$)</label><input id="b-juros" type="number" step="0.01" value="${l.juros && +l.juros ? l.juros : ''}" placeholder="0,00"></div>
          <div class="campo"><label>Multa (R$)</label><input id="b-multa" type="number" step="0.01" value="${l.multa && +l.multa ? l.multa : ''}" placeholder="0,00"></div>
        </div>
      </div>
      <div class="modal-f"><button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-green" onclick="confirmarBaixa(${l.id})">${icon("check")}Confirmar</button></div>
    </div>`);
}
async function confirmarBaixa(id) {
  try {
    await api(`/api/lancamentos/${id}/baixa`, { method: "POST", body: JSON.stringify({
      data_pagamento: $("#b-data").value, conta_id: +$("#b-conta").value || null,
      juros: parseFloat($("#b-juros").value || "0"), multa: parseFloat($("#b-multa").value || "0"),
    }) });
    fecharModal(); toast("Baixa registrada", "ok"); await recarregarTabela(); atualizarBadge();
    abrirPDF(`/api/lancamentos/${id}/recibo.pdf`);
  } catch (e) { toast(e.message, "err"); }
}

async function reciboWhats(id) {
  try {
    const r = await api(`/api/lancamentos/${id}/recibo/whatsapp`, { method: "POST" });
    toast(r.enviado ? "Recibo enviado no grupo do WhatsApp" : "WhatsApp desativado — configure a integração", r.enviado ? "ok" : "err");
  } catch (e) { toast(e.message, "err"); }
}
async function estornar(id) {
  try { await api(`/api/lancamentos/${id}/estornar`, { method: "POST" }); toast("Estornado", "ok"); await recarregarTabela(); atualizarBadge(); }
  catch (e) { toast(e.message, "err"); }
}
async function excluirLanc(id) {
  if (!confirm("Excluir este lançamento?")) return;
  try { await api(`/api/lancamentos/${id}`, { method: "DELETE" }); toast("Excluído", "ok"); await recarregarTabela(); atualizarBadge(); }
  catch (e) { toast(e.message, "err"); }
}

/* ============================================================
   VIEW: VENCIMENTOS
   ============================================================ */
async function viewVencimentos(v) {
  const venc = await api("/api/dashboard/vencimentos?dias=15");
  const bloco = (titulo, arr, ic, cls) => `
    <div class="card card-pad">
      <div class="card-h"><span class="card-ico ${cls}">${icon(ic)}</span><div class="grow"><h3>${titulo} (${arr.length})</h3></div></div>
      <div class="venc-list">${arr.length ? arr.map(item(true)).join("") : `<div class="empty">${icon("checkCircle")}<p>Nada por aqui.</p></div>`}</div>
    </div>`;
  function item(mostrarBotao) {
    return (l) => {
      const rec = l.tipo === "receita";
      const d = diasEntre(l.vencimento);
      const atras = l.status === "atrasado";
      const quando = atras ? `Venceu há ${Math.abs(d)} dia(s)` : d === 0 ? "Vence hoje" : d === 1 ? "Vence amanhã" : `Vence em ${d} dias`;
      return `<div class="venc-item">
        <span class="venc-ico ${atras ? 'i-red' : rec ? 'i-green' : 'i-amber'}">${icon(rec ? "arrowDown" : "arrowUp")}</span>
        <div class="d"><div class="n">${l.descricao}</div><div class="w">${quando} · ${dataBR(l.vencimento)}${l.categoria ? " · " + l.categoria : ""}</div></div>
        <div class="vv ${rec ? 'val-rec' : 'val-desp'}">${money(l.valor)}</div>
        ${mostrarBotao ? `<button class="btn btn-green btn-sm" onclick="formBaixaId(${l.id})">${icon("check")}Baixar</button>` : ""}
      </div>`;
    };
  }
  const totAtraso = venc.atrasados.reduce((s, x) => s + (x.tipo === 'despesa' ? x.valor : 0), 0);
  v.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      <div class="kpi red"><div class="lab"><span class="i i-red">${icon("alert")}</span>Atrasados</div><div class="val mono-num">${venc.atrasados.length}</div><div class="meta">${money(totAtraso)} a pagar vencido</div></div>
      <div class="kpi gold"><div class="lab"><span class="i i-gold">${icon("clock")}</span>Próximos 15 dias</div><div class="val mono-num">${venc.proximos.length}</div><div class="meta">Contas a vencer</div></div>
    </div>
    ${bloco("Atrasados", venc.atrasados, "alert", "i-red")}
    <div style="height:18px"></div>
    ${bloco("A vencer", venc.proximos, "clock", "i-gold")}`;
}

/* ============================================================
   VIEW: CONTAS
   ============================================================ */
async function viewContas(v) {
  const contas = await api("/api/contas");
  contas.forEach(c => _CACHE.contas[c.id] = c);
  const total = contas.reduce((s, c) => s + Number(c.saldo_atual || 0), 0);
  v.innerHTML = `
    <div class="toolbar">
      <div class="kpi gold" style="min-width:230px;margin:0">
        <div class="lab"><span class="i i-gold">${icon("wallet")}</span>Saldo consolidado</div>
        <div class="val mono-num">${money(total)}</div>
        <div class="meta">${contas.length} conta(s) cadastrada(s)</div>
      </div>
      <div class="grow"></div>
      <button class="btn btn-primary" onclick="formConta(null)">${icon("plus")}Nova conta</button>
    </div>
    <div class="grid-3">
      ${contas.map(c => `
        <div class="card card-pad">
          <div class="card-h">
            ${c.logo ? avatarLogo(c.logo, c.nome, 40) : `<span class="card-ico" style="background:${c.cor}22;color:${c.cor}">${icon(c.tipo === "carteira" ? "cash" : "bank")}</span>`}
            <div class="grow"><h3>${c.nome}</h3><div class="sub">${c.tipo === "carteira" ? "Carteira / dinheiro" : (c.banco || "Conta bancária")}</div></div>
          </div>
          <div class="val mono-num" style="font-size:26px;color:${Number(c.saldo_atual) < 0 ? 'var(--red)' : 'var(--navy)'};margin:6px 0 2px">${money(c.saldo_atual)}</div>
          <div class="meta">Saldo inicial ${money(c.saldo_inicial)}</div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn btn-ghost btn-sm" onclick="_editarConta(${c.id})">${icon("edit")}Editar</button>
            <button class="btn btn-ghost btn-sm" onclick="excluirConta(${c.id})">${icon("trash")}Excluir</button>
          </div>
        </div>`).join("") || `<div class="empty">${icon("wallet")}<p>Nenhuma conta ainda.</p></div>`}
    </div>`;
}
function formConta(c) {
  const e = c || {};
  abrirModal(`
    <div class="modal">
      <div class="modal-h"><span class="card-ico i-navy">${icon("wallet")}</span><h3>${c ? "Editar conta" : "Nova conta"}</h3><button onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b"><div class="frm">
        <div class="campo full"><label>Nome</label><input id="c-nome" value="${e.nome || ""}" placeholder="Nome da conta"></div>
        <div class="campo"><label>Tipo</label><select id="c-tipo">
          <option value="banco"${e.tipo === "banco" ? " selected" : ""}>Conta bancária</option>
          <option value="carteira"${e.tipo === "carteira" ? " selected" : ""}>Carteira / dinheiro</option>
        </select></div>
        <div class="campo"><label>Banco (opcional)</label><input id="c-banco" value="${e.banco || ""}" placeholder="Nome do banco"></div>
        <div class="campo"><label>Saldo inicial</label><input id="c-saldo" type="number" step="0.01" value="${e.saldo_inicial ?? 0}"></div>
        <div class="campo"><label>Cor</label><input id="c-cor" type="color" value="${e.cor || "#305C74"}"></div>
        ${campoLogo("Logo do banco ou cartão. PNG ou JPG.")}
      </div></div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarConta(${c ? e.id : "null"})">${icon("check")}Salvar</button>
      </div>
    </div>`, "lg");
  initLogo(e.logo);
}
async function salvarConta(id) {
  const body = {
    nome: $("#c-nome").value.trim(),
    tipo: $("#c-tipo").value,
    banco: $("#c-banco").value.trim() || null,
    saldo_inicial: Number($("#c-saldo").value || 0),
    cor: $("#c-cor").value,
    logo: LOGO_BUF || null,
  };
  if (!body.nome) return toast("Informe o nome", "err");
  try {
    if (id) await api(`/api/contas/${id}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/contas", { method: "POST", body: JSON.stringify(body) });
    fecharModal(); toast("Conta salva", "ok"); setView("contas");
  } catch (e) { toast(e.message, "err"); }
}
async function excluirConta(id) {
  if (!confirm("Excluir esta conta? Lançamentos ligados a ela ficarão sem conta.")) return;
  try { await api(`/api/contas/${id}`, { method: "DELETE" }); toast("Conta excluída", "ok"); setView("contas"); }
  catch (e) { toast(e.message, "err"); }
}

/* ============================================================
   VIEW: CATEGORIAS
   ============================================================ */
async function viewCategorias(v) {
  const cats = await api("/api/categorias");
  const rec = cats.filter(c => c.tipo === "receita");
  const desp = cats.filter(c => c.tipo === "despesa");
  const bloco = (titulo, arr, ic, cls) => `
    <div class="card card-pad">
      <div class="card-h"><span class="card-ico ${cls}">${icon(ic)}</span><div class="grow"><h3>${titulo}</h3><div class="sub">${arr.length} categoria(s)</div></div></div>
      <div style="display:flex;flex-direction:column;gap:2px;margin-top:4px">
        ${arr.map(c => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 6px;border-bottom:1px solid var(--line)">
            <span class="card-ico" style="width:34px;height:34px;background:${c.cor}22;color:${c.cor}">${icon(c.icone || "tag")}</span>
            <div class="grow"><div class="nm">${c.nome}</div></div>
            <button class="btn-icon" onclick="_editarCategoria(${c.id})">${icon("edit")}</button>
            <button class="btn-icon" onclick="excluirCategoria(${c.id})">${icon("trash")}</button>
          </div>`).join("") || `<div class="empty" style="padding:20px">${icon("tag")}<p>Nenhuma.</p></div>`}
    </div>`;
  v.innerHTML = `
    <div class="toolbar"><div class="grow"></div>
      <button class="btn btn-green" onclick="formCategoria(null,'receita')">${icon("plus")}Categoria de receita</button>
      <button class="btn btn-primary" onclick="formCategoria(null,'despesa')">${icon("plus")}Categoria de despesa</button>
    </div>
    <div class="grid-2" style="grid-template-columns:1fr 1fr">
      ${bloco("Receitas", rec, "arrowDown", "i-green")}
      ${bloco("Despesas", desp, "arrowUp", "i-red")}
    </div>`;
}
function formCategoria(c, tipoPad) {
  const e = c || {};
  const tipo = e.tipo || tipoPad || "despesa";
  const icones = ["tag","cash","wallet","bank","doc","users","trendUp","pie","calendar","clock","alert","cog"];
  abrirModal(`
    <div class="modal">
      <div class="modal-h"><span class="card-ico i-navy">${icon("tag")}</span><h3>${c ? "Editar categoria" : "Nova categoria"}</h3><button onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b"><div class="frm">
        <div class="campo full"><label>Nome</label><input id="k-nome" value="${e.nome || ""}" placeholder="Nome da categoria"></div>
        <div class="campo"><label>Tipo</label><select id="k-tipo">
          <option value="despesa"${tipo === "despesa" ? " selected" : ""}>Despesa</option>
          <option value="receita"${tipo === "receita" ? " selected" : ""}>Receita</option>
        </select></div>
        <div class="campo"><label>Cor</label><input id="k-cor" type="color" value="${e.cor || (tipo === "receita" ? "#3E9079" : "#C9A94E")}"></div>
        <div class="campo full"><label>Ícone</label><select id="k-icone">
          ${icones.map(i => `<option value="${i}"${(e.icone || "tag") === i ? " selected" : ""}>${i}</option>`).join("")}
        </select></div>
      </div></div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarCategoria(${c ? e.id : "null"})">${icon("check")}Salvar</button>
      </div>
    </div>`);
}
async function salvarCategoria(id) {
  const body = { nome: $("#k-nome").value.trim(), tipo: $("#k-tipo").value, cor: $("#k-cor").value, icone: $("#k-icone").value };
  if (!body.nome) return toast("Informe o nome", "err");
  try {
    if (id) await api(`/api/categorias/${id}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/categorias", { method: "POST", body: JSON.stringify(body) });
    fecharModal(); toast("Categoria salva", "ok"); setView("categorias");
  } catch (e) { toast(e.message, "err"); }
}
async function excluirCategoria(id) {
  if (!confirm("Excluir esta categoria?")) return;
  try { await api(`/api/categorias/${id}`, { method: "DELETE" }); toast("Categoria excluída", "ok"); setView("categorias"); }
  catch (e) { toast(e.message, "err"); }
}

/* ============================================================
   VIEW: CONTATOS (clientes / fornecedores)
   ============================================================ */
let FCONTATO = "";
async function viewContatos(v) {
  const contatos = await api("/api/contatos");
  window._contatos = contatos;
  v.innerHTML = `
    <div class="toolbar">
      <div class="seg" id="seg-cont">
        <button data-t="" class="on" onclick="filtroContato('')">Todos</button>
        <button data-t="cliente" onclick="filtroContato('cliente')">Recebo de</button>
        <button data-t="fornecedor" onclick="filtroContato('fornecedor')">Pago para</button>
      </div>
      <div class="search"><span>${icon("search")}</span><input class="search-i" id="bc" placeholder="Buscar nome..." oninput="renderContatos()"></div>
      <div class="grow"></div>
      <button class="btn btn-primary" onclick="formContato(null)">${icon("plus")}Novo contato</button>
    </div>
    <div class="card"><div class="tbl-wrap"><table>
      <thead><tr><th>Nome</th><th>Tipo</th><th>Documento</th><th>Telefone</th><th>E-mail</th><th style="width:96px"></th></tr></thead>
      <tbody id="tbc"></tbody>
    </table></div></div>`;
  FCONTATO = ""; renderContatos();
}
function filtroContato(t) {
  FCONTATO = t;
  document.querySelectorAll("#seg-cont button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  renderContatos();
}
function renderContatos() {
  const busca = ($("#bc")?.value || "").toLowerCase();
  const arr = (window._contatos || []).filter(c =>
    (!FCONTATO || c.tipo === FCONTATO) && (!busca || c.nome.toLowerCase().includes(busca)));
  $("#tbc").innerHTML = arr.map(c => `
    <tr>
      <td><div style="display:flex;align-items:center;gap:10px">${avatarLogo(c.logo, c.nome)}<div><div class="cell-desc">${c.nome}</div>${c.obs ? `<div class="cell-sub">${c.obs}</div>` : ""}</div></div></td>
      <td><span class="tag ${c.tipo === "cliente" ? "pago" : "pendente"}">${c.tipo === "cliente" ? "Recebo de" : "Pago para"}</span></td>
      <td>${c.documento || "—"}</td><td>${c.telefone || "—"}</td><td>${c.email || "—"}</td>
      <td><div style="display:flex;gap:4px;justify-content:flex-end">
        <button class="btn-icon" onclick="_editarContato(${c.id})">${icon("edit")}</button>
        <button class="btn-icon" onclick="excluirContato(${c.id})">${icon("trash")}</button>
      </div></td>
    </tr>`).join("") || `<tr><td colspan="6"><div class="empty">${icon("users")}<p>Nenhum contato.</p></div></td></tr>`;
}
function formContato(c) {
  const e = c || {};
  abrirModal(`
    <div class="modal">
      <div class="modal-h"><span class="card-ico i-navy">${icon("users")}</span><h3>${c ? "Editar contato" : "Novo contato"}</h3><button onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b"><div class="frm">
        <div class="campo full"><label>Nome</label><input id="o-nome" value="${e.nome || ""}" placeholder="Nome do contato"></div>
        <div class="campo"><label>Tipo</label><select id="o-tipo">
          <option value="cliente"${e.tipo === "cliente" ? " selected" : ""}>Recebo de (fonte de renda)</option>
          <option value="fornecedor"${e.tipo === "fornecedor" ? " selected" : ""}>Pago para (estabelecimento)</option>
        </select></div>
        <div class="campo"><label>Documento (CPF/CNPJ)</label><input id="o-doc" value="${e.documento || ""}"></div>
        <div class="campo"><label>Telefone</label><input id="o-tel" value="${e.telefone || ""}"></div>
        <div class="campo"><label>E-mail</label><input id="o-email" value="${e.email || ""}"></div>
        ${campoLogo("Logo da empresa. PNG ou JPG — reduzido e salvo no sistema.")}
        <div class="campo full"><label>Observações</label><textarea id="o-obs" rows="2">${e.obs || ""}</textarea></div>
      </div></div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarContato(${c ? e.id : "null"})">${icon("check")}Salvar</button>
      </div>
    </div>`, "lg");
  initLogo(e.logo);
}
async function salvarContato(id) {
  const body = {
    nome: $("#o-nome").value.trim(), tipo: $("#o-tipo").value,
    documento: $("#o-doc").value.trim() || null, telefone: $("#o-tel").value.trim() || null,
    email: $("#o-email").value.trim() || null, obs: $("#o-obs").value.trim() || null,
    logo: LOGO_BUF || null,
  };
  if (!body.nome) return toast("Informe o nome", "err");
  try {
    if (id) await api(`/api/contatos/${id}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/contatos", { method: "POST", body: JSON.stringify(body) });
    fecharModal(); toast("Contato salvo", "ok"); setView("contatos");
  } catch (e) { toast(e.message, "err"); }
}
async function excluirContato(id) {
  if (!confirm("Excluir este contato?")) return;
  try { await api(`/api/contatos/${id}`, { method: "DELETE" }); toast("Contato excluído", "ok"); setView("contatos"); }
  catch (e) { toast(e.message, "err"); }
}

/* ============================================================
   VIEW: WHATSAPP (estilo Sentinela)
   ============================================================ */
async function viewWhatsapp(v) {
  let st = {};
  try { st = await api("/api/whatsapp/status"); } catch { st = {}; }
  const ativo = !!st.ativo;
  const cmds = [
    { n: "1", c: "saldo", d: "Saldo das contas" },
    { n: "2", c: "vencimentos", d: "Atrasados + próximos 7 dias" },
    { n: "3", c: "resumo", d: "Resumo do mês" },
    { n: "4", c: "apagar", d: "Contas a pagar" },
    { n: "5", c: "areceber", d: "Contas a receber" },
    { n: "6", c: "patrimonio", d: "Contas + veículos" },
    { n: "7", c: "juros", d: "Juros e multas do ano" },
    { n: "0", c: "menu", d: "Mostra o menu" },
  ];
  v.innerHTML = `
    <div class="wa-card" style="margin-bottom:18px">
      <div class="wa-ico">${icon("whatsapp")}</div>
      <div class="grow">
        <div class="t">Central de avisos no WhatsApp</div>
        <div class="s"><span class="status-dot ${ativo ? "on" : "off"}"></span>${ativo ? "Integração ativa" : "Integração desativada (defina as variáveis no servidor)"}</div>
      </div>
      <button class="btn btn-green" onclick="testarWhatsapp(this)" ${ativo ? "" : "disabled"}>${icon("send")}Enviar teste</button>
    </div>

    <div class="grid-2" style="grid-template-columns:1fr 1fr">
      <div class="card card-pad">
        <div class="card-h"><span class="card-ico i-navy">${icon("cog")}</span><div class="grow"><h3>Configuração atual</h3></div></div>
        <table style="width:100%;font-size:13.5px">
          <tbody>
            <tr><td style="padding:7px 0;color:var(--ink-3)">Gateway</td><td style="text-align:right;font-family:monospace">${st.gateway || "—"}</td></tr>
            <tr><td style="padding:7px 0;color:var(--ink-3)">Grupo de controle</td><td style="text-align:right;font-family:monospace">${st.grupo || "—"}</td></tr>
            <tr><td style="padding:7px 0;color:var(--ink-3)">Alerta diário</td><td style="text-align:right">${st.alerta_hora != null ? String(st.alerta_hora).padStart(2, "0") + ":00" : "—"}</td></tr>
            <tr><td style="padding:7px 0;color:var(--ink-3)">Antecedência</td><td style="text-align:right">${st.alerta_dias_antes ?? "—"} dia(s)</td></tr>
            <tr><td style="padding:7px 0;color:var(--ink-3)">Resumo semanal</td><td style="text-align:right">${st.resumo_semanal ? "Ativo (seg.)" : "Desativado"}</td></tr>
          </tbody>
        </table>
        <div class="login-hint" style="margin-top:12px">Configure em <b>Configurações</b> no menu lateral — WhatsApp, FIPE, alertas e PDFs, tudo pelo sistema.</div>
      </div>

      <div class="card card-pad">
        <div class="card-h"><span class="card-ico i-green">${icon("whatsapp")}</span><div class="grow"><h3>Comandos no grupo</h3><div class="sub">Responde a número ou palavra</div></div></div>
        <div class="cmd-grid">
          ${cmds.map(c => `<div class="cmd"><span class="n">${c.n}</span><div><div class="c">${c.c}</div><div class="dsc">${c.d}</div></div></div>`).join("")}
        </div>
        <div class="login-hint" style="margin-top:14px">O sistema envia sozinho: alerta de vencimentos todo dia às ${st.alerta_hora != null ? String(st.alerta_hora).padStart(2, "0") : "08"}:00 (só quando há algo) e um resumo semanal na segunda-feira. Silencioso quando não há nada a avisar — igual ao Sentinela.</div>
      </div>
    </div>`;
}
async function testarWhatsapp(btn) {
  const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = icon("refresh", "spin") + "Enviando...";
  try {
    const r = await api("/api/whatsapp/teste", { method: "POST" });
    toast(r.enviado ? "Mensagem de teste enviada ao grupo" : "Gateway não confirmou o envio", r.enviado ? "ok" : "err");
  } catch (e) { toast(e.message, "err"); }
  btn.disabled = false; btn.innerHTML = orig;
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */
/* ============================================================
   VIEW: VEÍCULOS (patrimônio + FIPE/fixo + financiamento)
   ============================================================ */
async function viewVeiculos(v) {
  const [veics, fipe] = await Promise.all([api("/api/veiculos"), api("/api/veiculos/fipe/status")]);
  const totalPat = veics.reduce((s, x) => s + Number(x.patrimonio_liquido || 0), 0);
  v.innerHTML = `
    <div class="toolbar">
      <div class="kpi navy" style="min-width:240px;margin:0">
        <div class="lab"><span class="i i-navy">${icon("car")}</span>Patrimônio em veículos</div>
        <div class="val mono-num">${money(totalPat)}</div>
        <div class="meta">${veics.length} veículo(s) · valor menos financiamento</div>
      </div>
      <div class="grow"></div>
      <span class="tag ${fipe.ativo ? "pago" : "pendente"}" style="align-self:center">FIPE ${fipe.ativo ? "ativa" : "manual"}</span>
      <button class="btn btn-primary" onclick="formVeiculo(null)">${icon("plus")}Novo veículo</button>
    </div>
    <div class="grid-3">
      ${veics.map(cardVeiculo).join("") || `<div class="empty">${icon("car")}<p>Nenhum veículo cadastrado.</p></div>`}
    </div>`;
}

function cardVeiculo(x) {
  const fipe = x.tipo_valor === "fipe";
  const financiado = x.parcelas_total && x.parcelas_total > 0;
  const pago = financiado ? Math.round(((x.parcelas_pagas || 0) / x.parcelas_total) * 100) : 0;
  const extras = x.extras && typeof x.extras === "object" ? Object.entries(x.extras) : [];
  return `
    <div class="card card-pad">
      <div class="card-h">
        <span class="card-ico" style="background:${x.cor_card}22;color:${x.cor_card}">${icon("car")}</span>
        <div class="grow"><h3>${x.nome}</h3><div class="sub">${[x.marca, x.modelo, x.ano].filter(Boolean).join(" · ") || "—"}</div></div>
        <span class="tag ${fipe ? "rec" : "pendente"}">${fipe ? "FIPE" : "Valor fixo"}</span>
      </div>
      <div class="val mono-num" style="font-size:24px;color:var(--navy);margin:6px 0 0">${money(x.valor_atual)}</div>
      <div class="meta">${x.placa ? "Placa " + x.placa + " · " : ""}${fipe && x.fipe_atualizado_em ? "FIPE de " + dataBRcurto(x.fipe_atualizado_em) : (fipe ? "FIPE não consultada" : "Definido manualmente")}</div>
      ${financiado ? `
        <div style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--ink-2)">
            <span>Financiamento${x.financiamento_banco ? " · " + x.financiamento_banco : ""}</span>
            <span><b>${x.parcelas_pagas || 0}/${x.parcelas_total}</b> parcelas</span>
          </div>
          <div style="height:8px;border-radius:6px;background:var(--line-2);margin:6px 0;overflow:hidden">
            <div style="height:100%;width:${pago}%;background:linear-gradient(90deg,var(--teal),var(--green-2))"></div>
          </div>
          <div class="meta">Faltam <b>${x.parcelas_restantes}</b> de ${money(x.valor_parcela)} · Saldo devedor <b>${money(x.saldo_financiamento)}</b></div>
        </div>` : ""}
      ${extras.length ? `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px">${extras.map(([k, val]) => `<span class="cat-chip"><b>${k}:</b>&nbsp;${val}</span>`).join("")}</div>` : ""}
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        ${fipe ? `<button class="btn btn-ghost btn-sm" onclick="atualizarFipe(${x.id})">${icon("refresh")}Atualizar FIPE</button>` : ""}
        <button class="btn btn-ghost btn-sm" onclick="_editarVeiculo(${x.id})">${icon("edit")}Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="excluirVeiculo(${x.id})">${icon("trash")}</button>
      </div>
    </div>`;
}

let EXTRAS = [];
function formVeiculo(x) {
  const e = x || {};
  EXTRAS = e.extras && typeof e.extras === "object" ? Object.entries(e.extras).map(([k, v]) => ({ k, v })) : [];
  const fipe = (e.tipo_valor || "fipe") === "fipe";
  abrirModal(`
    <div class="modal" style="max-width:640px">
      <div class="modal-h"><span class="card-ico i-navy">${icon("car")}</span><h3>${x ? "Editar veículo" : "Novo veículo"}</h3><button onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b"><div class="frm">
        <div class="campo full"><label>Apelido / nome</label><input id="v-nome" value="${e.nome || ""}" placeholder="Apelido do veículo"></div>
        <div class="campo"><label>Marca</label><input id="v-marca" value="${e.marca || ""}"></div>
        <div class="campo"><label>Modelo</label><input id="v-modelo" value="${e.modelo || ""}"></div>
        <div class="campo"><label>Ano/modelo</label><input id="v-ano" value="${e.ano || ""}" placeholder="2021/2022"></div>
        <div class="campo"><label>Placa</label><input id="v-placa" value="${e.placa || ""}"></div>
        <div class="campo"><label>Cor</label><input id="v-cor" value="${e.cor || ""}"></div>
        <div class="campo"><label>KM</label><input id="v-km" type="number" value="${e.km ?? ""}"></div>

        <div class="campo full" style="border-top:1px solid var(--line);padding-top:12px"><label>Como calcular o valor?</label>
          <select id="v-tipo" onchange="toggleTipoValor()">
            <option value="fipe"${fipe ? " selected" : ""}>Automático pela FIPE (FIPEConsulta)</option>
            <option value="fixo"${!fipe ? " selected" : ""}>Valor fixo (eu defino)</option>
          </select></div>
        <div class="campo" id="wrap-fipe-cod"><label>Código FIPE (p/ consulta)</label><input id="v-fipecod" value="${e.fipe_codigo || ""}" placeholder="Código FIPE"></div>
        <div class="campo" id="wrap-fipe-val"><label>Valor FIPE atual (R$)</label><input id="v-fipeval" type="number" step="0.01" value="${e.fipe_valor ?? ""}" placeholder="consultar ou informar"></div>
        <div class="campo" id="wrap-fixo"><label>Valor fixo (R$)</label><input id="v-fixo" type="number" step="0.01" value="${e.valor_fixo ?? ""}"></div>

        <div class="campo full" style="border-top:1px solid var(--line);padding-top:12px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="v-fin" ${e.financiado ? "checked" : ""} onchange="toggleFin()" style="width:auto"> Tem financiamento</label></div>
        <div class="campo" id="wf-banco"><label>Banco</label><input id="v-banco" value="${e.financiamento_banco || ""}"></div>
        <div class="campo" id="wf-vparc"><label>Valor da parcela (R$)</label><input id="v-vparc" type="number" step="0.01" value="${e.valor_parcela ?? ""}"></div>
        <div class="campo" id="wf-ptot"><label>Total de parcelas</label><input id="v-ptot" type="number" value="${e.parcelas_total ?? ""}"></div>
        <div class="campo" id="wf-ppag"><label>Parcelas já pagas</label><input id="v-ppag" type="number" value="${e.parcelas_pagas ?? ""}"></div>
        <div class="campo" id="wf-dia"><label>Dia do vencimento</label><input id="v-dia" type="number" min="1" max="31" value="${e.venc_dia ?? ""}"></div>

        <div class="campo full" style="border-top:1px solid var(--line);padding-top:12px">
          <label>Campos personalizados</label>
          <div id="extras-box"></div>
          <button class="btn btn-ghost btn-sm" onclick="addExtra()" style="margin-top:8px">${icon("plus")}Adicionar campo</button>
        </div>
        <div class="campo full"><label>Observações</label><textarea id="v-obs" rows="2">${e.obs || ""}</textarea></div>
      </div></div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarVeiculo(${x ? e.id : "null"})">${icon("check")}Salvar</button>
      </div>
    </div>`, "lg");
  renderExtras(); toggleTipoValor(); toggleFin();
}
function renderExtras() {
  $("#extras-box").innerHTML = EXTRAS.map((ex, i) => `
    <div style="display:flex;gap:8px;margin-bottom:6px">
      <input placeholder="Nome do campo" value="${ex.k}" oninput="EXTRAS[${i}].k=this.value" style="flex:1">
      <input placeholder="Valor" value="${ex.v}" oninput="EXTRAS[${i}].v=this.value" style="flex:1">
      <button class="btn-icon" onclick="EXTRAS.splice(${i},1);renderExtras()">${icon("trash")}</button>
    </div>`).join("") || `<div class="meta">Nenhum campo. Você escolhe o que controlar (seguro, IPVA, Renavam...).</div>`;
}
function addExtra() { EXTRAS.push({ k: "", v: "" }); renderExtras(); }
function toggleTipoValor() {
  const fipe = $("#v-tipo").value === "fipe";
  $("#wrap-fipe-cod").style.display = fipe ? "" : "none";
  $("#wrap-fipe-val").style.display = fipe ? "" : "none";
  $("#wrap-fixo").style.display = fipe ? "none" : "";
}
function toggleFin() {
  const on = $("#v-fin").checked;
  ["wf-banco", "wf-vparc", "wf-ptot", "wf-ppag", "wf-dia"].forEach(id => { $("#" + id).style.display = on ? "" : "none"; });
}
async function salvarVeiculo(id) {
  const extras = {};
  EXTRAS.forEach(ex => { if (ex.k.trim()) extras[ex.k.trim()] = ex.v; });
  const body = {
    nome: $("#v-nome").value.trim(), marca: $("#v-marca").value.trim() || null,
    modelo: $("#v-modelo").value.trim() || null, ano: $("#v-ano").value.trim() || null,
    placa: $("#v-placa").value.trim() || null, cor: $("#v-cor").value.trim() || null,
    km: +$("#v-km").value || null, tipo_valor: $("#v-tipo").value,
    valor_fixo: parseFloat($("#v-fixo").value) || null,
    fipe_codigo: $("#v-fipecod").value.trim() || null,
    fipe_valor: parseFloat($("#v-fipeval").value) || null,
    financiado: $("#v-fin").checked,
    financiamento_banco: $("#v-banco").value.trim() || null,
    valor_parcela: parseFloat($("#v-vparc").value) || null,
    parcelas_total: +$("#v-ptot").value || null,
    parcelas_pagas: +$("#v-ppag").value || null,
    venc_dia: +$("#v-dia").value || null,
    obs: $("#v-obs").value.trim() || null, extras,
  };
  if (!body.nome) return toast("Informe o nome do veículo", "err");
  try {
    if (id) await api(`/api/veiculos/${id}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/veiculos", { method: "POST", body: JSON.stringify(body) });
    fecharModal(); toast("Veículo salvo", "ok"); setView("veiculos");
  } catch (e) { toast(e.message, "err"); }
}
async function excluirVeiculo(id) {
  if (!confirm("Excluir este veículo?")) return;
  try { await api(`/api/veiculos/${id}`, { method: "DELETE" }); toast("Veículo excluído", "ok"); setView("veiculos"); }
  catch (e) { toast(e.message, "err"); }
}
async function atualizarFipe(id) {
  toast("Consultando FIPE...", "ok");
  try { await api(`/api/veiculos/${id}/fipe`, { method: "POST" }); toast("Valor FIPE atualizado", "ok"); setView("veiculos"); }
  catch (e) { toast(e.message, "err"); }
}

/* ============================================================
   VIEW: RELATÓRIOS (balancete, patrimônio, projeção) + PDF
   ============================================================ */
let PERIODO = { de: null, ate: null };
async function viewRelatorios(v) {
  const hoje = new Date();
  if (!PERIODO.de) {
    PERIODO.de = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
    PERIODO.ate = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
  }
  const [bal, pat, proj, jur] = await Promise.all([
    api(`/api/relatorios/balancete?de=${PERIODO.de}&ate=${PERIODO.ate}`),
    api("/api/relatorios/patrimonio"),
    api("/api/relatorios/projecao?meses=6"),
    api("/api/relatorios/juros"),
  ]);
  const linhaCat = (arr) => arr.map(([n, val]) => `<tr><td>${n}</td><td class="num">${money(val)}</td></tr>`).join("") || `<tr><td colspan="2" class="meta">Sem lançamentos</td></tr>`;
  const resPos = bal.resultado >= 0;
  v.innerHTML = `
    <div class="toolbar">
      <div class="frm" style="display:flex;gap:10px;align-items:end;margin:0">
        <div class="campo" style="margin:0"><label>De</label><input type="date" id="r-de" value="${PERIODO.de}"></div>
        <div class="campo" style="margin:0"><label>Até</label><input type="date" id="r-ate" value="${PERIODO.ate}"></div>
        <button class="btn btn-ghost" onclick="aplicarPeriodo()">${icon("filter")}Aplicar</button>
      </div>
      <div class="grow"></div>
      <button class="btn btn-primary" onclick="abrirPDF('/api/relatorios/balancete.pdf?de=${PERIODO.de}&ate=${PERIODO.ate}')">${icon("download")}Balancete PDF</button>
      <button class="btn btn-ghost" onclick="abrirPDF('/api/relatorios/balancete.pdf?de=${PERIODO.de}&ate=${PERIODO.ate}&estilo=matricial')">${icon("terminal")}Estilo cupom</button>
      <button class="btn btn-gold" onclick="abrirPDF('/api/relatorios/patrimonio.pdf')">${icon("download")}Patrimônio PDF</button>
      <button class="btn btn-ghost" onclick="abrirPDF('/api/relatorios/patrimonio.pdf?estilo=matricial')">${icon("terminal")}Estilo cupom</button>
    </div>

    <div class="grid-2">
      <div class="card card-pad">
        <div class="card-h"><span class="card-ico i-green">${icon("trendUp")}</span><div class="grow"><h3>Balancete — receitas</h3></div></div>
        <div class="tbl-wrap"><table><tbody>${linhaCat(bal.receitas)}
          <tr style="border-top:2px solid var(--green)"><td><b>Total de receitas</b></td><td class="num val-rec"><b>${money(bal.total_receitas)}</b></td></tr>
        </tbody></table></div>
      </div>
      <div class="card card-pad">
        <div class="card-h"><span class="card-ico i-gold">${icon("arrowUp")}</span><div class="grow"><h3>Balancete — despesas</h3></div></div>
        <div class="tbl-wrap"><table><tbody>${linhaCat(bal.despesas)}
          <tr style="border-top:2px solid var(--gold)"><td><b>Total de despesas</b></td><td class="num val-desp"><b>${money(bal.total_despesas)}</b></td></tr>
        </tbody></table></div>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div><div class="sub">Resultado do período</div>
          <div class="val mono-num" style="font-size:26px;color:${resPos ? "var(--green-deep)" : "var(--red)"}">${money(bal.resultado)}</div></div>
        <div style="text-align:right"><div class="sub">Juros pagos no período</div>
          <div class="val mono-num" style="font-size:20px;color:var(--red)">${money(bal.juros)}</div></div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:18px">
      <div class="card card-pad">
        <div class="card-h"><span class="card-ico i-navy">${icon("trendUp")}</span><div class="grow"><h3>Projeção — próximos 6 meses</h3><div class="sub">Baseada em pendências e média recente</div></div></div>
        ${barChart(proj)}
        <div class="meta" style="margin-top:8px">Saldo projetado ao fim do período: <b>${money(proj[proj.length - 1]?.saldo || 0)}</b></div>
      </div>
      <div class="card card-pad">
        <div class="card-h"><span class="card-ico i-navy">${icon("car")}</span><div class="grow"><h3>Patrimônio</h3></div></div>
        <div class="tbl-wrap"><table><tbody>
          <tr><td>Contas e aplicações</td><td class="num">${money(pat.total_contas)}</td></tr>
          <tr><td>Veículos</td><td class="num">${money(pat.total_veiculos)}</td></tr>
          <tr><td>Financiamentos (a pagar)</td><td class="num val-desp">− ${money(pat.total_financiamentos)}</td></tr>
          <tr style="border-top:2px solid var(--gold)"><td><b>Patrimônio líquido</b></td><td class="num"><b>${money(pat.patrimonio_liquido)}</b></td></tr>
        </tbody></table></div>
        <div class="meta" style="margin-top:8px">Juros no ano: <b>${money(jur.juros_pago_ano)}</b> · a pagar <b>${money(jur.juros_a_pagar)}</b></div>
      </div>
    </div>`;
}
function aplicarPeriodo() {
  PERIODO.de = $("#r-de").value; PERIODO.ate = $("#r-ate").value;
  setView("relatorios");
}

function _ultimoAcesso() {
  const raw = State.ultimo_acesso;
  if (!raw) return "";
  try {
    const d = new Date(raw);
    const agora = new Date();
    const diffMin = Math.floor((agora - d) / 60000);
    let quando;
    if (diffMin < 1) quando = "agora mesmo";
    else if (diffMin < 60) quando = `há ${diffMin} min`;
    else if (diffMin < 1440) quando = `há ${Math.floor(diffMin / 60)}h`;
    else {
      const dias = Math.floor(diffMin / 1440);
      quando = dias === 1 ? "há 1 dia" : `há ${dias} dias`;
    }
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const data = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const ip = State.ultimo_acesso_ip ? ` · ${State.ultimo_acesso_ip}` : "";
    return `<div class="login-last">🕐 Último acesso: ${data} às ${hora} (${quando})${ip}</div>`;
  } catch { return ""; }
}

/* ============================================================
   VIEW: CONFIGURAÇÕES (tudo pelo sistema, igual ao Sentinela)
   ============================================================ */
const CFG_GRUPOS = [
  {
    titulo: "WhatsApp", ic: "whatsapp", cor: "i-green",
    desc: "Configure o gateway WhatsApp (zap.unicontroller.com.br) e os alertas automáticos.",
    chaves: ["WHATSAPP_ATIVO","WHATSAPP_API_URL","WHATSAPP_API_TOKEN","WHATSAPP_GRUPO","WHATSAPP_ENDPOINT_ENVIAR","RECIBO_WHATSAPP_AUTO"],
  },
  {
    titulo: "Alertas automáticos", ic: "alert", cor: "i-gold",
    desc: "Horários e regras dos alertas de vencimento, resumo semanal e fechamento do dia.",
    chaves: ["ALERTA_HORA","ALERTA_DIAS_ANTES","RESUMO_SEMANAL","FECHAMENTO_DIARIO","FECHAMENTO_HORA"],
  },
  {
    titulo: "FIPEConsulta", ic: "car", cor: "i-navy",
    desc: "Integração com sua API FIPEConsulta para atualização automática do valor dos veículos.",
    chaves: ["FIPE_ATIVO","FIPE_API_URL","FIPE_API_TOKEN","FIPE_ENDPOINT"],
  },
  {
    titulo: "PDFs e recibos", ic: "doc", cor: "i-gold",
    desc: "Nome e dados da empresa que aparecem no cabeçalho e rodapé dos PDFs gerados.",
    chaves: ["EMPRESA_NOME","EMPRESA_DOC","EMPRESA_CIDADE"],
  },
];
const BOOL_CHAVES = new Set(["WHATSAPP_ATIVO","RECIBO_WHATSAPP_AUTO","RESUMO_SEMANAL","FECHAMENTO_DIARIO","FIPE_ATIVO"]);
const INT_CHAVES  = new Set(["ALERTA_HORA","ALERTA_DIAS_ANTES","FECHAMENTO_HORA"]);
const PASS_CHAVES = new Set(["WHATSAPP_API_TOKEN","FIPE_API_TOKEN"]);

async function viewConfiguracoes(v) {
  const cfgs = await api("/api/configuracoes");
  const map = Object.fromEntries(cfgs.map(c => [c.chave, c]));

  function campo(c) {
    const isPass = PASS_CHAVES.has(c.chave);
    const isBool = BOOL_CHAVES.has(c.chave);
    const isInt  = INT_CHAVES.has(c.chave);
    const val = c.valor || "";
    if (isBool) return `
      <div class="cfg-row">
        <label class="cfg-label">${c.descricao}</label>
        <div style="display:flex;align-items:center;gap:10px">
          <label class="toggle"><input type="checkbox" id="cfg-${c.chave}" ${val==="true"||val==="1" ? "checked" : ""}>
            <span class="toggle-sl"></span></label>
          <span class="meta" id="cfg-lbl-${c.chave}">${val==="true"||val==="1" ? "Ativado" : "Desativado"}</span>
        </div>
      </div>`;
    return `
      <div class="cfg-row">
        <label class="cfg-label">${c.descricao}</label>
        <input class="cfg-input" id="cfg-${c.chave}" type="${isPass ? 'password' : isInt ? 'number' : 'text'}"
          value="${val}" placeholder="${c.chave}" autocomplete="off">
      </div>`;
  }

  v.innerHTML = `
    <div class="toolbar">
      <h2 style="margin:0;color:var(--navy)">Configurações do sistema</h2>
      <div class="grow"></div>
      <button class="btn btn-primary" onclick="salvarConfiguracoes()">${icon("check")}Salvar tudo</button>
    </div>
    <div class="cfg-grid">
      ${CFG_GRUPOS.map(g => `
        <div class="card card-pad">
          <div class="card-h">
            <span class="card-ico ${g.cor}">${icon(g.ic)}</span>
            <div class="grow"><h3>${g.titulo}</h3><div class="sub">${g.desc}</div></div>
            ${g.titulo === "WhatsApp" ? `<button class="btn btn-ghost btn-sm" onclick="testarWhatsappCfg()">${icon("whatsapp")}Testar</button>` : ""}
          </div>
          <div class="cfg-campos">
            ${g.chaves.map(k => campo(map[k] || {chave:k,valor:"",descricao:k})).join("")}
          </div>
        </div>`).join("")}
    </div>
    <div class="card card-pad" style="margin-top:4px">
      <div class="meta">💡 As configurações são salvas no banco de dados e valem imediatamente — sem reiniciar o sistema. Variáveis de ambiente no Coolify servem de fallback caso uma chave não esteja salva aqui.</div>
    </div>`;

  // toggle label ao clicar
  document.querySelectorAll(".toggle input").forEach(inp => {
    inp.addEventListener("change", () => {
      const lbl = document.getElementById("cfg-lbl-" + inp.id.replace("cfg-",""));
      if (lbl) lbl.textContent = inp.checked ? "Ativado" : "Desativado";
    });
  });
}

async function salvarConfiguracoes() {
  const dados = {};
  CFG_GRUPOS.forEach(g => g.chaves.forEach(k => {
    const el = document.getElementById("cfg-" + k);
    if (!el) return;
    dados[k] = BOOL_CHAVES.has(k) ? String(el.checked) : el.value;
  }));
  try {
    await api("/api/configuracoes", { method: "POST", body: JSON.stringify(dados) });
    toast("Configurações salvas!", "ok");
  } catch(e) { toast(e.message, "err"); }
}

async function testarWhatsappCfg() {
  // salva primeiro, depois testa
  await salvarConfiguracoes();
  try {
    const r = await api("/api/configuracoes/whatsapp/testar");
    toast(r.enviado ? "Mensagem enviada no grupo!" : "Falha — verifique URL, token e grupo.", r.enviado ? "ok" : "err");
  } catch(e) { toast(e.message, "err"); }
}


/* ============================================================
   VIEW: FAMÍLIA (usuários com emoji e cor)
   ============================================================ */
const EMOJIS_FAM = ['👨', '👩', '👦', '👧', '🧑', '👴', '👵', '🤴', '👸', '🧔', '💼', '🏠', '⭐', '❤️', '🌟', '🦁', '🐯', '🦊', '🐶', '🐱', '🌈', '🎯', '🚀', '💎'];
const CORES_FAM  = ['#082D51', '#2F817A', '#C9A94E', '#B4503E', '#305C74', '#3E9079', '#38648A', '#256B64', '#5E9B86', '#7F3F98', '#E67E22', '#2ECC71'];
let FORM_EMOJI = "👤", FORM_COR = "#305C74";

async function viewUsuarios(v) {
  const us = await api("/api/usuarios");
  us.forEach(u => _CACHE.usuarios[u.id] = u);
  v.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 style="margin:0;color:var(--navy)">Família Tomelin</h2>
        <div class="sub">Membros com acesso ao sistema</div>
      </div>
      <div class="grow"></div>
      <button class="btn btn-primary" onclick="formUsuario(null)">${icon("users")}Novo membro</button>
    </div>
    <div class="familia-grid">
      ${us.map(u => `
        <div class="familia-card">
          <div class="familia-avatar" style="background:${u.cor}">
            <span style="font-size:28px">${u.emoji}</span>
          </div>
          <div class="familia-nome">${u.nome}</div>
          <div class="familia-email">${u.email}</div>
          <span class="familia-papel ${u.papel}">${u.papel === "admin" ? "Admin" : "Membro"}</span>
          <div class="familia-acesso">${u.ultimo_acesso
            ? "Último acesso: " + new Date(u.ultimo_acesso).toLocaleDateString("pt-BR")
            : "Nunca acessou"}</div>
          <div class="card-actions">
            <button class="btn btn-ghost btn-sm" onclick="_editarUsuario(${u.id})">${icon("edit")}Editar</button>
            ${u.id !== State.uid ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="excluirUsuario(${u.id})">Excluir</button>` : '<span class="meta">Você</span>'}
          </div>
        </div>`).join("")}
    </div>
    <div class="dica azul" style="margin-top:16px">
      ${icon("shield")}<div><b>Dica:</b> Cada membro tem e-mail e senha próprios. O papel <b>Admin</b> permite criar usuários e alterar configurações do sistema.</div>
    </div>`;
}

function formUsuario(u) {
  const e = u || {};
  FORM_EMOJI = e.emoji || "👤";
  FORM_COR   = e.cor   || "#305C74";
  abrirModal(`
    <div class="modal" style="max-width:520px">
      <div class="modal-h">
        <span class="card-ico i-navy">${icon("users")}</span>
        <h3>${u ? "Editar membro" : "Novo membro da família"}</h3>
        <button onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b"><div class="frm">
        <div class="campo full" style="align-items:center;justify-content:center;display:flex;flex-direction:column;gap:8px">
          <div id="fam-av-prev" class="familia-avatar" style="background:${FORM_COR};width:72px;height:72px;font-size:34px">${FORM_EMOJI}</div>
          <div class="sub">Escolha emoji e cor</div>
        </div>
        <div class="campo full">
          <label>Emoji</label>
          <div class="emoji-grid" id="emoji-grid">
            ${EMOJIS_FAM.map(em => `<div class="emoji-opt${em===FORM_EMOJI?" sel":""}" onclick="selecionarEmoji('${em}')">${em}</div>`).join("")}
          </div>
        </div>
        <div class="campo full">
          <label>Cor</label>
          <div class="cor-grid" id="cor-grid">
            ${CORES_FAM.map(c => `<div class="cor-opt${c===FORM_COR?" sel":""}" style="background:${c}" onclick="selecionarCor('${c}')"></div>`).join("")}
          </div>
        </div>
        <div class="campo"><label>Nome</label><input id="fu-nome" value="${e.nome||""}" placeholder="Nome completo"></div>
        <div class="campo"><label>E-mail</label><input id="fu-email" type="email" value="${e.email||""}"></div>
        <div class="campo"><label>Senha ${u?"(deixe em branco para manter)":""}</label><input id="fu-senha" type="password" placeholder="${u?"Nova senha (opcional)":"Senha"}"></div>
        <div class="campo">
          <label>Papel</label>
          <select id="fu-papel">
            <option value="membro" ${e.papel!=="admin"?"selected":""}>👤 Membro</option>
            <option value="admin"  ${e.papel==="admin" ?"selected":""}>👑 Admin</option>
          </select>
        </div>
        <div class="campo full">
          <label><input type="checkbox" id="fu-ativo" ${e.ativo!==false?"checked":""}> Ativo (pode fazer login)</label>
        </div>
      </div></div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarUsuario(${u?e.id:"null"})">Salvar membro</button>
      </div>
    </div>`, "lg");
}

function selecionarEmoji(em) {
  FORM_EMOJI = em;
  document.querySelectorAll(".emoji-opt").forEach(el => el.classList.toggle("sel", el.textContent.trim() === em));
  const prev = document.getElementById("fam-av-prev");
  if (prev) prev.textContent = em;
}

function selecionarCor(cor) {
  FORM_COR = cor;
  document.querySelectorAll(".cor-opt").forEach(el => el.classList.toggle("sel", el.style.background === cor || el.style.backgroundColor === cor));
  const prev = document.getElementById("fam-av-prev");
  if (prev) prev.style.background = cor;
}


async function verHistoricoLogin(uid, nome) {
  const endpoint = uid === State.uid ? "/api/auth/historico" : `/api/auth/historico/${uid}`;
  let rows;
  try { rows = await api(endpoint + "?limite=30"); }
  catch(e) { toast(e.message, "err"); return; }

  const linhas = rows.length ? rows.map(r => {
    const dt = new Date(r.data_hora);
    const data = dt.toLocaleDateString("pt-BR");
    const hora = dt.toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"});
    const agora = new Date();
    const diffMin = Math.round((agora - dt) / 60000);
    const quando = diffMin < 1 ? "agora" : diffMin < 60 ? `${diffMin}min atrás`
      : diffMin < 1440 ? `${Math.floor(diffMin/60)}h atrás`
      : `${Math.floor(diffMin/1440)}d atrás`;
    const ok = r.sucesso;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)">
      <span style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${ok ? '#2F817A18' : '#B4503E18'};flex-shrink:0">${ok ? icon("checkCircle") : icon("x")}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:600;color:var(--ink)">${r.dispositivo || "—"}</div>
        <div style="font-size:11.5px;color:var(--ink-2)">${data} às ${hora} · ${r.ip || "—"}</div>
      </div>
      <div style="font-size:11px;color:var(--ink-3);white-space:nowrap">${quando}</div>
    </div>`;
  }).join("") : `<div class="empty" style="padding:30px">${icon("clock")}<p>Nenhum login registrado.</p></div>`;

  const falhas = rows.filter(r => !r.sucesso).length;
  const aviso = falhas > 0
    ? `<div class="dica vermelho" style="margin-bottom:12px">${icon("alert")}<div><b>${falhas} tentativa(s) com senha errada</b> nos últimos acessos.</div></div>`
    : `<div class="dica verde" style="margin-bottom:12px">${icon("checkCircle")}<div>Nenhuma tentativa suspeita nos últimos logins.</div></div>`;

  abrirModal(`
    <div class="modal" style="max-width:480px">
      <div class="modal-h">
        <span class="card-ico i-navy">${icon("clock")}</span>
        <h3>Histórico de logins — ${nome}</h3>
        <button onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b">
        ${aviso}
        <div style="max-height:400px;overflow-y:auto">
          ${linhas}
        </div>
      </div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Fechar</button>
      </div>
    </div>`, "lg");
}

async function meuHistoricoLogin() {
  verHistoricoLogin(State.uid, State.nome || "Meu histórico");
}

async function salvarUsuario(id) {
  const body = {
    nome: $("#fu-nome").value.trim(),
    email: $("#fu-email").value.trim(),
    senha: $("#fu-senha").value || undefined,
    papel: $("#fu-papel").value,
    ativo: $("#fu-ativo").checked,
    emoji: FORM_EMOJI,
    cor: FORM_COR,
  };
  if (!body.nome || !body.email) return toast("Nome e e-mail obrigatórios", "err");
  try {
    if (id) await api(`/api/usuarios/${id}`, { method:"PUT", body:JSON.stringify(body) });
    else     await api("/api/usuarios",         { method:"POST", body:JSON.stringify(body) });
    fecharModal(); toast("Membro salvo!", "ok"); setView("usuarios");
  } catch(e) { toast(e.message,"err"); }
}

async function excluirUsuario(id) {
  if (!confirm("Remover este membro do sistema?")) return;
  try { await api(`/api/usuarios/${id}`, {method:"DELETE"}); toast("Removido","ok"); setView("usuarios"); }
  catch(e) { toast(e.message,"err"); }
}


/* ============================================================
   LEITOR DE NF-e / NFC-e POR QR CODE
   ============================================================ */

async function abrirLeitorNFe() {
  abrirModal(`
    <div class="modal" style="max-width:520px">
      <div class="modal-h">
        <span class="card-ico i-navy">${icon("receipt")}</span>
        <h3>Ler Nota Fiscal (NF-e / NFC-e)</h3>
        <button onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b">
        <div class="dica azul" style="margin-bottom:16px">
          ${icon("alert")}
          <div>Cole a <b>URL do QR code</b> da nota ou a <b>chave de acesso</b> (44 dígitos) impressa no cupom fiscal.</div>
        </div>

        <div class="campo full">
          <label>URL do QR code ou chave de acesso</label>
          <textarea id="nfe-url" rows="4" placeholder="https://sat.sef.sc.gov.br/nfce/consulta?p=...&#10;&#10;ou cole a chave de acesso de 44 dígitos:" style="font-family:monospace;font-size:13px;resize:vertical"></textarea>
        </div>

        <div id="nfe-preview" style="display:none"></div>
        <div id="nfe-erro" class="login-erro hidden"></div>
      </div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-gold" id="nfe-btn-consultar" onclick="consultarNFe()">
          ${icon("search")}Consultar nota
        </button>
      </div>
    </div>`, "lg");
}

async function consultarNFe() {
  const url = (document.getElementById("nfe-url")?.value || "").trim();
  if (!url) { toast("Cole a URL ou a chave de acesso da nota", "err"); return; }

  const btn = document.getElementById("nfe-btn-consultar");
  const erro = document.getElementById("nfe-erro");
  const prev = document.getElementById("nfe-preview");
  if (erro) { erro.textContent = ""; erro.classList.add("hidden"); }
  if (prev) prev.style.display = "none";
  if (btn) { btn.disabled = true; btn.innerHTML = icon("refresh") + " Consultando..."; }

  try {
    const d = await api("/api/nfe/consultar", {
      method: "POST",
      body: JSON.stringify({ url })
    });
    _renderPreviewNFe(d);
  } catch(e) {
    if (erro) { erro.textContent = e.message; erro.classList.remove("hidden"); }
    toast("Erro ao consultar NF-e", "err");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = icon("search") + " Consultar nota"; }
  }
}

let _nfeDados = null;

function _renderPreviewNFe(d) {
  _nfeDados = d;
  const prev = document.getElementById("nfe-preview");
  if (!prev) return;

  const itens = (d.itens || []);
  const itensHtml = itens.length
    ? `<div style="max-height:180px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;margin-top:8px">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="background:var(--bg);position:sticky;top:0">
            <th style="padding:8px 10px;text-align:left;color:var(--ink-2);font-weight:600">Item</th>
            <th style="padding:8px 10px;text-align:right;color:var(--ink-2);font-weight:600">Valor</th>
          </tr></thead>
          <tbody>
            ${itens.map(i => `<tr style="border-top:1px solid var(--line)">
              <td style="padding:7px 10px;color:var(--ink)">${i.descricao}</td>
              <td style="padding:7px 10px;text-align:right;color:var(--ink);font-family:monospace">${money(i.valor)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
       </div>`
    : `<div class="dica ouro" style="margin-top:8px">${icon("alert")} <span>O portal não retornou a lista de itens — apenas o valor total está disponível.</span></div>`;

  prev.style.display = "block";
  prev.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span class="card-ico i-green" style="width:36px;height:36px">${icon("checkCircle")}</span>
        <div>
          <div style="font-weight:700;font-size:15px;color:var(--ink)">${d.emitente || "Emitente não identificado"}</div>
          <div style="font-size:12px;color:var(--ink-2)">${d.cnpj_emitente || ""} ${d.uf ? "· " + d.uf : ""}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:22px;font-weight:800;color:var(--navy);font-family:monospace">${money(d.valor_total || 0)}</div>
          <div style="font-size:11px;color:var(--ink-2)">${d.data_emissao ? "Emissão: " + dataBR(d.data_emissao) : ""}${d.numero_nota ? " · NF " + d.numero_nota : ""}</div>
        </div>
      </div>

      ${d.categoria_sugerida ? `<div style="margin-bottom:8px"><span style="font-size:12px;color:var(--ink-2)">Categoria sugerida: </span><span class="tag" style="background:${d.categoria_sugerida.cor}20;color:${d.categoria_sugerida.cor};border:1px solid ${d.categoria_sugerida.cor}44">${d.categoria_sugerida.nome}</span></div>` : ""}

      <div style="font-size:12.5px;color:var(--ink-2);margin-bottom:6px">${itens.length ? itens.length + " itens encontrados:" : ""}</div>
      ${itensHtml}
    </div>

    <div class="dica verde" style="margin-bottom:0">
      ${icon("checkCircle")}
      <div>Tudo certo! Clique em <b>Cadastrar lançamento</b> para criar a despesa com esses dados.</div>
    </div>`;

  // Troca botões
  const footer = prev.closest(".modal")?.querySelector(".modal-f");
  if (footer) {
    footer.innerHTML = `
      <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-gold" onclick="consultarNFe()">${icon("refresh")}Nova consulta</button>
      <button class="btn btn-primary" onclick="cadastrarDaNFe()">${icon("check")}Cadastrar lançamento</button>`;
  }
}

async function cadastrarDaNFe() {
  if (!_nfeDados) return;
  fecharModal();
  abrirFormCompra(null, _nfeDados);
}

/* ============================================================
   FORM DE COMPRA — itens da nota + parcelamento no cartão
   ============================================================ */
let COMPRA_ITENS = [];
let COMPRA_PARCELADO = false;

function abrirFormCompra(lancamentoExistente, nfeDados) {
  const d = nfeDados || {};
  COMPRA_ITENS = (d.itens || []).map(i => ({
    descricao: i.descricao, quantidade: 1,
    valor_unitario: i.valor, valor_total: i.valor,
  }));
  COMPRA_PARCELADO = false;

  const cartoes = State.contas.filter(c => c.tipo === "cartao");
  const valorTotal = d.valor_total || 0;
  const dataRef = d.data_emissao || hojeISO();

  abrirModal(`
    <div class="modal" style="max-width:640px">
      <div class="modal-h">
        <span class="card-ico i-navy">${icon("receipt")}</span>
        <h3>${d.emitente || "Cadastrar compra"}</h3>
        <button onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b"><div class="frm">
        <div class="campo full"><label>Descrição</label>
          <input id="fc-desc" value="${d.descricao_sugerida || d.emitente || ''}" placeholder="Descrição do lançamento"></div>
        <div class="campo"><label>Valor total (R$)</label>
          <input id="fc-valor" type="number" step="0.01" value="${valorTotal}" oninput="_recalcularParcelas()"></div>
        <div class="campo"><label>Categoria</label>
          <select id="fc-cat"><option value="">—</option>${State.cats.filter(c => c.tipo === 'despesa').map(c =>
            `<option value="${c.id}" ${d.categoria_sugerida?.id === c.id ? 'selected' : ''}>${c.nome}</option>`).join("")}</select></div>
        <div class="campo"><label>Data da compra</label>
          <input id="fc-data" type="date" value="${dataRef}"></div>
        <div class="campo"><label>Estabelecimento</label>
          <input id="fc-estab" value="${d.emitente || ''}" placeholder="Nome da loja"></div>
        <div class="campo full"><label>Como foi pago?</label>
          <select id="fc-forma" onchange="_toggleParcelamento()">
            <option value="avista">À vista (débito, pix, dinheiro)</option>
            <option value="cartao">Cartão de crédito parcelado</option>
          </select></div>

        <div id="fc-parcel-box" class="campo full hidden" style="background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:14px">
          <div class="frm" style="grid-template-columns:1fr 1fr">
            <div class="campo"><label>Cartão usado</label>
              <select id="fc-cartao">
                ${cartoes.length ? cartoes.map(c => `<option value="${c.id}">${c.nome}</option>`).join("")
                  : `<option value="">Nenhum cartão cadastrado</option>`}
              </select></div>
            <div class="campo"><label>Nº de parcelas</label>
              <input id="fc-parcelas" type="number" min="1" max="48" value="1" oninput="_recalcularParcelas()"></div>
            <div class="campo"><label>1ª parcela vence em</label>
              <input id="fc-1parc" type="date" value="${_add30dias(dataRef)}" oninput="_recalcularParcelas()"></div>
            <div class="campo"><label>Valor de cada parcela</label>
              <div id="fc-valor-parcela" class="mono-num" style="padding-top:8px;font-weight:700;color:var(--navy)">—</div></div>
          </div>
          ${cartoes.length === 0 ? `<div class="dica ouro" style="margin-top:8px">${icon("alert")}<div>Cadastre um cartão em <b>Contas</b> (tipo "cartão") antes de usar o parcelamento.</div></div>` : ""}
        </div>

        <div class="campo full">
          <label>Itens da compra ${COMPRA_ITENS.length ? `(${COMPRA_ITENS.length})` : ''}</label>
          <div id="fc-itens-wrap">${_renderItensCompra()}</div>
          <button type="button" class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="_addItemCompra()">${icon("plus")}Adicionar item</button>
        </div>
      </div></div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarCompra()">${icon("check")}Salvar compra</button>
      </div>
    </div>`, "lg");
}

function _add30dias(dataISO) {
  const d = dataISO ? new Date(dataISO + "T12:00:00") : new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function _toggleParcelamento() {
  const forma = document.getElementById("fc-forma").value;
  COMPRA_PARCELADO = forma === "cartao";
  document.getElementById("fc-parcel-box").classList.toggle("hidden", !COMPRA_PARCELADO);
  if (COMPRA_PARCELADO) _recalcularParcelas();
}

function _recalcularParcelas() {
  if (!COMPRA_PARCELADO) return;
  const valor = parseFloat(document.getElementById("fc-valor")?.value || "0");
  const n = Math.max(1, parseInt(document.getElementById("fc-parcelas")?.value || "1"));
  const el = document.getElementById("fc-valor-parcela");
  if (el) el.textContent = n > 0 ? `${n}x de ${money(valor / n)}` : "—";
}

function _renderItensCompra() {
  if (!COMPRA_ITENS.length) {
    return `<div class="empty" style="padding:16px">${icon("receipt")}<p>Nenhum item — adicione manualmente ou volte e leia o QR code da nota.</p></div>`;
  }
  return `<div style="border:1px solid var(--line);border-radius:8px;overflow:hidden">
    <table style="width:100%;border-collapse:collapse;font-size:12.5px">
      <thead><tr style="background:var(--bg)">
        <th style="padding:6px 8px;text-align:left;color:var(--ink-2)">Item</th>
        <th style="padding:6px 8px;text-align:right;color:var(--ink-2);width:70px">Qtd</th>
        <th style="padding:6px 8px;text-align:right;color:var(--ink-2);width:100px">Valor</th>
        <th style="width:32px"></th>
      </tr></thead>
      <tbody>
        ${COMPRA_ITENS.map((it, idx) => `<tr style="border-top:1px solid var(--line)">
          <td style="padding:4px 6px"><input value="${it.descricao}" oninput="_editarItem(${idx},'descricao',this.value)" style="width:100%;border:none;background:transparent;font-size:12.5px;padding:4px"></td>
          <td style="padding:4px 6px"><input type="number" step="0.01" value="${it.quantidade}" oninput="_editarItem(${idx},'quantidade',this.value)" style="width:100%;border:none;background:transparent;font-size:12.5px;text-align:right;padding:4px"></td>
          <td style="padding:4px 6px"><input type="number" step="0.01" value="${it.valor_total}" oninput="_editarItem(${idx},'valor_total',this.value)" style="width:100%;border:none;background:transparent;font-size:12.5px;text-align:right;padding:4px;font-family:monospace"></td>
          <td><button class="btn-icon" style="padding:4px" onclick="_removerItem(${idx})">${icon("trash")}</button></td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>`;
}

function _editarItem(idx, campo, valor) {
  if (!COMPRA_ITENS[idx]) return;
  COMPRA_ITENS[idx][campo] = campo === "descricao" ? valor : parseFloat(valor || "0");
}

function _addItemCompra() {
  COMPRA_ITENS.push({ descricao: "", quantidade: 1, valor_unitario: 0, valor_total: 0 });
  document.getElementById("fc-itens-wrap").innerHTML = _renderItensCompra();
}

function _removerItem(idx) {
  COMPRA_ITENS.splice(idx, 1);
  document.getElementById("fc-itens-wrap").innerHTML = _renderItensCompra();
}

async function salvarCompra() {
  const descricao = $("#fc-desc").value.trim();
  const valor = parseFloat($("#fc-valor").value || "0");
  if (!descricao || !valor) { toast("Preencha descrição e valor.", "err"); return; }

  const dataCompra = $("#fc-data").value || hojeISO();
  const forma = $("#fc-forma").value;
  const parcelado = forma === "cartao";

  const bodyLanc = {
    descricao, tipo: "despesa", valor,
    categoria_id: +$("#fc-cat").value || null,
    data_vencimento: dataCompra, data_competencia: dataCompra,
    data_pagamento: parcelado ? null : dataCompra,  // parcelado só "paga" conforme as parcelas
    obs: $("#fc-estab").value ? `Compra em ${$("#fc-estab").value}` : null,
  };

  try {
    const lanc = await api("/api/lancamentos", { method: "POST", body: JSON.stringify(bodyLanc) });

    const bodyCompra = {
      lancamento_id: lanc.id,
      estabelecimento: $("#fc-estab").value || null,
      cnpj_emitente: _nfeDados?.cnpj_emitente || null,
      numero_nota: _nfeDados?.numero_nota || null,
      chave_acesso: _nfeDados?.chave || null,
      data_emissao: dataCompra,
      uf: _nfeDados?.uf || null,
      itens: COMPRA_ITENS.filter(i => i.descricao && i.valor_total).map(i => ({
        descricao: i.descricao, quantidade: i.quantidade || 1,
        valor_unitario: i.valor_unitario || (i.valor_total / (i.quantidade || 1)),
        valor_total: i.valor_total,
      })),
    };

    if (parcelado) {
      const cartaoId = +$("#fc-cartao")?.value;
      if (!cartaoId) { toast("Selecione um cartão para o parcelamento.", "err"); return; }
      bodyCompra.parcelamento = {
        cartao_id: cartaoId,
        total_parcelas: parseInt($("#fc-parcelas").value || "1"),
        primeira_parcela_data: $("#fc-1parc").value || _add30dias(dataCompra),
      };
    }

    await api("/api/compras", { method: "POST", body: JSON.stringify(bodyCompra) });

    fecharModal();
    toast("Compra cadastrada com sucesso!", "ok");
    await recarregarTabela(); atualizarBadge();
  } catch (e) {
    toast(e.message, "err");
  }
}


/* ============================================================
   VIEW: COMPRAS E CARTÕES — itens comprados + controle de parcelas
   ============================================================ */
async function viewCompras(v) {
  const [compras, parcelasPend] = await Promise.all([
    api("/api/compras"),
    api("/api/compras/resumo/parcelas-pendentes"),
  ]);

  const totalParcelasPend = parcelasPend.length;
  const somaParcelasPend = parcelasPend.reduce((s, p) => s + p.valor, 0);
  const atrasadas = parcelasPend.filter(p => p.status === "atrasada");

  v.innerHTML = `
    <div class="toolbar">
      <div><h2 style="margin:0;color:var(--navy)">Compras e cartões</h2>
        <div class="sub">Itens comprados e controle de parcelamento</div></div>
      <div class="grow"></div>
      <button class="btn btn-ghost" onclick="verParcelasPendentes()">${icon("clock")}Parcelas pendentes${totalParcelasPend ? ` (${totalParcelasPend})` : ''}</button>
    </div>

    ${atrasadas.length ? `<div class="dica vermelho" style="margin-bottom:14px">${icon("alert")}<div><b>${atrasadas.length} parcela(s) atrasada(s)</b> — total de ${money(atrasadas.reduce((s,p)=>s+p.valor,0))}.</div></div>` : ""}

    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi navy"><div class="lab"><span class="i i-navy">${icon("receipt")}</span>Compras registradas</div><div class="val mono-num">${compras.length}</div><div class="meta">com itens detalhados</div></div>
      <div class="kpi gold"><div class="lab"><span class="i i-gold">${icon("wallet")}</span>Parcelas em aberto</div><div class="val mono-num">${totalParcelasPend}</div><div class="meta">${money(somaParcelasPend)}</div></div>
    </div>

    ${compras.length === 0 ? `
      <div class="empty" style="padding:50px 20px">
        ${icon("receipt")}
        <p>Nenhuma compra detalhada ainda.</p>
        <div class="sub">Use "Ler Nota Fiscal" em Lançamentos para cadastrar compras com itens e parcelamento.</div>
      </div>` : compras.map(c => _cardCompra(c)).join("")}
  `;
}

function _cardCompra(c) {
  const pm = c.parcelamento;
  const progresso = pm ? Math.round((pm.parcelas_pagas / pm.total_parcelas) * 100) : 0;
  return `
    <div class="card card-pad" style="margin-bottom:14px">
      <div style="display:flex;align-items:flex-start;gap:12px;cursor:pointer" onclick="_toggleItensCompra(${c.id})">
        <span class="card-ico i-navy">${icon("receipt")}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--ink)">${c.estabelecimento || "Compra #" + c.id}</div>
          <div class="sub">${c.numero_nota ? "NF " + c.numero_nota + " · " : ""}${c.data_emissao ? dataBR(c.data_emissao) : ""} ${c.uf ? "· " + c.uf : ""}</div>
        </div>
        <div style="text-align:right">
          <div class="mono-num" style="font-weight:700;color:var(--navy)">${money(c.valor_itens)}</div>
          <div class="sub">${c.total_itens} ${c.total_itens === 1 ? 'item' : 'itens'}</div>
        </div>
      </div>

      ${pm ? `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span class="sub">${icon("wallet")} ${pm.cartao_nome || "Cartão"} · ${pm.total_parcelas}x de ${money(pm.valor_parcela)}</span>
            <span class="sub"><b>${pm.parcelas_pagas}/${pm.total_parcelas}</b> pagas</span>
          </div>
          <div style="background:var(--bg);border-radius:8px;height:8px;overflow:hidden">
            <div style="background:var(--green,#2F817A);height:100%;width:${progresso}%;transition:width .3s"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:4px">
            <span class="sub">Pago: ${money(pm.valor_pago)}</span>
            <span class="sub">Falta: ${money(pm.valor_restante)}</span>
          </div>
        </div>` : ''}

      <div id="itens-compra-${c.id}" class="hidden" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tbody>
            ${c.itens.map(i => `<tr style="border-bottom:1px solid var(--line)">
              <td style="padding:6px 4px;color:var(--ink)">${i.descricao}</td>
              <td style="padding:6px 4px;text-align:center;color:var(--ink-2);width:60px">${i.quantidade > 1 ? i.quantidade + 'x' : ''}</td>
              <td style="padding:6px 4px;text-align:right;color:var(--ink);font-family:monospace">${money(i.valor_total)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
        ${pm ? `<button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="verParcelasCompra(${c.id})">${icon("clock")}Ver parcelas</button>` : ''}
      </div>
    </div>`;
}

function _toggleItensCompra(cid) {
  const el = document.getElementById(`itens-compra-${cid}`);
  if (el) el.classList.toggle("hidden");
}

async function verCompra(cid) {
  const c = await api(`/api/compras/${cid}`);
  abrirModal(`
    <div class="modal" style="max-width:520px">
      <div class="modal-h"><span class="card-ico i-navy">${icon("receipt")}</span>
        <h3>${c.estabelecimento || "Compra #" + c.id}</h3>
        <button onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b">${_cardCompra(c)}</div>
      <div class="modal-f"><button class="btn btn-ghost" onclick="fecharModal()">Fechar</button></div>
    </div>`, "lg");
}

async function verParcelasCompra(cid) {
  const c = await api(`/api/compras/${cid}`);
  const pm = c.parcelamento;
  if (!pm) return;
  abrirModal(`
    <div class="modal" style="max-width:480px">
      <div class="modal-h"><span class="card-ico i-gold">${icon("wallet")}</span>
        <h3>Parcelas — ${c.estabelecimento || 'Compra'}</h3>
        <button onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b">
        <div class="sub" style="margin-bottom:10px">${pm.cartao_nome} · ${pm.total_parcelas}x de ${money(pm.valor_parcela)}</div>
        ${pm.parcelas.map(p => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)">
            <span style="width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;
              background:${p.paga ? '#2F817A18' : p.status === 'atrasada' ? '#B4503E18' : 'var(--bg)'};
              color:${p.paga ? '#2F817A' : p.status === 'atrasada' ? '#B4503E' : 'var(--ink-2)'}">${p.numero}</span>
            <div style="flex:1">
              <div style="font-size:13px;color:var(--ink)">${money(p.valor)}</div>
              <div class="sub">${dataBR(p.data_vencimento)} ${p.paga ? '· pago em ' + dataBR(p.data_pagamento) : ''}</div>
            </div>
            <span class="tag ${p.paga ? 'pago' : p.status === 'atrasada' ? 'atrasado' : 'pendente'}">${p.paga ? 'Paga' : p.status === 'atrasada' ? 'Atrasada' : 'Pendente'}</span>
            ${!p.paga ? `<button class="btn-icon" title="Marcar como paga" onclick="pagarParcela(${p.id}, ${cid})">${icon("check")}</button>`
                      : `<button class="btn-icon" title="Estornar" onclick="estornarParcela(${p.id}, ${cid})">${icon("refresh")}</button>`}
          </div>`).join("")}
      </div>
      <div class="modal-f"><button class="btn btn-ghost" onclick="fecharModal()">Fechar</button></div>
    </div>`, "lg");
}

async function pagarParcela(pid, cid) {
  try {
    await api(`/api/compras/parcelas/${pid}/pagar`, { method: "POST" });
    toast("Parcela paga!", "ok");
    fecharModal();
    if (cid) verParcelasCompra(cid);
    if (State.view === "compras") setView("compras");
  } catch (e) { toast(e.message, "err"); }
}

async function estornarParcela(pid, cid) {
  try {
    await api(`/api/compras/parcelas/${pid}/estornar`, { method: "POST" });
    toast("Parcela estornada", "ok");
    if (cid) verParcelasCompra(cid);
    if (State.view === "compras") setView("compras");
  } catch (e) { toast(e.message, "err"); }
}

async function verParcelasPendentes() {
  const parcelas = await api("/api/compras/resumo/parcelas-pendentes");
  abrirModal(`
    <div class="modal" style="max-width:520px">
      <div class="modal-h"><span class="card-ico i-gold">${icon("clock")}</span>
        <h3>Parcelas pendentes</h3>
        <button onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b">
        ${parcelas.length === 0 ? `<div class="empty" style="padding:30px">${icon("checkCircle")}<p>Nenhuma parcela pendente!</p></div>` :
          parcelas.map(p => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)">
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600;color:var(--ink)">${p.estabelecimento || 'Compra'} — parcela ${p.numero}/${p.total_parcelas}</div>
                <div class="sub">${p.cartao_nome} · vence ${dataBR(p.data_vencimento)}</div>
              </div>
              <div style="text-align:right">
                <div class="mono-num" style="font-weight:700">${money(p.valor)}</div>
                <span class="tag ${p.status === 'atrasada' ? 'atrasado' : 'pendente'}" style="font-size:10px">${p.status === 'atrasada' ? 'Atrasada' : 'Pendente'}</span>
              </div>
              <button class="btn-icon" title="Marcar como paga" onclick="pagarParcela(${p.id}, ${p.compra_id})">${icon("check")}</button>
            </div>`).join("")}
      </div>
      <div class="modal-f"><button class="btn btn-ghost" onclick="fecharModal()">Fechar</button></div>
    </div>`, "lg");
}

async function verComprasView() { setView("compras"); }

async function render() {
  aplicarTema(temaAtual());
  if (!State.token) { renderLogin(); return; }
  renderApp();
  marcarNav();
  try {
    await setView(State.view || "dashboard");
    atualizarBadge();
  } catch (e) {
    if (String(e.message).includes("401")) return;
    toast("Falha ao carregar: " + e.message, "err");
  }
}

// expõe funções usadas por onclick inline
Object.assign(window, {
  setView, fazerLogin, logout, toggleSidebar, fecharModal, abrirModal,
  filtroStatus, filtroCat, debBusca, exportarCSV,
  formBaixaId, formLancamentoId,
  _editarConta, _editarCategoria, _editarContato, _editarVeiculo, _editarUsuario,
  formLancamento, salvarLanc, formBaixa, confirmarBaixa, estornar, excluirLanc,
  formConta, salvarConta, excluirConta,
  formCategoria, salvarCategoria, excluirCategoria,
  formContato, salvarContato, excluirContato, filtroContato, renderContatos,
  testarWhatsapp, State,
  toggleTema, temaAtual, aplicarTema,
  toggleSenha,
  abrirPDF, reciboWhats,
  formVeiculo, salvarVeiculo, excluirVeiculo, atualizarFipe,
  addExtra, renderExtras, toggleTipoValor, toggleFin, aplicarPeriodo,
  salvarConfiguracoes, testarWhatsappCfg,
  formUsuario, salvarUsuario, excluirUsuario, selecionarEmoji, selecionarCor,
  verHistoricoLogin, meuHistoricoLogin,
  abrirLeitorNFe, consultarNFe, cadastrarDaNFe,
  abrirFormCompra, salvarCompra, _toggleParcelamento, _recalcularParcelas,
  _addItemCompra, _removerItem, _editarItem,
  verCompra, verComprasView, verParcelasPendentes, pagarParcela, estornarParcela,
  initLogo, escolherLogo, logoURLInput, limparLogo,
});

render();
