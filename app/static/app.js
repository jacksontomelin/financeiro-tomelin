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
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 16 4-4 4 4 4-5"/>',
  map: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/>',
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
      <button class="btn-icon" title="Remover logo" onclick="limparLogo()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
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
  const ua = _ultimoAcesso();
  root().innerHTML = `
    <div class="login-app">
      <!-- topo: logo grande centralizada -->
      <div class="login-app-top">
        <div class="login-app-logo-wrap">
          <img src="/static/icons/logo-mark.png" class="login-app-logo-img" alt="Tomelin">
        </div>
        <div class="login-app-brand">Tomelin</div>
        <div class="login-app-sub">Gestão Financeira da Família</div>
      </div>

      <!-- card do formulário -->
      <div class="login-app-card">
        <h2 class="login-app-titulo">Acesse sua conta</h2>

        ${ua ? `<div class="lf-ultimo-acesso">${icon("clock")} ${ua}</div>` : ""}

        <form onsubmit="fazerLogin(event)" autocomplete="on" style="display:flex;flex-direction:column;gap:14px">
          <div class="login-campo">
            <label class="login-label">E-mail</label>
            <div class="login-input-wrap">
              <span class="login-input-ic">${icon("user")}</span>
              <input id="l-email" type="email" autocomplete="username"
                placeholder="seu@email.com.br" required class="login-input">
            </div>
          </div>
          <div class="login-campo">
            <label class="login-label">Senha</label>
            <div class="login-input-wrap">
              <span class="login-input-ic">${icon("lock")}</span>
              <input id="l-senha" type="password" autocomplete="current-password"
                placeholder="••••••••" required class="login-input" style="padding-right:44px">
              <button type="button" class="btn-ver-senha" onclick="toggleSenha()">${icon("eye")}</button>
            </div>
          </div>
          <div id="l-erro" class="login-erro hidden"></div>
          <button id="l-btn" type="submit" class="btn btn-primary btn-login">
            ${icon("send")}<span id="l-btn-txt">Entrar</span>
          </button>
        </form>
      </div>

      <!-- rodapé -->
      <div class="login-app-footer">
        <span id="sb-version-login" style="font-size:11px;opacity:.5">v2.0</span>
      </div>
    </div>`;

  // busca versão
  fetch("/api/health").then(r=>r.json()).then(d=>{
    const el = document.getElementById("sb-version-login");
    if (el && d.version) el.textContent = "v" + d.version + " · " + d.build;
  }).catch(()=>{});

  _statusLogin();
}

/* ============================================================
   APP SHELL
   ============================================================ */
