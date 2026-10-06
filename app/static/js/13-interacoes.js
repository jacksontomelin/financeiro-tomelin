/* Tomelin Gestão Financeira · Interações: botão +, deslizar, voltar, sem internet, janelas, menus, calendário.
   Arquivo 13 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ── Botão "+" em leque ──────────────────────────────────────── */
function abrirFabMenu() {
  if (document.getElementById("leque")) return fecharLeque();
  const itens = [
    { rot: "Receita", ic: "arrowDown", cor: "#2F9E7E", acao: "formLancamento(null,'receita')" },
    { rot: "Despesa", ic: "arrowUp", cor: "#C9573F", acao: "formLancamento(null,'despesa')" },
    { rot: "Transferir", ic: "transfer", cor: "#305C74", acao: "_leqTransferir()" },
    { rot: "Nota fiscal", ic: "receipt", cor: "#C9A94E", acao: "abrirLeitorNFe()" },
    { rot: "Compra", ic: "wallet", cor: "#7F3F98", acao: "setView('compras');setTimeout(()=>abrirFormCompra(null,null),150)" },
  ];
  const n = itens.length, raio = Math.min(150, innerWidth * .36);
  const el = document.createElement("div");
  el.id = "leque"; el.className = "leque";
  el.innerHTML = `<div class="leque-fundo" onclick="fecharLeque()"></div>` + itens.map((it, i) => {
    const ang = Math.PI * (0.92 - (i / (n - 1)) * 0.84);          // arco de 165° a 15°
    return `<button class="leque-bt" style="--dx:${(Math.cos(ang) * raio).toFixed(0)}px;--dy:${(-Math.sin(ang) * raio).toFixed(0)}px;--i:${i};--c:${it.cor}"
              onclick="fecharLeque();${it.acao}"><span class="leque-ic">${icon(it.ic)}</span><span class="leque-rot">${it.rot}</span></button>`;
  }).join("");
  document.body.appendChild(el);
  document.querySelector(".btab-fab")?.classList.add("aberto");
  requestAnimationFrame(() => el.classList.add("aberto"));
  document.addEventListener("keydown", _lequeEsc);
}
function fecharLeque() {
  const el = document.getElementById("leque"); if (!el) return;
  el.classList.remove("aberto"); el.classList.add("fechando");
  document.querySelector(".btab-fab")?.classList.remove("aberto");
  document.removeEventListener("keydown", _lequeEsc);
  setTimeout(() => el.remove(), 260);
}
function _lequeEsc(e) { if (e.key === "Escape") fecharLeque(); }
async function _leqTransferir() {
  try { (await api("/api/contas")).forEach(c => _CACHE.contas[c.id] = c); } catch {}
  formTransferencia();
}

/* ── Deslizar o lançamento: direita dá baixa, esquerda edita ── */
const _SW = { el: null, x0: 0, y0: 0, dx: 0, ativo: false, fundo: null, bloqueiaClique: false };
function _swipeIniciar(lista) {
  if (!lista || lista._swipe) return; lista._swipe = true;
  lista.addEventListener("pointerdown", e => {
    const card = e.target.closest(".lanc-card"); if (!card || e.target.closest("button, a, input, select")) return;
    Object.assign(_SW, { el: card, x0: e.clientX, y0: e.clientY, dx: 0, ativo: false });
  });
  lista.addEventListener("pointermove", e => {
    if (!_SW.el) return;
    const dx = e.clientX - _SW.x0, dy = e.clientY - _SW.y0;
    if (!_SW.ativo) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { _SW.el = null; return; }   // é rolagem
      if (Math.abs(dx) < 12) return;
      _SW.ativo = true; _swipeFundo(_SW.el);
      try { _SW.el.setPointerCapture(e.pointerId); } catch {}
    }
    _SW.dx = dx > 0 ? Math.min(dx, 160) : Math.max(dx, -160);
    _SW.el.style.transition = "none";
    _SW.el.style.transform = `translateX(${_SW.dx}px) rotate(${_SW.dx / 90}deg)`;
    const f = _SW.fundo, perto = Math.min(1, Math.abs(_SW.dx) / 90);
    f.classList.toggle("dir", _SW.dx > 0); f.classList.toggle("esq", _SW.dx < 0);
    if (perto >= 1 && !f.classList.contains("pronto")) vibrar(14);
    f.classList.toggle("pronto", perto >= 1);
    f.style.setProperty("--p", perto.toFixed(2));
  });
  const soltar = () => {
    if (!_SW.el) return;
    const card = _SW.el, dx = _SW.dx, ativo = _SW.ativo;
    _SW.el = null;
    if (!ativo) return;
    _SW.bloqueiaClique = true; setTimeout(() => _SW.bloqueiaClique = false, 80);
    card.style.transition = "transform .35s cubic-bezier(.2,.9,.3,1.2)"; card.style.transform = "";
    setTimeout(() => _SW.fundo?.remove(), 330);
    const id = Number(card.dataset.id), l = _LANC_CACHE.get(id);
    if (!l || Math.abs(dx) < 90) return;
    localStorage.setItem("tom_dica_swipe", "1"); document.querySelector(".swipe-dica")?.remove();
    if (dx > 0) {
      if (l.data_pagamento) return toast(`"${l.descricao}" já está ${l.tipo === "receita" ? "recebido" : "pago"}.`);
      formBaixa(l);
    } else formLancamentoId(id);
  };
  lista.addEventListener("pointerup", soltar); lista.addEventListener("pointercancel", soltar);
  lista.addEventListener("click", e => { if (_SW.bloqueiaClique) { e.stopPropagation(); e.preventDefault(); } }, true);
}
function _swipeFundo(card) {
  _SW.fundo?.remove();
  const f = document.createElement("div"); f.className = "swipe-fundo";
  f.style.cssText = `top:${card.offsetTop}px;height:${card.offsetHeight}px`;
  f.innerHTML = `<span class="sw-a dir">${icon("check")}<b>Dar baixa</b></span><span class="sw-a esq"><b>Editar</b>${icon("edit")}</span>`;
  card.parentElement.insertBefore(f, card); _SW.fundo = f;
}
function _swipeDica(lista) {
  if (!lista || localStorage.getItem("tom_dica_swipe") || !lista.querySelector(".lanc-card")) return;
  if (lista.querySelector(".swipe-dica")) return;
  lista.insertAdjacentHTML("afterbegin", `<div class="swipe-dica">
    <svg viewBox="0 0 120 44" aria-hidden="true"><rect x="8" y="10" width="78" height="24" rx="7" class="sd-c"/>
      <rect x="14" y="17" width="34" height="4" rx="2" class="sd-l"/><rect x="14" y="24" width="20" height="3" rx="1.5" class="sd-l"/>
      <g class="sd-mao"><path d="M64 30v-12a3 3 0 0 1 6 0v8l7 1.5a4 4 0 0 1 3 4.6L78.5 40H66z" fill="#fff" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></g></svg>
    <span><b>Dica:</b> deslize um lançamento para a <b>direita</b> para dar baixa, ou para a <b>esquerda</b> para editar.</span>
    <button class="btn-icon" onclick="localStorage.setItem('tom_dica_swipe','1');this.closest('.swipe-dica').remove()" title="Entendi">${icon("x")}</button></div>`);
}

