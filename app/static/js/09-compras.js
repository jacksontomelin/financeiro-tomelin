/* Tomelin Gestão Financeira · Compras e cartões: leitor de nota, formulário de compra, fornecedor.
   Arquivo 9 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ============================================================
   FORM DE COMPRA: itens da nota + parcelamento no cartão
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
          <select id="fc-cat"><option value="">-</option>${State.cats.filter(c => c.tipo === 'despesa').map(c =>
            `<option value="${c.id}" ${d.categoria_sugerida?.id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join("")}</select></div>
        <div class="campo"><label>Data da compra</label>
          <input id="fc-data" type="date" value="${dataRef}"></div>
        <div class="campo full"><label>Fornecedor (onde comprou)</label>
          <input type="hidden" id="fc-forn" value="">
          <div class="forn-box">
            <div class="forn-atual" id="fc-forn-atual"></div>
            <div class="search forn-busca"><span>${icon("search")}</span>
              <input class="search-i" id="fc-forn-busca" autocomplete="off" placeholder="Buscar ou cadastrar: Mercado Livre, Cassol..." oninput="_fornFiltrar(this.value)"></div>
            <div class="forn-chips" id="fc-forn-chips"></div>
          </div></div>
        <div class="campo full"><label>Como foi pago?</label>
          <select id="fc-forma" onchange="_toggleParcelamento()">
            <option value="avista">À vista (débito, pix, dinheiro)</option>
            <option value="cartao">Cartão de crédito parcelado</option>
          </select></div>

        <div id="fc-parcel-box" class="campo full hidden" style="background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:14px">
          <div class="frm">
            <div class="campo"><label>Cartão usado</label>
              <select id="fc-cartao">
                ${cartoes.length ? cartoes.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join("")
                  : `<option value="">Nenhum cartão cadastrado</option>`}
              </select></div>
            <div class="campo"><label>Nº de parcelas</label>
              <input id="fc-parcelas" type="number" min="1" max="48" value="1" oninput="_recalcularParcelas()"></div>
            <div class="campo"><label>1ª parcela vence em</label>
              <input id="fc-1parc" type="date" value="${_add30dias(dataRef)}" oninput="_recalcularParcelas()"></div>
            <div class="campo"><label>Valor de cada parcela</label>
              <div id="fc-valor-parcela" class="mono-num" style="padding-top:8px;font-weight:700;color:var(--navy)">-</div></div>
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
  _fornIniciar(d);
}

/* ══════════════════════════════════════════════════════════════
   Abertura ao entrar: o dia em "histórias" (toque para avançar,
   segure para pausar, deslize para voltar). Contas dá para pagar ali mesmo.
   ══════════════════════════════════════════════════════════════ */