const NAV = [
  { sec: "Painel" },
  { id: "dashboard",    nome: "Visão geral",          ic: "grid",      sub: "Resumo do mês",                        badge: false },
  { id: "vencimentos",  nome: "Vencimentos",           ic: "clock",     sub: "Contas atrasadas e a vencer",          badge: true  },
  { id: "relatorios",   nome: "Relatórios",            ic: "pie",       sub: "Balancete, patrimônio e projeções",    badge: false },
  { sec: "Movimentação" },
  { id: "receber",      nome: "Contas a receber",      ic: "arrowDown", sub: "Receitas previstas e realizadas",      badge: false },
  { id: "pagar",        nome: "Contas a pagar",        ic: "arrowUp",   sub: "Despesas previstas e realizadas",      badge: false },
  { id: "lancamentos",  nome: "Extrato completo",      ic: "terminal",  sub: "Histórico completo de movimentações",  badge: false },
  { id: "compras",      nome: "Compras e cartões",     ic: "receipt",   sub: "Parcelamentos e cartões",              badge: false },
  { id: "metas",        nome: "Metas financeiras",     ic: "star",      sub: "Objetivos e reservas",                 badge: false },
  { sec: "Patrimônio" },
  { id: "veiculos",     nome: "Veículos",              ic: "car",       sub: "Carros e financiamentos",              badge: false },
  { id: "contas",       nome: "Contas e carteiras",    ic: "bank",      sub: "Saldos por conta bancária",            badge: false },
  { sec: "Cadastros" },
  { id: "categorias",   nome: "Categorias",            ic: "tag",       sub: "Classificação de movimentações",       badge: false },
  { id: "contatos",     nome: "Contatos",              ic: "users",     sub: "Clientes e fornecedores",              badge: false },
  { sec: "Sistema" },
  { id: "usuarios",     nome: "Família",               ic: "user",      sub: "Membros e permissões",                 badge: false },
  { id: "configuracoes",nome: "Configurações",         ic: "cog",       sub: "Alertas, FIPE, PDFs",                  badge: false },
  { id: "whatsapp",     nome: "WhatsApp",              ic: "whatsapp",  sub: "Alertas e comandos no grupo",          badge: false },
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
        <div>
          <div class="t">Tomelin</div>
          <div class="s">Gestão Financeira</div>
          <div id="sb-version" style="font-size:10px;opacity:.4;margin-top:2px;font-weight:600;letter-spacing:.06em">v2.100.0 · 93d8252 · 30/09/2026</div>
        </div>
      </div>
      <nav class="sb-nav">
        ${NAV.map(n => n.sec
          ? `<div class="sb-sec">${n.sec}</div>`
          : `<a class="nav-item" data-id="${n.id}" data-nome="${n.nome}" onclick="setView('${n.id}')" title="${n.nome}">
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
        <div class="busca-global-wrap hide-mob">
          <span class="busca-ic">${icon("search")}</span>
          <input class="busca-input" id="busca-input" placeholder="Buscar lançamentos..."
            oninput="buscaGlobal(this.value)"
            onblur="setTimeout(fecharBusca,200)">
          <div class="busca-box" id="busca-box"></div>
        </div>
        <button class="btn-icon show-mob" title="Buscar" onclick="abrirBuscaMobile()">${icon("search")}</button>
        <div class="hide-mob" style="min-width:0">
          <div id="tb-title" style="font-size:13px;font-weight:600;color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px"></div>
        </div>
        <div class="grow"></div>
        <button class="btn-icon hide-mob" title="Tour do sistema" onclick="iniciarTour()" style="background:linear-gradient(135deg,#C9A94E,#B8963B);border:none;color:#fff">${icon("alert")}</button>
        <button class="btn-icon" title="Tema claro/escuro" onclick="toggleTema()">${icon(temaAtual() === "dark" ? "sun" : "moon")}</button>
        <button class="btn-icon" title="Atualizar" onclick="setView(State.view)">${icon("refresh")}</button>
      </header>
      <main class="content" id="view"></main>
    </div>
  </div>
  <!-- Bottom Tab Bar (mobile only) -->
  <nav class="btab" id="btab">
    <button class="btab-item" data-tab="dashboard"  onclick="setView('dashboard')">
      ${icon("home")}<span>Início</span>
    </button>
    <button class="btab-item" data-tab="vencimentos" onclick="setView('vencimentos')">
      ${icon("clock")}<span>Vencer</span>
      <span class="btab-badge hidden" id="btab-badge"></span>
    </button>
    <button class="btab-fab" onclick="abrirFabMenu()">
      <div class="btab-fab-inner">${icon("plus")}</div>
      <span style="color:var(--ink-3)">Novo</span>
    </button>
    <button class="btab-item" data-tab="lancamentos" onclick="setView('lancamentos')">
      ${icon("wallet")}<span>Extrato</span>
    </button>
    <button class="btab-item" data-tab="mais" onclick="abrirMenuMais()">
      ${icon("grid")}<span>Mais</span>
    </button>
  </nav>`;
}

function toggleSidebar(open) {
  State.sidebarOpen = open;
  $("#sb")?.classList.toggle("open", open);
  $("#bd")?.classList.toggle("show", open);
}

function marcarNav() {
  document.querySelectorAll(".nav-item").forEach(a => {
    a.classList.toggle("on", a.dataset.id === State.view ||
      (["pagar","receber"].includes(State.view) && a.dataset.id === State.view));
  });

  // Sincroniza bottom tab bar
  const tabMap = { pagar:"lancamentos", receber:"lancamentos",
    compras:"lancamentos", metas:"mais", relatorios:"mais",
    configuracoes:"mais", usuarios:"mais", veiculos:"mais",
    contas:"mais", categorias:"mais", contatos:"mais", whatsapp:"mais" };
  const tabAtivo = tabMap[State.view] || State.view;
  document.querySelectorAll(".btab-item[data-tab]").forEach(b => {
    b.classList.toggle("on", b.dataset.tab === tabAtivo);
  });
  document.querySelectorAll(".btab-item[data-tab='mais']").forEach(b => {
    b.classList.toggle("on", tabAtivo === "mais");
  });

  const m = META[State.view] || {};
  try { const tt = $("#tb-title"); if (tt) tt.textContent = m.nome || ""; } catch {}
  try { const ts = $("#tb-sub"); if (ts) ts.textContent = m.sub || ""; } catch {}
}

/* FAB (+) — abre mini-menu de novo lançamento */
function _atalhoClick(btn) {
  const a = btn.dataset.acao;
  if (a === "despesa") formLancamento(null,"despesa");
  else if (a === "receita") formLancamento(null,"receita");
  else if (a === "nfe") abrirLeitorNFe();
  else setView(a);
}

function abrirFabMenu() {
  abrirModal(`
    <div class="modal" style="max-width:340px">
      <div class="modal-h">
        <span class="card-ico i-navy">${icon("plus")}</span>
        <h3>Novo lançamento</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b" style="padding:12px 16px">
        <div style="display:flex;flex-direction:column;gap:10px">
          <button class="btn btn-green btn-full btn-lg" onclick="fecharModal();formLancamento(null,'receita')">
            ${icon("arrowDown")} <span>Registrar recebimento</span>
          </button>
          <button class="btn btn-primary btn-full btn-lg" onclick="fecharModal();formLancamento(null,'despesa')">
            ${icon("arrowUp")} <span>Registrar pagamento</span>
          </button>
          <button class="btn btn-gold btn-full btn-lg" onclick="fecharModal();abrirLeitorNFe()">
            ${icon("receipt")} <span>Ler nota fiscal</span>
          </button>
          <button class="btn btn-ghost btn-full" onclick="fecharModal();setView('compras');setTimeout(()=>abrirFormCompra(null,null),100)">
            ${icon("wallet")} <span>Registrar compra</span>
          </button>
        </div>
      </div>
    </div>`);
}

/* Menu "Mais" — todas as outras seções */
function abrirMenuMais() {
  const MAIS_ITENS = [
    { id:"relatorios",    ic:"chart",    nome:"Relatórios",         cor:"i-navy" },
    { id:"metas",         ic:"star",     nome:"Metas financeiras",  cor:"i-gold" },
    { id:"compras",       ic:"receipt",  nome:"Compras e cartões",  cor:"i-navy" },
    { id:"veiculos",      ic:"car",      nome:"Veículos",           cor:"i-green" },
    { id:"contas",        ic:"wallet",   nome:"Contas e carteiras", cor:"i-navy" },
    { id:"categorias",    ic:"tag",      nome:"Categorias",         cor:"i-gold" },
    { id:"contatos",      ic:"users",    nome:"Contatos",           cor:"i-green" },
    { id:"usuarios",      ic:"user",     nome:"Família",            cor:"i-navy" },
    { id:"whatsapp",      ic:"whatsapp", nome:"WhatsApp",           cor:"i-green" },
    { id:"configuracoes", ic:"cog",      nome:"Configurações",      cor:"i-navy" },
  ];
  abrirModal(`
    <div class="modal" style="max-width:380px">
      <div class="modal-h">
        <span class="card-ico i-navy">${icon("grid")}</span>
        <h3>Menu completo</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b" style="padding:12px 16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${MAIS_ITENS.map(it => `
            <button onclick="fecharModal();setView('${it.id}')"
              style="display:flex;align-items:center;gap:10px;padding:12px 14px;
                     border-radius:12px;border:1.5px solid var(--line);
                     background:var(--bg);cursor:pointer;text-align:left;
                     transition:all .15s;font-size:13px;font-weight:600;color:var(--ink)"
              onmouseover="this.style.borderColor='var(--navy)';this.style.background='var(--card)'"
              onmouseout="this.style.borderColor='var(--line)';this.style.background='var(--bg)'">
              <span class="card-ico ${it.cor}" style="width:32px;height:32px;border-radius:9px">${icon(it.ic)}</span>
              ${it.nome}
            </button>`).join("")}
        </div>
      </div>
    </div>`);
}

async function setView(id) {
  State.view = id;
  toggleSidebar(false);
  marcarNav();
  const v = $("#view");
  if (!v) return;
  v.innerHTML = `<div class="empty" style="padding:80px">${icon("refresh", "spin")}<p>Carregando...</p></div>`;
  try {
    if (id === "dashboard") await viewDashboard(v);
    else if (id === "vencimentos") await viewVencimentos(v);
    else if (id === "pagar") await viewLancamentos(v, "despesa");
    else if (id === "receber") await viewLancamentos(v, "receita");
    else if (id === "lancamentos") await viewLancamentos(v, null);
    else if (id === "compras") await viewCompras(v);
    else if (id === "metas") await viewMetas(v);
    else if (id === "contas") await viewContas(v);
    else if (id === "categorias") await viewCategorias(v);
    else if (id === "contatos") await viewContatos(v);
    else if (id === "veiculos") await viewVeiculos(v);
    else if (id === "relatorios") await viewRelatorios(v);
    else if (id === "whatsapp") { await viewWhatsapp(v); rodarDiagnosticoWA(); }
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
    // Sincroniza com bottom tab badge
    const btabBadge = $("#btab-badge");
    if (btabBadge) { btabBadge.textContent = VENC_BADGE; btabBadge.classList.toggle("hidden", VENC_BADGE === 0); }
  } catch {}
}

/* ============================================================
   GRÁFICOS SVG (desenhados à mão, sem libs)
   ============================================================ */
function barChart(dados) {
  const W = 660, H = 280, pad = { t: 20, r: 12, b: 34, l: 62 };
  // rótulo compacto do eixo Y: 800 · 12 mil · 1,2 mi (não corta no celular)
  const eixo = (n) => n >= 1e6 ? (n/1e6).toLocaleString("pt-BR",{maximumFractionDigits:1}) + " mi"
                    : n >= 1e3 ? (n/1e3).toLocaleString("pt-BR",{maximumFractionDigits:1}) + " mil"
                    : String(Math.round(n));
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
             <text x="${pad.l - 8}" y="${yy + 4}" text-anchor="end" font-size="15" fill="${CINK.axis}">${eixo(i)}</text>`;
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
      <text x="${cx}" y="${H - 12}" text-anchor="middle" font-size="15" fill="${CINK.label}" font-weight="600">${d.label}</text>`;
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
   VIEW: DASHBOARD — layout premium
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

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const nome = State.nome ? State.nome.split(" ")[0] : "Jackson";
  const saldoPos = k.saldo >= 0;
  const resultado = k.receitas_mes - k.despesas_mes;
  const resPos = resultado >= 0;

  // mini spark line (últimos 6 meses de saldo) para o hero card
  const saldos = fluxo.map(m => m.receitas - m.despesas);
  const sMax = Math.max(...saldos, 1), sMin = Math.min(...saldos, 0);
  const sy = (v) => 28 - ((v - sMin) / ((sMax - sMin) || 1)) * 26;
  const sparkPts = saldos.map((s, i) => `${i * (60 / Math.max(saldos.length - 1, 1))},${sy(s).toFixed(1)}`).join(" ");

  // lista de vencimentos compacta (estilo app bancário)
  const itemVenc = (l) => {
    const d = l.vencimento ? diasEntre(l.vencimento) : null;
    const atras = l.status === "atrasado";
    const rec = l.tipo === "receita";
    const quando = atras ? `Venceu ${dataBRcurto(l.vencimento)} · há ${Math.abs(d)}d`
      : d === 0 ? "Vence hoje" : d === 1 ? "Vence amanhã" : `Vence em ${d} dias`;
    return `<div onclick="formLancamentoId(${l.id})" style="display:flex;align-items:center;gap:12px;padding:12px 8px;border-bottom:1px solid var(--line);
          cursor:pointer;border-radius:10px;transition:background .15s;margin:0 -8px"
        onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
      <div style="width:38px;height:38px;border-radius:12px;background:${atras?"rgba(180,80,62,.1)":rec?"rgba(47,129,122,.1)":"rgba(201,169,78,.1)"};
           display:flex;align-items:center;justify-content:center;flex-shrink:0">
        ${atras
          ? `<svg viewBox='0 0 24 24' fill='none' stroke='#B4503E' stroke-width='2' width='18' height='18'><polyline points='23 18 13.5 8.5 8.5 13.5 1 6'/><polyline points='17 18 23 18 23 12'/></svg>`
          : rec
            ? `<svg viewBox='0 0 24 24' fill='none' stroke='#2F817A' stroke-width='2' width='18' height='18'><polyline points='23 6 13.5 15.5 8.5 10.5 1 18'/><polyline points='17 6 23 6 23 12'/></svg>`
            : `<svg viewBox='0 0 24 24' fill='none' stroke='#C9A94E' stroke-width='2' width='18' height='18'><polyline points='23 18 13.5 8.5 8.5 13.5 1 6'/><polyline points='17 18 23 18 23 12'/></svg>`}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.descricao}</div>
        <div style="font-size:11.5px;color:${atras?"var(--red)":"var(--ink-3)"};margin-top:1px">${quando}${l.categoria?" · "+l.categoria:""}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
        <div style="font-size:14px;font-weight:700;font-family:monospace;color:${atras?"var(--red)":rec?"var(--teal)":"var(--ink)"}">${money(l.valor)}</div>
        <button onclick="event.stopPropagation();formBaixaId(${l.id})" style="font-size:11px;padding:3px 8px;border-radius:8px;border:none;cursor:pointer;
          background:${rec?"rgba(47,129,122,.15)":"rgba(201,169,78,.15)"};color:${rec?"#1A6B63":"#8A6A1A"};font-weight:700;display:${l.status==="pago"?"none":"inline"}">
          ${rec?"Confirmar":"Pagar"}
        </button>
      </div>
    </div>`;
  };

  const atrasadas = venc.atrasados || [];
  const proximas = venc.proximos || [];
  const todasVenc = [...atrasadas, ...proximas];
  const vencDesp = todasVenc.filter(x => x.tipo === "despesa");
  const vencRec = todasVenc.filter(x => x.tipo === "receita");

  v.innerHTML = `
    <!-- ── HERO ── -->
    <div style="background:linear-gradient(135deg,#06243F 0%,#082D51 45%,#0E3A63 100%);
                border-radius:16px;padding:14px 18px 0;margin-bottom:12px;position:relative;overflow:hidden">
      <div class="hero-circle-1"></div>
      <div class="hero-circle-2"></div>
      <!-- spark line decorativa -->
      <svg viewBox="0 0 60 30" preserveAspectRatio="none"
           style="position:absolute;right:0;bottom:0;width:55%;height:70%;opacity:.18">
        <polyline points="${sparkPts}" fill="none" stroke="#C9A94E" stroke-width="1.8" stroke-linejoin="round"/>
      </svg>
      <!-- saudação -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.12);
             display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" ><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
        <div>
          <div style="font-size:14px;font-weight:800;color:#fff">${saudacao}, ${nome}!</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5)">Família Tomelin · ${new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}</div>
        </div>
      </div>
      <!-- saldo grande -->
      <div style="margin-bottom:4px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.45)">Saldo consolidado</div>
        <div style="font-size:clamp(22px,3.5vw,32px);font-weight:900;color:#fff;font-family:monospace;letter-spacing:-.02em;line-height:1.1">${money(k.saldo)}</div>
        <div style="font-size:12px;color:${saldoPos?"#6FD4AF":"#E07060"};margin-top:2px">
          <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' width='12' height='12' style='display:inline;vertical-align:middle'>${saldoPos?'<polyline points="5 12 12 5 19 12"/>':'<polyline points="5 12 12 19 19 12"/>'}</svg>
          ${money(Math.abs(resultado))} ${resPos?"resultado positivo":"resultado negativo"} este mês
        </div>
      </div>
      <!-- mini KPIs dentro do hero -->
      <div style="display:flex;gap:0;border-top:1px solid rgba(255,255,255,.1);margin:0 -20px;margin-top:10px">
        ${[
          ["Receitas","#6FD4AF",money(k.receitas_mes),"setView('receber')"],
          ["Despesas","#E0A060",money(k.despesas_mes),"setView('pagar')"],
          ["A pagar","#AFC2D6",money(k.a_pagar),"setView('pagar')"],
        ].map(([lab,cor,val,nav],i) => `
          <div style="flex:1;padding:10px 12px;border-right:${i<2?"1px solid rgba(255,255,255,.08)":"none"};cursor:pointer;transition:background .15s"
               onclick="${nav}"
               onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background=''">
            <div style="font-size:9.5px;color:rgba(255,255,255,.4);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px">${lab} ›</div>
            <div style="font-size:13px;font-weight:800;color:${cor};font-family:monospace">${val}</div>
          </div>`).join("")}
      </div>
    </div>

    <!-- ── ATALHOS RÁPIDOS ── -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
      ${[
        ["plus",     "Despesa",  "despesa",   "linear-gradient(135deg,#082D51,#1E4D8C)"],
        ["arrowDown","Receita",  "receita",   "linear-gradient(135deg,#16A34A,#1A7A6E)"],
        ["receipt",  "NF-e",    "nfe",        "linear-gradient(135deg,#D97706,#B45309)"],
        ["trendUp",  "Relatório","relatorios","linear-gradient(135deg,#7C3AED,#4F46E5)"],
      ].map(([ic,lab,acao,grad]) => `
        <button data-acao="${acao}" onclick="_atalhoClick(this)"
          style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 8px 12px;
                 border-radius:16px;border:none;background:${grad};cursor:pointer;
                 transition:all .18s;box-shadow:0 4px 12px rgba(0,0,0,.15);position:relative;overflow:hidden"
          onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,.22)'"
          onmouseout="this.style.transform='';this.style.boxShadow='0 4px 14px rgba(0,0,0,.15)'">
          <div style="width:36px;height:36px;border-radius:11px;background:rgba(255,255,255,.2);
               display:flex;align-items:center;justify-content:center;position:relative;z-index:1">
            <svg viewBox='0 0 24 24' fill='none' stroke='#fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='20' height='20'>${P[ic]||""}</svg>
          </div>
          <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,.95);text-align:center;
                       line-height:1.2;position:relative;z-index:1">${lab}</span>
          <div style="position:absolute;top:-10px;right:-10px;width:50px;height:50px;border-radius:50%;
               background:rgba(255,255,255,.08)"></div>
        </button>`).join("")}
    </div>

    <!-- ── ALERTAS (só aparece se houver) ── -->
    ${atrasadas.length ? `
    <div style="background:linear-gradient(135deg,#FEF2F2,#FEE2E2);border:1.5px solid #FCA5A5;border-radius:16px;
                padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;cursor:pointer"
         onclick="setView('pagar')">
      <div style="width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#DC2626,#991B1B);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 12px rgba(220,38,38,.3)"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" ><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13.5px;color:var(--red)">${atrasadas.length} conta${atrasadas.length>1?"s":""} vencida${atrasadas.length>1?"s":""}</div>
        <div style="font-size:12px;color:var(--red);opacity:.8">${money(atrasadas.reduce((s,l)=>s+l.valor,0))} em atraso — toque para ver</div>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
    </div>` : ""}

    <!-- ── CONTEÚDO INFERIOR (2 colunas no desktop) ── -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start" class="dash-grid">
    <div>
    <!-- ── PRÓXIMOS VENCIMENTOS ── -->
    ${todasVenc.length ? `
    <div class="card card-pad" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <h3 style="font-size:15px;color:var(--navy)">Próximos vencimentos</h3>
        <button class="btn btn-ghost btn-sm" onclick="setView('vencimentos')">${icon("clock")} Ver todos</button>
      </div>
      ${todasVenc.slice(0,5).map(itemVenc).join("")}
    </div>` : ""}

    <!-- ── GRÁFICOS ── -->
    <div class="card card-pad" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div>
          <h3 style="font-size:15px;color:var(--navy)">Fluxo de caixa</h3>
          <div class="sub">Últimos 6 meses</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="setView('relatorios')">${icon("trendUp")} Relatórios</button>
      </div>
      <div style="overflow-x:auto">${barChart(fluxo)}</div>
    </div>

    <div class="card card-pad" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div>
          <h3 style="font-size:15px;color:var(--navy)">Despesas por categoria</h3>
          <div class="sub">Mês atual</div>
        </div>
      </div>
      ${donut(desp)}
    </div>

    <!-- ── PATRIMÔNIO + JUROS ── -->
    <div class="grid-2" style="margin-bottom:16px">
      <div class="card card-pad" style="cursor:pointer;transition:all .15s" onclick="setView('relatorios')" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(8,45,81,.12)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span class="card-ico i-navy" style="width:34px;height:34px;border-radius:10px">${icon("shield")}</span>
          <div><div style="font-size:12.5px;font-weight:700;color:var(--ink-2)">Patrimônio líquido ›</div></div>
        </div>
        <div class="mono-num" style="font-size:22px;font-weight:900;color:var(--navy)">${money(pat.patrimonio_liquido)}</div>
        <div class="sub" style="margin-top:6px">Contas <b>${money(pat.total_contas)}</b> + Veículos <b>${money(pat.total_veiculos)}</b></div>
        ${pat.total_financiamentos > 0 ? `<div class="sub" style="color:var(--red)">Financiamentos: − ${money(pat.total_financiamentos)}</div>` : ""}
      </div>
      <div class="card card-pad" style="cursor:pointer;transition:all .15s" onclick="setView('relatorios')" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(8,45,81,.12)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span class="card-ico i-red" style="width:34px;height:34px;border-radius:10px">${icon("alert")}</span>
          <div><div style="font-size:12.5px;font-weight:700;color:var(--ink-2)">Juros pagos no ano ›</div></div>
        </div>
        <div class="mono-num" style="font-size:22px;font-weight:900;color:var(--red)">${money(jur.juros_pago_ano)}</div>
        <div class="sub" style="margin-top:6px">Este mês: <b>${money(jur.juros_mes)}</b></div>
        ${jur.juros_a_pagar > 0 ? `<div class="sub" style="color:var(--red)">A pagar: ${money(jur.juros_a_pagar)}</div>` : ""}
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
        <span style="flex-shrink:0;width:20px;height:20px;display:flex;margin-top:1px">${icon("alert")}</span>
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
const FILTRO = { status: "", busca: "", cat: "", conta: "", contato: "" };

async function viewLancamentos(v, tipoFixo) {
  await carregarRefs();
  const titulo = tipoFixo === "despesa" ? "Contas a pagar" : tipoFixo === "receita" ? "Contas a receber" : "Todos os lançamentos";
  const cats = State.cats.filter(c => !tipoFixo || c.tipo === tipoFixo);
  v.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div class="seg" id="seg-status" style="flex:1;min-width:0">
          <button data-s="" class="on" onclick="filtroStatus('')">Todos</button>
          <button data-s="pendente" onclick="filtroStatus('pendente')">Pendentes</button>
          <button data-s="atrasado" onclick="filtroStatus('atrasado')">Atrasados</button>
          <button data-s="pago" onclick="filtroStatus('pago')">Pagos</button>
        </div>
        <button class="btn ${tipoFixo === 'receita' ? 'btn-green' : 'btn-primary'}" onclick="formLancamento(null,'${tipoFixo || 'despesa'}')">+ Novo</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="search" style="flex:1"><span>${icon("search")}</span>
          <input class="search-i" id="busca" placeholder="Buscar..." oninput="debBusca(this.value)">
        </div>
        <select id="fcat" onchange="filtroCat(this.value)" style="flex:1;max-width:180px">
          <option value="">Todas categorias</option>
          ${cats.map(c => `<option value="${c.id}">${c.nome}</option>`).join("")}
        </select>
        <button class="btn btn-ghost btn-sm" onclick="exportarCSV('${tipoFixo || ''}')"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='15' height='15' ><line x1='8' y1='6' x2='16' y2='6'/><line x1="8" y1="12" x2="16" y2="12"/><polyline points="8 18 12 22 16 18"/></svg> CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="abrirLeitorNFe()">NF-e</button>
      </div>
    </div>
    <div id="lanc-lista" style="display:flex;flex-direction:column;gap:8px"></div>`;
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
  if (FILTRO.conta) q += `&conta_id=${FILTRO.conta}`;
  if (FILTRO.contato) q += `&contato_id=${FILTRO.contato}`;
  const itens = await api("/api/lancamentos" + q);
  itens.forEach(l => _LANC_CACHE.set(l.id, l));

  const lista = document.getElementById("lanc-lista");
  if (!lista) return;

  if (!itens.length) {
    lista.innerHTML = `<div class="empty">${icon("wallet")}<p>Nenhum lançamento encontrado.</p></div>`;
    return;
  }

  // cores e estilos por status
  const STATUS_COR = {
    pago:     { bg: "#F0FDF4", borda: "#86EFAC", txt: "#15803D", label: "Pago"      },
    pendente: { bg: "#FEFCE8", borda: "#FDE047", txt: "#854D0E", label: "Pendente"    },
    atrasado: { bg: "#FEF2F2", borda: "#FCA5A5", txt: "#991B1B", label: "Atrasado" },
  };

  lista.innerHTML = itens.map(l => {
    const rec = l.tipo === "receita";
    const st  = STATUS_COR[l.status] || STATUS_COR.pendente;
    const catCor = (State.cats.find(c => c.id === l.categoria_id) || {}).cor || "#7E8C9A";
    const podeBaixar = l.status !== "pago";
    const d = l.data_vencimento ? diasEntre(l.data_vencimento) : null;
    const quando = l.status === "atrasado" && d !== null
      ? `Venceu há ${Math.abs(d)}d`
      : d === 0 ? "Vence hoje"
      : d === 1 ? "Vence amanhã"
      : l.data_vencimento ? dataBR(l.data_vencimento)
      : "Sem vencimento";

    return `<div style="background:${st.bg};border:1.5px solid ${st.borda};border-radius:16px;padding:14px 16px;
                cursor:pointer;transition:all .15s;border-left:4px solid ${st.borda.replace('.3)','1)').replace('.35)','1)')}"
              onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 18px rgba(8,45,81,.12)'"
              onmouseout="this.style.transform='';this.style.boxShadow=''"
              onclick="formLancamentoId(${l.id})">
      <div style="display:flex;align-items:flex-start;gap:12px">
        <!-- ícone de tipo -->
        <div style="width:44px;height:44px;border-radius:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;
             background:${rec ? "linear-gradient(135deg,#DCFCE7,#BBF7D0)" : "linear-gradient(135deg,#FEE2E2,#FECACA)"};
             margin-top:1px;font-size:22px;font-weight:800;color:${rec?"#15803D":"#991B1B"}">
          ${rec
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" ><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="#991B1B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" ><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`}
        </div>
        <!-- info principal -->
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <div style="font-size:15px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${l.descricao}</div>
            <div style="font-family:monospace;font-size:17px;font-weight:900;
                 color:${rec?"#15803D":"#DC2626"};flex-shrink:0;
                 background:${rec?"#F0FDF4":"#FEF2F2"};padding:4px 10px;border-radius:10px">
              ${rec ? "+" : "−"} ${money(l.valor)}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:5px">
            <!-- status badge -->
            <span style="font-size:11.5px;font-weight:700;color:${st.txt};background:${st.bg};
                         border:1px solid ${st.borda};border-radius:20px;padding:2px 9px">${st.label}</span>
            <!-- quando -->
            <span style="font-size:12px;color:${l.status === "atrasado" ? "var(--red)" : "var(--ink-3)"}">${quando}</span>
            <!-- categoria -->
            ${l.categoria_nome ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--ink-3)">
              <span style="width:8px;height:8px;border-radius:50%;background:${catCor};flex-shrink:0"></span>${l.categoria_nome}
            </span>` : ""}
            <!-- conta -->
            ${l.conta_nome ? `<span style="font-size:12px;color:var(--ink-3)">· ${l.conta_nome}</span>` : ""}
          </div>
        </div>
      </div>
      <!-- botões de ação — linha separada -->
      <div style="display:flex;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid ${st.borda};flex-wrap:wrap">
        ${podeBaixar
          ? `<button class="btn btn-green btn-sm" onclick="event.stopPropagation();formBaixaId(${l.id})"><svg viewBox='0 0 24 24' fill='none' stroke='#fff' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' width='16' height='16'><polyline points='20 6 9 17 4 12'/></svg> Dar baixa</button>`
          : `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();estornar(${l.id})"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='15' height='15' ><polyline points='9 14 4 9 9 4'/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg> Estornar</button>`}
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();formLancamentoId(${l.id})"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='15' height='15' ><path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();abrirPDF('/api/lancamentos/${l.id}/recibo.pdf')"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='15' height='15' ><path d='M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z'/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg> Recibo</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();reciboWhats(${l.id})"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='15' height='15' ><path d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'/></svg> WA</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red);margin-left:auto" onclick="event.stopPropagation();excluirLanc(${l.id})"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' width='14' height='14'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg></button>
      </div>
    </div>`;
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
  if (pre && !l) l = pre;
  const ed = !!l;
  const tipoFinal = tipo || (l && l.tipo) || "despesa";
  const cats = State.cats.filter(c => c.tipo === tipoFinal);
  const rec = tipoFinal === "receita";

  abrirModal(`
    <div class="modal">
      <div class="modal-h">
        <span class="card-ico ${rec ? 'i-green' : 'i-red'}">${icon(rec ? "arrowDown" : "arrowUp")}</span>
        <h3>${ed ? "Editar" : "Novo"} ${rec ? "recebimento" : "pagamento"}</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b"><div class="frm">
        <input type="hidden" id="f-tipo" value="${tipoFinal}">

        <div class="campo full"><label>Descrição</label>
          <div class="inp-wrap" style="position:relative">
            <div class="inp-ic">${icon("edit")}</div>
            <input id="f-desc" value="${ed ? l.descricao : ""}" placeholder="Ex.: Aluguel, Salário..."
              autocomplete="off"
              oninput="_autoDesc(this.value)"
              onfocus="_autoDesc(this.value)"
              onblur="setTimeout(()=>{ const d=document.getElementById('f-desc-list'); if(d) d.remove(); },200)">
            <div id="f-desc-list" style="display:none"></div>
          </div></div>

        <div class="campo"><label>Valor (R$)</label>
          <div class="inp-wrap">
            <div class="inp-ic">${icon("cash")}</div>
            <input id="f-valor" type="number" step="0.01" value="${ed ? l.valor : ""}" placeholder="0,00">
          </div></div>

        <div class="campo"><label>Categoria</label>
          <div style="position:relative">
            <select id="f-cat" onchange="_previewCat(this)" style="width:100%;padding-left:28px">
              <option value="">— Sem categoria —</option>
              ${cats.map(c => `<option value="${c.id}" ${ed && l.categoria_id === c.id ? "selected" : ""} data-cor="${c.cor||"#94A3B8"}">${c.nome}</option>`).join("")}
            </select>
            <span id="f-cat-dot" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);
              width:10px;height:10px;border-radius:50%;pointer-events:none;
              background:${ed && l.categoria_id ? (State.cats.find(c=>c.id===l.categoria_id)||{}).cor||"#94A3B8" : "transparent"}">
            </span>
          </div>
        </div>

        <div class="campo"><label>Vencimento</label>
          <input id="f-venc" type="date" value="${ed && l.vencimento ? l.vencimento.split("T")[0] : hojeISO()}"></div>

        <div class="campo"><label>Competência</label>
          <input id="f-comp" type="date" value="${ed && l.data_competencia ? l.data_competencia.split("T")[0] : hojeISO()}"></div>

        <div class="campo"><label>Conta / carteira</label>
          <select id="f-conta">
            <option value="">— Qualquer —</option>
            ${State.contas.map(c => `<option value="${c.id}" ${ed && l.conta_id === c.id ? "selected" : ""}>${c.nome}</option>`).join("")}
          </select></div>

        <div class="campo"><label>${rec ? "Recebo de" : "Pago para"}</label>
          <div style="position:relative">
            <select id="f-contato" style="width:100%">
              <option value="">— Selecione —</option>
              ${State.contatos.map(c => {
                const tipo = c.tipo ? ` (${c.tipo})` : "";
                return `<option value="${c.id}" ${ed && l.contato_id === c.id ? "selected" : ""}>${c.nome}${tipo}</option>`;
              }).join("")}
            </select>
          </div>
          ${State.contatos.length === 0 ? `<div style="font-size:11px;color:var(--ink-3);margin-top:4px">Cadastre contatos em <b>Contatos</b> para vincular aqui</div>` : ""}
        </div>

        <div class="campo full"><label>Situação</label>
          <select id="f-pago">
            <option value="">Pendente (a ${rec ? "receber" : "pagar"})</option>
            <option value="1" ${ed && l.data_pagamento ? "selected" : ""}>Já ${rec ? "recebido" : "pago"}</option>
          </select></div>

        <div class="campo"><label>Juros (R$)</label>
          <input id="f-juros" type="number" step="0.01" value="${ed && l.juros && +l.juros ? l.juros : ""}" placeholder="0,00"></div>

        <div class="campo"><label>Multa (R$)</label>
          <input id="f-multa" type="number" step="0.01" value="${ed && l.multa && +l.multa ? l.multa : ""}" placeholder="0,00"></div>

        <div class="campo full"><label>Observação</label>
          <textarea id="f-obs" placeholder="Anotações opcionais...">${ed && l.obs ? l.obs : ""}</textarea></div>
      </div></div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">${icon("x")} Cancelar</button>
        <button class="btn ${rec ? "btn-green" : "btn-primary"}" onclick="salvarLanc(${ed ? l.id : "null"})">
          ${icon("check")} ${ed ? "Salvar alterações" : (rec ? "Registrar recebimento" : "Registrar pagamento")}
        </button>
      </div>
    </div>`);

  // popula cache se vazio (para o autocomplete funcionar)
  if (_LANC_CACHE.size < 5) {
    api("/api/lancamentos?limite=200").then(itens => {
      if (Array.isArray(itens)) itens.forEach(l => _LANC_CACHE.set(l.id, l));
    }).catch(() => {});
  }
  // foca na descrição com pequeno delay
  setTimeout(() => document.getElementById("f-desc")?.focus(), 120);
}

// ── AUTOCOMPLETE DE DESCRIÇÃO ──────────────────────────────
function _autoDesc(q) {
  const box = document.getElementById("f-desc-list");
  if (!box) return;
  const tipo = document.getElementById("f-tipo")?.value || "";
  q = (q || "").toLowerCase().trim();

  // busca nos lançamentos do cache — agrupa por descrição única
  const vistos = new Map();
  for (const [, l] of _LANC_CACHE) {
    if (tipo && l.tipo !== tipo) continue;
    const key = l.descricao?.toLowerCase();
    if (!key) continue;
    if (q && !key.includes(q)) continue;
    if (!vistos.has(key)) vistos.set(key, l);
  }

  const sugs = [...vistos.values()]
    .sort((a, b) => (b.id || 0) - (a.id || 0))
    .slice(0, 6);

  if (!sugs.length || (!q && sugs.length === 0)) {
    box.style.display = "none";
    return;
  }

  const catMap = Object.fromEntries((State.cats || []).map(c => [c.id, c]));
  const cntMap = Object.fromEntries((State.contas || []).map(c => [c.id, c]));

  box.innerHTML = sugs.map(l => {
    const cat = catMap[l.categoria_id];
    const cnt = cntMap[l.conta_id];
    return `<div class="auto-item" onmousedown="event.preventDefault()" onclick="_escolherDesc(${l.id})">
      <div style="font-size:13.5px;font-weight:600;color:var(--ink)">${_highlight(l.descricao, q)}</div>
      <div style="font-size:11.5px;color:var(--ink-3);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">
        ${cat ? `<span style="color:${cat.cor||'var(--ink-3)'}">${cat.nome}</span>` : ""}
        ${cnt ? `<span>${cnt.nome}</span>` : ""}
        <span class="mono-num">${money(l.valor)}</span>
      </div>
    </div>`;
  }).join("");

  box.style.display = "block";
  box.style.cssText = `display:block;position:absolute;top:100%;left:0;right:0;z-index:9999;
    background:var(--card);border:1.5px solid var(--navy);border-radius:14px;
    box-shadow:0 8px 32px rgba(8,45,81,.18);overflow:hidden;margin-top:4px;`;
}

function _previewCat(sel) {
  const opt = sel.options[sel.selectedIndex];
  const dot = document.getElementById("f-cat-dot");
  if (!dot) return;
  const cor = opt ? opt.dataset.cor : "";
  dot.style.background = cor || "transparent";
  sel.style.paddingLeft = cor ? "28px" : "14px";
}

// Inicializa o dot ao abrir o form
setTimeout(() => {
  const sel = document.getElementById("f-cat");
  if (sel) _previewCat(sel);
}, 150);

function _highlight(text, q) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return text;
  return text.slice(0, idx) +
    `<mark style="background:#FEF9C3;border-radius:3px;padding:0 1px">${text.slice(idx, idx + q.length)}</mark>` +
    text.slice(idx + q.length);
}

function _escolherDesc(id) {
  const l = _LANC_CACHE.get(id);
  if (!l) return;
  const descEl = document.getElementById("f-desc");
  const valEl  = document.getElementById("f-valor");
  const catEl  = document.getElementById("f-cat");
  const cntEl  = document.getElementById("f-conta");
  const ctoEl  = document.getElementById("f-contato");
  const box    = document.getElementById("f-desc-list");

  if (descEl) descEl.value = l.descricao;
  if (valEl && !valEl.value) valEl.value = l.valor;
  if (catEl && l.categoria_id) catEl.value = l.categoria_id;
  if (cntEl && l.conta_id) cntEl.value = l.conta_id;
  if (ctoEl && l.contato_id) ctoEl.value = l.contato_id;
  if (box) box.style.display = "none";

  // foca no valor para confirmar/ajustar
  setTimeout(() => valEl?.focus(), 50);
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
async function formBaixaId(id) {
  let l = _LANC_CACHE.get(id);
  if (!l) {
    try {
      l = await api(`/api/lancamentos/${id}`);
      if (l && l.id) _LANC_CACHE.set(l.id, l);
    } catch {}
  }
  if (!l || !l.id) { toast("Lançamento não encontrado.", "err"); return; }
  formBaixa(l);
}
async function formLancamentoId(id) {
  let l = _LANC_CACHE.get(id);
  if (!l) {
    try {
      l = await api(`/api/lancamentos/${id}`);
      if (l && l.id) _LANC_CACHE.set(l.id, l);
    } catch {}
  }
  if (!l || !l.id) { toast("Lançamento não encontrado.", "err"); return; }
  formLancamento(l, l.tipo);
}


// Cache genérico para edições seguras (evita JSON.stringify em onclick)
const _CACHE = { contas:{}, cats:{}, contatos:{}, veiculos:{}, usuarios:{} };

async function _editarConta(id) {
  let o = _CACHE.contas?.[id];
  if (!o) try { o = await api(`/api/contas/${id}`); } catch {}
  if (o) formConta(o); else toast("Conta não encontrada.", "err");
}
async function _editarCategoria(id) {
  let o = _CACHE.cats?.[id];
  if (!o) try { const list = await api("/api/categorias"); list.forEach(c => _CACHE.cats[c.id]=c); o = _CACHE.cats[id]; } catch {}
  if (o) formCategoria(o); else toast("Categoria não encontrada.", "err");
}
async function _editarContato(id) {
  let o = _CACHE.contatos?.[id];
  if (!o) {
    try { o = await api(`/api/contatos/${id}`); } catch {}
  }
  if (o) formContato(o);
  else toast("Contato não encontrado.", "err");
}
async function _editarVeiculo(id) {
  let o = _CACHE.veiculos?.[id];
  if (!o) try { o = await api(`/api/veiculos/${id}`); } catch {}
  if (o) formVeiculo(o); else toast("Veículo não encontrado.", "err");
}
async function _editarUsuario(id) {
  let o = _CACHE.usuarios?.[id];
  if (!o) try { const list = await api("/api/usuarios"); list.forEach(u => _CACHE.usuarios[u.id]=u); o = _CACHE.usuarios[id]; } catch {}
  if (o) formUsuario(o); else toast("Usuário não encontrado.", "err");
}

function formBaixa(l) {
  const rec = l.tipo === "receita";
  abrirModal(`
    <div class="modal" style="max-width:420px">
      <div class="modal-h"><span class="card-ico i-green">${icon("checkCircle")}</span>
        <h3>Dar baixa</h3><button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
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
      return `<div class="venc-item" onclick="formLancamentoId(${l.id})" style="cursor:pointer"
          onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
        <span class="venc-ico ${atras ? 'i-red' : rec ? 'i-green' : 'i-amber'}">${icon(rec ? "arrowDown" : "arrowUp")}</span>
        <div class="d"><div class="n">${l.descricao}</div><div class="w">${quando} · ${dataBR(l.vencimento)}${l.categoria ? " · " + l.categoria : ""}</div></div>
        <div class="vv ${rec ? 'val-rec' : 'val-desp'}">${money(l.valor)}</div>
        ${mostrarBotao ? `<button class="btn btn-green btn-sm" onclick="event.stopPropagation();formBaixaId(${l.id})">${icon("check")}Baixar</button>` : ""}
      </div>`;
    };
  }
  const totAtraso = venc.atrasados.reduce((s, x) => s + (x.tipo === 'despesa' ? x.valor : 0), 0);
  v.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
      <div class="kpi red" style="cursor:pointer" onclick="setView('pagar')" title="Ver contas a pagar atrasadas"><div class="lab"><span class="i i-red">${icon("alert")}</span>Atrasados</div><div class="val mono-num">${venc.atrasados.length}</div><div class="meta">${money(totAtraso)} a pagar vencido</div></div>
      <div class="kpi gold" style="cursor:pointer" onclick="setView('lancamentos')" title="Ver todos os lançamentos"><div class="lab"><span class="i i-gold">${icon("clock")}</span>Próximos 15 dias</div><div class="val mono-num">${venc.proximos.length}</div><div class="meta">Contas a vencer</div></div>
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
        <div class="card card-pad" style="cursor:pointer;transition:all .15s"
             onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(8,45,81,.12)'"
             onmouseout="this.style.transform='';this.style.boxShadow=''"
             onclick="FILTRO.conta=${c.id};FILTRO.status='';window._tipoFixo='';setView('lancamentos')"
             title="Ver lançamentos de ${c.nome}">
          <div class="card-h">
            ${c.logo ? avatarLogo(c.logo, c.nome, 40) : `<span class="card-ico" style="background:${c.cor}22;color:${c.cor}">${icon(c.tipo === "carteira" ? "cash" : "bank")}</span>`}
            <div class="grow"><h3>${c.nome}</h3><div class="sub">${c.tipo === "carteira" ? "Carteira / dinheiro" : (c.banco || "Conta bancária")}</div></div>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div class="val mono-num" style="font-size:26px;color:${Number(c.saldo_atual) < 0 ? 'var(--red)' : 'var(--navy)'};margin:6px 0 2px">${money(c.saldo_atual)}</div>
          <div class="meta">Saldo inicial ${money(c.saldo_inicial)} · toque para ver os lançamentos</div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_editarConta(${c.id})">${icon("edit")}Editar</button>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();excluirConta(${c.id})">${icon("trash")}Excluir</button>
          </div>
        </div>`).join("") || `<div class="empty">${icon("wallet")}<p>Nenhuma conta ainda.</p></div>`}
    </div>`;
}
function formConta(c) {
  const e = c || {};
  abrirModal(`
    <div class="modal">
      <div class="modal-h"><span class="card-ico i-navy">${icon("wallet")}</span><h3>${c ? "Editar conta" : "Nova conta"}</h3><button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
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
          <div style="display:flex;align-items:center;gap:12px;padding:10px 6px;border-bottom:1px solid var(--line);cursor:pointer;border-radius:8px;transition:background .15s"
               onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
               onclick="FILTRO.cat=${c.id};FILTRO.status='';window._tipoFixo='';setView('lancamentos')" title="Ver lançamentos de ${c.nome}">
            <span class="card-ico" style="width:34px;height:34px;background:${c.cor}22;color:${c.cor}">${icon(c.icone || "tag")}</span>
            <div class="grow"><div class="nm">${c.nome}</div><div class="sub" style="font-size:11px">Toque para ver os lançamentos</div></div>
            <button class="btn-icon" onclick="event.stopPropagation();_editarCategoria(${c.id})">${icon("edit")}</button>
            <button class="btn-icon" onclick="event.stopPropagation();excluirCategoria(${c.id})"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='15' height='15'><polyline points='3 6 5 6 21 6'/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
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
      <div class="modal-h"><span class="card-ico i-navy">${icon("tag")}</span><h3>${c ? "Editar categoria" : "Nova categoria"}</h3><button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
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
        <button class="btn-icon" onclick="excluirContato(${c.id})"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='15' height='15'><polyline points='3 6 5 6 21 6'/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </div></td>
    </tr>`).join("") || `<tr><td colspan="6"><div class="empty">${icon("users")}<p>Nenhum contato.</p></div></td></tr>`;
}
function formContato(c) {
  const e = c || {};
  abrirModal(`
    <div class="modal" style="max-width:600px">
      <div class="modal-h">
        <span class="card-ico i-navy">${icon("users")}</span>
        <h3>${c ? "Editar contato" : "Novo contato"}</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b"><div class="frm">

        <!-- Busca por CNPJ -->
        <div class="campo full" style="background:var(--bg);border-radius:12px;padding:12px 14px;border:1.5px solid var(--line)">
          <label>Buscar por CNPJ (preenche automaticamente)</label>
          <div style="display:flex;gap:8px;margin-top:6px">
            <input id="o-cnpj-busca" placeholder="00.000.000/0001-00" maxlength="18"
              style="flex:1"
              oninput="this.value=this.value.replace(/\\D/g,'').replace(/(\\d{2})(\\d{3})(\\d{3})(\\d{4})(\\d{2})/,'$1.$2.$3/$4-$5').slice(0,18)">
            <button class="btn btn-primary btn-sm" onclick="_buscarCNPJ()">${icon("search")} Buscar</button>
          </div>
          <div id="o-cnpj-status" style="font-size:11.5px;color:var(--ink-3);margin-top:4px"></div>
        </div>

        <!-- Dados principais -->
        <div class="campo full"><label>Nome / Razão social</label>
          <input id="o-nome" value="${e.nome||""}" placeholder="Nome do contato ou empresa"></div>

        <div class="campo"><label>Tipo</label>
          <select id="o-tipo">
            <option value="cliente"    ${e.tipo==="cliente"    ?"selected":""}>Recebo de (cliente / renda)</option>
            <option value="fornecedor" ${e.tipo==="fornecedor" ?"selected":""}>Pago para (fornecedor)</option>
            <option value="ambos"      ${e.tipo==="ambos"      ?"selected":""}>Ambos</option>
          </select></div>

        <div class="campo"><label>CPF / CNPJ</label>
          <input id="o-doc" value="${e.documento||""}" placeholder="000.000.000-00 ou 00.000.000/0001-00"></div>

        <div class="campo"><label>Telefone / WhatsApp</label>
          <input id="o-tel" value="${e.telefone||""}" placeholder="(47) 9 9999-0000"></div>

        <div class="campo"><label>E-mail</label>
          <input id="o-email" type="email" value="${e.email||""}" placeholder="contato@empresa.com.br"></div>

        <!-- Endereço com busca de CEP -->
        <div class="campo full" style="border-top:1px solid var(--line);padding-top:14px;margin-top:2px">
          <label style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3)">
            Endereço
          </label>
        </div>

        <div class="campo"><label>CEP</label>
          <div style="display:flex;gap:6px">
            <input id="o-cep" value="${e.cep||""}" placeholder="00000-000" maxlength="9"
              style="flex:1"
              oninput="this.value=this.value.replace(/\\D/g,'').replace(/(\\d{5})(\\d{3})/,'$1-$2').slice(0,9)"
              onblur="_buscarCEP(this.value)">
            <button class="btn btn-ghost btn-sm" onclick="_buscarCEP(document.getElementById('o-cep').value)" title="Buscar CEP">
              ${icon("search")}
            </button>
          </div>
        </div>

        <div class="campo full"><label>Logradouro</label>
          <input id="o-logradouro" value="${e.logradouro||""}" placeholder="Rua, Avenida..."></div>

        <div class="campo" style="max-width:120px"><label>Número</label>
          <input id="o-numero" value="${e.numero||""}" placeholder="Nº"></div>

        <div class="campo"><label>Complemento</label>
          <input id="o-complemento" value="${e.complemento||""}" placeholder="Sala, Apto..."></div>

        <div class="campo"><label>Bairro</label>
          <input id="o-bairro" value="${e.bairro||""}" placeholder="Bairro"></div>

        <div class="campo"><label>Cidade</label>
          <input id="o-cidade" value="${e.cidade||""}" placeholder="Cidade"></div>

        <div class="campo" style="max-width:100px"><label>Estado</label>
          <input id="o-estado" value="${e.estado||""}" placeholder="SC" maxlength="2"
            oninput="this.value=this.value.toUpperCase()"></div>

        <!-- Logo e obs -->
        ${campoLogo("Logo da empresa (PNG/JPG — salvo no sistema)")}
        <div class="campo full"><label>Observações</label>
          <textarea id="o-obs" rows="2">${e.obs||""}</textarea></div>

      </div></div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">${icon("x")} Cancelar</button>
        <button class="btn btn-primary" onclick="salvarContato(${c?e.id:"null"})">${icon("check")} Salvar contato</button>
      </div>
    </div>`, "lg");
  initLogo(e.logo);
}

