/* Tomelin Gestão Financeira · Estrutura do app (menu, topo, navegação) e gráficos SVG.
   Arquivo 2 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ============================================================
   APP SHELL
   ============================================================ */
const NAV = [
  { sec: "Painel" },
  { id: "dashboard",    nome: "Visão geral",          ic: "grid",      sub: "Resumo do mês",                        badge: false },
  { id: "vencimentos",  nome: "Vencimentos",           ic: "clock",     sub: "Contas atrasadas e a vencer",          badge: true  },
  { id: "relatorios",   nome: "Relatórios",            ic: "pie",       sub: "Balancete, patrimônio e projeções",    badge: false },
  { id: "documentos",   nome: "Documentos emitidos",   ic: "doc",       sub: "PDFs com QR de validação",             badge: false },
  { id: "orcamento",    nome: "Orçamento",             ic: "target",    sub: "Limite de gasto por categoria",        badge: false },
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
META.fatura = { id: "fatura", nome: "Fatura do cartão", sub: "Compras, parcelas e pagamento" };

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
          <div id="sb-version" style="font-size:10px;opacity:.4;margin-top:2px;font-weight:600;letter-spacing:.06em">v2.152.0</div>
          <div class="sb-cred">UniController · Dev Jackson Tomelin</div>
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
        <div class="tb-cena" id="tb-cena" aria-hidden="true"></div>
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
        <button class="btn-icon hide-mob tb-tour" title="Tour do sistema" onclick="iniciarTour()">${icon("compass")}</button>
        <button class="btn-icon btn-tema" title="Tema claro/escuro" onclick="_temaComTransicao(event)">${icon(temaAtual() === "dark" ? "sun" : "moon")}</button>
        <button class="btn-icon tb-atualizar" title="Atualizar" onclick="this.classList.remove('gira');void this.offsetWidth;this.classList.add('gira');setView(State.view)">${icon("refresh")}</button>
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
      <span class="btab-fab-rot">Novo</span>
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
    a.classList.toggle("on", a.dataset.id === State.view || (State.view === "fatura" && a.dataset.id === "compras") ||
      (["pagar","receber"].includes(State.view) && a.dataset.id === State.view));
  });

  // Sincroniza bottom tab bar
  const tabMap = { pagar:"lancamentos", receber:"lancamentos",
    compras:"lancamentos", fatura:"lancamentos", metas:"mais", relatorios:"mais",
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
  try { const tc = $("#tb-cena"); if (tc) tc.innerHTML = _cenaTela(State.view) + `<span class="tc-nome">${esc(m.nome || "")}</span>`; } catch {}
  try { const ts = $("#tb-sub"); if (ts) ts.textContent = m.sub || ""; } catch {}
}

/* FAB (+): abre mini-menu de novo lançamento */
function _atalhoClick(btn) {
  const a = btn.dataset.acao;
  if (a === "despesa") formLancamento(null,"despesa");
  else if (a === "receita") formLancamento(null,"receita");
  else if (a === "nfe") abrirLeitorNFe();
  else if (a === "transferir") _leqTransferir();
  else if (a === "repeticoes") abrirRecorrencias();
  else if (a === "importar") formImportar();
  else if (a === "zap") abrirZap();
  else setView(a);
}

