/* Tomelin Gestão Financeira · Base: estado, chamadas ao servidor, utilidades, avisos, janelas e login.
   Arquivo 1 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ============================================================
   Tomelin Gestão Financeira: SPA (vanilla JS, sem dependências)
   ============================================================ */

// Cache de lançamentos por ID: evita JSON.stringify em onclick (quebra com aspas)
const _LANC_CACHE = new Map();
const State = {
  token: localStorage.getItem("tom_token") || null,
  ultimo_acesso: null,
  ultimo_acesso_ip: null,
  emoji: localStorage.getItem("tom_emoji") || "pessoa",
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
  if (!iso) return "-";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}
function dataBRcurto(iso) {
  if (!iso) return "-";
  const [, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}`;
}
function hojeISO() {   // data LOCAL (toISOString é UTC: depois das 21h virava o dia seguinte)
  const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function diasEntre(iso) {
  const hoje = new Date(hojeISO());
  const alvo = new Date(iso.split("T")[0]);
  return Math.round((alvo - hoje) / 86400000);
}

/* ---------- ícones SVG (sem emoji) ---------- */
const P = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  clip: '<path d="M21.4 11.1l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  transfer: '<path d="M17 3l4 4-4 4"/><path d="M3 7h18"/><path d="M7 21l-4-4 4-4"/><path d="M21 17H3"/>',
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

/* ── Escape XSS: todo dado vindo do usuário passa por aqui ── */
function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function icon(name, cls = "") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</svg>`;
}

/* ---------- ilustrações SVG ----------
   Desenhos pequenos com as cores do sistema. Usados em estados vazios,
   buscas (CNPJ, CEP), sugestões e carregamento. */
function ilus(name, cor = "var(--navy)", tam = 112) {
  return `<svg class="ilus ilus-cena" viewBox="0 0 120 100" width="${tam}" height="${Math.round(tam * 100 / 120)}" fill="none" aria-hidden="true">
    <defs>
      <radialGradient id="ilFundo" cx=".5" cy=".46" r=".55"><stop offset="0" stop-color="#2F817A" stop-opacity=".2"/><stop offset=".6" stop-color="#C9A94E" stop-opacity=".07"/><stop offset="1" stop-color="#C9A94E" stop-opacity="0"/></radialGradient>
      <linearGradient id="ilBorda" x1="34" y1="22" x2="86" y2="74" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#082D51"/><stop offset=".55" stop-color="#2F817A"/><stop offset="1" stop-color="#C9A94E"/></linearGradient>
      <linearGradient id="ilIcone" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#082D51"/><stop offset="1" stop-color="#2F817A"/></linearGradient>
    </defs>
    <circle cx="60" cy="48" r="47" fill="url(#ilFundo)"/>
    <circle class="il-orbita" cx="60" cy="48" r="41" stroke="${cor}" stroke-opacity=".2" stroke-width="1.2" stroke-dasharray="2 7" stroke-linecap="round"/>
    <circle class="il-orbita-ponto" cx="60" cy="7" r="2.6" fill="#2F817A"/>
    <ellipse class="il-sombra" cx="60" cy="91" rx="27" ry="4" fill="var(--ink-3)" opacity=".16"/>
    <g class="il-flutua">
      <rect x="34" y="22" width="52" height="52" rx="16" fill="var(--card)" stroke="url(#ilBorda)" stroke-width="2"/>
      <path d="M50 22h20a16 16 0 0 1 16 16v0H34v0a16 16 0 0 1 16-16z" fill="url(#ilBorda)" opacity=".09"/>
      <g transform="translate(46 34) scale(1.17)" stroke="url(#ilIcone)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ""}</g>
    </g>
    <g class="il-moeda"><circle cx="95" cy="26" r="7" fill="#E2C46E"/><circle cx="95" cy="26" r="4.6" fill="none" stroke="#B8923A" stroke-width="1.2"/></g>
    <circle class="ilus-brilho" cx="22" cy="30" r="2.4" fill="var(--gold)"/>
    <path class="ilus-brilho b2" d="M101 60l1.8 3.6 3.6 1.8-3.6 1.8-1.8 3.6-1.8-3.6-3.6-1.8 3.6-1.8z" fill="var(--gold)" opacity=".8"/>
    <path class="ilus-brilho b3" d="M15 66h8M19 62v8" stroke="var(--teal)" stroke-width="1.7" stroke-linecap="round"/>
  </svg>`;
}