/* ── Cena animada no topo de cada tela ───────────────────────── */
function _cenaTela(id) {
  const C = { t: "#2F817A", o: "#C9A94E", n: "currentColor", r: "#C9573F" };
  const s = (body, cls) => `<svg viewBox="0 0 32 32" class="tc ${cls}" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const cenas = {
    dashboard: s(`<path d="M5 27h22" stroke="${C.n}" stroke-width="2"/>${[[7, 16, C.t], [13, 10, C.o], [19, 6, C.t], [25, 12, C.o]].map(([x, h, c], i) => `<rect class="tc-b" style="--i:${i}" x="${x - 2}" y="${26 - h}" width="4" height="${h}" rx="1.5" fill="${c}"/>`).join("")}`, "tc-barras"),
    vencimentos: s(`<rect x="5" y="7" width="22" height="20" rx="3" stroke="${C.n}" stroke-width="2"/><path d="M5 12h22M11 4v5M21 4v5" stroke="${C.n}" stroke-width="2"/><path class="tc-folha" d="M5 12h22v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" fill="${C.o}" opacity=".35"/><circle class="tc-pisca" cx="21" cy="20" r="2.5" fill="${C.r}"/>`, "tc-cal"),
    relatorios: s(`<circle cx="16" cy="16" r="10" stroke="${C.n}" stroke-width="2"/><path class="tc-fatia" d="M16 16V6a10 10 0 0 1 9.5 13z" fill="${C.t}"/><path class="tc-fatia f2" d="M16 16l9.5 3A10 10 0 0 1 12 25.2z" fill="${C.o}"/>`, "tc-pizza"),
    orcamento: s(`<circle cx="15" cy="17" r="10" stroke="${C.n}" stroke-width="2"/><circle cx="15" cy="17" r="5.5" stroke="${C.o}" stroke-width="2"/><circle cx="15" cy="17" r="1.8" fill="${C.r}"/><g class="tc-flecha"><path d="M15 17L28 4" stroke="${C.t}" stroke-width="2.2"/><path d="M24 4h4v4" stroke="${C.t}" stroke-width="2.2"/></g>`, "tc-alvo"),
    metas: s(`<path d="M10 5h12v6a6 6 0 0 1-12 0z" stroke="${C.o}" stroke-width="2" fill="${C.o}" fill-opacity=".25"/><path d="M10 7H6a4 4 0 0 0 4 5M22 7h4a4 4 0 0 1-4 5M16 17v5M11 27h10M13 22h6v5h-6z" stroke="${C.o}" stroke-width="2"/><path class="tc-brilho" d="M26 18l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="${C.t}"/>`, "tc-trofeu"),
    contas: s(`<path d="M5 11a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" stroke="${C.n}" stroke-width="2"/><path d="M27 15h-5a2.5 2.5 0 0 0 0 5h5" stroke="${C.n}" stroke-width="2"/><circle class="tc-moeda" cx="16" cy="4" r="3.5" fill="${C.o}"/>`, "tc-carteira"),
    lancamentos: s(`<path d="M6 10h16M18 6l4 4-4 4" stroke="${C.t}" stroke-width="2.2"/><path d="M26 22H10M14 18l-4 4 4 4" stroke="${C.o}" stroke-width="2.2"/>`, "tc-setas"),
    compras: s(`<path d="M7 11h18l-1.5 14a2 2 0 0 1-2 2H10.5a2 2 0 0 1-2-2z" stroke="${C.n}" stroke-width="2" fill="${C.o}" fill-opacity=".2"/><path d="M12 11V8a4 4 0 0 1 8 0v3" stroke="${C.n}" stroke-width="2"/>`, "tc-sacola"),
    veiculos: s(`<path d="M5 20v-4l3-6h14l4 6v4z" stroke="${C.n}" stroke-width="2"/><path class="tc-vento" d="M1 13h3M0 17h3" stroke="${C.t}" stroke-width="1.8"/><g class="tc-roda"><circle cx="10" cy="22" r="3" fill="var(--card)" stroke="${C.n}" stroke-width="2"/><path d="M10 19v6" stroke="${C.n}" stroke-width="1.2"/></g><g class="tc-roda r2"><circle cx="22" cy="22" r="3" fill="var(--card)" stroke="${C.n}" stroke-width="2"/><path d="M22 19v6" stroke="${C.n}" stroke-width="1.2"/></g>`, "tc-carro"),
    categorias: s(`<g class="tc-tag"><path d="M5 6h10l12 12-9 9L6 15z" stroke="${C.n}" stroke-width="2" fill="${C.t}" fill-opacity=".2"/><circle cx="10.5" cy="11" r="2" fill="${C.o}"/></g>`, "tc-etiqueta"),
    contatos: s(`<circle cx="12" cy="11" r="4" stroke="${C.n}" stroke-width="2"/><path d="M4 26c0-5 3.5-8 8-8s8 3 8 8" stroke="${C.n}" stroke-width="2"/><g class="tc-aceno"><path d="M24 8v8M21 10.5l3-2.5 3 2.5" stroke="${C.o}" stroke-width="2"/></g>`, "tc-pessoas"),
    usuarios: s(`<path class="tc-coracao" d="M16 26s-10-6-10-13a5.5 5.5 0 0 1 10-3.2A5.5 5.5 0 0 1 26 13c0 7-10 13-10 13z" fill="${C.r}" fill-opacity=".85"/>`, "tc-familia"),
    configuracoes: s(`<g class="tc-engrenagem"><circle cx="16" cy="16" r="4" stroke="${C.n}" stroke-width="2"/><path d="M16 3v4M16 25v4M3 16h4M25 16h4M6.8 6.8l2.8 2.8M22.4 22.4l2.8 2.8M6.8 25.2l2.8-2.8M22.4 9.6l2.8-2.8" stroke="${C.n}" stroke-width="2.2"/></g>`, "tc-gear"),
    whatsapp: s(`<path d="M5 8a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H13l-6 5v-5H8a3 3 0 0 1-3-3z" stroke="${C.n}" stroke-width="2" fill="${C.t}" fill-opacity=".15"/>${[11, 16, 21].map((x, i) => `<circle class="tc-ponto" style="--i:${i}" cx="${x}" cy="13.5" r="1.8" fill="${C.t}"/>`).join("")}`, "tc-chat"),
  };
  cenas.pagar = cenas.receber = cenas.lancamentos;
  cenas.fatura = cenas.contas;
  return cenas[id] || cenas.dashboard;
}


/* ── Botão voltar (Android, gesto de voltar, navegador) ──────────
   Fecha o que estiver aberto antes de mudar de tela; no Painel, pede
   um segundo toque para sair. Funciona com um único "degrau" de guarda
   no histórico, então abrir e fechar janelas pelo código não bagunça nada. */
const _PILHA_TELAS = [];
let _naVolta = false, _ultimoVoltar = 0;
function _historicoIniciar() {
  if (window._historicoOk) return;
  window._historicoOk = true;
  history.replaceState({ tomelin: "raiz" }, "");
  history.pushState({ tomelin: "guarda" }, "");
  addEventListener("popstate", _aoVoltar);
}
function _aoVoltar() {
  const repor = () => history.pushState({ tomelin: "guarda" }, "");
  if (!State.token) return;                                           // tela de login: deixa sair
  if (_DLG_ATUAL) { _DLG_ATUAL.cancelar(); return repor(); }
  if (document.getElementById("menu-lanc")) { _folhaFechar(); return repor(); }
  if (document.getElementById("bv")) { _bvFechar(); return repor(); }
  if (document.querySelector(".dp-pop")) { _dpFechar(); return repor(); }
  if (document.getElementById("leque")) { fecharLeque(); return repor(); }
  const visor = document.querySelector(".anx-viewer"); if (visor) { visor.click(); return repor(); }
  if (modalRoot().children.length) { fecharModal(); return repor(); }   // a troca obrigatória de senha não fecha
  if (State.sidebarOpen) { toggleSidebar(false); return repor(); }
  const anterior = _PILHA_TELAS.pop() || (State.view !== "dashboard" ? "dashboard" : null);
  if (anterior) { _naVolta = true; setView(anterior); _naVolta = false; return repor(); }
  const agora = Date.now();
  if (agora - _ultimoVoltar < 2200) { history.back(); return; }        // segundo toque: sai do app
  _ultimoVoltar = agora; toast("Toque em voltar de novo para sair"); repor();
}

/* ── Atalhos do ícone do app e links diretos: /?acao=despesa, /?tela=vencimentos ── */
function _acaoInicial() {
  const q = new URLSearchParams(location.search);
  const acao = q.get("acao"), tela = q.get("tela");
  if (!acao && !tela && !q.has("origem")) return;
  history.replaceState(history.state, "", location.pathname);
  if (tela && META[tela]) setView(tela);
  if (acao === "despesa" || acao === "receita") formLancamento(null, acao);
  else if (acao === "transferir") _leqTransferir();
  else if (acao === "nfe") abrirLeitorNFe();
}