const _BV = { i: 0, n: 0, pagou: false };
const _hojeKey = () => hojeISO();
function _bvPodeMostrar() { try { return localStorage.getItem("tom_bv_ocultar") !== _hojeKey(); } catch { return true; } }
async function boasVindas(d) {
  const { k, venc, orc, prev, nome, saudacao, hora } = d;
  const F = _saudeFatores(k, orc, prev, venc), nota = F.reduce((s, f) => s + f.pts, 0);
  const contas = [...venc.atrasados, ...venc.proximos.filter(x => diasEntre(x.vencimento) <= 3)];
  const resultado = (k.receitas_mes || 0) - (k.despesas_mes || 0);
  let metas = []; try { metas = (await api("/api/metas")).filter(m => !m.concluida).slice(0, 3); } catch {}
  const orcAlerta = (orc?.itens || []).filter(i => i.status === "estourado" || i.status === "atencao" || i.vai_estourar).slice(0, 4);
  const neg = prev?.primeiro_negativo?.lancado || prev?.primeiro_negativo?.estimado;

  const slides = [];
  slides.push({ cor: ["#06243F", "#2F817A"], html: `
    <div class="bv-ola"><span class="bv-per">${_iconePeriodo(hora)}</span><div><b>${saudacao}, ${esc(nome)}!</b>
      <small>${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</small></div></div>
    <div class="bv-masc">${_mascoteSVG(nota)}</div>
    <div class="bv-rot">Saldo de toda a família</div>
    <div class="bv-grande mono-num" data-conta="${k.saldo}">${money(0)}</div>
    <div class="bv-chips"><span class="${resultado >= 0 ? "ok" : "ruim"}">${icon(resultado >= 0 ? "trendUp" : "arrowDown")}${resultado >= 0 ? "Sobrou" : "Faltou"} ${money0(Math.abs(resultado))} este mês</span>
      <span>${icon("heart")}Saúde ${nota}/100</span></div>` });
  if (contas.length) {
    const total = contas.filter(x => x.tipo === "despesa").reduce((s, x) => s + x.valor, 0);
    slides.push({ cor: ["#8E3326", "#C9573F"], html: `
      <div class="bv-tit">${icon("bell")}<div><b>${contas.length} conta(s) pedindo atenção</b><small><span id="bv-total">${money(total)}</span> a pagar nos próximos dias</small></div></div>
      <div class="bv-lista">${contas.slice(0, 5).map(l => { const dd = diasEntre(l.vencimento), at = l.status === "atrasado", rec = l.tipo === "receita";
        return `<div class="bv-conta${at ? " atras" : ""}" data-id="${l.id}" data-v="${rec ? 0 : l.valor}">
          <span class="bv-c-ic">${icon(rec ? "arrowDown" : "arrowUp")}</span>
          <div class="grow"><b>${esc(l.descricao)}</b><small>${at ? `venceu há ${Math.abs(dd)}d` : dd === 0 ? "vence hoje" : dd === 1 ? "vence amanhã" : `vence em ${dd}d`}${l.responsavel ? ` · ${esc(l.responsavel.split(" ")[0])}` : ""}</small></div>
          <span class="mono-num bv-c-v">${money(l.valor)}</span>
          <button class="bv-pagar" onclick="event.stopPropagation();_bvPagar(${l.id}, this)">${icon("check")}${rec ? "Recebi" : "Paguei"}</button></div>`; }).join("")}
        ${contas.length > 5 ? `<div class="bv-mais">e mais ${contas.length - 5}...</div>` : ""}</div>` });
  } else {
    slides.push({ cor: ["#14594C", "#3EC28F"], festa: true, html: `
      <div class="bv-centro"><div class="bv-ok">${icon("checkCircle")}</div><b class="bv-tit-g">Tudo em dia!</b>
        <small>Nenhuma conta vencida nem vencendo nos próximos 3 dias.</small></div>` });
  }
  if (orcAlerta.length) slides.push({ cor: ["#8A6D1E", "#E2C46E"], html: `
    <div class="bv-tit">${icon("target")}<div><b>Orçamento do mês</b><small>Dia ${orc.dia} de ${orc.dias_mes}</small></div></div>
    <div class="bv-lista">${orcAlerta.map(i => { const pct = Math.min(130, i.pct || 0); return `
      <div class="bv-orc"><div class="bv-orc-top"><b>${esc(i.nome)}</b><span>${money0(i.gasto)} de ${money0(i.limite)}</span></div>
        <div class="bv-barra ${i.status}"><i style="--w:${Math.min(100, pct)}%"></i></div>
        <small>${i.status === "estourado" ? `Passou ${money0(i.gasto - i.limite)}` : i.vai_estourar ? `No ritmo, fecha em ${money0(i.previsto_fim_mes)}` : `Restam ${money0(i.restante)}`}</small></div>`; }).join("")}</div>` });
  if (metas.length) slides.push({ cor: ["#5B3FA0", "#E35D9A"], html: `
    <div class="bv-tit">${icon("star")}<div><b>Suas metas</b><small>Cada aporte conta</small></div></div>
    <div class="bv-lista">${metas.map(m => `<div class="bv-meta"><span class="bv-anel" style="--p:${Math.min(100, m.progresso_pct)}">
        <b>${Math.round(m.progresso_pct)}%</b></span><div class="grow"><b>${esc(m.nome)}</b>
        <small>${money0(m.valor_atual)} de ${money0(m.valor_alvo)}${m.prazo ? ` · até ${dataBR(m.prazo)}` : ""}</small></div></div>`).join("")}</div>` });
  if (prev) slides.push({ cor: neg ? ["#8E3326", "#E07A5F"] : ["#082D51", "#4F8BC9"], html: `
    <div class="bv-tit">${icon("chart")}<div><b>Os próximos 30 dias</b><small>Contas lançadas e o que costuma vir</small></div></div>
    <div class="bv-rot">Saldo previsto em 30 dias</div>
    <div class="bv-grande mono-num" data-conta="${prev.marcos?.["30"]?.estimado ?? prev.saldo_hoje}">${money(0)}</div>
    <div class="bv-prev">${svgPrevisao(prev, true)}</div>
    ${neg ? `<div class="bv-alerta">${icon("alert")}O saldo fica negativo em ${_dm(neg)}. Vale rever as contas.</div>`
          : `<div class="bv-chips"><span class="ok">${icon("shield")}Menor saldo: ${money0(prev.minimo.estimado.valor)}</span></div>`}` });

  _BV.i = 0; _BV.n = slides.length; _BV.pagou = false; _BV.slides = slides;
  document.getElementById("bv")?.remove();
  const el = document.createElement("div"); el.id = "bv"; el.className = "bv";
  el.innerHTML = `
    <div class="bv-fundo" onclick="_bvFechar()"></div>
    <div class="bv-caixa" role="dialog" aria-label="Resumo do dia">
      <div class="bv-segs">${slides.map((_, i) => `<span class="bv-seg" data-i="${i}"><i></i></span>`).join("")}</div>
      <button class="bv-x" onclick="_bvFechar()" aria-label="Fechar">${icon("x")}</button>
      <div class="bv-trilho">${slides.map((sl, i) => `<section class="bv-slide" data-i="${i}" style="--c1:${sl.cor[0]};--c2:${sl.cor[1]}">${sl.html}</section>`).join("")}</div>
      <div class="bv-pe">
        <label class="bv-ocultar"><input type="checkbox" id="bv-ocultar"> Não mostrar de novo hoje</label>
        <div class="bv-bts">${contas.length ? `<button class="bv-bt claro" onclick="_bvFechar();setView('vencimentos')">Ver vencimentos</button>` : ""}
          <button class="bv-bt" id="bv-prox" onclick="_bvIr(_BV.i + 1)">Próximo ›</button></div>
      </div>
    </div>`;
  document.body.appendChild(el);
  _DLG_ATUAL_FOLHA = true;
  requestAnimationFrame(() => el.classList.add("aberta"));
  _bvGestos(el.querySelector(".bv-caixa"));
  el.querySelectorAll(".bv-seg i").forEach(i => i.addEventListener("animationend", () => _bvIr(_BV.i + 1)));
  document.addEventListener("keydown", _bvTecla);
  _bvIr(0);
}
function _bvIr(i) {
  const el = document.getElementById("bv"); if (!el) return;
  if (i >= _BV.n) return _bvFechar();
  i = Math.max(0, i); _BV.i = i;
  el.querySelector(".bv-trilho").style.transform = `translateX(${-i * 100}%)`;
  el.querySelectorAll(".bv-seg").forEach((s, k) => { s.classList.toggle("feito", k < i); s.classList.toggle("ativo", k === i);
    const b = s.querySelector("i"); b.style.animation = "none"; void b.offsetWidth; b.style.animation = ""; });
  const sl = el.querySelectorAll(".bv-slide")[i];
  el.querySelector(".bv-caixa").style.setProperty("--c1", _BV.slides[i].cor[0]);
  el.querySelector(".bv-caixa").style.setProperty("--c2", _BV.slides[i].cor[1]);
  el.querySelector("#bv-prox").textContent = i === _BV.n - 1 ? "Começar o dia" : "Próximo ›";
  sl.querySelectorAll("[data-conta]").forEach(n => _bvConta(n));
  if (_BV.slides[i].festa) setTimeout(() => celebrar("Tudo em dia!"), 300);
  vibrar(6);
}
function _bvConta(n) {
  if (n.dataset.feito) return; n.dataset.feito = "1";
  const alvo = Number(n.dataset.conta) || 0, ini = performance.now(), dur = 900;
  const passo = t => { const p = Math.min(1, (t - ini) / dur), e = 1 - Math.pow(1 - p, 3); n.textContent = money(alvo * e); if (p < 1) requestAnimationFrame(passo); };
  requestAnimationFrame(passo);
}
function _bvGestos(cx) {
  let x0 = null, t0 = 0, mexeu = false;
  cx.addEventListener("pointerdown", e => { if (e.target.closest("button, label, input, a")) return; x0 = e.clientX; t0 = Date.now(); mexeu = false; cx.classList.add("pausa"); });
  cx.addEventListener("pointermove", e => { if (x0 != null && Math.abs(e.clientX - x0) > 12) mexeu = true; });
  const solta = e => {
    if (x0 == null) return; cx.classList.remove("pausa");
    const dx = e.clientX - x0, rapido = Date.now() - t0 < 350; x0 = null;
    if (mexeu && Math.abs(dx) > 50) return _bvIr(_BV.i + (dx < 0 ? 1 : -1));
    if (!mexeu && rapido) { const r = cx.getBoundingClientRect(); _bvIr(_BV.i + (e.clientX - r.left < r.width * .3 ? -1 : 1)); }
  };
  cx.addEventListener("pointerup", solta); cx.addEventListener("pointercancel", () => { x0 = null; cx.classList.remove("pausa"); });
}
function _bvTecla(e) {
  if (!document.getElementById("bv")) return document.removeEventListener("keydown", _bvTecla);
  if (e.key === "ArrowRight") _bvIr(_BV.i + 1); else if (e.key === "ArrowLeft") _bvIr(_BV.i - 1); else if (e.key === "Escape") _bvFechar();
}
async function _bvPagar(id, bt) {
  const linha = bt.closest(".bv-conta"); bt.disabled = true; bt.innerHTML = icon("refresh", "spin");
  try {
    await api(`/api/lancamentos/${id}/baixa`, { method: "POST", body: JSON.stringify({}) });
    linha.classList.add("paga"); vibrar(15); _BV.pagou = true;
    const tot = document.getElementById("bv-total");
    const resta = [...document.querySelectorAll(".bv-conta:not(.paga)")].reduce((s, x) => s + Number(x.dataset.v || 0), 0);
    if (tot) tot.textContent = money(resta);
    if (!document.querySelector(".bv-conta:not(.paga)")) setTimeout(() => celebrar("Tudo pago!"), 250);
  } catch (e) { toast(e.message, "err"); bt.disabled = false; bt.innerHTML = `${icon("check")}Paguei`; }
}
function _bvFechar() {
  const el = document.getElementById("bv"); if (!el) return;
  try { if (document.getElementById("bv-ocultar")?.checked) localStorage.setItem("tom_bv_ocultar", _hojeKey()); } catch {}
  _DLG_ATUAL_FOLHA = false; document.removeEventListener("keydown", _bvTecla);
  el.classList.remove("aberta"); el.classList.add("saindo"); setTimeout(() => el.remove(), 320);
  if (_BV.pagou) { atualizarBadge(); if (State.view === "dashboard") setView("dashboard", { silencioso: true }); }
}