/* Menu "Mais": todas as outras seções */
function abrirMenuMais() {
  const MAIS_ITENS = [
    { id:"relatorios",    ic:"chart",    nome:"Relatórios",         cor:"i-navy" },
    { id:"documentos",    ic:"doc",      nome:"Documentos",         cor:"i-green" },
    { id:"orcamento",     ic:"target",   nome:"Orçamento",          cor:"i-gold" },
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
        ${creditoDev("cd-mais")}
      </div>
    </div>`);
}

// Cada troca de tela desenha no próprio espaço. Se outra tela for pedida antes
// desta terminar de carregar, a resposta atrasada cai num espaço que já saiu da
// tela e não sobrescreve a tela nova (antes o menu marcava uma e mostrava outra).
let _SEQ_VIEW = 0;
async function setView(id, opts = {}) {
  const silencioso = !!opts.silencioso && State.view === id;
  if (!_naVolta && State.view && State.view !== id) { _PILHA_TELAS.push(State.view); if (_PILHA_TELAS.length > 30) _PILHA_TELAS.shift(); }
  State.view = id;
  toggleSidebar(false);
  marcarNav();
  const raiz = $("#view");
  if (!raiz) return;
  const vez = ++_SEQ_VIEW;
  const v = document.createElement("div");
  v.className = "view-alvo";
  const rolagem = window.scrollY;
  if (silencioso) {
    // monta escondido ANTES do conteúdo atual (os ids novos vêm primeiro) e troca no fim
    v.classList.add("sem-anim"); v.hidden = true; raiz.prepend(v);
  } else {
    v.innerHTML = `<div class="empty" style="padding:80px">${ilusCarregando()}<p>Carregando...</p></div>`;
    raiz.replaceChildren(v);
  }
  try {
    if (id === "dashboard") await viewDashboard(v);
    else if (id === "vencimentos") await viewVencimentos(v);
    else if (id === "pagar") await viewLancamentos(v, "despesa");
    else if (id === "receber") await viewLancamentos(v, "receita");
    else if (id === "lancamentos") await viewLancamentos(v, null);
    else if (id === "compras") await viewCompras(v);
    else if (id === "fatura") await viewFatura(v);
    else if (id === "metas") await viewMetas(v);
    else if (id === "contas") await viewContas(v);
    else if (id === "categorias") await viewCategorias(v);
    else if (id === "contatos") await viewContatos(v);
    else if (id === "veiculos") await viewVeiculos(v);
    else if (id === "relatorios") await viewRelatorios(v);
    else if (id === "documentos") await viewDocumentos(v);
    else if (id === "orcamento") await viewOrcamento(v);
    else if (id === "whatsapp") { await viewWhatsapp(v); rodarDiagnosticoWA(); }
    else if (id === "usuarios") await viewUsuarios(v);
    else if (id === "configuracoes") await viewConfiguracoes(v);
    if (vez === _SEQ_VIEW) {
      if (silencioso) { [...raiz.children].forEach(c => { if (c !== v) c.remove(); }); v.hidden = false; window.scrollTo(0, rolagem); }
      else _animarNumeros(v);
    } else if (silencioso) v.remove();
  } catch (e) {
    if (silencioso) { v.remove(); return; }
    if (vez === _SEQ_VIEW) v.innerHTML = `<div class="empty" style="padding:60px">${ilusAlerta(80)}<p>${esc(e.message)}</p></div>`;
  }
}

// Valores em destaque contam de 0 até o valor ao abrir a tela (o texto final é o original)
function _animarNumeros(raiz) {
  if (!raiz || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !window.requestAnimationFrame) return;
  raiz.querySelectorAll("[data-contar]").forEach(el => {
    const alvo = Number(el.dataset.contar) || 0, ini = performance.now();
    const passo = t => { const p = Math.min(1, (t - ini) / 1100), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(alvo * e); if (p < 1 && el.isConnected) requestAnimationFrame(passo); };
    el.textContent = "0"; requestAnimationFrame(passo);
  });
  raiz.querySelectorAll(".hero-saldo, .kpi .val, .hero-mini-val, .dash-kpi").forEach(el => {
    if (!_soNossos(el)) return;
    const final = _moedaPartes(el.textContent);
    if (!final) return;
    const neg = /[−-]/.test(final.sinal);
    const alvo = (neg ? -1 : 1) * parseFloat(final.inteiro.replace(/\./g, "") + "." + final.cent);
    if (!alvo) return;
    const ini = performance.now(), dur = 800;
    const desenha = v => { const p = _moedaPartes(money(v)); if (p) el.innerHTML = _moedaHTML(p); };
    const passo = t => {
      if (!el.isConnected) return;
      const p = Math.min(1, (t - ini) / dur), e = 1 - Math.pow(1 - p, 3);
      if (p < 1) { desenha(alvo * e); requestAnimationFrame(passo); }
      else el.innerHTML = _moedaHTML(final);
    };
    el.dataset.rs = "1"; desenha(0); requestAnimationFrame(passo);
  });
}

async function carregarRefs() {
  const [cats, contas, contatos, membros] = await Promise.all([
    api("/api/categorias"), api("/api/contas"), api("/api/contatos"), api("/api/usuarios").catch(() => []),
  ]);
  State.cats = cats; State.contas = contas; State.contatos = contatos;
  State.membros = (membros || []).filter(u => u.ativo !== false);
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
    const res = d.receitas - d.despesas;
    // balão do resumo: acima da coluna, sem sair do gráfico
    const tw = 168, th = 70, tx = Math.min(Math.max(cx - tw / 2, pad.l), W - pad.r - tw);
    const ty = Math.max(2, Math.min(y(d.receitas), y(d.despesas)) - th - 8);
    bars += `
      <g class="bc-col" style="--i:${i}">
        <rect class="bc-hit" x="${pad.l + bw * i}" y="${pad.t}" width="${bw}" height="${ih}" fill="transparent"/>
        <rect class="bc-barra" x="${x1}" y="${y(d.receitas)}" width="${barW}" height="${Math.max(1, rH)}" rx="4" fill="url(#gGreen)"/>
        <rect class="bc-barra" x="${x2}" y="${y(d.despesas)}" width="${barW}" height="${Math.max(1, dH)}" rx="4" fill="url(#gDesp)"/>
        <text x="${cx}" y="${H - 12}" text-anchor="middle" font-size="15" fill="${CINK.label}" font-weight="600">${d.label}</text>
        <g class="bc-tip" transform="translate(${tx} ${ty})">
          <rect width="${tw}" height="${th}" rx="10" fill="#0B2540" opacity=".94"/>
          <text x="12" y="20" font-size="13" font-weight="800" fill="#fff">${d.label}</text>
          <text x="12" y="38" font-size="12.5" fill="#7FD3C2">Receitas ${money(d.receitas)}</text>
          <text x="12" y="55" font-size="12.5" fill="#E9CF86">Despesas ${money(d.despesas)}</text>
          <text x="${tw - 12}" y="20" font-size="12" font-weight="800" text-anchor="end" fill="${res >= 0 ? "#7FD3C2" : "#F2A08F"}">${res >= 0 ? "+" : "−"}${money0(Math.abs(res))}</text>
        </g>
      </g>`;
  });
  return `
  <svg class="bc" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" font-family="Numeros, Inter, system-ui, sans-serif">
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
  if (!dados.length) return `<div class="empty">${ilus("pie")}<p>Sem despesas categorizadas neste mês.</p></div>`;
  const total = dados.reduce((s, d) => s + d.valor, 0);
  const R = 78, r = 48, cx = 100, cy = 100;
  let ang = -Math.PI / 2, segs = "";
  dados.slice(0, 8).forEach((d, i) => {
    const frac = d.valor / total, a2 = ang + frac * 2 * Math.PI;
    const large = frac > 0.5 ? 1 : 0;
    const p = (a, rad) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    const [x1, y1] = p(ang, R), [x2, y2] = p(a2, R);
    const [x3, y3] = p(a2, r), [x4, y4] = p(ang, r);
    segs += `<path class="dn-seg" data-i="${i}" data-nome="${esc(d.nome)}" data-valor="${money0(d.valor)}" data-pct="${(frac*100).toFixed(0)}" style="--i:${i}"
              d="M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${large} 0 ${x4} ${y4} Z"
              fill="${d.cor}" stroke="var(--card)" stroke-width="2" onmouseenter="_donutFoco(this)" onclick="_donutAbrir(${d.id || 0})"><title>${esc(d.nome)} · ${money(d.valor)} (${(frac*100).toFixed(0)}%). Toque para ver os lançamentos</title></path>`;
    ang = a2;
  });
  const leg = dados.slice(0, 8).map((d, i) =>
    `<span class="lg dn-leg" data-i="${i}" onmouseenter="_donutFoco(this)" onclick="_donutAbrir(${d.id || 0})"><span class="dot" style="background:${d.cor}"></span>${esc(d.nome)} · <b style="color:${chartInk().strong}">${money0(d.valor)}</b></span>`).join("");
  return `
  <div class="dn-wrap" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap" onmouseleave="_donutSai(this)">
    <svg class="dn" data-total="${money0(total)}" viewBox="0 0 200 200" style="width:180px;height:180px;flex-shrink:0" font-family="Numeros, Inter, system-ui, sans-serif">
      ${segs}
      <text class="dn-rot" x="100" y="94" text-anchor="middle" font-size="11" fill="${chartInk().axis}">Total mês</text>
      <text class="dn-val" x="100" y="114" text-anchor="middle" font-size="17" font-weight="800" fill="${chartInk().strong}">${money0(total)}</text>
    </svg>
    <div class="chart-legend" style="flex-direction:column;gap:9px;margin:0;flex:1;min-width:170px">${leg}</div>
  </div>`;
}