/* ── Sem internet: aviso fixo enquanto durar; ao voltar, atualiza a tela ── */
function _redeEstado(ev) {
  const off = navigator.onLine === false;
  let b = document.getElementById("sem-rede");
  if (off && !b) {
    b = document.createElement("div"); b.id = "sem-rede"; b.className = "sem-rede"; b.setAttribute("role", "status");
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.8M19 12.9a10 10 0 0 0-2.5-1.7"/>
        <path d="M1.5 9a15 15 0 0 1 4.6-2.9M22.5 9A15 15 0 0 0 11 5.1"/><circle cx="12" cy="20" r="1"/></svg>
      <span>Sem internet. Você vê o que já estava carregado; lançamentos novos ficam guardados e sobem quando a conexão voltar.</span>`;
    document.body.appendChild(b);
  } else if (!off && b) {
    b.remove();
    if (ev) { toast("Conexão de volta", "ok"); if (State.token) setView(State.view); }
  }
}
addEventListener("online", _redeEstado); addEventListener("offline", _redeEstado);


/* ── Janelas do sistema no lugar das caixas do navegador ─────────
   confirmar({ titulo, texto, detalhe, tipo: "perigo"|"aviso"|"info", figura,
               ok, cancelar, itens: [{rot, valor, marcado}], okItens: n => "...", campo })
   devolve true/false; com itens, a lista de índices marcados (ou null). */
const _DLG_FIG = {
  lixeira: `<svg viewBox="0 0 120 96" class="fg fg-lixeira" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <g class="fg-papel"><rect x="50" y="6" width="20" height="24" rx="3" fill="#fff" stroke="#F2A08F" stroke-width="2"/><path d="M55 14h10M55 20h7" stroke="#F2A08F" stroke-width="2"/></g>
      <g class="fg-tampa"><path d="M34 34h52" stroke="#fff" stroke-width="5"/><path d="M52 34v-5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5" stroke="#fff" stroke-width="4"/></g>
      <path d="M39 40l4 44a5 5 0 0 0 5 4h24a5 5 0 0 0 5-4l4-44z" fill="rgba(255,255,255,.18)" stroke="#fff" stroke-width="4"/>
      <path d="M52 50v26M60 50v26M68 50v26" stroke="#fff" stroke-width="3" opacity=".8"/></svg>`,
  alerta: `<svg viewBox="0 0 120 96" class="fg fg-alerta" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <g class="fg-raios" stroke="#fff" stroke-width="3" opacity=".7"><path d="M20 30l8 5M100 30l-8 5M60 4v8M14 60h9M106 60h-9"/></g>
      <g class="fg-tri"><path d="M60 16L96 82H24z" fill="rgba(255,255,255,.2)" stroke="#fff" stroke-width="5"/><path d="M60 40v20" stroke="#fff" stroke-width="6"/><circle cx="60" cy="70" r="3.5" fill="#fff"/></g></svg>`,
  pergunta: `<svg viewBox="0 0 120 96" class="fg fg-pergunta" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <g class="fg-balao"><path d="M28 18h64a8 8 0 0 1 8 8v34a8 8 0 0 1-8 8H58l-16 14V68H28a8 8 0 0 1-8-8V26a8 8 0 0 1 8-8z" fill="rgba(255,255,255,.18)" stroke="#fff" stroke-width="4"/>
      <path d="M51 36a9 9 0 1 1 13 8c-3 2-4 3-4 7" stroke="#fff" stroke-width="5"/><circle cx="60" cy="58" r="3" fill="#fff"/></g></svg>`,
  moedas: `<svg viewBox="0 0 120 96" class="fg fg-moedas" fill="none">
      ${[78, 68, 58].map(y => `<ellipse cx="44" cy="${y + 6}" rx="22" ry="7" fill="#B8923A"/><ellipse cx="44" cy="${y}" rx="22" ry="7" fill="#F4D27A" stroke="#8C6D24" stroke-width="1.5"/>`).join("")}
      <g class="fg-moeda"><ellipse cx="44" cy="22" rx="22" ry="7" fill="#F4D27A" stroke="#8C6D24" stroke-width="1.5"/></g>
      <g class="fg-alvo"><circle cx="86" cy="42" r="20" stroke="#fff" stroke-width="4"/><circle cx="86" cy="42" r="11" stroke="#fff" stroke-width="3.5"/><circle cx="86" cy="42" r="3.5" fill="#fff"/></g></svg>`,
  desfazer: `<svg viewBox="0 0 120 96" class="fg fg-desfazer" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <g class="fg-giro"><path d="M38 34a28 28 0 1 1-4 26" stroke="#fff" stroke-width="6"/><path d="M28 22v16h16" stroke="#fff" stroke-width="6"/></g>
      <text x="60" y="58" text-anchor="middle" font-size="18" font-weight="800" fill="#fff" font-family="Numeros, sans-serif">R$</text></svg>`,
  pessoa: `<svg viewBox="0 0 120 96" class="fg fg-pessoa" fill="none" stroke-linecap="round">
      <circle cx="52" cy="32" r="14" fill="rgba(255,255,255,.2)" stroke="#fff" stroke-width="4"/><path d="M24 84c0-17 12-28 28-28s28 11 28 28" fill="rgba(255,255,255,.2)" stroke="#fff" stroke-width="4"/>
      <g class="fg-menos"><circle cx="90" cy="34" r="14" fill="#fff"/><path d="M83 34h14" stroke="#C9573F" stroke-width="5"/></g></svg>`,
  repetir: `<svg viewBox="0 0 120 96" class="fg fg-repetir" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <g class="fg-giro2"><path d="M30 44a30 30 0 0 1 52-18M90 52a30 30 0 0 1-52 18" stroke="#fff" stroke-width="5"/><path d="M80 14l4 13-13 3M40 82l-4-13 13-3" stroke="#fff" stroke-width="5"/></g>
      <g class="fg-pare"><circle cx="60" cy="48" r="13" fill="#fff"/><rect x="54" y="42" width="12" height="12" rx="2" fill="#C9A94E"/></g></svg>`,
  copiar: `<svg viewBox="0 0 120 96" class="fg fg-copiar" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <rect x="30" y="14" width="40" height="52" rx="6" fill="rgba(255,255,255,.15)" stroke="#fff" stroke-width="4"/>
      <g class="fg-copia"><rect x="50" y="30" width="40" height="52" rx="6" fill="rgba(255,255,255,.25)" stroke="#fff" stroke-width="4"/>
      <path d="M62 52a6 6 0 0 1 0-8l4-4a6 6 0 0 1 8 8l-2 2M78 58a6 6 0 0 1 0 8l-4 4a6 6 0 0 1-8-8l2-2" stroke="#fff" stroke-width="3.5"/></g></svg>`,
};
let _DLG_ATUAL = null;
function confirmar(o = {}) {
  const tipo = o.tipo || "aviso";
  const fig = _DLG_FIG[o.figura] || _DLG_FIG[tipo === "perigo" ? "lixeira" : tipo === "info" ? "pergunta" : "alerta"];
  return new Promise(resolve => {
    _DLG_ATUAL?.cancelar();                       // nunca empilha duas
    const el = document.createElement("div");
    el.className = `dlg dlg-${tipo}`;
    const itens = Array.isArray(o.itens) ? o.itens : null;
    el.innerHTML = `
      <div class="dlg-fundo"></div>
      <div class="dlg-caixa" role="alertdialog" aria-modal="true" aria-labelledby="dlg-tit">
        <div class="dlg-topo">${fig}</div>
        <div class="dlg-corpo">
          <h3 id="dlg-tit" class="dlg-tit">${esc(o.titulo || "Tem certeza?")}</h3>
          ${o.texto ? `<p class="dlg-txt">${esc(o.texto)}</p>` : ""}
          ${itens ? `<div class="dlg-itens">${itens.map((it, i) => `
              <label class="dlg-item" style="--i:${i}"><input type="checkbox" data-i="${i}" ${it.marcado === false ? "" : "checked"}>
                <span class="dlg-ck">${icon("check")}</span><span class="dlg-rot">${esc(it.rot)}</span>${it.valor ? `<b class="mono-num">${esc(it.valor)}</b>` : ""}</label>`).join("")}</div>
            <div class="dlg-todos"><button type="button" data-todos="1">Marcar todas</button><button type="button" data-todos="0">Nenhuma</button></div>` : ""}
          ${o.campo != null ? `<input class="dlg-campo" readonly value="${esc(o.campo)}" aria-label="Texto para copiar">` : ""}
          ${o.digitar ? `<label class="dlg-digitar">Para confirmar, digite <b>${esc(o.digitar)}</b><input class="dlg-campo" autocomplete="off" autocapitalize="characters" aria-label="Digite ${esc(o.digitar)} para confirmar"></label>` : ""}
          ${o.detalhe ? `<div class="dlg-det">${icon(tipo === "perigo" ? "alert" : "shield")}<span>${esc(o.detalhe)}</span></div>` : ""}
          <div class="dlg-bts">
            <button type="button" class="btn btn-ghost dlg-nao">${esc(o.cancelar || "Cancelar")}</button>
            <button type="button" class="btn dlg-sim">${esc(o.ok || "Confirmar")}</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    const sim = el.querySelector(".dlg-sim"), nao = el.querySelector(".dlg-nao");
    const marcados = () => [...el.querySelectorAll(".dlg-item input:checked")].map(c => Number(c.dataset.i));
    const dig = o.digitar ? el.querySelector(".dlg-digitar input") : null;
    if (dig) { sim.disabled = true; dig.oninput = () => { sim.disabled = dig.value.trim().toUpperCase() !== String(o.digitar).toUpperCase(); }; }
    const rotulo = () => { if (!itens) return; const n = marcados().length; sim.disabled = !n;
      sim.textContent = n ? (o.okItens ? o.okItens(n) : `${o.ok || "Confirmar"} (${n})`) : "Nada marcado"; };
    const fim = valor => {
      if (el.classList.contains("saindo")) return;
      el.classList.add("saindo"); document.removeEventListener("keydown", tecla, true);
      _DLG_ATUAL = null; setTimeout(() => el.remove(), 240); resolve(valor);
    };
    const tecla = e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fim(itens ? null : false); }
      else if (e.key === "Enter") {
        const a = document.activeElement;
        if (a === nao || a === sim || a?.type === "checkbox") return;    // o próprio botão/caixa decide
        e.preventDefault();
        // perigo (excluir): Enter só confirma com o foco no botão de confirmar; senão volta ao Cancelar
        if (tipo === "perigo" && !(dig && !sim.disabled && document.activeElement === dig)) nao.focus();
        else if (dig && !sim.disabled) sim.click();
        else if (!sim.disabled) sim.click();
      }
      else if (e.key === "Tab") {                              // o foco não sai da janela
        const f = [...el.querySelectorAll("button:not(:disabled), input")];
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    };
    sim.onclick = () => fim(itens ? marcados() : true);
    nao.onclick = () => fim(itens ? null : false);
    el.querySelector(".dlg-fundo").onclick = () => {
      const cx = el.querySelector(".dlg-caixa"); cx.classList.remove("tremer"); void cx.offsetWidth; cx.classList.add("tremer");
      (tipo === "perigo" ? nao : sim).focus();                        // o foco não fica solto fora da janela
    };
    el.querySelectorAll(".dlg-item input").forEach(c => c.onchange = rotulo);
    el.querySelectorAll("[data-todos]").forEach(b => b.onclick = () => { el.querySelectorAll(".dlg-item input").forEach(c => c.checked = b.dataset.todos === "1"); rotulo(); });
    document.addEventListener("keydown", tecla, true);
    _DLG_ATUAL = { cancelar: () => fim(itens ? null : false) };
    rotulo();
    requestAnimationFrame(() => {
      const campo = el.querySelector(".dlg-campo");
      if (dig) dig.focus(); else if (campo) { campo.focus(); campo.select(); } else (tipo === "perigo" ? nao : sim).focus();
    });
  });
}