// Prédio + lupa varrendo as janelas (consultando CNPJ)
function ilusBuscaEmpresa(tam = 64) {
  return `<svg class="ilus ilus-scan" viewBox="0 0 64 64" width="${tam}" height="${tam}" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="30" fill="var(--navy)" opacity=".07"/>
    <rect x="14" y="16" width="24" height="36" rx="3" fill="var(--card)" stroke="var(--navy)" stroke-width="1.8"/>
    <rect x="38" y="28" width="12" height="24" rx="2" fill="var(--card)" stroke="var(--navy)" stroke-width="1.8"/>
    <g fill="var(--navy)" opacity=".35">
      <rect x="19" y="21" width="5" height="4" rx="1"/><rect x="28" y="21" width="5" height="4" rx="1"/>
      <rect x="19" y="29" width="5" height="4" rx="1"/><rect x="28" y="29" width="5" height="4" rx="1"/>
      <rect x="19" y="37" width="5" height="4" rx="1"/><rect x="28" y="37" width="5" height="4" rx="1"/>
      <rect x="42" y="33" width="4" height="4" rx="1"/><rect x="42" y="40" width="4" height="4" rx="1"/>
    </g>
    <rect x="23" y="45" width="6" height="7" rx="1" fill="var(--gold)"/>
    <path d="M10 52h46" stroke="var(--navy)" stroke-width="1.8" stroke-linecap="round"/>
    <g class="lupa">
      <circle cx="27" cy="30" r="8" fill="var(--card)" fill-opacity=".55" stroke="var(--gold)" stroke-width="2.4"/>
      <path d="M33 36l6 6" stroke="var(--gold)" stroke-width="3" stroke-linecap="round"/>
    </g>
  </svg>`;
}

// Prédio com selo: verde (ativa), âmbar (situação irregular)
function ilusEmpresa(ativa = true, tam = 64) {
  const cor = ativa ? "#16A34A" : "#CA8A04";
  const selo = ativa ? '<path d="M44.5 46.5l3 3 5.5-6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
                     : '<path d="M48.5 42.5v4.5M48.5 50.5v.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
  return `<svg class="ilus ilus-pop" viewBox="0 0 64 64" width="${tam}" height="${tam}" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="30" fill="${cor}" opacity=".09"/>
    <rect x="14" y="16" width="24" height="36" rx="3" fill="var(--card)" stroke="var(--navy)" stroke-width="1.8"/>
    <rect x="38" y="28" width="10" height="24" rx="2" fill="var(--card)" stroke="var(--navy)" stroke-width="1.8"/>
    <g fill="var(--navy)" opacity=".35">
      <rect x="19" y="21" width="5" height="4" rx="1"/><rect x="28" y="21" width="5" height="4" rx="1"/>
      <rect x="19" y="29" width="5" height="4" rx="1"/><rect x="28" y="29" width="5" height="4" rx="1"/>
      <rect x="19" y="37" width="5" height="4" rx="1"/><rect x="28" y="37" width="5" height="4" rx="1"/>
    </g>
    <rect x="23" y="45" width="6" height="7" rx="1" fill="var(--gold)"/>
    <path d="M10 52h30" stroke="var(--navy)" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="48.5" cy="47" r="9" fill="${cor}" stroke="var(--card)" stroke-width="2.5"/>${selo}
  </svg>`;
}

// Mapa dobrado + alfinete pulando (CEP)
function ilusMapa(buscando = false, tam = 52) {
  return `<svg class="ilus ${buscando ? "ilus-pin" : "ilus-pop"}" viewBox="0 0 64 64" width="${tam}" height="${tam}" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="30" fill="var(--teal)" opacity=".1"/>
    <path d="M12 22l13-5 14 5 13-5v27l-13 5-14-5-13 5z" fill="var(--card)" stroke="var(--navy)" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M25 17v27M39 22v27" stroke="var(--navy)" stroke-width="1.4" opacity=".35"/>
    <path d="M15 37c6-2 9 3 15 1s8-6 14-4" stroke="var(--teal)" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2 3"/>
    <ellipse class="sombra" cx="33" cy="41" rx="4" ry="1.5" fill="var(--navy)" opacity=".25"/>
    <g class="pin">
      <path d="M33 40s-8-8.5-8-14a8 8 0 0116 0c0 5.5-8 14-8 14z" fill="var(--red)" stroke="#fff" stroke-width="1.5"/>
      <circle cx="33" cy="26" r="3" fill="#fff"/>
    </g>
  </svg>`;
}