/* ── Cor do logo do fornecedor: a compra ganha a cor da loja (amarelo do Mercado Livre...) ── */
const _COR_LOGO = new Map();
function _corDoLogo(src) {
  if (!src) return Promise.resolve(null);
  if (_COR_LOGO.has(src)) return Promise.resolve(_COR_LOGO.get(src));
  return new Promise(res => {
    const img = new Image();
    if (/^https?:/.test(src) && !src.startsWith(location.origin)) img.crossOrigin = "anonymous";
    img.onload = () => {
      let cor = null;
      try {
        const n = 48, cv = document.createElement("canvas"); cv.width = n; cv.height = n;
        const c = cv.getContext("2d", { willReadFrequently: true }); c.drawImage(img, 0, 0, n, n);
        const px = c.getImageData(0, 0, n, n).data, cestos = {};
        for (let i = 0; i < px.length; i += 4) {
          const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
          if (a < 128) continue;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
          if (sat < .28 || mx < 45) continue;                       // ignora branco, preto e cinza
          let h = 0; const d = mx - mn;
          if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
          const k = Math.round(((h * 60 + 360) % 360) / 20);       // 18 faixas de cor
          const q = cestos[k] || (cestos[k] = { n: 0, r: 0, g: 0, b: 0 });
          const peso = sat * (mx / 255); q.n += peso; q.r += r * peso; q.g += g * peso; q.b += b * peso;
        }
        const top = Object.values(cestos).sort((a, b) => b.n - a.n)[0];
        if (top && top.n > 6) cor = `rgb(${Math.round(top.r / top.n)}, ${Math.round(top.g / top.n)}, ${Math.round(top.b / top.n)})`;
      } catch { cor = null; }                                       // imagem de outro site sem permissão
      _COR_LOGO.set(src, cor); res(cor);
    };
    img.onerror = () => { _COR_LOGO.set(src, null); res(null); };
    img.src = src;
  });
}
function _pintarPorLogo(raiz) {
  (raiz || document).querySelectorAll(".pinta-logo").forEach(async el => {
    const src = el.querySelector(".lg-av img")?.getAttribute("src");
    const cor = await _corDoLogo(src);
    if (cor) { el.style.setProperty("--forn", cor); el.classList.add("com-forn"); }
  });
}