/* ── Vibração curta (Android); em outros aparelhos não faz nada ── */
function vibrar(ms = 18) { try { if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) navigator.vibrate?.(ms); } catch {} }

/* ── Segurar o lançamento: anel enche, vibra e abre o menu de ações ── */
let _SEGURA = null;
function _seguraIniciar(lista) {
  if (!lista || lista._segura) return; lista._segura = true;
  lista.addEventListener("pointerdown", e => {
    const card = e.target.closest(".lanc-card"); if (!card || e.target.closest("button, a, input, select")) return;
    _seguraCancelar();
    const anel = document.createElement("div"); anel.className = "anel-toque";
    anel.style.left = e.clientX + "px"; anel.style.top = e.clientY + "px";
    anel.innerHTML = `<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18"/></svg>`;
    document.body.appendChild(anel);
    _SEGURA = { card, x: e.clientX, y: e.clientY, anel, t: setTimeout(() => {
      const id = Number(card.dataset.id); _seguraCancelar(); vibrar(28);
      _SW.el = null; _SW.bloqueiaClique = true; setTimeout(() => _SW.bloqueiaClique = false, 450);
      card.classList.add("pulsou"); setTimeout(() => card.classList.remove("pulsou"), 400);
      _menuLanc(id);
    }, 480) };
  });
  const mexeu = e => { if (_SEGURA && Math.hypot(e.clientX - _SEGURA.x, e.clientY - _SEGURA.y) > 9) _seguraCancelar(); };
  lista.addEventListener("pointermove", mexeu);
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev => lista.addEventListener(ev, _seguraCancelar));
  lista.addEventListener("contextmenu", e => {                   // botão direito no computador: mesmo menu
    const card = e.target.closest(".lanc-card"); if (!card) return;
    e.preventDefault(); _seguraCancelar(); _menuLanc(Number(card.dataset.id));
  });
}
function _seguraCancelar() { if (!_SEGURA) return; clearTimeout(_SEGURA.t); _SEGURA.anel.remove(); _SEGURA = null; }