async function _buscarCNPJ() {
  const raw = (document.getElementById("o-cnpj-busca")?.value||"").replace(/\D/g,"");
  if (raw.length !== 14) { toast("Digite o CNPJ completo (14 dígitos)", "err"); return; }
  const st = document.getElementById("o-cnpj-status");
  if (st) st.textContent = "Consultando...";
  try {
    const d = await api(`/api/contatos/buscar-cnpj/${raw}`);
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    set("o-nome", d.nome);
    set("o-doc", d.documento ? d.documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,"$1.$2.$3/$4-$5") : "");
    set("o-tel", d.telefone);
    set("o-email", d.email);
    set("o-logradouro", d.logradouro);
    set("o-numero", d.numero);
    set("o-complemento", d.complemento);
    set("o-bairro", d.bairro);
    set("o-cidade", d.cidade);
    set("o-estado", d.estado);
    if (d.cep) {
      const cepFmt = d.cep.replace(/(\d{5})(\d{3})/,"$1-$2");
      set("o-cep", cepFmt);
    }
    if (st) st.textContent = `✓ ${d.razao_social || d.nome} encontrado`;
    if (st) st.style.color = "#16A34A";
    toast("CNPJ encontrado — dados preenchidos", "ok");
  } catch(err) {
    if (st) { st.textContent = "CNPJ não encontrado na base."; st.style.color = "var(--red)"; }
    toast("CNPJ não encontrado", "err");
  }
}