/* ── Fornecedor da compra: escolhe dos contatos (com logo) ou cadastra na hora ── */
let _FORN_NFE = null;
const _fornLista = () => (State.contatos || []).filter(c => c.tipo !== "cliente").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
const _soDig = v => String(v || "").replace(/\D/g, "");
function _fornIniciar(nfe, recarregou) {
  if (!State.contatos && !recarregou) { carregarRefs().catch(() => {}).finally(() => _fornIniciar(nfe, true)); return; }
  _FORN_NFE = nfe && nfe.emitente ? nfe : null;
  let achado = null;
  if (_FORN_NFE) {
    const cnpj = _soDig(_FORN_NFE.cnpj_emitente);
    achado = (State.contatos || []).find(c => cnpj && _soDig(c.documento) === cnpj)
          || (State.contatos || []).find(c => c.nome.toLowerCase() === _FORN_NFE.emitente.toLowerCase());
  }
  if (achado) _fornEscolher(achado.id);
  else { _fornMostrar(null); if (_FORN_NFE) { document.getElementById("fc-forn-busca").value = _FORN_NFE.emitente; } }
  _fornFiltrar(document.getElementById("fc-forn-busca")?.value || "");
}
function _fornMostrar(c) {
  const box = document.getElementById("fc-forn-atual"); if (!box) return;
  box.innerHTML = c ? `<div class="forn-escolhido">${avatarLogo(c.logo, c.nome, 40)}<div class="grow"><b>${esc(c.nome)}</b>
      <small>${c.documento ? esc(fmtDoc(c.documento)) : "fornecedor"}</small></div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="_fornLimpar()" title="Trocar">${icon("x")}</button></div>` : "";
  box.parentElement.classList.toggle("tem", !!c);
}
function _fornFiltrar(q) {
  const box = document.getElementById("fc-forn-chips"); if (!box) return;
  const t = q.trim().toLowerCase();
  const lista = _fornLista().filter(c => !t || c.nome.toLowerCase().includes(t)).slice(0, t ? 12 : 10);
  const exato = _fornLista().some(c => c.nome.toLowerCase() === t);
  box.innerHTML = lista.map(c => `<button type="button" class="forn-chip" onclick="_fornEscolher(${c.id})">${avatarLogo(c.logo, c.nome, 24)}<span>${esc(c.nome)}</span></button>`).join("")
    + (t && !exato ? `<button type="button" class="forn-chip novo" onclick="_fornCriar()">${icon("plus")}<span>Cadastrar “${esc(q.trim())}”</span></button>` : "")
    + (!lista.length && !t ? `<span class="sub">Nenhum fornecedor ainda: digite o nome para cadastrar.</span>` : "");
}
function _fornEscolher(id) {
  const c = (State.contatos || []).find(x => x.id === id); if (!c) return;
  document.getElementById("fc-forn").value = id; vibrar(8);
  document.getElementById("fc-forn-busca").value = "";
  _fornMostrar(c); _fornFiltrar("");
  const desc = document.getElementById("fc-desc"); if (desc && !desc.value.trim()) desc.value = `Compra ${c.nome}`;
}
function _fornLimpar() { document.getElementById("fc-forn").value = ""; _fornMostrar(null); document.getElementById("fc-forn-busca").focus(); }
async function _fornCriar() {
  const nome = document.getElementById("fc-forn-busca").value.trim(); if (!nome) return;
  const doc = _FORN_NFE && nome.toLowerCase() === _FORN_NFE.emitente.toLowerCase() ? _soDig(_FORN_NFE.cnpj_emitente) : "";
  try {
    const c = await api("/api/contatos", { method: "POST", body: JSON.stringify({ nome, tipo: "fornecedor", documento: doc || null }) });
    State.contatos = [...(State.contatos || []), c];
    toast(`Fornecedor "${c.nome}" cadastrado`, "ok"); _fornEscolher(c.id);
  } catch (e) { toast(e.message, "err"); }
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
  if (el) el.textContent = n > 0 ? `${n}x de ${money(valor / n)}` : "-";
}