/* ── Menu de ações do lançamento (folha colorida) ── */
function _menuLanc(id) {
  const l = _LANC_CACHE.get(id); if (!l) return;
  const pago = !!l.data_pagamento, rec = l.tipo === "receita";
  const cat = (State.cats || []).find(c => c.id === l.categoria_id);
  const acoes = [
    pago ? { rot: rec ? "Desfazer recebimento" : "Desfazer pagamento", ic: "refresh", c1: "#8A6D1E", c2: "#C9A94E", f: `estornar(${id})` }
         : { rot: rec ? "Recebi" : "Paguei", ic: "check", c1: "#1F6F5C", c2: "#3EA88A", f: `formBaixa(_LANC_CACHE.get(${id}))` },
    { rot: "Editar", ic: "edit", c1: "#082D51", c2: "#305C74", f: `formLancamentoId(${id})` },
    { rot: "Duplicar", ic: "doc", c1: "#5B3FA0", c2: "#8B6BD8", f: `_lancDuplicar(${id})` },
    l.recorrencia_id ? { rot: "Repetições", ic: "repeat", c1: "#1C6E8C", c2: "#38A3C9", f: `abrirRecorrencias()` }
                     : { rot: "Repetir todo mês", ic: "repeat", c1: "#1C6E8C", c2: "#38A3C9", f: `_lancRepetir(${id})` },
    { rot: "Comprovante", ic: "clip", c1: "#B35C1E", c2: "#E59A4B", f: `_lancComprovante(${id})` },
    { rot: "Recibo", ic: "doc", c1: "#2F5D50", c2: "#4E9C84", f: `abrirPDF('/api/lancamentos/${id}/recibo.pdf')` },
    { rot: "Compartilhar", ic: "send", c1: "#1E7A4A", c2: "#25B26A", f: `_lancCompartilhar(${id})` },
    { rot: "Recibo no WhatsApp", ic: "whatsapp", c1: "#DDF8E8", c2: "#B4EFCD", f: `reciboWhats(${id})` },
    { rot: "Histórico", ic: "clock", c1: "#3A4654", c2: "#7E8C9A", f: `verHistoricoLanc(${id})` },
    { rot: "Excluir", ic: "trash", c1: "#8E3326", c2: "#D0624E", f: `excluirLanc(${id})` },
  ];
  document.getElementById("menu-lanc")?.remove();
  const el = document.createElement("div"); el.id = "menu-lanc"; el.className = "folha";
  el.innerHTML = `
    <div class="folha-fundo" onclick="_folhaFechar()"></div>
    <div class="folha-caixa" style="--cat:${_corOk(cat?.cor, "#305C74")}">
      <div class="folha-alca"></div>
      <div class="folha-cab">
        <span class="folha-ic ${rec ? "rec" : "desp"}">${icon(rec ? "arrowDown" : "arrowUp")}</span>
        <div class="folha-tit"><b>${esc(l.descricao)}</b>
          <small>${cat ? `<i style="background:${_corOk(cat.cor)}"></i>${esc(cat.nome)} · ` : ""}${pago ? (rec ? "Recebido" : "Pago") : (l.status === "atrasado" ? "Atrasado" : "Pendente")}</small></div>
        <span class="folha-valor mono-num">${money(Number(l.valor_total ?? l.valor ?? 0))}</span>
      </div>
      <div class="folha-grade">
        ${acoes.map((a, i) => `<button class="folha-bt" style="--c1:${a.c1};--c2:${a.c2};--i:${i}" onclick="_folhaFechar();vibrar(12);${a.f}">
            <span class="folha-bt-ic">${icon(a.ic)}</span><span>${a.rot}</span></button>`).join("")}
      </div>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("aberta"));
  _DLG_ATUAL_FOLHA = true;
}
let _DLG_ATUAL_FOLHA = false;
function _folhaFechar() {
  const el = document.getElementById("menu-lanc"); if (!el) return;
  _DLG_ATUAL_FOLHA = false; el.classList.remove("aberta"); el.classList.add("saindo"); setTimeout(() => el.remove(), 260);
}
async function _lancDuplicar(id) {
  const l = _LANC_CACHE.get(id); if (!l) return;
  const d = v => v ? String(v).slice(0, 10) : null;
  const body = { descricao: l.descricao, tipo: l.tipo, valor: Number(l.valor), categoria_id: l.categoria_id, conta_id: l.conta_id,
    contato_id: l.contato_id, obs: l.obs || null, data_competencia: d(l.data_competencia || l.competencia),
    data_vencimento: d(l.data_vencimento || l.vencimento), data_pagamento: null };
  try {
    const novo = await api("/api/lancamentos", { method: "POST", body: JSON.stringify(body) });
    toast(`"${l.descricao}" duplicado como pendente`, "ok");
    await recarregarTabela();
    const c = document.querySelector(`#lanc-lista .lanc-card[data-id="${novo.id}"]`);
    if (c) { c.scrollIntoView({ block: "center", behavior: "smooth" }); c.classList.add("destaque"); setTimeout(() => c.classList.remove("destaque"), 1600); }
  } catch (e) { toast(e.message, "err"); }
}
async function _lancRepetir(id) {
  try {
    const r = await api("/api/recorrencias", { method: "POST", body: JSON.stringify({ lancamento_id: id, frequencia: "mensal" }) });
    toast(`Vai se repetir todo dia ${r.dia}${r.criadas ? ` (${r.criadas} próxima(s) criada(s))` : ""}`, "ok"); celebrar("Repetindo todo mês!");
    recarregarTabela();
  } catch (e) { toast(e.message, "err"); }
}
async function _lancComprovante(id) {
  await formLancamentoId(id);
  setTimeout(() => { const b = document.getElementById("anx-lista")?.closest(".campo"); if (b) { b.scrollIntoView({ block: "center", behavior: "smooth" }); b.classList.add("destaque"); setTimeout(() => b.classList.remove("destaque"), 1800); } }, 400);
}
async function _lancCompartilhar(id) {
  const l = _LANC_CACHE.get(id); if (!l) return;
  const venc = l.data_vencimento || l.vencimento;
  const texto = `${l.tipo === "receita" ? "Receita" : "Despesa"}: ${l.descricao}\nValor: ${money(Number(l.valor_total ?? l.valor ?? 0))}`
    + (venc ? `\nVencimento: ${dataBR(String(venc).slice(0, 10))}` : "") + `\nSituação: ${l.data_pagamento ? "pago" : "pendente"}`;
  if (navigator.share) { try { await navigator.share({ title: l.descricao, text: texto }); return; } catch (e) { if (e?.name === "AbortError") return; } }
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
}

/* ── Puxar para atualizar (celular) ── */
(function () {
  let y0 = null, puxando = false, ind = null, atualizando = false;
  const LIMITE = 78;
  const podeComecar = e => !atualizando && window.scrollY <= 0 && State.token && !modalRoot()?.children.length
    && !document.querySelector(".folha, .dlg, #leque, .dp-pop") && !e.target?.closest?.(".cc-faixa, .imp-lista, .dlg-itens, .atalhos, .periodos");
  addEventListener("touchstart", e => { if (e.touches.length === 1 && podeComecar(e)) { y0 = e.touches[0].clientY; puxando = false; } }, { passive: true });
  addEventListener("touchmove", e => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy <= 0 || window.scrollY > 0) { if (ind) ind.style.transform = "translate(-50%, -70px)"; return; }
    if (!ind) { ind = document.createElement("div"); ind.className = "puxa"; ind.innerHTML = `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" class="pu-moeda"/><text x="20" y="25.5" text-anchor="middle">R$</text></svg><span>Puxe para atualizar</span>`; document.body.appendChild(ind); }
    puxando = true;
    const d = Math.min(dy * .5, 110);
    ind.style.transform = `translate(-50%, ${d - 60}px)`;
    ind.querySelector("svg").style.transform = `rotate(${d * 4}deg)`;
    const pronto = d >= LIMITE;
    if (pronto && !ind.classList.contains("pronto")) vibrar(10);
    ind.classList.toggle("pronto", pronto);
    ind.querySelector("span").textContent = pronto ? "Solte para atualizar" : "Puxe para atualizar";
  }, { passive: true });
  addEventListener("touchend", async () => {
    if (y0 == null) return; y0 = null;
    if (!ind) return;
    const pronto = ind.classList.contains("pronto") && puxando;
    const el = ind;
    if (!pronto) { el.style.transform = "translate(-50%, -70px)"; setTimeout(() => el.remove(), 250); ind = null; return; }
    atualizando = true; el.classList.add("girando"); el.style.transform = "translate(-50%, 18px)"; el.querySelector("span").textContent = "Atualizando...";
    try { await setView(State.view); atualizarBadge?.(); } catch {}
    el.querySelector("span").textContent = "Atualizado"; el.classList.add("ok"); vibrar(14);
    setTimeout(() => { el.style.transform = "translate(-50%, -70px)"; setTimeout(() => el.remove(), 260); }, 500);
    ind = null; atualizando = false;
  });
})();

function _periodo(k) {
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const ini = (a, m) => new Date(a, m, 1), fim = (a, m) => new Date(a, m + 1, 0);
  const [a, m] = [h.getFullYear(), h.getMonth()];
  const faixas = { "": ["", ""], hoje: [iso(h), iso(h)], "7d": [iso(new Date(h.getTime() - 6 * 864e5)), iso(h)],
    mes: [iso(ini(a, m)), iso(fim(a, m))], mesant: [iso(ini(a, m - 1)), iso(fim(a, m - 1))], prox: [iso(ini(a, m + 1)), iso(fim(a, m + 1))] };
  [FILTRO.de, FILTRO.ate] = faixas[k] || ["", ""];
  document.querySelectorAll("#periodos .periodo").forEach(b => b.classList.toggle("on", b.dataset.p === k));
  vibrar(8); recarregarTabela();
}