async function _buscarCEP(cep) {
  const raw = (cep||"").replace(/\D/g,"");
  if (raw.length !== 8) return;
  try {
    const d = await api(`/api/contatos/buscar-cep/${raw}`);
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    set("o-logradouro", d.logradouro);
    set("o-bairro", d.bairro);
    set("o-cidade", d.cidade);
    set("o-estado", d.estado);
    document.getElementById("o-numero")?.focus();
    toast("CEP encontrado", "ok");
  } catch { /* CEP não encontrado, deixa o usuário preencher */ }
}

async function salvarContato(id) {
  const body = {
    nome:        ($("#o-nome")?.value||"").trim(),
    tipo:        $("#o-tipo")?.value || "fornecedor",
    documento:   ($("#o-doc")?.value||"").trim() || null,
    telefone:    ($("#o-tel")?.value||"").trim() || null,
    email:       ($("#o-email")?.value||"").trim() || null,
    obs:         ($("#o-obs")?.value||"").trim() || null,
    logo:        LOGO_BUF || null,
    cep:         ($("#o-cep")?.value||"").replace(/\D/g,"") || null,
    logradouro:  ($("#o-logradouro")?.value||"").trim() || null,
    numero:      ($("#o-numero")?.value||"").trim() || null,
    complemento: ($("#o-complemento")?.value||"").trim() || null,
    bairro:      ($("#o-bairro")?.value||"").trim() || null,
    cidade:      ($("#o-cidade")?.value||"").trim() || null,
    estado:      ($("#o-estado")?.value||"").trim().toUpperCase() || null,
  };
  if (!body.nome) return toast("Informe o nome", "err");
  try {
    if (id) await api(`/api/contatos/${id}`, { method: "PUT", body: JSON.stringify(body) });
    else     await api("/api/contatos",       { method: "POST", body: JSON.stringify(body) });
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
const WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

async function viewWhatsapp(v) {
  let st = {}, tunnelUrl = "";
  try { st = await api("/api/whatsapp/status"); } catch { st = {}; }
  try { const t = await api("/api/whatsapp/tunnel-url"); tunnelUrl = t.url || ""; } catch {}
  // URL direta por IP:porta — igual ao Sentinela (bypassa o Traefik)
  const _host = location.hostname;
  const webhookUrl = tunnelUrl || st.tunnel_url || `http://189.126.105.8:8788/api/whatsapp/webhook`;
  const webhookUrlAlt = location.origin + "/api/whatsapp/webhook";
  const ok       = st.conectado === true && st.ativo;
  const semCfg   = !st.gateway || !st.chave_configurada;
  const statusTxt = semCfg ? "Não configurado"
    : st.erro_gateway ? "Erro no gateway"
    : st.conectado ? (st.numero ? st.numero : "Conectado")
    : "WhatsApp desconectado";

  // ── helpers ──────────────────────────────────────────────
  const stepCircle = (n, done) =>
    `<div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;
       font-size:12px;font-weight:800;transition:all .2s;
       background:${done?"#25D366":"var(--bg)"};color:${done?"#fff":"var(--ink-3)"};
       border:2px solid ${done?"#25D366":"var(--line)"}">${done?IC_CHECK_W:n}</div>`;

  const section = (titulo, sub, ico, corpo, accent="#25D366") =>
    `<div style="background:var(--card);border-radius:18px;border:1.5px solid var(--line);overflow:hidden;margin-bottom:14px">
       <div style="display:flex;align-items:center;gap:12px;padding:16px 18px 0">
         <div style="width:38px;height:38px;border-radius:12px;background:${accent}18;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${accent}">${ico}</div>
         <div><div style="font-weight:800;font-size:15px;color:var(--ink)">${titulo}</div>
           <div style="font-size:12px;color:var(--ink-3);margin-top:1px">${sub}</div></div>
       </div>
       <div style="padding:14px 18px 18px">${corpo}</div>
     </div>`;

  const cmdChip = (cmd, desc, cor="#128C7E") =>
    `<div style="display:flex;flex-direction:column;gap:3px;padding:10px 12px;background:var(--bg);border-radius:12px;border:1px solid var(--line);min-width:0">
       <code style="font-size:12.5px;font-weight:700;color:${cor};overflow-wrap:anywhere">${cmd}</code>
       <span style="font-size:11.5px;color:var(--ink-2);line-height:1.3">${desc}</span>
     </div>`;

  const cmdGrid = (arr, cor) =>
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:8px">${arr.map(([c,d])=>cmdChip(c,d,cor)).join("")}</div>`;

  // ── conteúdo principal ────────────────────────────────────
  v.innerHTML = `

  <!-- HERO VERDE -->
  <div style="background:linear-gradient(135deg,#075E54 0%,#128C7E 55%,#25D366 100%);
              border-radius:22px;padding:24px 22px 20px;margin-bottom:16px;position:relative;overflow:hidden">
    <!-- bolhas decorativas -->
    <div style="position:absolute;right:-20px;top:-20px;width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.06)"></div>
    <div style="position:absolute;right:30px;bottom:-30px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.05)"></div>

    <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:18px">
      <div style="width:52px;height:52px;border-radius:16px;background:rgba(255,255,255,.15);
           display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff">${WA_SVG}</div>
      <div>
        <div style="font-size:19px;font-weight:900;color:#fff;line-height:1.1">Central WhatsApp</div>
        <div style="font-size:12.5px;color:rgba(255,255,255,.65);margin-top:3px">Comandos financeiros no grupo</div>
      </div>
    </div>

    <!-- status pill -->
    <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(0,0,0,.25);
         border-radius:20px;padding:7px 14px;margin-bottom:18px">
      <span style="width:8px;height:8px;border-radius:50%;background:${ok?"#25D366":semCfg?"#aaa":"#FF6B6B"};
        ${ok?"box-shadow:0 0 0 3px rgba(37,211,102,.35)":""}"></span>
      <span style="font-size:13px;font-weight:700;color:#fff">${statusTxt}</span>
      ${ok?`<span style="font-size:11px;color:rgba(255,255,255,.5)">· respondendo a cada 4s</span>`:""}
    </div>

    <!-- mini-stats -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:rgba(255,255,255,.1);border-radius:14px;overflow:hidden">
      ${[
        ["Escuta","a cada 4s"],
        ["PDFs","no grupo"],
        ["Respostas","instantâneas"],
      ].map(([e,t,s])=>`
        <div style="background:rgba(0,0,0,.2);padding:12px 10px;text-align:center">
          <div style="font-size:20px;margin-bottom:4px">${e}</div>
          <div style="font-size:12px;font-weight:700;color:#fff">${t}</div>
          <div style="font-size:10.5px;color:rgba(255,255,255,.5)">${s}</div>
        </div>`).join("")}
    </div>
  </div>

  <!-- BOTÕES DE AÇÃO RÁPIDA -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
    <button onclick="testarWhatsapp(this)" ${st.ativo&&st.grupo?"":'disabled style="opacity:.45"'}
      style="display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;border-radius:14px;
             background:#25D366;color:#fff;font-weight:700;font-size:14px;border:none;cursor:pointer;
             box-shadow:0 4px 14px rgba(37,211,102,.4);transition:all .15s">
      ${WA_SVG} Testar agora
    </button>
    <button onclick="rodarDiagnosticoWA()"
      style="display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;border-radius:14px;
             background:var(--card);color:var(--navy);font-weight:700;font-size:14px;
             border:1.5px solid var(--line);cursor:pointer;transition:all .15s">
      ${icon("shield")} Diagnóstico
    </button>
  </div>

  <!-- DIAGNÓSTICO (expande) -->
  <div style="background:var(--card);border-radius:18px;border:1.5px solid var(--line);margin-bottom:14px;overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 18px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;border-radius:10px;background:#128C7E18;display:flex;align-items:center;justify-content:center;color:#128C7E">${icon("shield")}</div>
        <div><div style="font-weight:700;color:var(--ink)">Diagnóstico</div>
          <div style="font-size:12px;color:var(--ink-3)">Verificação em tempo real</div></div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="rodarDiagnosticoWA()">${icon("refresh")} Verificar</button>
    </div>
    <div id="wa-diag" style="padding:0 18px 16px"><div style="font-size:13px;color:var(--ink-3)">Toque em Verificar para checar a conexão.</div></div>
  </div>

  <!-- PASSO 1: GATEWAY -->
  <div style="background:var(--card);border-radius:18px;border:1.5px solid var(--line);margin-bottom:14px;overflow:hidden">
    <div style="display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)">
      ${stepCircle(1, !!(st.gateway && st.chave_configurada && !st.erro_gateway))}
      <div>
        <div style="font-weight:800;font-size:15px;color:var(--ink)">Conectar ao gateway</div>
        <div style="font-size:12px;color:var(--ink-3)">${st.gateway||"zap.unicontroller.com.br"}</div>
      </div>
    </div>
    <div style="padding:16px 18px">
      <div class="frm">
        <div class="campo full"><label>URL do gateway</label>
          <input id="wa-url" value="${st.gateway||"https://zap.unicontroller.com.br"}" placeholder="https://zap.unicontroller.com.br"></div>
        <div class="campo full"><label>Chave de API <span style="font-weight:400;color:var(--ink-3)">(API Keys no painel do gateway)</span></label>
          <input id="wa-chave" type="password" placeholder="${st.chave_configurada?"••••••••  (já salva — deixe em branco para manter)":"Cole a chave gerada no painel"}"></div>
        <div class="campo full" style="flex-direction:row;align-items:center;gap:10px">
          <label class="switch"><input type="checkbox" id="wa-ativo" ${st.ativo?"checked":""}><span class="slider"></span></label>
          <span style="font-size:13.5px;color:var(--ink);font-weight:600">Ativar envio de mensagens</span>
        </div>
      </div>
      <button onclick="salvarGatewayWA()"
        style="margin-top:14px;width:100%;padding:12px 16px;border-radius:12px;background:#128C7E;color:#fff;
               font-weight:700;font-size:14px;border:none;cursor:pointer;display:flex;align-items:center;
               justify-content:center;gap:8px;transition:opacity .15s">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
        Salvar e verificar conexão
      </button>
    </div>
  </div>

  <!-- PASSO 2: GRUPO + NÚMERO -->
  <div style="background:var(--card);border-radius:18px;border:1.5px solid var(--line);margin-bottom:14px;overflow:hidden">

    <!-- header do passo -->
    <div style="display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)">
      ${stepCircle(2, !!st.grupo)}
      <div>
        <div style="font-weight:800;font-size:15px;color:var(--ink)">Grupo e seu número</div>
        <div style="font-size:12px;color:var(--ink-3)">${st.grupo ? "Grupo configurado" : "Nenhum grupo configurado"}</div>
      </div>
    </div>

    <div style="padding:18px">

      <!-- ── SEÇÃO: GRUPO ── -->
      <div style="font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;
                  color:#128C7E;margin-bottom:12px">Grupo de controle</div>

      <!-- chip do grupo atual (quando configurado) -->
      ${st.grupo ? `
      <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;
           background:linear-gradient(135deg,rgba(37,211,102,.08),rgba(7,94,84,.06));
           border:2px solid rgba(37,211,102,.35);border-radius:16px;margin-bottom:14px;
           position:relative;overflow:hidden">
        <div style="position:absolute;right:-10px;top:-10px;width:60px;height:60px;border-radius:50%;
             background:rgba(37,211,102,.08)"></div>
        <div style="width:46px;height:46px;border-radius:14px;
             background:linear-gradient(135deg,#25D366,#128C7E);
             display:flex;align-items:center;justify-content:center;flex-shrink:0;
             box-shadow:0 4px 12px rgba(37,211,102,.3)">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="24" height="24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;color:#128C7E;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Grupo ativo</div>
          <div style="font-size:13.5px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Família Tomelin</div>
          <div style="font-size:11px;color:var(--ink-3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace">${st.grupo}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <span><svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg></span>
          <button onclick="carregarGruposWA()"
            style="font-size:11px;font-weight:700;color:#128C7E;background:rgba(18,140,126,.1);
                   border:none;border-radius:8px;padding:4px 8px;cursor:pointer">Trocar</button>
        </div>
      </div>` : `
      <!-- placeholder quando não tem grupo -->
      <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;
           background:var(--bg);border:2px dashed var(--line);border-radius:16px;margin-bottom:14px">
        <div style="width:46px;height:46px;border-radius:14px;background:var(--line);
             display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.8" width="24" height="24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:700;color:var(--ink-3)">Nenhum grupo selecionado</div>
          <div style="font-size:12px;color:var(--ink-3);margin-top:2px">Toque em Listar grupos abaixo</div>
        </div>
        <span style="style="opacity:.3"><svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28" ><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
      </div>`}

      <!-- botão listar grupos -->
      <button onclick="carregarGruposWA()" ${st.gateway && st.chave_configurada ? "" : "disabled"}
        style="width:100%;padding:13px 16px;border-radius:14px;cursor:pointer;
               display:flex;align-items:center;gap:12px;margin-bottom:4px;
               background:${st.gateway && st.chave_configurada ? "linear-gradient(135deg,#075E54,#128C7E)" : "var(--bg)"};
               color:${st.gateway && st.chave_configurada ? "#fff" : "var(--ink-3)"};
               border:${st.gateway && st.chave_configurada ? "none" : "1.5px solid var(--line)"};
               box-shadow:${st.gateway && st.chave_configurada ? "0 4px 14px rgba(7,94,84,.3)" : "none"};
               opacity:${st.gateway && st.chave_configurada ? "1" : ".5"};transition:all .15s">
        <div style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.15);
             display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div style="text-align:left;flex:1">
          <div style="font-size:14px;font-weight:800">${st.grupo ? "Trocar grupo" : "Listar grupos e escolher"}</div>
          <div style="font-size:11.5px;opacity:.75">${st.gateway && st.chave_configurada ? "Busca no seu WhatsApp" : "Configure o gateway primeiro"}</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
      <div id="wa-grupos" style="margin-top:4px"></div>

      <!-- ── SEPARADOR ── -->
      <div style="display:flex;align-items:center;gap:10px;margin:20px 0 16px">
        <div style="flex:1;height:1px;background:var(--line)"></div>
        <span style="font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#128C7E">Seu número</span>
        <div style="flex:1;height:1px;background:var(--line)"></div>
      </div>

      <!-- ── CHIP DO NÚMERO (estilo contato salvo no celular) ── -->
      <div style="background:var(--bg);border-radius:18px;border:1.5px solid var(--line);overflow:hidden;
                  transition:border-color .15s" onclick="document.getElementById('wa-meunumero').focus()"
           id="wa-num-chip">
        <!-- topo do chip: avatar + nome -->
        <div style="display:flex;align-items:center;gap:14px;padding:16px 16px 12px">
          <div style="width:52px;height:52px;border-radius:50%;
               background:${st.meu_numero ? "linear-gradient(135deg,#25D366,#128C7E)" : "var(--line)"};
               display:flex;align-items:center;justify-content:center;flex-shrink:0;
               box-shadow:${st.meu_numero ? "0 3px 10px rgba(37,211,102,.3)" : "none"};
               transition:all .3s" id="wa-num-avatar">
            ${st.meu_numero ? `
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="26" height="26">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>` : `
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.8" width="26" height="26">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
              <line x1="12" y1="1" x2="12" y2="5"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            </svg>`}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:700;color:var(--ink-3);text-transform:uppercase;
                        letter-spacing:.06em;margin-bottom:3px">Responsável pelo grupo</div>
            <div id="wa-num-nome" style="font-size:15px;font-weight:800;color:var(--ink)">
              ${st.meu_numero ? (State.nome || "Jackson Tomelin") : "Não configurado"}
            </div>
          </div>
          <span id="wa-num-ico" style="font-size:22px">${st.meu_numero ? `<svg viewBox='0 0 24 24' fill='none' stroke='#16A34A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' width='18' height='18' ><polyline points='20 6 9 17 4 12'/></svg>` : `<svg viewBox='0 0 24 24' fill='none' stroke='var(--ink-3)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='20' height='20' ><line x1='12' y1='5' x2='12' y2='19'/><line x1="5" y1="12" x2="19" y2="12"/></svg>`}</span>
        </div>

        <!-- linha divisória -->
        <div style="height:1px;background:var(--line);margin:0 16px"></div>

        <!-- campo de número estilo app de contato -->
        <div style="padding:12px 16px 16px">
          <div style="font-size:10.5px;font-weight:700;color:#128C7E;text-transform:uppercase;
                      letter-spacing:.08em;margin-bottom:6px"><svg viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> WhatsApp (DDI+DDD+número)</div>
          <div style="display:flex;align-items:center;gap:10px">
            <!-- bandeira BR decorativa -->
            <div style="width:32px;height:32px;border-radius:8px;background:#009c3b;
                 display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden"><svg viewBox="0 0 30 20" width="30" height="20" style="border-radius:3px"><rect width="30" height="20" fill="#009c3b"/><polygon points="15,2 28,10 15,18 2,10" fill="#ffdf00"/><circle cx="15" cy="10" r="4.5" fill="#002776"/><text x="15" y="13.5" text-anchor="middle" font-size="4" fill="#fff" font-weight="bold">BR</text></svg></div>
            <input id="wa-meunumero" value="${st.meu_numero || ""}" placeholder="5547 9 9999-0000"
              style="flex:1;border:none;background:transparent;font-size:17px;font-weight:700;
                     color:var(--ink);padding:0;font-family:monospace;outline:none;min-width:0"
              oninput="this.value=this.value.replace(/[^0-9]/g,'');_previewNumeroWA(this.value)">
            <div id="wa-num-status" style="font-size:20px;flex-shrink:0">${st.meu_numero ? `<svg viewBox='0 0 24 24' fill='none' stroke='#16A34A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' width='18' height='18' ><polyline points='20 6 9 17 4 12'/></svg>` : ""}</div>
          </div>
          <div id="wa-num-preview" style="margin-top:6px;font-size:12.5px;
            color:${st.meu_numero ? "#128C7E" : "var(--ink-3)"}">
            ${st.meu_numero ? "✓ Somente você controla o sistema pelo grupo."
              : "Deixe em branco para qualquer membro do grupo usar."}
          </div>
        </div>
      </div>

      <!-- botão salvar número -->
      <button onclick="salvarNumeroWA()"
        style="margin-top:12px;width:100%;padding:13px 16px;border-radius:14px;
               background:linear-gradient(135deg,#075E54,#128C7E);color:#fff;
               font-weight:800;font-size:14px;border:none;cursor:pointer;
               display:flex;align-items:center;justify-content:center;gap:8px;
               box-shadow:0 4px 14px rgba(7,94,84,.3);transition:all .15s">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" width="18" height="18">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Salvar número
      </button>

    </div>
  </div>

  <!-- PASSO 3: WEBHOOK -->
  <div style="background:var(--card);border-radius:18px;border:1.5px solid var(--line);margin-bottom:14px;overflow:hidden">
    <div style="display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)">
      ${stepCircle(3, false)}
      <div>
        <div style="font-weight:800;font-size:15px;color:var(--ink)">Webhook — resposta imediata</div>
        <div style="font-size:12px;color:var(--ink-3)">Igual ao Sentinela — sem atraso, responde na hora</div>
      </div>
    </div>
    <div style="padding:16px 18px">
      <div style="padding:14px 16px;background:linear-gradient(135deg,rgba(37,211,102,.08),rgba(7,94,84,.05));border:2px solid rgba(37,211,102,.4);border-radius:14px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:800;color:#128C7E;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
          ⚡ URL por IP direto — igual ao Sentinela (recomendado)
        </div>
        <div style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.05);border-radius:10px;padding:10px 12px;margin-bottom:6px">
          <code style="flex:1;font-size:12.5px;color:var(--navy);font-weight:700;overflow-wrap:anywhere">http://189.126.105.8:8788/api/whatsapp/webhook</code>
          <button onclick="copiarTexto('http://189.126.105.8:8788/api/whatsapp/webhook')"
            style="background:#25D366;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;color:#fff;font-size:12px;font-weight:700;flex-shrink:0">
            Copiar
          </button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:12px;color:var(--ink-2)">Evento:</span>
          <span style="background:#25D366;color:#fff;font-size:12px;font-weight:800;padding:2px 10px;border-radius:8px">Mensagem recebida</span>
        </div>
        <div style="font-size:11.5px;color:var(--ink-3)">
          ⚠️ Apague o webhook antigo com a URL do domínio e cadastre este com o IP direto.
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:11px 13px;background:var(--bg);border:1px solid var(--line);border-radius:12px">
        <code style="flex:1;min-width:0;font-size:11.5px;color:var(--navy);overflow-wrap:anywhere">${webhookUrl}</code>
        <button onclick="copiarTexto('${webhookUrl}')" title="Copiar"
          style="width:32px;height:32px;border-radius:9px;background:#25D36618;border:none;cursor:pointer;
                 display:flex;align-items:center;justify-content:center;color:#128C7E;flex-shrink:0">
          ${icon("doc")}
        </button>
      </div>
    </div>
  </div>

  <!-- COMANDOS: CONSULTAS -->
  ${section("Consultas financeiras", "Digite qualquer um no grupo", WA_SVG, `
    ${cmdGrid([
      ["1 · saldo","Saldo de todas as contas"],
      ["2 · vencer","Atrasados + próx. 7 dias"],
      ["3 · resumo","Resultado do mês"],
      ["4 · pagar","Contas a pagar"],
      ["5 · receber","Contas a receber"],
      ["6 · patrimonio","Contas + veículos"],
      ["7 · juros","Juros no ano"],
      ["8 · metas","Metas financeiras"],
      ["9 · categorias","Lista de categorias"],
      ["10 · contas","Saldo por conta"],
      ["hoje","Resumo do dia"],
      ["semana","Movimentos da semana"],
      ["fluxo","Gráfico 6 meses"],
      ["gastos","Top categorias"],
      ["projecao","Saldo previsto"],
      ["proximo mes","Mês que vem"],
      ["parcelas","Parcelas de cartão"],
      ["carros","Veículos e fin."],
      ["dica","Dica personalizada"],
      ["menu","Lista de comandos"],
    ], "#128C7E")}`, "#25D366")}

  <!-- COMANDOS: AÇÕES -->
  ${section("Lançamentos e ações", "O sistema reage ao registrar", icon("edit"), `
    ${cmdGrid([
      ["despesa 150 mercado","Registra uma despesa"],
      ["receita 3000 salario","Registra uma receita"],
      ["baixa 42","Dá baixa no lançamento"],
      ["buscar aluguel","Busca lançamentos"],
      ["ultimo","Último lançamento"],
      ["aporte 500 reserva","Deposita numa meta"],
      ["nova conta Nubank","Cria conta bancária"],
      ["nova cat Pets","Cria categoria"],
      ["nf https://...","Consulta NF-e"],
      ["ajuda baixa","Ajuda de qualquer cmd"],
    ], "#075E54")}`, "#34B7F1")}

  <!-- COMANDOS: PDFs -->
  ${section("PDFs direto no grupo", "O arquivo chega como anexo no chat", icon("download"), `
    ${cmdGrid([
      ["recibo 42","Recibo #42 em PDF"],
      ["recibo cupom 42","Estilo impressora"],
      ["balancete","Balancete do mês"],
      ["balancete cupom","Balancete cupom"],
      ["patrimonio pdf","Patrimônio em PDF"],
    ], "#B4503E")}`, "#FF6B35")}

  <!-- API v1 (expansível) -->
  <div style="background:var(--card);border-radius:18px;border:1.5px solid var(--line);margin-bottom:14px;overflow:hidden">
    <div onclick="document.getElementById('wa-api-body').classList.toggle('hidden')"
         style="display:flex;align-items:center;gap:12px;padding:16px 18px;cursor:pointer">
      <div style="width:36px;height:36px;border-radius:10px;background:#075E5418;color:#075E54;display:flex;align-items:center;justify-content:center">${icon("terminal")}</div>
      <div style="flex:1">
        <div style="font-weight:800;font-size:15px;color:var(--ink)">API pública v1</div>
        <div style="font-size:12px;color:var(--ink-3)">16 endpoints · header X-API-Key · toque para expandir</div>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2" width="18" height="18"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div id="wa-api-body" class="hidden" style="padding:0 18px 18px">
      ${[
        ["GET","/api/v1/status","Conexão do WhatsApp"],
        ["POST","/api/v1/enviar","Enviar texto · {jid|numero, texto}"],
        ["POST","/api/v1/enviar-anexo","Enviar arquivo (PDF, imagem) · multipart"],
        ["GET","/api/v1/chats","Últimas 200 conversas"],
        ["GET","/api/v1/grupos","Todos os grupos · ?busca="],
        ["GET","/api/v1/mensagens","Mensagens de um chat · ?jid=&limite="],
        ["POST","/api/v1/send-image","Imagem por URL"],
        ["POST","/api/v1/send-document","Documento por URL"],
        ["POST","/api/v1/send-video","Vídeo por URL"],
        ["POST","/api/v1/send-audio","Áudio por URL"],
        ["POST","/api/v1/send-location","Localização · {lat,lng,nome}"],
        ["POST","/api/v1/send-contact","Cartão de contato"],
        ["POST","/api/v1/send-reaction","Reagir · {msgId, emoji}"],
        ["POST","/api/v1/reply","Responder citando · {msgId, texto}"],
        ["POST","/api/v1/delete-message","Apagar para todos · {msgId}"],
        ["POST","/api/v1/read-message","Marcar como lida"],
      ].map(([m,p,d])=>`
        <div style="display:flex;gap:10px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--line)">
          <span style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:6px;color:#fff;
            background:${m==="GET"?"#128C7E":"#075E54"};flex-shrink:0">${m}</span>
          <div style="min-width:0">
            <code style="font-size:12.5px;color:var(--ink);display:block;overflow-wrap:anywhere">${p}</code>
            <span style="font-size:11.5px;color:var(--ink-3)">${d}</span>
          </div>
        </div>`).join("")}
    </div>
  </div>

  <!-- AUTOMAÇÕES -->
  <div style="background:linear-gradient(135deg,#075E54,#128C7E);border-radius:18px;padding:18px 20px">
    <div style="font-size:13px;font-weight:800;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">Automações ativas</div>
    ${[
      ["Alerta diário",`Vencimentos às ${String(st.alerta_hora??8).padStart(2,"0")}:00 (só quando há algo pendente)`],
      ["Resumo semanal","Resumo semanal",st.resumo_semanal?"Todo dia segunda-feira":"Desativado"],
      ["Fechamento do dia",st.fechamento_diario?`Contas pagas do dia às ${String(st.fechamento_hora??20).padStart(2,"0")}:00`:"Desativado"],
      ["Escuta do grupo","Escuta do grupo","Lê e responde mensagens novas a cada 4 segundos"],
    ].map(([e,t,d])=>`
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.1)">
        <span style="font-size:20px;flex-shrink:0">${e}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:#fff">${t}</div>
          <div style="font-size:11.5px;color:rgba(255,255,255,.55)">${d}</div>
        </div>
      </div>`).join("")}
  </div>`;
}



async function rodarDiagnosticoWA() {
  const box = document.getElementById("wa-diag");
  if (!box) return;  // tela não está aberta
  box.innerHTML = `<div style="font-size:13px;color:var(--ink-3);padding:4px 0">Verificando…</div>`;
  let d;
  try { d = await api("/api/whatsapp/debug"); }
  catch (e) { box.innerHTML = `<div style="color:var(--red);font-size:13px">${e.message}</div>`; return; }

  const cor = r => /respondido/.test(r) ? "#25D366" : /erro|FALH/.test(r) ? "var(--red)" : "var(--ink-3)";
  const cfg = d.config || {};

  // ── CHECKLIST DE CONFIGURAÇÃO ──
  const checks = [
    [cfg.ativo,                        "Envio ativado",           cfg.ativo?"":"Ative no passo 1"],
    [!!cfg.url,                        "URL do gateway",          cfg.url||"não configurada"],
    [cfg.chave_configurada,            "Chave de API",            cfg.chave_configurada?"configurada":"não configurada"],
    [!!(cfg.grupo&&cfg.grupo.includes("@g.us")), "Grupo definido",cfg.grupo||"escolha no passo 2"],
    [!!cfg.meu_numero,                 "Seu número",              cfg.meu_numero||"qualquer membro pode usar"],
  ];

  // ── URL DO WEBHOOK ──
  const hookUrl = (d.config && d.config.tunnel_url) || "http://189.126.105.8:8788/api/whatsapp/webhook";
  const hookUrlAlt = location.origin + "/api/whatsapp/webhook";
  const hookDbg  = location.origin + "/api/whatsapp/webhook/debug";

  box.innerHTML = `
    <!-- checklist -->
    <div style="margin-bottom:12px">
      ${checks.map(([ok,nome,det])=>`
        <div style="display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--line)">
          <span style="flex-shrink:0">${ok ? `<svg viewBox='0 0 24 24' fill='none' stroke='#16A34A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' width='18' height='18' ><polyline points='20 6 9 17 4 12'/></svg>` : `<svg viewBox='0 0 24 24' fill='none' stroke='#DC2626' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' width='18' height='18' ><line x1='18' y1='6' x2='6' y2='18'/><line x1="6" y1="6" x2="18" y2="18"/></svg>`}</span>
          <div style="min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--ink)">${nome}</div>
            ${det?`<div style="font-size:11.5px;color:var(--ink-3);overflow-wrap:anywhere">${det}</div>`:""}
          </div>
        </div>`).join("")}
    </div>

    <!-- URL do webhook -->
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:8px">
      ⚡ URL do webhook — cadastre no gateway
    </div>
    <div style="padding:14px;background:linear-gradient(135deg,rgba(37,211,102,.08),rgba(7,94,84,.05));border:2px solid rgba(37,211,102,.4);border-radius:14px;margin-bottom:10px">
      <div style="font-size:11px;color:#128C7E;font-weight:700;margin-bottom:6px">
        zap.unicontroller.com.br → Webhooks → Adicionar
      </div>
      <div style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.04);border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <code id="wa-hook-url" style="flex:1;font-size:12px;color:var(--navy);overflow-wrap:anywhere;font-weight:700">${hookUrl}</code>
        <button onclick="copiarTexto('${hookUrl}')"
          style="background:#25D366;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;color:#fff;flex-shrink:0;font-size:12px;font-weight:700">
          Copiar
        </button>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;color:var(--ink-2)">Evento:</span>
        <span style="font-size:12px;font-weight:800;background:#25D366;color:#fff;padding:2px 10px;border-radius:8px">Mensagem recebida</span>
        <span style="font-size:12px;color:var(--ink-3)">— só este, uma vez</span>
      </div>
    </div>

    <!-- payloads recebidos -->
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:6px">
      Payloads recebidos do gateway (últimos ${(d.ultimos_payloads||[]).length})
    </div>
    ${(d.ultimos_payloads||[]).length === 0 ? `
      <div style="padding:14px;background:rgba(255,193,7,.08);border:1.5px solid rgba(255,193,7,.3);border-radius:12px;margin-bottom:10px">
        <div style="font-size:13px;font-weight:700;color:#8A6A1A;margin-bottom:8px">⚠️ Gateway não está chamando o webhook</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;gap:8px;align-items:flex-start">
            <span style="width:20px;height:20px;border-radius:50%;background:#C9A94E;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">1</span>
            <span style="font-size:12.5px;color:var(--ink-2)">Acesse <b>zap.unicontroller.com.br</b> → <b>Webhooks</b> → <b>Adicionar</b></span>
          </div>
          <div style="display:flex;gap:8px;align-items:flex-start">
            <span style="width:20px;height:20px;border-radius:50%;background:#C9A94E;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">2</span>
            <span style="font-size:12.5px;color:var(--ink-2)">Cole a URL acima e selecione evento <b>Mensagem recebida</b></span>
          </div>
          <div style="display:flex;gap:8px;align-items:flex-start">
            <span style="width:20px;height:20px;border-radius:50%;background:#C9A94E;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">3</span>
            <span style="font-size:12.5px;color:var(--ink-2)">Mande <b>menu</b> no grupo e toque em <b>Verificar</b> aqui</span>
          </div>
        </div>
      </div>` : `
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--line);border-radius:12px;margin-bottom:10px">
        ${(d.ultimos_payloads||[]).map(p=>`
          <div style="padding:10px 12px;border-bottom:1px solid var(--line)">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:11px;color:var(--ink-3)">${p.hora}</span>
              <span style="font-size:11px;background:#25D36620;color:#128C7E;padding:1px 6px;border-radius:6px">recebido</span>
            </div>
            <pre style="font-size:11px;color:var(--ink);margin:0;overflow-x:auto;white-space:pre-wrap;word-break:break-all">${JSON.stringify(p.payload,null,2).replace(/</g,"&lt;")}</pre>
          </div>`).join("")}
      </div>`}

    <!-- eventos processados -->
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:6px">
      Comandos processados (últimos ${(d.ultimos_eventos||[]).length})
    </div>
    ${(d.ultimos_eventos||[]).length === 0 ? `
      <div style="font-size:12.5px;color:var(--ink-3);padding:10px 0">
        Nenhum comando processado. Mande <b>menu</b> no grupo depois de configurar o webhook.
      </div>` :
      (d.ultimos_eventos||[]).slice(0,10).map(e=>`
        <div style="display:flex;gap:8px;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--line)">
          <code style="font-size:12px;color:var(--navy);flex:1;overflow-wrap:anywhere">${(e.texto||"").replace(/</g,"&lt;")}</code>
          <span style="font-size:11px;color:${cor(e.resultado)};flex-shrink:0">${e.resultado}</span>
          <span style="font-size:10px;color:var(--ink-3);flex-shrink:0">${e.hora}</span>
        </div>`).join("")}

    <!-- URL debug -->
    <div style="margin-top:12px;padding:10px 12px;background:var(--bg);border-radius:10px;border:1px solid var(--line)">
      <div style="font-size:11px;color:var(--ink-3);margin-bottom:3px">URL alternativa para testar o webhook:</div>
      <code style="font-size:11px;color:var(--ink-2);overflow-wrap:anywhere">${hookDbg}</code>
    </div>`;
}

async function salvarGatewayWA() {
  const dados = {
    WHATSAPP_API_URL: (document.getElementById("wa-url")?.value || "").trim(),
    WHATSAPP_ATIVO: document.getElementById("wa-ativo")?.checked ? "true" : "false",
    WHATSAPP_ENDPOINT_ENVIAR: "/api/v1/enviar",
  };
  const chave = (document.getElementById("wa-chave")?.value || "").trim();
  if (chave) dados.WHATSAPP_API_TOKEN = chave;
  try {
    await api("/api/configuracoes", { method: "POST", body: JSON.stringify(dados) });
    const st = await api("/api/whatsapp/status");
    if (st.erro_gateway) toast(st.erro_gateway, "err");
    else toast(st.conectado ? "Gateway conectado!" : "Salvo — WhatsApp desconectado no gateway", st.conectado ? "ok" : "err");
    setView("whatsapp");
  } catch (e) { toast(e.message, "err"); }
}

async function carregarGruposWA() {
  const box = document.getElementById("wa-grupos");
  if (!box) { toast("Abra a tela WhatsApp primeiro.", "err"); return; }
  box.innerHTML = `<div style="padding:12px 0;text-align:center;color:var(--ink-3);font-size:13px">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"
         style="animation:spin 1s linear infinite;vertical-align:middle">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg> Buscando grupos…
  </div>`;

  const r = await api("/api/whatsapp/grupos");
  if (!r.ok || !r.grupos?.length) {
    box.innerHTML = `<div style="padding:12px;background:rgba(180,80,62,.06);border-radius:12px;font-size:13px;color:var(--red)">
      ${r.erro || "Nenhum grupo encontrado. Verifique a conexão com o gateway."}</div>`;
    return;
  }

  // paleta de avatares para os grupos
  const cores = ["#075E54","#128C7E","#25D366","#34B7F1","#9E62AE","#E65C6E","#F47A3A","#3B7DD8"];
  const ini = (nome) => (nome || "G").replace(/[^a-zA-ZÀ-ú0-9]/g,"").slice(0,2).toUpperCase();

  box.innerHTML = `
    <div style="margin-top:8px">
      <div style="position:relative;margin-bottom:8px">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2"
             width="16" height="16" style="position:absolute;left:12px;top:50%;transform:translateY(-50%)">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input placeholder="Filtrar grupos…" oninput="filtrarGruposWA(this.value)"
          style="width:100%;padding:10px 12px 10px 36px;border:1.5px solid var(--line);
                 border-radius:12px;background:var(--bg);font-size:13.5px;box-sizing:border-box">
      </div>
      <div id="wa-lista-grupos" style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto">
        ${r.grupos.map((g, i) => {
          const cor = cores[i % cores.length];
          const sigla = ini(g.nome);
          return `<div class="wa-grupo" data-nome="${(g.nome||"").toLowerCase()}"
            onclick="escolherGrupoWA('${g.jid}')"
            style="display:flex;align-items:center;gap:12px;padding:12px 14px;
                   background:var(--bg);border:1.5px solid var(--line);border-radius:14px;
                   cursor:pointer;transition:all .15s"
            onmouseover="this.style.borderColor='#25D366';this.style.background='rgba(37,211,102,.04)'"
            onmouseout="this.style.borderColor='var(--line)';this.style.background='var(--bg)'">
            <div style="width:44px;height:44px;border-radius:14px;background:${cor};
                 display:flex;align-items:center;justify-content:center;flex-shrink:0;
                 box-shadow:0 2px 8px ${cor}44;position:relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="1.8" width="22" height="22">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14px;color:var(--ink);
                          overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.nome || "(sem nome)"}</div>
              <div style="font-size:11px;color:var(--ink-3);font-family:monospace;margin-top:2px;
                          overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.jid}</div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" stroke-width="2.5" width="18" height="18">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>`;
        }).join("")}
      </div>
    </div>`;
}

function filtrarGruposWA(q) {
  q = (q || "").toLowerCase();
  document.querySelectorAll(".wa-grupo").forEach(el =>
    el.style.display = el.dataset.nome.includes(q) ? "" : "none");
}

async function escolherGrupoWA(jid) {
  try {
    await api("/api/whatsapp/grupo", { method: "POST", body: JSON.stringify({ jid }) });
    toast("Grupo definido!", "ok");
    setView("whatsapp");
  } catch (e) { toast(e.message, "err"); }
}

function copiarTexto(t) {
  (navigator.clipboard?.writeText(t) || Promise.reject())
    .then(() => toast("URL copiada!", "ok"))
    .catch(() => { prompt("Copie a URL:", t); });
}

function _previewNumeroWA(v) {
  const el = document.getElementById("wa-num-preview");
  const ico = document.getElementById("wa-num-ico");
  const st2 = document.getElementById("wa-num-status");
  const nome = document.getElementById("wa-num-nome");
  const avatar = document.getElementById("wa-num-avatar");
  const d = v.replace(/\D/g, "");

  let fmt = d ? "+" + d : "";
  if (d.length >= 2)  fmt = "+" + d.slice(0,2) + " " + d.slice(2);
  if (d.length >= 4)  fmt = "+" + d.slice(0,2) + " " + d.slice(2,4) + " " + d.slice(4);
  if (d.length >= 9)  fmt = "+" + d.slice(0,2) + " " + d.slice(2,4) + " " + d.slice(4,9) + "-" + d.slice(9);
  const completo = d.length >= 10;

  if (el) {
    el.textContent = !d ? "Deixe em branco para qualquer membro do grupo usar."
      : completo ? "✓ Somente você controla o sistema pelo grupo."
      : fmt + "…";
    el.style.color = completo ? "#128C7E" : "var(--ink-3)";
  }
  if (st2) st2.innerHTML = completo ? `<svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>` : "";
  if (ico) ico.innerHTML = completo ? `<svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>` : `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  if (nome) nome.textContent = completo ? (State.nome || "Jackson Tomelin") : "Não configurado";
  if (avatar && avatar.style !== undefined) {
    avatar.style.background = completo
      ? "linear-gradient(135deg,#25D366,#128C7E)"
      : "var(--line)";
    avatar.style.boxShadow = completo ? "0 3px 10px rgba(37,211,102,.3)" : "none";
    avatar.innerHTML = completo
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="26" height="26">
           <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
           <circle cx="12" cy="7" r="4"/>
         </svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.8" width="26" height="26">
           <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
           <circle cx="12" cy="7" r="4"/>
           <line x1="12" y1="1" x2="12" y2="5"/>
           <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
         </svg>`;
  }
}

async function salvarNumeroWA() {
  const n = (document.getElementById("wa-meunumero")?.value || "").replace(/\D/g, "").trim();
  try {
    await api("/api/configuracoes", { method: "POST", body: JSON.stringify({ WHATSAPP_MEU_NUMERO: n }) });
    toast(n ? `Número ${n} salvo` : "Filtro removido.", "ok");
    rodarDiagnosticoWA();
  } catch (e) { toast(e.message, "err"); }
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
        <button class="btn btn-ghost btn-sm" onclick="excluirVeiculo(${x.id})"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='15' height='15'><polyline points='3 6 5 6 21 6'/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
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
      <div class="modal-h"><span class="card-ico i-navy">${icon("car")}</span><h3>${x ? "Editar veículo" : "Novo veículo"}</h3><button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
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
      <button class="btn-icon" onclick="EXTRAS.splice(${i},1);renderExtras()"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='15' height='15'><polyline points='3 6 5 6 21 6'/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
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

  const resPos = bal.resultado >= 0;
  const deLabel = PERIODO.de ? dataBR(PERIODO.de) : "";
  const ateLabel = PERIODO.ate ? dataBR(PERIODO.ate) : "";

  const clicavel = `cursor:pointer;transition:all .15s;user-select:none`;
  const hoverEfect = `onmouseover="this.style.transform='scale(1.01)';this.style.boxShadow='0 4px 16px rgba(8,45,81,.12)'" onmouseout="this.style.transform='';this.style.boxShadow=''"`;

  // linha de categoria clicável — filtra o extrato por categoria
  const linhaCat = (arr, total, cor, tipo) => {
    if (!arr?.length) return `<div class="meta" style="padding:12px 0">Sem lançamentos no período.</div>`;
    return arr.map(([nome, val]) => {
      const pct = total ? Math.round(val / total * 100) : 0;
      const cat = State.cats.find(c => c.nome === nome);
      const catId = cat?.id || "";
      return `<div style="margin-bottom:12px;${clicavel};padding:8px;border-radius:10px;margin-left:-8px;margin-right:-8px"
        ${hoverEfect}
        onclick="FILTRO.cat=${catId};FILTRO.status='';window._tipoFixo='${tipo}';setView('${tipo === "receita" ? "receber" : "pagar"}')"
        title="Ver lançamentos de ${nome}">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;align-items:center">
          <span style="font-size:13.5px;color:var(--ink);font-weight:600">${nome}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="mono-num" style="font-size:13.5px;font-weight:700">${money(val)}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
        <div style="background:var(--bg);border-radius:4px;height:5px">
          <div style="background:${cor};width:${pct}%;height:100%;border-radius:4px;transition:width .4s"></div>
        </div>
        <div class="sub" style="margin-top:2px;font-size:11px">${pct}% do total · toque para ver os lançamentos</div>
      </div>`;
    }).join("");
  };

  v.innerHTML = `
    <!-- Filtro de período -->
    <div class="card card-pad" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="card-ico i-navy">${icon("calendar")}</span>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;flex:1">
          <div class="campo" style="margin:0;min-width:130px">
            <label>De</label>
            <input type="date" id="r-de" value="${PERIODO.de}">
          </div>
          <div class="campo" style="margin:0;min-width:130px">
            <label>Até</label>
            <input type="date" id="r-ate" value="${PERIODO.ate}">
          </div>
          <button class="btn btn-primary" onclick="aplicarPeriodo()">${icon("filter")}Aplicar</button>
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
        <button class="btn btn-ghost btn-sm" onclick="abrirPDF('/api/relatorios/balancete.pdf?de=${PERIODO.de}&ate=${PERIODO.ate}')">${icon("download")}Balancete PDF</button>
        <button class="btn btn-ghost btn-sm" onclick="abrirPDF('/api/relatorios/balancete.pdf?de=${PERIODO.de}&ate=${PERIODO.ate}&estilo=matricial')">${icon("terminal")}Cupom</button>
        <button class="btn btn-ghost btn-sm" onclick="abrirPDF('/api/relatorios/patrimonio.pdf')">${icon("download")}Patrimônio PDF</button>
      </div>
    </div>

    <!-- KPIs clicáveis -->
    <div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi ${resPos ? "green" : "red"}" style="${clicavel}" ${hoverEfect}
           onclick="setView('lancamentos')" title="Ver todos os lançamentos do período">
        <div class="lab"><span class="i i-${resPos ? "green" : "red"}">${icon(resPos ? "trendUp" : "arrowUp")}</span>Resultado</div>
        <div class="val mono-num">${money(bal.resultado)}</div>
        <div class="meta">${deLabel} → ${ateLabel}</div>
      </div>
      <div class="kpi navy" style="${clicavel}" ${hoverEfect}
           onclick="setView('veiculos')" title="Ver patrimônio detalhado">
        <div class="lab"><span class="i i-navy">${icon("wallet")}</span>Patrimônio líquido</div>
        <div class="val mono-num">${money(pat.patrimonio_liquido)}</div>
        <div class="meta">contas + veículos − dívidas</div>
      </div>
      <div class="kpi gold" style="${clicavel}" ${hoverEfect}
           onclick="setView('pagar')" title="Ver lançamentos com juros">
        <div class="lab"><span class="i i-gold">${icon("alert")}</span>Juros no ano</div>
        <div class="val mono-num">${money(jur.juros_pago_ano)}</div>
        <div class="meta">a pagar: ${money(jur.juros_a_pagar)}</div>
      </div>
    </div>

    <!-- Receitas clicáveis por categoria -->
    <div class="card card-pad" style="margin-bottom:14px">
      <div class="card-h" style="margin-bottom:14px;${clicavel}" ${hoverEfect} onclick="setView('receber')">
        <span class="card-ico i-green">${icon("trendUp")}</span>
        <div class="grow">
          <h3 style="color:var(--teal)">Receitas do período</h3>
          <div class="sub">Total: <b class="mono-num">${money(bal.total_receitas)}</b> · toque para ver todas</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      ${linhaCat(bal.receitas, bal.total_receitas, "var(--teal)", "receita")}
    </div>

    <!-- Despesas clicáveis por categoria -->
    <div class="card card-pad" style="margin-bottom:14px">
      <div class="card-h" style="margin-bottom:14px;${clicavel}" ${hoverEfect} onclick="setView('pagar')">
        <span class="card-ico i-gold">${icon("arrowUp")}</span>
        <div class="grow">
          <h3 style="color:var(--gold-2)">Despesas do período</h3>
          <div class="sub">Total: <b class="mono-num">${money(bal.total_despesas)}</b> · toque para ver todas</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      ${linhaCat(bal.despesas, bal.total_despesas, "var(--gold)", "despesa")}
    </div>

    <!-- Projeção -->
    <div class="card card-pad" style="margin-bottom:14px">
      <div class="card-h">
        <span class="card-ico i-navy">${icon("trendUp")}</span>
        <div class="grow">
          <h3>Projeção — próximos 6 meses</h3>
          <div class="sub">Saldo projetado: <b>${money(proj[proj.length - 1]?.saldo || 0)}</b></div>
        </div>
      </div>
      <div style="overflow-x:auto;margin-top:8px">${barChart(proj)}</div>
    </div>

    <!-- Patrimônio — cada linha clicável -->
    <div class="card card-pad" style="margin-bottom:14px">
      <div class="card-h" style="margin-bottom:16px">
        <span class="card-ico i-navy">${icon("shield")}</span>
        <div class="grow"><h3>Patrimônio detalhado</h3></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;
             background:var(--bg);border-radius:12px;${clicavel}" ${hoverEfect}
             onclick="setView('contas')" title="Ver contas e carteiras">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="card-ico i-navy" style="width:32px;height:32px;border-radius:9px">${icon("bank")}</span>
            <div>
              <div style="font-size:13.5px;color:var(--ink);font-weight:600">Contas e aplicações</div>
              <div class="sub" style="font-size:11px">Toque para ver as contas</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="mono-num" style="font-weight:700">${money(pat.total_contas)}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;
             background:var(--bg);border-radius:12px;${clicavel}" ${hoverEfect}
             onclick="setView('veiculos')" title="Ver veículos">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="card-ico i-green" style="width:32px;height:32px;border-radius:9px">${icon("car")}</span>
            <div>
              <div style="font-size:13.5px;color:var(--ink);font-weight:600">Veículos</div>
              <div class="sub" style="font-size:11px">Toque para ver os veículos</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="mono-num" style="font-weight:700">${money(pat.total_veiculos)}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>

        ${pat.total_financiamentos > 0 ? `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;
             background:rgba(180,80,62,.06);border-radius:12px;${clicavel}" ${hoverEfect}
             onclick="setView('veiculos')" title="Ver financiamentos">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="card-ico i-red" style="width:32px;height:32px;border-radius:9px">${icon("alert")}</span>
            <div>
              <div style="font-size:13.5px;color:var(--ink);font-weight:600">Financiamentos</div>
              <div class="sub" style="font-size:11px">Toque para ver os financiamentos</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="mono-num val-desp" style="font-weight:700">− ${money(pat.total_financiamentos)}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>` : ""}

        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;
             background:linear-gradient(135deg,var(--navy),var(--navy-2));border-radius:14px;margin-top:4px;
             ${clicavel}" ${hoverEfect} onclick="abrirPDF('/api/relatorios/patrimonio.pdf')"
             title="Baixar PDF do patrimônio">
          <span style="font-size:14px;font-weight:700;color:#fff">Patrimônio líquido</span>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="mono-num" style="font-size:20px;font-weight:800;color:#fff">${money(pat.patrimonio_liquido)}</span>
            <svg viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,.6)' stroke-width='2' width='16' height='16'>${P.download||""}</svg>
          </div>
        </div>
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
    return `<div class="login-last"> Último acesso: ${data} às ${hora} (${quando})${ip}</div>`;
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
      <div class="meta"> As configurações são salvas no banco de dados e valem imediatamente — sem reiniciar o sistema. Variáveis de ambiente no Coolify servem de fallback caso uma chave não esteja salva aqui.</div>
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
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button>
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
            <option value="membro" ${e.papel!=="admin"?"selected":""}>Membro</option>
            <option value="admin"  ${e.papel==="admin" ?"selected":""}>Admin</option>
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
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button>
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
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b">
        <div class="dica azul" style="margin-bottom:16px">
          <span style="flex-shrink:0;width:20px;height:20px;display:flex;margin-top:1px">${icon("alert")}</span>
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
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
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
      <span style="flex-shrink:0;width:20px;height:20px;display:flex;margin-top:1px">${icon("checkCircle")}</span>
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
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button>
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
          <td><button class="btn-icon" style="padding:4px" onclick="_removerItem(${idx})"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='15' height='15'><polyline points='3 6 5 6 21 6'/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button></td>
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
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
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
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
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
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
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