// Barras subindo (carregando telas)
function ilusCarregando(tam = 96) {
  return `<svg class="ilus ilus-load" viewBox="0 0 120 92" width="${tam}" height="${Math.round(tam * 92 / 120)}" fill="none" aria-hidden="true">
    <defs>
      <radialGradient id="ldFundo" cx=".5" cy=".5" r=".55"><stop offset="0" stop-color="#2F817A" stop-opacity=".18"/><stop offset="1" stop-color="#2F817A" stop-opacity="0"/></radialGradient>
      <linearGradient id="ldB1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3EA88A"/><stop offset="1" stop-color="#1F6F5C"/></linearGradient>
      <linearGradient id="ldB2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E2C46E"/><stop offset="1" stop-color="#B8923A"/></linearGradient>
      <linearGradient id="ldB3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#305C74"/><stop offset="1" stop-color="#082D51"/></linearGradient>
    </defs>
    <circle cx="60" cy="46" r="44" fill="url(#ldFundo)"/>
    <ellipse cx="60" cy="84" rx="32" ry="4" fill="var(--ink-3)" opacity=".14"/>
    <rect x="22" y="16" width="76" height="60" rx="14" fill="var(--card)" stroke="#2F817A" stroke-opacity=".28" stroke-width="1.5"/>
    <rect class="ld-b ld-b1" x="34" y="40" width="10" height="26" rx="3" fill="url(#ldB1)"/>
    <rect class="ld-b ld-b2" x="50" y="32" width="10" height="34" rx="3" fill="url(#ldB2)"/>
    <rect class="ld-b ld-b3" x="66" y="44" width="10" height="22" rx="3" fill="url(#ldB3)"/>
    <polyline class="ld-linha" pathLength="100" points="34,46 52,30 70,40 88,24" stroke="#2F817A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <g class="ld-moeda"><circle cx="96" cy="16" r="8" fill="#E2C46E"/><circle cx="96" cy="16" r="5.2" stroke="#B8923A" stroke-width="1.3"/></g>
    <circle class="ilus-brilho" cx="16" cy="28" r="2.5" fill="var(--gold)"/>
    <path class="ilus-brilho b2" d="M108 50l1.6 3.2 3.2 1.6-3.2 1.6-1.6 3.2-1.6-3.2-3.2-1.6 3.2-1.6z" fill="var(--teal)"/>
  </svg>`;
}