/* ── Mascote: cofrinho que reage à saúde financeira e dá dicas ── */
function _mascoteSVG(nota) {
  const humor = nota >= 65 ? "feliz" : nota >= 40 ? "atento" : "preocupado";
  const boca = humor === "feliz" ? "M50 60q8 7 16 0" : humor === "atento" ? "M51 62h14" : "M50 64q8-6 16 0";
  return `<svg viewBox="0 0 120 100" class="mc mc-${humor}" aria-hidden="true">
    <defs><radialGradient id="mcCorpo" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#FFC6D4"/><stop offset="1" stop-color="#E7799A"/></radialGradient></defs>
    <g class="mc-moeda"><circle cx="62" cy="10" r="7" fill="#F4D27A" stroke="#8C6D24" stroke-width="1.5"/><path d="M59 10h6" stroke="#8C6D24" stroke-width="1.5" stroke-linecap="round"/></g>
    <g class="mc-corpo">
      <path d="M96 52c8-2 12 4 9 9" fill="none" stroke="#D86889" stroke-width="3" stroke-linecap="round" class="mc-rabo"/>
      <ellipse cx="58" cy="58" rx="40" ry="31" fill="url(#mcCorpo)"/>
      <path d="M36 32l-4-14 14 8z" fill="#E7799A"/><path d="M38 29l-2-7 7 4z" fill="#FFC6D4"/>
      <rect x="50" y="29" width="16" height="4" rx="2" fill="#B9506F"/>
      <rect x="34" y="82" width="9" height="11" rx="4" fill="#D86889"/><rect x="72" y="82" width="9" height="11" rx="4" fill="#D86889"/>
      <ellipse cx="22" cy="60" rx="10" ry="8" fill="#F7A3BA" stroke="#D86889" stroke-width="2"/>
      <circle cx="19" cy="60" r="1.8" fill="#B9506F"/><circle cx="25" cy="60" r="1.8" fill="#B9506F"/>
      <g class="mc-olho"><circle cx="46" cy="48" r="7" fill="#fff"/><circle class="mc-pupila" cx="46" cy="48" r="3.4" fill="#2A1B24"/></g>
      <g class="mc-olho"><circle cx="70" cy="48" r="7" fill="#fff"/><circle class="mc-pupila" cx="70" cy="48" r="3.4" fill="#2A1B24"/></g>
      <rect class="mc-palpebra" x="38" y="40" width="40" height="0" fill="#E7799A"/>
      <circle cx="38" cy="60" r="4" fill="#FF8FAE" opacity=".7"/><circle cx="78" cy="60" r="4" fill="#FF8FAE" opacity=".7"/>
      <path d="${boca}" fill="none" stroke="#7A2D47" stroke-width="2.6" stroke-linecap="round"/>
      ${humor === "preocupado" ? `<path class="mc-gota" d="M86 34c3 5 4 7 1 9s-6-1-4-4z" fill="#8FD3F4"/>` : ""}
    </g></svg>`;
}
function _mascoteDicas(k, orc, prev, venc) {
  const d = [];
  const res = (k.receitas_mes || 0) - (k.despesas_mes || 0);
  const atras = (venc?.atrasados || []).filter(l => l.tipo === "despesa").length;
  const neg = prev?.primeiro_negativo?.lancado || prev?.primeiro_negativo?.estimado;
  if (atras) d.push(`Você tem ${atras} conta(s) vencida(s). Toque em Vencer, lá embaixo, para resolver.`);
  if (neg) d.push(`Atenção: pela previsão, o saldo fica negativo em ${_dm(neg)}.`);
  if (orc?.estourados) d.push(`${orc.estourados} categoria(s) passaram do limite este mês.`);
  if (res > 0) d.push(`Sobrou ${money0(res)} este mês. Que tal guardar uma parte numa meta?`);
  if (res < 0) d.push(`Este mês saiu ${money0(-res)} a mais do que entrou.`);
  if (!orc?.limite_total) d.push("Defina limites no Orçamento e eu aviso quando estiver perto de passar.");
  d.push("Segure o dedo num lançamento para ver todas as ações.", "Deslize um lançamento para a direita para dar baixa rapidinho.", "Puxe a tela para baixo para atualizar.");
  return d;
}
let _MC_DICAS = [], _MC_I = 0;
function _mascoteToque(el) {
  vibrar(12);
  el.classList.remove("pula"); void el.offsetWidth; el.classList.add("pula");
  const fala = el.querySelector(".mc-fala"); if (!fala || !_MC_DICAS.length) return;
  fala.textContent = _MC_DICAS[_MC_I++ % _MC_DICAS.length];
  fala.classList.remove("mostra"); void fala.offsetWidth; fala.classList.add("mostra");
}
addEventListener("pointermove", e => {                      // olhos acompanham o dedo ou o mouse
  if (window._mcRaf) return;
  window._mcRaf = requestAnimationFrame(() => {
    window._mcRaf = null;
    document.querySelectorAll(".mc .mc-olho").forEach(o => {
      const c = o.querySelector("circle"), p = o.querySelector(".mc-pupila"), r = c.getBoundingClientRect();
      if (!r.width) return;
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1, m = Math.min(3, d / 30);
      p.setAttribute("transform", `translate(${(dx / d * m).toFixed(2)} ${(dy / d * m).toFixed(2)})`);
    });
  });
}, { passive: true });

/* ── Calendário de vencimentos: próximos 30 dias ── */
let _CAL = null;
async function _calVenc() {
  const box = document.getElementById("cal-venc"); if (!box) return;
  let v; try { v = await api("/api/dashboard/vencimentos?dias=30"); } catch { box.remove(); return; }
  if (!document.getElementById("cal-venc")) return;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const porDia = {};
  (v.proximos || []).forEach(l => { const k = String(l.vencimento).slice(0, 10); (porDia[k] = porDia[k] || []).push(l); });
  const dias = [{ k: "atrasados", rot: "Vencidas", num: "!", itens: v.atrasados || [], especial: true }]
    .concat(Array.from({ length: 31 }, (_, i) => { const d = new Date(hoje.getTime() + i * 864e5);
      return { k: iso(d), rot: i === 0 ? "Hoje" : i === 1 ? "Amanhã" : d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
               num: d.getDate(), itens: porDia[iso(d)] || [], fds: d.getDay() === 0 || d.getDay() === 6 }; }));
  const max = Math.max(1, ...dias.map(d => d.itens.reduce((s, l) => s + (l.tipo === "despesa" ? l.valor : 0), 0)));
  _CAL = dias;
  box.innerHTML = `
    <div class="card-h"><span class="card-ico i-gold">${icon("calendar")}</span>
      <div class="grow"><h3>Calendário dos próximos 30 dias</h3><div class="sub">Bolha maior, conta maior. Toque num dia para ver as contas.</div></div></div>
    <div class="cal-faixa">${dias.map((d, i) => {
      const pagar = d.itens.filter(l => l.tipo === "despesa").reduce((s, l) => s + l.valor, 0);
      const receber = d.itens.some(l => l.tipo === "receita");
      const tam = pagar ? 12 + Math.sqrt(pagar / max) * 22 : (receber ? 12 : 0);
      return `<button class="cal-dia${d.especial ? " especial" : ""}${d.fds ? " fds" : ""}${!d.itens.length ? " vazio" : ""}" data-i="${i}" style="--i:${i}" onclick="_calDia(${i})">
          <span class="cal-rot">${d.rot}</span><span class="cal-num">${d.num}</span>
          <span class="cal-bolha-area">${d.itens.length ? `<span class="cal-bolha ${d.especial ? "atras" : pagar ? "pagar" : "receber"}" style="--t:${tam.toFixed(0)}px">${d.itens.length > 1 ? d.itens.length : ""}</span>` : ""}</span>
        </button>`; }).join("")}</div>
    <div class="cal-det" id="cal-det"></div>`;
  const primeiro = dias.findIndex(d => d.itens.length);
  if (primeiro >= 0) _calDia(primeiro, true);
}
function _calDia(i, silencioso) {
  const d = _CAL?.[i]; if (!d) return;
  if (!silencioso) vibrar(8);
  document.querySelectorAll(".cal-dia").forEach(b => b.classList.toggle("on", Number(b.dataset.i) === i));
  const det = document.getElementById("cal-det"); if (!det) return;
  det.innerHTML = d.itens.length ? `<div class="cal-det-tit">${d.especial ? "Contas vencidas" : (d.rot === "Hoje" || d.rot === "Amanhã" ? d.rot : `Dia ${d.num}`)} · ${d.itens.length} conta(s)</div>`
    + d.itens.map((l, j) => {
        const venc = String(l.vencimento).slice(0, 10), rec = l.tipo === "receita";
        const atras = d.especial ? Math.max(1, Math.round((new Date().setHours(0, 0, 0, 0) - new Date(venc + "T00:00:00")) / 864e5)) : 0;
        return `<div class="cal-item ${l.tipo}" style="--j:${j}">
        <span class="cal-item-ic">${icon(rec ? "arrowDown" : "arrowUp")}</span>
        <b class="cal-item-nome">${esc(l.descricao)}</b>
        <span class="mono-num cal-item-val">${money(l.valor)}</span>
        <span class="cal-item-meta"><span>${esc(l.categoria || "Sem categoria")}</span>${atras ? `<em class="cal-atras">${icon("clock")}${atras === 1 ? "venceu ontem" : `venceu há ${atras} dias`}</em>` : ""}</span>
        <button class="cal-item-bt" onclick="formBaixaId(${l.id})">${icon("check")}${rec ? "Recebi" : "Paguei"}</button>
      </div>`; }).join("")
    : `<div class="cal-vazio">${icon("checkCircle")}Nenhuma conta neste dia.</div>`;
}