/* Ripple effect em todos os .btn */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn");
  if (!btn || btn.classList.contains("btn-icon") || btn.classList.contains("btn-ghost")) return;
  const r = document.createElement("span");
  r.className = "ripple";
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 1.5;
  r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
  btn.appendChild(r);
  r.addEventListener("animationend", () => r.remove());
});

window.addEventListener("error", (e) => {
  if (e.message && e.message.includes("innerHTML")) {
    console.error("NULL innerHTML em:", e.filename, "linha:", e.lineno, "col:", e.colno, e.error?.stack?.split("\n")[1]);
    const box = document.getElementById("wa-diag") || document.getElementById("view");
    if (box) box.innerHTML = `<div style="padding:20px;color:var(--red)">Erro JS: ${e.message} (linha ${e.lineno})</div>`;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharModal();
});
// expõe funções usadas por onclick inline

/* ============================================================
   METAS FINANCEIRAS — funções que precisam ser definidas
   ============================================================ */
const METAS_ICONES = ["🎯","🏠","🚗","✈️","📱","💻","🎓","💰","🏖️","👶","🏋️","🎸","📚","🩺","💍"];
const METAS_CORES  = ["#082D51","#2F817A","#C9A94E","#B4503E","#6B3FA0","#D9772E","#1E5FA8","#3B6D11","#C74B4B","#305C74"];
let _metaFormCor = "#082D51";
let _metaFormIcone = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--navy)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
const _CACHE_METAS = {};