function _renderItensCompra() {
  if (!COMPRA_ITENS.length) {
    return `<div class="empty" style="padding:16px">${ilus("receipt")}<p>Nenhum item: adicione manualmente ou volte e leia o QR code da nota.</p></div>`;
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
  const forn = (State.contatos || []).find(c => c.id === +$("#fc-forn").value) || null;
  const descricao = $("#fc-desc").value.trim() || (forn ? `Compra ${forn.nome}` : "");
  const valor = parseFloat($("#fc-valor").value || "0");
  if (!descricao) return erroCampo("descricao", "Descrição: preenchimento obrigatório (ou escolha o fornecedor).");
  if (!valor) return erroCampo("valor", "Valor: informe um valor maior que zero.");

  const dataCompra = $("#fc-data").value || hojeISO();
  const forma = $("#fc-forma").value;
  const parcelado = forma === "cartao";

  const bodyLanc = {
    descricao, tipo: "despesa", valor,
    categoria_id: +$("#fc-cat").value || null,
    data_vencimento: dataCompra, data_competencia: dataCompra,
    data_pagamento: parcelado ? null : dataCompra,  // parcelado só "paga" conforme as parcelas
    contato_id: forn ? forn.id : null,
    obs: forn ? `Compra em ${forn.nome}` : null,
  };

  try {
    const lanc = await api("/api/lancamentos", { method: "POST", body: JSON.stringify(bodyLanc) });

    const bodyCompra = {
      lancamento_id: lanc.id,
      estabelecimento: forn ? forn.nome : (_nfeDados?.emitente || null),
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
      if (!cartaoId) return erroCampo("cartao", "Cartão: selecione o cartão do parcelamento.");
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
   VIEW: COMPRAS E CARTÕES: itens comprados + controle de parcelas
   ============================================================ */
async function viewCompras(v) {
  const [compras, parcelasPend] = await Promise.all([
    api("/api/compras"),
    api("/api/compras/resumo/parcelas-pendentes"),
  ]);

  const totalParcelasPend = parcelasPend.length;
  const somaParcelasPend = parcelasPend.reduce((s, p) => s + p.valor, 0);
  const atrasadas = parcelasPend.filter(p => p.status === "atrasada");

  setTimeout(() => _ccFaixa("cc-compras", true), 0);
  v.innerHTML = `
    <div class="toolbar">
      <div><h2 style="margin:0;color:var(--navy)">Compras e cartões</h2>
        <div class="sub">Itens comprados e controle de parcelamento</div></div>
      <div class="grow"></div>
      <button class="btn btn-ghost" onclick="verParcelasPendentes()">${icon("clock")}Parcelas pendentes${totalParcelasPend ? ` (${totalParcelasPend})` : ''}</button>
    </div>
    <div id="cc-compras" class="cc-secao"></div>

    ${atrasadas.length ? `<div class="dica vermelho" style="margin-bottom:14px">${icon("alert")}<div><b>${atrasadas.length} parcela(s) atrasada(s)</b>: total de ${money(atrasadas.reduce((s,p)=>s+p.valor,0))}.</div></div>` : ""}

    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi navy"><div class="lab"><span class="i i-navy">${icon("receipt")}</span>Compras registradas</div><div class="val mono-num">${compras.length}</div><div class="meta">com itens detalhados</div></div>
      <div class="kpi gold"><div class="lab"><span class="i i-gold">${icon("wallet")}</span>Parcelas em aberto</div><div class="val mono-num">${totalParcelasPend}</div><div class="meta">${money(somaParcelasPend)}</div></div>
    </div>

    ${compras.length === 0 ? `
      <div class="empty" style="padding:50px 20px">
        ${ilus("receipt")}
        <p>Nenhuma compra detalhada ainda.</p>
        <div class="sub">Use "Ler Nota Fiscal" em Lançamentos para cadastrar compras com itens e parcelamento.</div>
      </div>` : compras.map(c => _cardCompra(c)).join("")}
  `;
  _pintarPorLogo(v);
}

function _cardCompra(c) {
  const pm = c.parcelamento;
  const progresso = pm ? Math.round((pm.parcelas_pagas / pm.total_parcelas) * 100) : 0;
  return `
    <div class="card card-pad compra-card${c.contato_logo ? " pinta-logo" : ""}" style="margin-bottom:14px">
      <div style="display:flex;align-items:flex-start;gap:12px;cursor:pointer" onclick="_toggleItensCompra(${c.id})">
        ${c.contato_id ? avatarLogo(c.contato_logo, c.contato_nome, 40) : `<span class="card-ico i-navy">${icon("receipt")}</span>`}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--ink)">${esc(c.contato_nome || c.estabelecimento || "Compra #" + c.id)}</div>
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
        <h3>Parcelas: ${c.estabelecimento || 'Compra'}</h3>
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
        ${parcelas.length === 0 ? `<div class="empty" style="padding:30px">${ilus("checkCircle")}<p>Nenhuma parcela pendente!</p></div>` :
          parcelas.map(p => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)">
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600;color:var(--ink)">${p.estabelecimento || 'Compra'}: parcela ${p.numero}/${p.total_parcelas}</div>
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
  _checarSenhaFabrica();
  _bandeirasCarregar();
  _historicoIniciar();
  _redeEstado();
  _offSelo(); setTimeout(() => _offEnviar(), 1500);
  try {
    await setView(State.view || "dashboard");
    atualizarBadge();
    _acaoInicial();
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