/* ── Banner colorido das listas (a pagar, a receber, extrato) ── */
function _lancBanner(itens, tipo) {
  const box = document.getElementById("lanc-banner"); if (!box || FILTRO.status) return;
  const h = new Date(), mes = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`;
  const val = l => Number(l.valor_total ?? l.valor ?? 0);
  const soma = f => itens.filter(f).reduce((s, l) => s + val(l), 0), conta = f => itens.filter(f).length;
  const pend = l => !l.data_pagamento && l.status !== "atrasado", atr = l => !l.data_pagamento && l.status === "atrasado";
  const pago = l => l.data_pagamento && String(l.data_pagamento).slice(0, 7) === mes;
  const rec = tipo === "receita";
  const fig = tipo === "despesa" ? `<svg viewBox="0 0 140 100" class="lb-fig"><g class="lb-moedas">${[0, 1, 2].map(i => `<circle class="lb-m m${i}" cx="${84 + i * 14}" cy="30" r="8" fill="#F4D27A" stroke="#8C6D24" stroke-width="1.5"/>`).join("")}</g>
      <rect x="22" y="38" width="86" height="54" rx="12" fill="rgba(255,255,255,.18)" stroke="#fff" stroke-width="3.5"/><path d="M108 56h-18a9 9 0 0 0 0 18h18" fill="rgba(255,255,255,.25)" stroke="#fff" stroke-width="3.5"/><circle cx="92" cy="65" r="3" fill="#fff"/></svg>`
    : rec ? `<svg viewBox="0 0 140 100" class="lb-fig"><g class="lb-cai">${[0, 1, 2].map(i => `<circle class="lb-c c${i}" cx="70" cy="8" r="8" fill="#F4D27A" stroke="#8C6D24" stroke-width="1.5"/>`).join("")}</g>
      <path d="M30 52h80l-8 38H38z" fill="rgba(255,255,255,.2)" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/><path d="M24 52h92" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>`
    : `<svg viewBox="0 0 140 100" class="lb-fig"><path d="M20 88h104" stroke="#fff" stroke-width="3" stroke-linecap="round"/>${[[30, 30, "#7FD3C2"], [52, 50, "#F4D27A"], [74, 38, "#7FD3C2"], [96, 62, "#F4D27A"]].map(([x, hh, c], i) => `<rect class="lb-b b${i}" x="${x}" y="${86 - hh}" width="14" height="${hh}" rx="4" fill="${c}"/>`).join("")}
      <path class="lb-linha" d="M34 50l22-18 22 10 22-24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" pathLength="100"/></svg>`;
  const chip = (s, rot, valor, n, cls) => `<button class="lb-chip ${cls}" onclick="filtroStatus('${s}');vibrar(8)"><small>${rot}</small><b class="mono-num">${money(valor)}</b><span>${n} lanç.</span></button>`;
  box.className = `lanc-banner lb-${tipo || "todos"}`;
  box.innerHTML = `
    <div class="lb-txt"><b>${tipo === "despesa" ? "Contas a pagar" : rec ? "Contas a receber" : "Extrato completo"}</b>
      <span>${FILTRO.de ? "No período escolhido" : "Toque num número para filtrar"}</span></div>
    ${fig}
    <div class="lb-chips">
      ${chip("pendente", rec ? "A receber" : "A pagar", soma(pend), conta(pend), "c-pend")}
      ${chip("atrasado", "Atrasado", soma(atr), conta(atr), "c-atr")}
      ${chip("pago", rec ? "Recebido no mês" : "Pago no mês", soma(pago), conta(pago), "c-pago")}
    </div>`;
}

/* ── Formulário de categoria: ícones desenhados, paleta e prévia ── */
const CAT_ICONES = ["tag", "home", "car", "heart", "shield", "cash", "wallet", "bank", "receipt", "doc", "users", "user", "star", "target",
  "trendUp", "pie", "chart", "calendar", "clock", "bell", "send", "repeat", "map", "cog"];
const CAT_CORES = ["#C9573F", "#E59A4B", "#C9A94E", "#3EA88A", "#2F817A", "#38A3C9", "#305C74", "#5B3FA0", "#A0285F", "#7E8C9A"];
function _catPrev() {
  const irc = document.getElementById("k-ir-campo"); if (irc) irc.style.display = document.getElementById("k-tipo")?.value === "receita" ? "none" : "";
  const p = document.getElementById("k-prev"); if (!p) return;
  const cor = $("#k-cor").value, ic = $("#k-icone").value, nome = $("#k-nome").value.trim() || "Nova categoria";
  p.style.setProperty("--cor", cor);
  p.innerHTML = `<span class="cat-tile-ic">${icon(ic)}</span><b>${esc(nome)}</b><small>${$("#k-tipo").value === "receita" ? "Receita" : "Despesa"}</small>`;
  document.querySelectorAll("#k-ic-grade .av-opt").forEach(b => b.classList.toggle("sel", b.dataset.ic === ic));
  document.querySelectorAll("#k-cores .cor-opt").forEach(b => b.classList.toggle("sel", b.dataset.cor.toLowerCase() === cor.toLowerCase()));
}


/* ── Editor do limite do orçamento (abre dentro da linha) ── */
let _ORC_SUG = null;
const _numBR = t => {                              // "1.450,50" | "1450.5" | "R$ 1.450" -> 1450.5
  let s = String(t || "").replace(/[^\d,.-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s); return Number.isFinite(n) ? n : NaN;
};
const _fmtBR = n => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function _orcEditar(cid) {
  const linha = document.querySelector(`.orc-item[data-cat="${cid}"]`); if (!linha) return;
  const aberto = linha.nextElementSibling?.classList.contains("orc-editor");
  _orcFecharEditor();
  if (aberto) return;
  const i = (_ORC?.itens || []).find(x => x.categoria_id === cid); if (!i) return;
  const sug = _ORC_SUG?.sugestao?.[cid];
  const ed = document.createElement("div");
  ed.className = "orc-editor"; ed.dataset.cat = cid;
  ed.innerHTML = `
    <div class="oe-tit">Limite mensal de <b>${esc(i.nome)}</b></div>
    <div class="oe-campo"><span>R$</span><input id="oe-valor" inputmode="decimal" autocomplete="off" placeholder="0,00"
         value="${i.limite != null ? _fmtBR(i.limite) : ""}" aria-label="Limite mensal em reais"></div>
    <div class="oe-rapidos">
      ${sug ? `<button type="button" class="oe-chip media" data-v="${sug}">${icon("chart")}Média 3 meses <b>${money0(sug)}</b></button>` : ""}
      ${i.gasto ? `<button type="button" class="oe-chip gasto" data-v="${Math.ceil(i.gasto / 10) * 10}">${icon("receipt")}Gasto do mês <b>${money0(i.gasto)}</b></button>` : ""}
      <button type="button" class="oe-chip ajuste" data-p="1.1">+10%</button>
      <button type="button" class="oe-chip ajuste" data-p="0.9">−10%</button>
    </div>
    <div class="oe-bts">
      ${i.limite != null ? `<button type="button" class="btn btn-ghost btn-sm oe-tirar">${icon("trash")}Tirar limite</button>` : ""}
      <span class="grow"></span>
      <button type="button" class="btn btn-ghost btn-sm oe-cancelar">Cancelar</button>
      <button type="button" class="btn btn-primary btn-sm oe-salvar">${icon("check")}Salvar</button>
    </div>`;
  linha.after(ed); linha.classList.add("editando");
  const inp = ed.querySelector("#oe-valor");
  const pega = () => _numBR(inp.value);
  ed.querySelectorAll(".oe-chip[data-v]").forEach(b => b.onclick = () => { inp.value = _fmtBR(Number(b.dataset.v)); inp.focus(); vibrar(8); _oeMarca(b); });
  ed.querySelectorAll(".oe-chip[data-p]").forEach(b => b.onclick = () => {
    const base = pega() || i.limite || sug || i.gasto || 0; if (!base) return;
    inp.value = _fmtBR(Math.round(base * Number(b.dataset.p) / 10) * 10); inp.focus(); vibrar(8); _oeMarca(b); });
  inp.addEventListener("blur", () => { const n = pega(); if (inp.value.trim() && Number.isFinite(n)) inp.value = _fmtBR(n); });
  inp.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); ed.querySelector(".oe-salvar").click(); }
    if (e.key === "Escape") { e.preventDefault(); _orcFecharEditor(); }
  });
  ed.querySelector(".oe-cancelar").onclick = _orcFecharEditor;
  ed.querySelector(".oe-tirar")?.addEventListener("click", () => _orcAplicar(cid, null));
  ed.querySelector(".oe-salvar").onclick = () => {
    const n = pega();
    if (!inp.value.trim()) return _orcAplicar(cid, null);
    if (!Number.isFinite(n) || n < 0) { inp.closest(".oe-campo").classList.add("erro"); toast("Limite: digite um valor, ex.: 1.450,00", "err"); return; }
    _orcAplicar(cid, n);
  };
  requestAnimationFrame(() => { ed.classList.add("aberto"); inp.focus(); inp.select(); });
}
function _oeMarca(b) { b.parentElement.querySelectorAll(".oe-chip").forEach(x => x.classList.toggle("on", x === b)); }
function _orcFecharEditor() {
  document.querySelectorAll(".orc-editor").forEach(e => e.remove());
  document.querySelectorAll(".orc-item.editando").forEach(e => e.classList.remove("editando"));
}
async function _orcAplicar(cid, valor) {
  try {
    const r = await api(`/api/orcamento/${cid}`, { method: "PUT", body: JSON.stringify({ limite: valor }) });
    vibrar(12);
    toast(r.limite == null ? `Limite de ${r.nome} removido` : `Limite de ${r.nome}: ${money(r.limite)} por mês`, "ok");
    setView("orcamento");
  } catch (e) { toast(e.message, "err"); }
}


/* ── Depois da baixa: a conta some na hora de todo lugar da tela e os números se atualizam sem piscar ── */
function _baixaFeita(id) {
  const linhas = new Set();
  document.querySelectorAll(`[onclick*="formBaixaId(${id})"], .lanc-card[data-id="${id}"]`).forEach(b => {
    const r = b.closest('.cal-item, .venc-item, .lanc-card, [onclick^="formLancamentoId("]');
    if (r && !r.closest(".overlay")) linhas.add(r);
  });
  linhas.forEach(r => {
    r.classList.add("baixou");
    setTimeout(() => { r.style.height = r.offsetHeight + "px"; void r.offsetHeight; r.classList.add("saindo-baixa"); r.style.height = "0px"; }, 320);
    setTimeout(() => r.remove(), 760);
  });
  setTimeout(async () => {
    atualizarBadge?.();
    if (document.getElementById("lanc-lista")) await recarregarTabela();
    else await setView(State.view, { silencioso: true });
  }, linhas.size ? 780 : 0);
}


/* ── Dados de exemplo (Configurações) ── */
async function _exStatus() {
  const box = document.getElementById("ex-status"); if (!box) return;
  try {
    const st = await api("/api/exemplos");
    box.innerHTML = st.exemplos
      ? `<span class="ex-ponto on"></span><b>${st.exemplos}</b> registros de exemplo carregados. Use à vontade e apague quando terminar.`
      : `<span class="ex-ponto"></span>Nenhum exemplo carregado. O sistema tem ${st.lancamentos} lançamento(s).`;
    document.getElementById("ex-carregar").style.display = st.exemplos ? "none" : "";
    document.getElementById("ex-apagar").style.display = st.exemplos ? "" : "none";
  } catch (e) { box.textContent = e.message; }
}
async function exemplosCarregar() {
  if (!(await confirmar({ tipo: "info", figura: "moedas", titulo: "Carregar dados de exemplo?", ok: "Carregar",
    texto: "Cria uma família de teste com 6 meses de histórico e os próximos 2 meses: salário, aluguel, escola, mercado, contas atrasadas, 2 cartões com parcelas, metas, veículos e limites de orçamento.",
    detalhe: "Tudo fica marcado como exemplo e sai inteiro com Apagar exemplos. O que você já lançou não muda." }))) return;
  const bt = document.getElementById("ex-carregar"); if (bt) { bt.disabled = true; bt.innerHTML = `${icon("refresh")}Criando...`; }
  try {
    const r = await api("/api/exemplos", { method: "POST" });
    celebrar("Exemplos prontos!");
    const c = r.criados || {};
    toast(`Criados ${(c.lancamentos || 0) + (c.lancamentos_futuros || 0)} lançamentos, ${c.contas || 0} contas e cartões, ${c.metas || 0} metas e ${c.veiculos || 0} veículos`, "ok");
    setTimeout(() => setView("dashboard"), 1200);
  } catch (e) { toast(e.message, "err"); _exStatus(); if (bt) { bt.disabled = false; bt.innerHTML = `${icon("plus")}Carregar exemplos`; } }
}
async function exemplosApagar() {
  if (!(await confirmar({ tipo: "perigo", figura: "lixeira", titulo: "Apagar os dados de exemplo?", ok: "Apagar exemplos",
    texto: "Remove só o que o botão Carregar exemplos criou. O que você lançou de verdade continua.",
    detalhe: "Os limites de orçamento voltam a ser como eram antes." }))) return;
  try { const r = await api("/api/exemplos", { method: "DELETE" }); toast(`${r.apagados} registros de exemplo apagados`, "ok"); _exStatus(); atualizarBadge?.(); }
  catch (e) { toast(e.message, "err"); }
}
async function exemplosZerar() {
  if (!(await confirmar({ tipo: "perigo", figura: "alerta", titulo: "Zerar o sistema?", ok: "Zerar tudo",
    texto: "Apaga todos os lançamentos, contas, cartões, compras, parcelas, metas, veículos, contatos e repetições. Ficam os usuários, as categorias e as configurações.",
    detalhe: "Não dá para desfazer. Se ainda não baixou o backup, cancele e baixe antes.", digitar: "ZERAR" }))) return;
  try {
    const r = await api("/api/exemplos/zerar", { method: "POST", body: JSON.stringify({ confirmacao: "ZERAR" }) });
    const n = Object.values(r.apagados || {}).reduce((a, b) => a + b, 0);
    toast(`Sistema zerado: ${n} registros apagados. Cadastre suas contas para começar.`, "ok");
    atualizarBadge?.(); setView("contas");
  } catch (e) { toast(e.message, "err"); }
}