async function viewMetas(v) {
  const metas = await api("/api/metas");
  const ativas = metas.filter(m => !m.concluida);
  const concluidas = metas.filter(m => m.concluida);
  const totalAlvo = ativas.reduce((s,m) => s + m.valor_alvo, 0);
  const totalAtual = ativas.reduce((s,m) => s + m.valor_atual, 0);
  v.innerHTML = `
    <div class="toolbar">
      <div><h2 style="margin:0;color:var(--navy)">Metas financeiras</h2>
        <div class="sub">Objetivos e reservas de dinheiro</div></div>
      <div class="grow"></div>
      <button class="btn btn-primary" onclick="formMeta(null)">${icon("plus")}Nova meta</button>
    </div>
    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi navy" style="cursor:pointer" onclick="formMeta(null)" title="Nova meta"><div class="lab"><span class="i i-navy">${icon("star")}</span>Metas ativas</div>
        <div class="val mono-num">${ativas.length}</div><div class="meta">${money(totalAlvo)} no total · + nova</div></div>
      <div class="kpi green"><div class="lab"><span class="i i-green">${icon("trendUp")}</span>Guardado</div>
        <div class="val mono-num">${money(totalAtual)}</div>
        <div class="meta">${totalAlvo ? Math.round(totalAtual/totalAlvo*100) : 0}% do objetivo</div></div>
      <div class="kpi gold"><div class="lab"><span class="i i-gold">${icon("checkCircle")}</span>Concluídas</div>
        <div class="val mono-num">${concluidas.length}</div><div class="meta">Objetivos alcançados</div></div>
    </div>
    ${metas.length === 0 ? `
      <div class="empty" style="padding:60px 20px">
        ${icon("star")}<p>Nenhuma meta ainda.</p>
        <button class="btn btn-primary" style="margin-top:20px" onclick="formMeta(null)">${icon("plus")}Criar primeira meta</button>
      </div>` : `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px">
        ${[...ativas,...concluidas].map(m => _cardMeta(m)).join("")}
      </div>`}`;
}