// Alerta (erro em buscas)
function ilusAlerta(tam = 64) {
  return `<svg class="ilus ilus-pop" viewBox="0 0 64 64" width="${tam}" height="${tam}" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="30" fill="var(--red)" opacity=".08"/>
    <path d="M32 13L53 49H11z" fill="var(--card)" stroke="var(--red)" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M32 26v11M32 42.5v.5" stroke="var(--red)" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}
const LOGO_MARK = '<img class="brand-mark" src="/static/icons/logo-mark.png" alt="Tomelin" width="164" height="217">';
/* Crédito de quem criou o sistema */
function creditoDev(cls = "") {
  return `<div class="credito-dev ${cls}">Criado pela <b>UniController</b> · Dev <b>Jackson Tomelin</b></div>`;
}
const LOGO_LOCKUP = '<img class="login-lockup" src="/static/icons/logo-lockup.png" alt="Tomelin Gestão Financeira">';
const SVG_HOUSE = '<svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 80 L100 20 L180 80 L180 150 L20 150 Z" fill="white" opacity=".6"/><rect x="70" y="100" width="30" height="50" fill="white" opacity=".8"/><rect x="120" y="85" width="35" height="30" fill="white" opacity=".5"/><circle cx="160" cy="35" r="18" fill="white" opacity=".3"/></svg>';

/* ---------- API ---------- */
// Endereço do servidor. Vazio = o mesmo da página (navegador, app instalado, TWA).
// Num APK com Capacitor (arquivos dentro do app), defina antes do app.js:
//   <script>window.TOMELIN_API = "https://financeiro.seudominio.com.br"</script>
const API_BASE = String(window.TOMELIN_API || "").replace(/\/$/, "");
const _url = p => (typeof p === "string" && p.startsWith("/") ? API_BASE + p : p);

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (State.token) headers.Authorization = `Bearer ${State.token}`;
  let res;
  try {
    res = await fetch(_url(path), { ...opts, headers });
  } catch {
    const err = new Error(navigator.onLine === false
      ? "Sem internet. Verifique a conexão e tente de novo."
      : "Não consegui falar com o servidor. Ele pode estar reiniciando, tente de novo em alguns segundos.");
    err.rede = true;
    throw err;
  }
  if (res.status === 401) { logout(); throw new Error("Sessão expirada. Entre de novo."); }
  if (!res.ok) {
    let j = null;
    try { j = await res.json(); } catch {}
    const err = new Error(_msgErro(res.status, j, (opts.method || "GET").toUpperCase(), path));
    err.status = res.status;
    err.campo = j?.campo || j?.erros?.[0]?.campo || null;
    if (err.campo) try { _marcarCampo(err.campo, err.message); } catch {}
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

// Transforma a resposta de erro do servidor numa frase que diz o que houve.
function _msgErro(status, j, metodo, path) {
  const d = j?.detail;
  if (typeof d === "string" && d) return d;
  if (Array.isArray(d) && d.length)            // formato padrão do FastAPI
    return d.map(e => `${(e.loc || []).filter(x => x !== "body").join(" › ")}: ${e.msg}`).join(" · ");
  if (d && typeof d === "object") return d.mensagem || d.message || JSON.stringify(d);
  const rota = path.split("?")[0];
  return ({
    400: "Requisição inválida.",
    403: "Você não tem permissão para esta ação.",
    404: `Não encontrado (${metodo} ${rota}). O registro pode ter sido excluído. Recarregue a tela.`,
    405: `Ação não suportada pelo servidor (${metodo} ${rota}).`,
    409: "Conflito: o registro foi alterado ou já existe.",
    413: "Arquivo ou conteúdo grande demais para enviar.",
    422: "Algum campo está inválido.",
    429: "Muitas tentativas seguidas. Aguarde um minuto.",
    500: `Erro interno do servidor em ${metodo} ${rota}.`,
    502: "Servidor fora do ar ou reiniciando (502). Tente em alguns segundos.",
    503: "Servidor indisponível no momento (503). Tente em alguns segundos.",
    504: "O servidor demorou demais para responder (504).",
  })[status] || `Erro ${status} em ${metodo} ${rota}.`;
}

// Destaca no formulário aberto o campo que o servidor apontou.
function _marcarCampo(campo, msg) {
  const ov = [...document.querySelectorAll(".overlay")].pop();
  if (!ov) return;
  // nome no banco → sufixos usados nos ids dos formulários
  const ALIAS = {
    telefone: ["tel"], documento: ["doc"], descricao: ["desc"],
    data_vencimento: ["venc"], data_competencia: ["comp"], data_pagamento: ["pago", "data"],
    categoria_id: ["cat"], conta_id: ["conta"], contato_id: ["contato"],
    saldo_inicial: ["saldo"], conta_origem_id: ["origem"], conta_destino_id: ["destino"], arquivo: ["imp-arquivo"], estabelecimento: ["estab"], total_parcelas: ["parcelas"],
    forma_pagamento: ["forma"], valor_alvo: ["alvo"], valor_atual: ["atual"],
    fipe_codigo: ["fipecod"], fipe_valor: ["fipeval"], valor_parcela: ["vparc"],
    parcelas_total: ["ptot"], parcelas_pagas: ["ppag"], financiado: ["fin"],
    financiamento_banco: ["banco"], venc_dia: ["dia"], valor_fixo: ["fixo"],
  };
  const nomes = [campo, ...(ALIAS[campo] || [])];
  const sel = nomes.flatMap(n => [`[name="${n}"]`, `[id$="-${n}"]`, `[data-campo="${n}"]`]).join(", ");
  const el = ov.querySelector(sel);
  if (!el) return;
  el.classList.add("campo-erro");
  el.title = msg;
  const box = el.closest("label, .fld, .campo, div");
  let dica = box && box.querySelector(".campo-erro-msg");
  if (box && !dica) {
    dica = document.createElement("small");
    dica.className = "campo-erro-msg";
    el.insertAdjacentElement("afterend", dica);
  }
  if (dica) dica.textContent = msg;
  try { el.scrollIntoView?.({ block: "center", behavior: "smooth" }); el.focus({ preventScroll: true }); } catch {}
  const limpar = () => { el.classList.remove("campo-erro"); el.title = ""; dica?.remove(); };
  el.addEventListener("input", limpar, { once: true });
  el.addEventListener("change", limpar, { once: true });
}

// Erro de validação feito na própria tela: destaca o campo e avisa.
function erroCampo(campo, msg) {
  try { _marcarCampo(campo, msg); } catch {}
  toast(msg, "err");
}

async function abrirPDF(path) {
  try {
    const res = await fetch(_url(path), { headers: { Authorization: `Bearer ${State.token}` } });
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
        <input id="logo-url" placeholder="ou cole o link da imagem" oninput="logoURLInput(this.value)">
      </div>
      <button class="btn-icon" title="Remover logo" onclick="limparLogo()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
    </div>
    <div class="meta">${hint || "Arquivo ou link: a imagem é baixada e guardada no próprio sistema, sem depender do link depois."}</div>
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
  if (typeof _contaPrev === "function") _contaPrev();
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
  el.className = tipo === "wa-fila" ? "toast wa fila" : `toast ${tipo}`;
  const ic = tipo === "ok" ? "checkCircle" : (tipo === "err" || tipo === "warn") ? "alert" : "bell";
  el.innerHTML = tipo === "wa" || tipo === "wa-fila"
    ? `<span class="toast-wa-ic">${waDesenho()}</span><span>${esc(msg)}</span><span class="toast-ticks">${_WA_TICKS}</span>`
    : icon(ic) + `<span>${esc(msg)}</span>`;
  $("#toasts").appendChild(el);
  // erro fica mais tempo (dá pra ler a mensagem inteira); clique fecha
  const dur = (tipo === "err" || tipo === "warn") ? Math.min(12000, 5000 + String(msg).length * 40) : 3200;
  el.style.setProperty("--dur", dur + "ms");
  el.insertAdjacentHTML("beforeend", '<i class="toast-barra"></i>');
  const fechar = () => { el.style.opacity = "0"; el.style.transform = "translateX(20px)"; setTimeout(() => el.remove(), 200); };
  el.addEventListener("click", fechar);
  setTimeout(fechar, dur);
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
// O modal sai animado, mas some do lugar na hora: quem abre outro modal logo em
// seguida não esbarra no que está saindo (e os ids dele são retirados).
function _saiModal(el) {
  if (!el) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { el.remove(); return; }
  let g = document.getElementById("modal-saida");
  if (!g) { g = document.createElement("div"); g.id = "modal-saida"; document.body.appendChild(g); }
  el.querySelectorAll("[id]").forEach(n => n.removeAttribute("id"));
  el.classList.add("saindo"); g.appendChild(el);
  setTimeout(() => el.remove(), 230);
}
function fecharModal() {
  const r = modalRoot();
  if (State._senhaObrigatoria && r.querySelector("#sf-nova")) return;   // troca da senha de fábrica não pode ser pulada
  if (State._contatoRapido && r.children.length > 1) {   // volta ao lançamento
    State._contatoRapido = false;
    _saiModal(r.lastElementChild);
    return;
  }
  State._contatoRapido = false;
  [...r.children].forEach(_saiModal);
}

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
    State.emoji = r.emoji || "pessoa";
    State.uid = r.id || null;
    localStorage.setItem("tom_token", r.token);
    localStorage.setItem("tom_emoji", r.emoji || "pessoa");
    localStorage.setItem("tom_nome", r.nome);
    localStorage.setItem("tom_email", r.email);
    State._senhaChecada = false;
    sessionStorage.removeItem("tom_popup");          // acabou de entrar: mostra a abertura do dia
    const ent = document.createElement("div"); ent.className = "entrada";
    ent.innerHTML = `<div class="entrada-logo"><img src="/static/icons/logo-mark.png" alt=""></div>
      <b>Bem-vindo de volta, ${esc((r.nome || "").split(" ")[0])}!</b><small>Preparando o seu dia...</small><i class="entrada-barra"></i>`;
    document.body.appendChild(ent); vibrar(12);
    await Promise.all([render(), new Promise(ok => setTimeout(ok, 900))]);
    ent.classList.add("sai"); setTimeout(() => ent.remove(), 450);
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
  fetch(_url("/api/auth/status")).then(r => r.json()).then(d => {
    const el = document.getElementById("lp-status");
    if (el) el.innerHTML = '<svg viewBox="0 0 8 8" width="8" height="8" style="margin-right:6px"><circle cx="4" cy="4" r="3.5" fill="#3E9079"/></svg> Sistema online &nbsp;·&nbsp; ' + d.total_lancamentos + ' lançamentos registrados';
  }).catch(() => {});
}

function renderLogin() {
  const ua = _ultimoAcesso();
  root().innerHTML = `
    <div class="login-app" onpointermove="_loginParallax(event)">
      <div class="cena-fin" aria-hidden="true">${_cenaFinanceira()}</div>
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
        ${creditoDev("cd-login")}
        <span id="sb-version-login" style="font-size:11px;opacity:.5">v2.0</span>
      </div>
    </div>`;

  // busca versão
  fetch(_url("/api/health")).then(r=>r.json()).then(d=>{
    const el = document.getElementById("sb-version-login");
    if (el && d.version) el.textContent = "v" + d.version;
  }).catch(()=>{});

  _statusLogin();
}