function _cardMeta(m) {
  const pct = m.progresso_pct;
  const dias = m.prazo ? Math.ceil((new Date(m.prazo) - new Date()) / 86400000) : null;
  const prazoStr = m.prazo ? (dias < 0 ? `Prazo vencido há ${Math.abs(dias)}d` : dias === 0 ? "Prazo hoje!" : `${dias} dias restantes`) : "Sem prazo";
  const prazoClass = dias !== null && dias <= 30 && !m.concluida ? "color:var(--red)" : "color:var(--ink-2)";
  return `<div class="card card-pad${m.concluida ? " op-6" : ""}" style="position:relative;cursor:pointer;transition:all .15s" onclick="_editarMeta(${m.id})" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(8,45,81,.12)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
    ${m.concluida ? `<div style="position:absolute;top:10px;right:10px"><span class="tag pago">Concluída ✓</span></div>` : ""}
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <div style="width:48px;height:48px;border-radius:14px;background:${m.cor}20;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">${m.icone}</div>
      <div><div style="font-weight:700;color:var(--ink)">${m.nome}</div>
        ${m.descricao ? `<div class="sub">${m.descricao}</div>` : ""}</div>
    </div>
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span class="sub">${money(m.valor_atual)} guardados</span>
        <span class="mono-num" style="font-size:12px;font-weight:700;color:${m.cor}">${pct.toFixed(0)}%</span>
      </div>
      <div style="background:var(--bg);border-radius:6px;height:10px;overflow:hidden">
        <div style="background:${m.cor};height:100%;width:${pct}%;transition:width .4s;border-radius:6px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:5px">
        <span class="sub" style="${prazoClass}">${prazoStr}</span>
        <span class="sub">Falta ${money(m.falta)}</span>
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:8px">
      ${!m.concluida ? `<button class="btn btn-primary btn-sm" onclick="formAporte(${m.id},'${m.nome.replace(/'/g,"\\'")}')">${icon("plus")}Aportar</button>` : ""}
      <button class="btn btn-ghost btn-sm" onclick="_editarMeta(${m.id})">${icon("edit")}</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="excluirMeta(${m.id})"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='15' height='15'><polyline points='3 6 5 6 21 6'/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
    </div>
  </div>`;
}

function formMeta(m) {
  _metaFormCor = m?.cor || "#082D51";
  _metaFormIcone = m?.icone || `<svg viewBox="0 0 24 24" fill="none" stroke="var(--navy)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;
  if (m) _CACHE_METAS[m.id] = m;
  abrirModal(`
    <div class="modal" style="max-width:500px">
      <div class="modal-h"><span class="card-ico i-gold">${icon("star")}</span>
        <h3>${m ? "Editar meta" : "Nova meta financeira"}</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b"><div class="frm">
        <div class="campo full" style="text-align:center">
          <div id="meta-prev" style="width:64px;height:64px;border-radius:18px;background:${_metaFormCor}20;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 8px">${_metaFormIcone}</div>
        </div>
        <div class="campo full"><label>Ícone</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:2px">
            ${METAS_ICONES.map(ic => `<div onclick="_setMetaIcone('${ic}')" style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;border:2px solid ${ic===_metaFormIcone?'var(--navy)':'var(--line)'};background:${ic===_metaFormIcone?'var(--bg)':'transparent'}">${ic}</div>`).join("")}
          </div></div>
        <div class="campo full"><label>Cor</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:2px">
            ${METAS_CORES.map(c => `<div onclick="_setMetaCor('${c}')" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c===_metaFormCor?'var(--navy)':'transparent'};outline:2px solid ${c===_metaFormCor?c:'transparent'}"></div>`).join("")}
          </div></div>
        <div class="campo full"><label>Nome da meta</label>
          <input id="mt-nome" value="${m?.nome||''}" placeholder="Ex.: Reserva de emergência, Viagem..."></div>
        <div class="campo full"><label>Descrição (opcional)</label>
          <input id="mt-desc" value="${m?.descricao||''}" placeholder="Detalhes adicionais"></div>
        <div class="campo"><label>Valor alvo (R$)</label>
          <input id="mt-alvo" type="number" step="0.01" value="${m?.valor_alvo||''}"></div>
        <div class="campo"><label>Já guardado (R$)</label>
          <input id="mt-atual" type="number" step="0.01" value="${m?.valor_atual||0}"></div>
        <div class="campo full"><label>Prazo (opcional)</label>
          <input id="mt-prazo" type="date" value="${m?.prazo||''}"></div>
      </div></div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">${icon("x")} Cancelar</button>
        <button class="btn btn-primary" onclick="salvarMeta(${m?m.id:'null'})">${icon("check")} Salvar meta</button>
      </div>
    </div>`, "lg");
}

function _editarMeta(id) {
  const m = _CACHE_METAS[id];
  if (m) { formMeta(m); return; }
  api("/api/metas").then(ms => { const f = ms.find(x=>x.id===id); if(f){_CACHE_METAS[id]=f;formMeta(f);} });
}

function _setMetaIcone(ic) {
  _metaFormIcone = ic;
  document.querySelectorAll("[onclick^='_setMetaIcone']").forEach(el => {
    const isThis = el.textContent.trim() === ic;
    el.style.border = `2px solid ${isThis ? "var(--navy)" : "var(--line)"}`;
    el.style.background = isThis ? "var(--bg)" : "transparent";
  });
  const p = document.getElementById("meta-prev"); if(p) p.textContent = ic;
}

function _setMetaCor(cor) {
  _metaFormCor = cor;
  document.querySelectorAll("[onclick^='_setMetaCor']").forEach(el => {
    const bg = el.style.backgroundColor || el.style.background;
    el.style.border = `3px solid ${el.getAttribute("onclick")?.includes(cor) ? "var(--navy)" : "transparent"}`;
  });
  const p = document.getElementById("meta-prev"); if(p) p.style.background = cor + "20";
}

async function salvarMeta(id) {
  const body = {
    nome: document.getElementById("mt-nome").value.trim(),
    descricao: document.getElementById("mt-desc").value.trim() || null,
    valor_alvo: parseFloat(document.getElementById("mt-alvo").value || "0"),
    valor_atual: parseFloat(document.getElementById("mt-atual").value || "0"),
    prazo: document.getElementById("mt-prazo").value || null,
    cor: _metaFormCor, icone: _metaFormIcone,
  };
  if (!body.nome || !body.valor_alvo) { toast("Nome e valor alvo são obrigatórios.", "err"); return; }
  try {
    if (id) await api(`/api/metas/${id}`, {method:"PUT", body:JSON.stringify(body)});
    else     await api("/api/metas",       {method:"POST",body:JSON.stringify(body)});
    fecharModal(); toast("Meta salva!", "ok"); setView("metas");
  } catch(e) { toast(e.message, "err"); }
}

function formAporte(id, nome) {
  abrirModal(`
    <div class="modal" style="max-width:360px">
      <div class="modal-h"><span class="card-ico i-green">${icon("plus")}</span>
        <h3>Aportar na meta</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b">
        <p style="color:var(--ink-2);margin-bottom:16px">Quanto você guardou para <b>${nome}</b>?</p>
        <div class="campo full"><label>Valor do aporte (R$)</label>
          <input id="ap-valor" type="number" step="0.01" min="0.01" placeholder="0,00" autofocus></div>
      </div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">${icon("x")} Cancelar</button>
        <button class="btn btn-green" onclick="confirmarAporte(${id})">${icon("check")} Aportar</button>
      </div>
    </div>`);
}

async function confirmarAporte(id) {
  const v = parseFloat(document.getElementById("ap-valor").value || "0");
  if (!v || v <= 0) { toast("Informe um valor positivo.", "err"); return; }
  try {
    await api(`/api/metas/${id}/aporte`, {method:"POST", body:JSON.stringify({valor:v})});
    fecharModal(); toast("Aporte registrado!", "ok"); setView("metas");
  } catch(e) { toast(e.message, "err"); }
}

async function excluirMeta(id) {
  if (!confirm("Excluir esta meta permanentemente?")) return;
  try { await api(`/api/metas/${id}`, {method:"DELETE"}); toast("Meta excluída", "ok"); setView("metas"); }
  catch(e) { toast(e.message, "err"); }
}

/* ============================================================
   BUSCA GLOBAL
   ============================================================ */
async function buscaGlobal(q) {
  if (!q || q.length < 2) { fecharBusca(); return; }
  try {
    const [lancs, conts] = await Promise.all([
      api(`/api/lancamentos?busca=${encodeURIComponent(q)}&limite=6`),
      api("/api/contatos").then(cs => cs.filter(c => c.nome.toLowerCase().includes(q.toLowerCase())).slice(0,3)),
    ]);
    const res = [...lancs.map(l => ({tipo:"lanc",l})), ...conts.map(c => ({tipo:"cont",c}))];
    let box = document.getElementById("busca-box");
    if (!box) return;
    if (!res.length) {
      box.innerHTML = `<div style="padding:12px 16px;color:var(--ink-2);font-size:13px">Nenhum resultado.</div>`;
      box.style.display = "block"; return;
    }
    box.innerHTML = res.map(r => {
      if (r.tipo === "lanc") {
        const l = r.l;
        return `<div class="busca-item" onclick="setView('lancamentos');fecharBusca()">
          <span style="font-size:16px">${l.tipo==="receita" ? `<svg viewBox='0 0 24 24' fill='none' stroke='#15803D' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' width='22' height='22' ><line x1='12' y1='5' x2='12' y2='19'/><polyline points="19 12 12 19 5 12"/></svg>` : `<svg viewBox='0 0 24 24' fill='none' stroke='#991B1B' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' width='22' height='22' ><line x1='12' y1='19' x2='12' y2='5'/><polyline points="5 12 12 5 19 12"/></svg>`}</span>
          <div style="flex:1;min-width:0"><div class="busca-nome">${l.descricao}</div>
            <div class="busca-sub">${l.data_vencimento?dataBR(l.data_vencimento):""} · ${l.categoria_nome||"—"}</div></div>
          <span class="mono-num" style="font-size:12px;font-weight:700">${money(l.valor)}</span>
        </div>`;
      }
      const c = r.c;
      return `<div class="busca-item" onclick="setView('contatos');fecharBusca()">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <div style="flex:1"><div class="busca-nome">${c.nome}</div>
          <div class="busca-sub">${c.tipo||""}</div></div>
      </div>`;
    }).join("");
    box.style.display = "block";
  } catch { fecharBusca(); }
}

function fecharBusca() {
  const box = document.getElementById("busca-box");
  if (box) box.style.display = "none";
}

/* ── Busca mobile: overlay fullscreen estilo app nativo ── */
function abrirBuscaMobile() {
  if (document.getElementById("busca-mob-overlay")) return;
  const ov = document.createElement("div");
  ov.id = "busca-mob-overlay";
  ov.style.cssText = "position:fixed;inset:0;z-index:200;background:var(--card);display:flex;flex-direction:column;animation:ovIn .15s ease";
  ov.innerHTML =
    `<div style="display:flex;align-items:center;gap:10px;padding:calc(16px + var(--safe-top)) 16px 14px;border-bottom:1px solid var(--line)">
       <div style="position:relative;flex:1">
         <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--ink-3);display:flex;pointer-events:none">${icon("search")}</span>
         <input id="busca-mob-input" placeholder="Buscar lançamentos e contatos..."
           style="width:100%;padding:11px 12px 11px 38px;border:1.5px solid var(--navy);border-radius:12px;font-size:15px;background:var(--bg);color:var(--ink);outline:none"
           oninput="buscaMobileQuery(this.value)" autofocus>
       </div>
       <button onclick="fecharBuscaMobile()" style="padding:6px 2px;font-size:14px;font-weight:700;color:var(--navy);flex-shrink:0">Cancelar</button>
     </div>
     <div id="busca-mob-res" style="flex:1;overflow-y:auto;padding:8px 0">
       <div style="padding:48px 20px;text-align:center;color:var(--ink-3)">
         ${icon("search")}<p style="margin-top:14px;font-size:14px">Digite para buscar</p>
       </div>
     </div>`;
  document.body.appendChild(ov);
  setTimeout(() => { const i = document.getElementById("busca-mob-input"); if(i) i.focus(); }, 80);
}

function fecharBuscaMobile() {
  document.getElementById("busca-mob-overlay")?.remove();
}

async function buscaMobileQuery(q) {
  const res = document.getElementById("busca-mob-res");
  if (!res) return;
  if (!q || q.length < 2) {
    res.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--ink-3)"><p style="font-size:14px">Digite ao menos 2 caracteres</p></div>`;
    return;
  }
  try {
    const [lancs, conts] = await Promise.all([
      api("/api/lancamentos?busca=" + encodeURIComponent(q) + "&limite=10"),
      api("/api/contatos").then(cs => cs.filter(c => c.nome.toLowerCase().includes(q.toLowerCase())).slice(0,5)),
    ]);
    if (!lancs.length && !conts.length) {
      res.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--ink-3)"><p>Nenhum resultado para <b>${q}</b></p></div>`;
      return;
    }
    let html = "";
    if (lancs.length) {
      html += `<div style="padding:8px 16px 4px;font-size:11px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em">Lançamentos</div>`;
      for (const l of lancs) {
        const cor = l.tipo === "receita" ? "var(--teal)" : "var(--red)";
        const ico = l.tipo === "receita" ? '<svg viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.5" width="18" height="18"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="#991B1B" stroke-width="2.5" width="18" height="18"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
        const data = l.data_vencimento ? dataBR(l.data_vencimento) : "";
        const cat  = l.categoria_nome ? " · " + l.categoria_nome : "";
        html += `<div onclick="fecharBuscaMobile();setView('lancamentos')" style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--line);cursor:pointer">
          <span style="font-size:22px">${ico}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.descricao}</div>
            <div style="font-size:12px;color:var(--ink-2)">${data}${cat}</div>
          </div>
          <span style="font-family:monospace;font-weight:700;font-size:13px;color:${cor};flex-shrink:0">${money(l.valor)}</span>
        </div>`;
      }
    }
    if (conts.length) {
      html += `<div style="padding:12px 16px 4px;font-size:11px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em">Contatos</div>`;
      for (const c of conts) {
        html += `<div onclick="fecharBuscaMobile();setView('contatos')" style="display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--line);cursor:pointer">
          <span style="width:38px;height:38px;border-radius:50%;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0">${c.nome.charAt(0).toUpperCase()}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;color:var(--ink)">${c.nome}</div>
            <div style="font-size:12px;color:var(--ink-2)">${c.tipo || ""}${c.documento ? " · " + c.documento : ""}</div>
          </div>
        </div>`;
      }
    }
    res.innerHTML = html;
  } catch { res.innerHTML = `<div style="padding:20px 16px;color:var(--red)">Erro na busca.</div>`; }
}


/* ============================================================
   TOUR INTERATIVO — guia completo do sistema
   ============================================================ */
const TOUR_PASSOS = [
  {
    titulo: "Bem-vindo ao Tomelin Gestão Financeira!",
    texto: "Este tour vai te mostrar todas as telas e funcionalidades. Toque em <b>Próximo</b> para navegar ou <b>Pular</b> para sair a qualquer momento.",
    acao: null,
    destaque: null,
  },
  {
    titulo: "Dashboard — Visão geral",
    texto: "A tela principal mostra seu <b>saldo consolidado</b>, receitas e despesas do mês, alertas de vencimento e atalhos rápidos.",
    acao: () => setView("dashboard"),
    destaque: null,
  },
  {
    titulo: "Hero card — Saldo",
    texto: "O card escuro no topo mostra seu <b>saldo total</b> somando todas as contas, o resultado do mês (verde = positivo, vermelho = negativo) e os 3 KPIs principais.",
    acao: () => setView("dashboard"),
    destaque: ".dash-hero, [style*='#06243F'], [style*='#082D51'][style*='border-radius:22px']",
  },
  {
    titulo: "Atalhos rápidos",
    texto: "4 botões logo abaixo do hero: <b>Nova despesa</b>, <b>Recebimento</b>, <b>Ler NF</b> e <b>Relatórios</b>. Os mais usados estão sempre à mão.",
    acao: () => setView("dashboard"),
    destaque: null,
  },
  {
    titulo: "Vencimentos",
    texto: "Contas <b>atrasadas e próximas</b> dos próximos 7 dias aparecem aqui. O número vermelho no menu mostra quantas precisam de atenção.",
    acao: () => setView("vencimentos"),
    destaque: "#badge-venc",
  },
  {
    titulo: "Contas a pagar",
    texto: "Lista de todas as <b>despesas pendentes e pagas</b>. Filtre por status (pendente, atrasado, pago), categoria ou busque por descrição. Toque em uma linha para dar baixa, editar ou gerar recibo.",
    acao: () => setView("pagar"),
    destaque: null,
  },
  {
    titulo: "Dar baixa",
    texto: "Toque no botão <b>✓</b> de qualquer lançamento para registrar o pagamento. Você define a data, conta e eventuais juros/multa.",
    acao: () => setView("pagar"),
    destaque: ".btn-green",
  },
  {
    titulo: "Contas a receber",
    texto: "Suas <b>receitas pendentes e recebidas</b>. Mesmo sistema das despesas — filtre, busque, confirme recebimento.",
    acao: () => setView("receber"),
    destaque: null,
  },
  {
    titulo: "Todos os lançamentos",
    texto: "<b>Extrato completo</b>: receitas e despesas juntas, ordenadas por data. Exporte para CSV com o botão Exportar.",
    acao: () => setView("lancamentos"),
    destaque: null,
  },
  {
    titulo: "Compras e cartões",
    texto: "Registre <b>compras parceladas no cartão</b>. O sistema controla cada parcela, data de vencimento e progresso de pagamento.",
    acao: () => setView("compras"),
    destaque: null,
  },
  {
    titulo: "Metas financeiras",
    texto: "Crie <b>objetivos de poupança</b>: reserva de emergência, viagem, carro. Cada meta tem barra de progresso, prazo e aporte avulso.",
    acao: () => setView("metas"),
    destaque: null,
  },
  {
    titulo: "Relatórios",
    texto: "Balancete do período, projeção dos próximos 6 meses, patrimônio líquido e juros pagos. Todos disponíveis em <b>PDF</b> (padrão ou estilo cupom).",
    acao: () => setView("relatorios"),
    destaque: null,
  },
  {
    titulo: "Veículos",
    texto: "Cadastre seus veículos com valor FIPE atualizado, financiamento e custo mensal. O patrimônio líquido inclui os veículos automaticamente.",
    acao: () => setView("veiculos"),
    destaque: null,
  },
  {
    titulo: "Contas e carteiras",
    texto: "Gerencie suas <b>contas bancárias, carteiras e cartões</b>. O saldo de cada uma aparece no dashboard e nos relatórios.",
    acao: () => setView("contas"),
    destaque: null,
  },
  {
    titulo: "Categorias",
    texto: "Organize seus lançamentos por categoria (Moradia, Alimentação, Saúde...). As categorias aparecem nos <b>gráficos de despesas</b> do dashboard.",
    acao: () => setView("categorias"),
    destaque: null,
  },
  {
    titulo: "Contatos",
    texto: "Clientes, fornecedores, pessoas. Vincule um contato a qualquer lançamento para saber <b>quem pagou ou recebeu</b>.",
    acao: () => setView("contatos"),
    destaque: null,
  },
  {
    titulo: "WhatsApp",
    texto: "Control tudo pelo grupo da família. Mande <b>saldo</b>, <b>vencer</b>, <b>resumo</b>, <b>menu</b> e muito mais. Configure o webhook aqui para respostas instantâneas.",
    acao: () => setView("whatsapp"),
    destaque: null,
  },
  {
    titulo: "Família",
    texto: "Adicione membros da família com e-mail e senha próprios. Cada um acessa o sistema com seu login. O papel <b>Admin</b> dá acesso total.",
    acao: () => setView("usuarios"),
    destaque: null,
  },
  {
    titulo: "Configurações",
    texto: "Personalize alertas de vencimento, horários de envio no WhatsApp, logo da empresa, dados do cabeçalho dos PDFs e muito mais.",
    acao: () => setView("configuracoes"),
    destaque: null,
  },
  {
    titulo: "Menu mobile",
    texto: "No celular, o menu fica na <b>barra inferior</b>: Início, Vencer, botão + (novo lançamento), Extrato e Mais. O botão + abre atalhos para registrar receita, despesa, NF ou compra.",
    acao: () => setView("dashboard"),
    destaque: ".btab",
  },
  {
    titulo: "Ler Nota Fiscal",
    texto: "Aponte a câmera para o QR code de qualquer NF-e ou cole o link. O sistema lê os itens da nota e pré-preenche o lançamento automaticamente.",
    acao: () => setView("dashboard"),
    destaque: null,
  },
  {
    titulo: "Busca rápida",
    texto: "No desktop, use a <b>barra de busca</b> no topo. No celular, toque na <b>lupa</b> — abre uma busca fullscreen de lançamentos e contatos.",
    acao: () => setView("dashboard"),
    destaque: ".busca-global-wrap, .show-mob[title='Buscar']",
  },
  {
    titulo: "Tour concluído!",
    texto: "Você conheceu todas as telas do sistema. Para voltar ao início, toque em <b>Dashboard</b>. Qualquer dúvida, mande <b>ajuda</b> no grupo do WhatsApp!",
    acao: () => setView("dashboard"),
    destaque: null,
  },
];

let _TOUR_PASSO = 0;
let _TOUR_ATIVO = false;

function iniciarTour() {
  _TOUR_PASSO = 0;
  _TOUR_ATIVO = true;
  mostrarPassoTour();
}

function fecharTour() {
  _TOUR_ATIVO = false;
  document.getElementById("tour-overlay")?.remove();
  document.querySelectorAll(".tour-destaque").forEach(el => el.classList.remove("tour-destaque"));
}

async function mostrarPassoTour() {
  if (!_TOUR_ATIVO) return;
  const p = TOUR_PASSOS[_TOUR_PASSO];
  const total = TOUR_PASSOS.length;

  // executa ação da tela
  if (p.acao) {
    try { await p.acao(); } catch {}
    await new Promise(r => setTimeout(r, 400));
  }

  // destaca elemento
  document.querySelectorAll(".tour-destaque").forEach(el => el.classList.remove("tour-destaque"));
  if (p.destaque) {
    const sels = p.destaque.split(",").map(s => s.trim());
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el) { el.classList.add("tour-destaque"); break; }
    }
  }

  // remove overlay anterior
  document.getElementById("tour-overlay")?.remove();

  // cria card do tour
  const ov = document.createElement("div");
  ov.id = "tour-overlay";
  ov.innerHTML = `
    <div class="tour-card">
      <div class="tour-prog">
        <div class="tour-bar" style="width:${Math.round((_TOUR_PASSO / (total-1)) * 100)}%"></div>
      </div>
      <div class="tour-step">${_TOUR_PASSO + 1} de ${total}</div>
      <div class="tour-titulo">${p.titulo}</div>
      <div class="tour-texto">${p.texto}</div>
      <div class="tour-btns">
        <button onclick="fecharTour()" class="tour-btn-pular">Pular tour</button>
        <div style="display:flex;gap:8px">
          ${_TOUR_PASSO > 0 ? `<button onclick="tourAnterior()" class="tour-btn-nav">← Anterior</button>` : ""}
          <button onclick="tourProximo()" class="tour-btn-prox">
            ${_TOUR_PASSO === total - 1 ? "Concluir" : "Próximo"}
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(ov);
}

async function tourProximo() {
  if (_TOUR_PASSO < TOUR_PASSOS.length - 1) {
    _TOUR_PASSO++;
    await mostrarPassoTour();
  } else {
    fecharTour();
    setView("dashboard");
    toast("Tour concluído!", "ok");
  }
}

async function tourAnterior() {
  if (_TOUR_PASSO > 0) {
    _TOUR_PASSO--;
    await mostrarPassoTour();
  }
}


/* ── Ícones SVG como constantes ── */
const IC_CHECK_W = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>`;
const IC_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const IC_EDIT_SM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const IC_WA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
const IC_RECEIPT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>`;
const IC_UNDO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`;
const IC_CSV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><polyline points="8 18 12 22 16 18"/></svg>`;
const IC_PLUS_X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

Object.assign(window, {
  setView, fazerLogin, logout, toggleSidebar, fecharModal, abrirModal,
  filtroStatus, filtroCat, debBusca, exportarCSV,
  formBaixaId, formLancamentoId, abrirFabMenu, abrirMenuMais,
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
  formMeta, salvarMeta, excluirMeta, formAporte, confirmarAporte, _editarMeta,
  _setMetaIcone, _setMetaCor, buscaGlobal, fecharBusca,
  abrirBuscaMobile, fecharBuscaMobile, buscaMobileQuery, _atalhoClick,
  _toggleItensCompra, verParcelasCompra,
  rodarDiagnosticoWA, salvarGatewayWA, _autoDesc, _escolherDesc,
  _buscarCNPJ, _buscarCEP,
  iniciarTour, fecharTour, tourProximo, tourAnterior, salvarNumeroWA, _previewNumeroWA, carregarGruposWA, filtrarGruposWA, escolherGrupoWA, copiarTexto,
  initLogo, escolherLogo, logoURLInput, limparLogo,
});

render();
