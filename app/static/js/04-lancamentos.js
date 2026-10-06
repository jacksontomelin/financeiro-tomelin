/* Tomelin Gestão Financeira · Lançamentos: listas, formulário, autocompletar e lançar sem internet.
   Arquivo 4 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ============================================================
   VIEW: LANÇAMENTOS (a pagar / a receber / todos)
   ============================================================ */
const FILTRO = { status: "", busca: "", cat: "", conta: "", contato: "", responsavel: "" };

async function viewLancamentos(v, tipoFixo) {
  await carregarRefs();
  const titulo = tipoFixo === "despesa" ? "Contas a pagar" : tipoFixo === "receita" ? "Contas a receber" : "Todos os lançamentos";
  const cats = State.cats.filter(c => !tipoFixo || c.tipo === tipoFixo);
  v.innerHTML = `
    <div id="lanc-banner" class="lanc-banner"></div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div class="seg" id="seg-status" style="flex:1;min-width:0">
          <button data-s="" class="on" onclick="filtroStatus('')">Todos</button>
          <button data-s="pendente" onclick="filtroStatus('pendente')">Pendentes</button>
          <button data-s="atrasado" onclick="filtroStatus('atrasado')">Atrasados</button>
          <button data-s="pago" onclick="filtroStatus('pago')">Pagos</button>
        </div>
        <button class="btn ${tipoFixo === 'receita' ? 'btn-green' : 'btn-primary'}" onclick="formLancamento(null,'${tipoFixo || 'despesa'}')" title="Novo lançamento">+<span class="so-desktop"> Novo</span></button>
      </div>
      <div class="lanc-filtros" style="display:flex;gap:8px;align-items:center">
        <div class="search" style="flex:1"><span>${icon("search")}</span>
          <input class="search-i" id="busca" placeholder="Buscar..." oninput="debBusca(this.value)">
        </div>
        <select id="fcat" onchange="filtroCat(this.value)" style="flex:1;max-width:180px">
          <option value="">Todas categorias</option>
          ${cats.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join("")}
        </select>
        <button class="btn btn-ghost btn-sm" onclick="exportarCSV('${tipoFixo || ''}')"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='15' height='15' ><line x1='8' y1='6' x2='16' y2='6'/><line x1="8" y1="12" x2="16" y2="12"/><polyline points="8 18 12 22 16 18"/></svg> CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="abrirRecorrencias()" title="Lançamentos que se repetem">${icon("repeat")}<span class="so-desktop">Repetições</span></button>
        <button class="btn btn-ghost btn-sm" onclick="abrirLeitorNFe()">NF-e</button>
      </div>
    </div>
    <div class="periodos" id="periodos">
      ${[["", "Tudo"], ["hoje", "Hoje"], ["7d", "7 dias"], ["mes", "Este mês"], ["mesant", "Mês passado"], ["prox", "Próximo mês"]]
        .map(([k, r]) => `<button class="periodo${k === "" ? " on" : ""}" data-p="${k}" onclick="_periodo('${k}')">${r}</button>`).join("")}
    </div>
    <div id="filtro-chips" class="filtro-chips"></div>
    <div id="lanc-lista" style="display:flex;flex-direction:column;gap:8px"></div>`;
  FILTRO.status = ""; FILTRO.busca = ""; FILTRO.cat = ""; FILTRO.de = ""; FILTRO.ate = "";
  _filtroChips();
  // quem abriu esta tela já filtrada (rosca do painel, Categorias) deixa o filtro aqui
  if (window._filtroInicial) { Object.assign(FILTRO, window._filtroInicial); window._filtroInicial = null; }
  const selCat = v.querySelector('select[onchange^="filtroCat"]'); if (selCat && FILTRO.cat) selCat.value = String(FILTRO.cat);
  window._tipoFixo = tipoFixo;
  await recarregarTabela({ cache: true });
}

let _debTimer;
function debBusca(val) { clearTimeout(_debTimer); _debTimer = setTimeout(() => { FILTRO.busca = val; recarregarTabela(); }, 300); }
function filtroStatus(s) {
  FILTRO.status = s;
  document.querySelectorAll("#seg-status button").forEach(b => b.classList.toggle("on", b.dataset.s === s));
  recarregarTabela();
}
function filtroCat(c) { FILTRO.cat = c; recarregarTabela(); }

async function recarregarTabela(opts = {}) {
  const tf = window._tipoFixo;
  let q = "?limite=500";
  if (tf) q += `&tipo=${tf}`;
  if (FILTRO.status) q += `&status=${FILTRO.status}`;
  if (FILTRO.busca) q += `&busca=${encodeURIComponent(FILTRO.busca)}`;
  if (FILTRO.cat) q += `&categoria_id=${FILTRO.cat}`;
  if (FILTRO.conta) q += `&conta_id=${FILTRO.conta}`;
  if (FILTRO.contato) q += `&contato_id=${FILTRO.contato}`;
  if (FILTRO.responsavel) q += `&responsavel_id=${FILTRO.responsavel}`;
  if (FILTRO.de) q += `&de=${FILTRO.de}`;
  if (FILTRO.ate) q += `&ate=${FILTRO.ate}`;
  const lista0 = document.getElementById("lanc-lista");
  const guardado = opts.cache ? _LISTA_CACHE[q] : null;
  if (lista0 && guardado) _renderLista(guardado);                 // aparece na hora com o que já tinha
  else if (lista0 && !lista0.children.length) lista0.innerHTML = _esqueletoLista();
  const [itens] = await Promise.all([api("/api/lancamentos" + q), _anxContagem()]);
  itens.forEach(l => _LANC_CACHE.set(l.id, l));
  _LISTA_CACHE[q] = itens;
  setTimeout(() => { const ls = document.getElementById("lanc-lista"); _swipeIniciar(ls); _seguraIniciar(ls); _swipeDica(ls); }, 0);
  _lancBanner(itens, window._tipoFixo);
  const lista = document.getElementById("lanc-lista");
  if (!lista) return;
  const assin = JSON.stringify(itens.map(l => [l.id, l.status, l.valor, l.data_pagamento, l.descricao, l.data_vencimento, l.categoria_id, l.forma_pagamento, l.recorrencia_id]));
  if (guardado && lista._assin === assin) return;                // nada mudou: não redesenha
  _renderLista(itens);
  lista._assin = assin;
}

/* ── Lista no estilo extrato: agrupada por dia, uma linha por lançamento, desenhada aos poucos ── */
let _LISTA_ATUAL = [], _LISTA_CACHE = {};
const _esqueletoLista = () => `<div class="lc-esq">${Array.from({ length: 6 }, () => `<div class="lc-esq-linha"><i></i><span><b></b><small></small></span><em></em></div>`).join("")}</div>`;
function _rotDia(iso) {
  if (!iso) return "Sem data";
  const d = diasEntre(iso);
  if (d === 0) return "Hoje"; if (d === 1) return "Amanhã"; if (d === -1) return "Ontem";
  const dt = new Date(iso + "T00:00:00");
  const txt = dt.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, "");
  const t = dt.getFullYear() !== new Date().getFullYear() ? `${txt} de ${dt.getFullYear()}` : txt;
  return t.charAt(0).toUpperCase() + t.slice(1);            // só a primeira letra: "Ter, 29 de set"
}
function _linhaLanc(l) {
  const rec = l.tipo === "receita", st = l.status || "pendente";
  const cat = (State.cats || []).find(c => c.id === l.categoria_id);
  const cor = _corOk(cat?.cor, rec ? "#2F9E7E" : "#7E8C9A");
  const d = l.data_vencimento ? diasEntre(l.data_vencimento) : null;
  const stTxt = st === "pago" ? (rec ? "Recebido" : "Pago")
    : st === "atrasado" ? (d != null ? `Atrasado há ${Math.abs(d)} dia${Math.abs(d) > 1 ? "s" : ""}` : "Atrasado")
    : d === 0 ? "Vence hoje" : d === 1 ? "Vence amanhã" : rec ? "A receber" : "A pagar";
  const valor = Number(l.valor_total ?? l.valor ?? 0);
  return `<div class="lanc-card lc st-${st} ${rec ? "rec" : "desp"}" data-id="${l.id}" style="--cat:${cor}" onclick="_menuLanc(${l.id})">
    <span class="lc-ic">${icon(cat?.icone || (rec ? "arrowDown" : "arrowUp"))}</span>
    <div class="lc-meio"><b class="lc-desc">${esc(l.descricao)}</b>
      <small class="lc-sub"><span class="lc-st">${stTxt}</span>${cat ? `<span class="lc-cat">${esc(cat.nome)}</span>` : ""}${l.conta_nome ? `<span class="lc-cat">${esc(l.conta_nome)}</span>` : ""}${l.responsavel_nome ? `<span class="lc-quem">${icon("user")}${esc(l.responsavel_nome.split(" ")[0])}</span>` : ""}${l.recorrencia_id ? `<span class="lc-mini" title="Repete todo mês">${icon("repeat")}</span>` : ""}${_ANX_CONT[l.id] ? `<span class="lc-mini" title="${_ANX_CONT[l.id]} comprovante(s)">${icon("clip")}</span>` : ""}${_formaSelo(l)}</small></div>
    <div class="lc-dir"><span class="lc-val mono-num">${rec ? "+" : "−"} ${money(valor)}</span>
      ${st !== "pago" ? `<button class="lc-bt" onclick="event.stopPropagation();formBaixaId(${l.id})">${icon("check")}${rec ? "Recebi" : "Paguei"}</button>` : ""}</div>
  </div>`;
}
function _ordenarLista(itens) {
  // A pagar / A receber: atrasadas e mais próximas primeiro; pagas depois, das mais recentes. Extrato: mais recente primeiro.
  if (!window._tipoFixo) return itens;
  const dt = l => String(l.data_vencimento || l.data_competencia || "");
  const pend = itens.filter(l => !l.data_pagamento).sort((a, b) => dt(a).localeCompare(dt(b)));
  const pagos = itens.filter(l => l.data_pagamento).sort((a, b) => dt(b).localeCompare(dt(a)));
  return pend.concat(pagos);
}
function _renderLista(itens) {
  const lista = document.getElementById("lanc-lista"); if (!lista) return;
  itens = _ordenarLista(itens);
  _LISTA_ATUAL = itens;
  if (!itens.length) { lista.innerHTML = `<div class="empty">${ilus("wallet")}<p>Nenhum lançamento encontrado.</p></div>`; return; }
  const pedacos = []; let ant = null, grupo = null;
  for (const l of itens) {
    const dk = String(l.data_vencimento || l.data_competencia || "").slice(0, 10);
    if (dk !== ant) { grupo = { dk, soma: 0, n: 0 }; pedacos.push({ cab: grupo }); ant = dk; }
    grupo.soma += (l.tipo === "receita" ? 1 : -1) * Number(l.valor_total ?? l.valor ?? 0); grupo.n++;
    pedacos.push({ l });
  }
  const html = p => p.cab
    ? `<div class="lc-dia"><span>${_rotDia(p.cab.dk)}</span><b class="mono-num ${p.cab.soma >= 0 ? "pos" : "neg"}">${p.cab.soma >= 0 ? "+" : "−"} ${money(Math.abs(p.cab.soma))}</b></div>`
    : _linhaLanc(p.l);
  const PRIMEIRO = 40;
  lista.innerHTML = pedacos.slice(0, PRIMEIRO).map(html).join("") + (pedacos.length > PRIMEIRO ? `<div class="lc-mais" id="lc-mais">Carregando mais...</div>` : "");
  const sent = document.getElementById("lc-mais");
  if (!sent || !window.IntersectionObserver) { if (sent) sent.outerHTML = pedacos.slice(PRIMEIRO).map(html).join(""); return; }
  let pos = PRIMEIRO;
  const io = new IntersectionObserver(ents => {
    if (!ents.some(e => e.isIntersecting)) return;
    sent.insertAdjacentHTML("beforebegin", pedacos.slice(pos, pos + 60).map(html).join("")); pos += 60;
    if (pos >= pedacos.length) { io.disconnect(); sent.remove(); }
  }, { rootMargin: "700px" });
  io.observe(sent);
}

function exportarCSV(tf) {
  const linhas = (_LISTA_ATUAL || []).map(l => {
    const cat = (State.cats || []).find(c => c.id === l.categoria_id);
    const v = Number(l.valor_total ?? l.valor ?? 0).toFixed(2).replace(".", ",");
    return [l.descricao, cat?.nome || "", ...(tf ? [] : [l.tipo === "receita" ? "Receita" : "Despesa"]),
            l.data_vencimento ? dataBR(String(l.data_vencimento).slice(0, 10)) : "", l.status || "", v]
      .map(c => `"${String(c).replace(/"/g, '""')}"`).join(";");
  });
  if (!linhas.length) return toast("Nada para exportar com os filtros atuais.", "warn");
  const head = ["Descrição", "Categoria", ...(tf ? [] : ["Tipo"]), "Vencimento", "Situação", "Valor"].join(";");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\uFEFF" + head + "\n" + linhas.join("\n")], { type: "text/csv" }));
  a.download = `lancamentos-tomelin-${hojeISO()}.csv`; a.click();
  toast(`CSV exportado com ${linhas.length} lançamento(s)`, "ok");
}

/* ---------- form lançamento ---------- */
async function formLancamento(l, tipo, pre) {
  // As listas só eram carregadas na tela Lançamentos: abrindo pelo painel,
  // pelo "Vencer" ou depois de cadastrar um contato, "Pago para" vinha vazio.
  if (!State.contatos?.length || !State.contas?.length || !State.cats?.length) {
    try { await carregarRefs(); } catch (e) { toast(`Não carreguei contatos e contas: ${e.message}`, "err"); }
  } else {
    carregarRefs().then(() => _recarregarSelContato()).catch(() => {});
  }
  _formLancamento(l, tipo, pre);
}

// Opções do "Pago para / Recebo de": os do tipo certo primeiro.
function _opcoesContato(rec, selId) {
  const lista = [...(State.contatos || [])].sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const certo = lista.filter(c => c.tipo === "ambos" || c.tipo === (rec ? "cliente" : "fornecedor") || !c.tipo);
  const outros = lista.filter(c => !certo.includes(c));
  const opt = c => `<option value="${c.id}" ${selId === c.id ? "selected" : ""}>${esc(c.nome)}</option>`;
  let html = `<option value="">${lista.length ? "Selecione" : "Nenhum contato ainda"}</option>`;
  if (certo.length)  html += `<optgroup label="${rec ? "Quem me paga" : "Fornecedores"}">${certo.map(opt).join("")}</optgroup>`;
  if (outros.length) html += `<optgroup label="Outros contatos">${outros.map(opt).join("")}</optgroup>`;
  return html;
}

function _recarregarSelContato(novoId) {
  const sel = document.getElementById("f-contato");
  if (!sel) return;
  const atual = novoId || Number(sel.value) || null;
  sel.innerHTML = _opcoesContato(sel.dataset.rec === "1", atual);
  const dica = document.getElementById("f-contato-dica");
  if (dica) dica.style.display = State.contatos?.length ? "none" : "";
}

function _novoContatoRapido() {
  const rec = document.getElementById("f-contato")?.dataset.rec === "1";
  State._contatoRapido = true;
  formContato({ tipo: rec ? "cliente" : "fornecedor" });
}

function _formLancamento(l, tipo, pre) {
  if (pre && !l) l = pre;
  const ed = !!l;
  const tipoFinal = tipo || (l && l.tipo) || "despesa";
  const cats = State.cats.filter(c => c.tipo === tipoFinal);
  const rec = tipoFinal === "receita";

  _ANX = { lid: null, fila: [], salvos: [] };
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
              <option value="">Sem categoria</option>
              ${cats.map(c => `<option value="${c.id}" ${ed && l.categoria_id === c.id ? "selected" : ""} data-cor="${c.cor||"#94A3B8"}">${esc(c.nome)}</option>`).join("")}
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
            <option value="">Qualquer</option>
            ${State.contas.map(c => `<option value="${c.id}" ${ed && l.conta_id === c.id ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}
          </select></div>
        ${(State.membros || []).length > 1 ? `<div class="campo full"><label>Quem paga</label>
          <div class="quem-grade">${[{ id: "", nome: "Ninguém" }, ...State.membros].map(u => `<button type="button" class="quem-opt${String(ed ? (l.responsavel_id || "") : "") === String(u.id) ? " on" : ""}" data-id="${u.id}"
              style="--c:${_corOk(u.cor, "#7E8C9A")}" onclick="_quemEscolher(this)">${u.id ? avatarSVG(u.emoji, 18) : icon("users")}<span>${esc(u.nome.split(" ")[0])}</span></button>`).join("")}</div>
          <input type="hidden" id="f-resp" value="${ed ? (l.responsavel_id || "") : ""}"></div>` : ""}

        <div class="campo"><label>${rec ? "Recebo de" : "Pago para"}</label>
          <div style="display:flex;gap:6px">
            <select id="f-contato" data-rec="${rec ? 1 : 0}" style="flex:1;min-width:0">
              ${_opcoesContato(rec, l?.contato_id ?? null)}
            </select>
            <button type="button" class="btn btn-ghost btn-sm" onclick="_novoContatoRapido()"
              title="Cadastrar ${rec ? "quem paga" : "para quem pago"}">${icon("plus")}</button>
          </div>
          <div id="f-contato-dica" style="font-size:11px;color:var(--ink-3);margin-top:4px;${State.contatos?.length ? "display:none" : ""}">
            Toque no <b>+</b> para cadastrar sem sair daqui.</div>
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

        ${_repetirBloco(l || {}, ed)}
        <div class="campo full"><label>Observação</label>
          <textarea id="f-obs" placeholder="Anotações opcionais...">${ed && l.obs ? esc(l.obs) : ""}</textarea></div>
        ${_anxBloco("Foto do recibo, nota ou comprovante do PIX. Até 5 MB por arquivo.")}
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
  if (ed) _anxCarregar(l.id); else _anxRender();
}

// ── AUTOCOMPLETE DE DESCRIÇÃO ──────────────────────────────
function _autoDesc(q) {
  const box = document.getElementById("f-desc-list");
  if (!box) return;
  const tipo = document.getElementById("f-tipo")?.value || "";
  q = (q || "").toLowerCase().trim();

  // busca nos lançamentos do cache: agrupa por descrição única
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

  const estilo = `display:block;position:absolute;top:100%;left:0;right:0;z-index:9999;
    background:var(--card);border:1.5px solid var(--navy);border-radius:14px;
    box-shadow:0 8px 32px rgba(8,45,81,.18);overflow:hidden;margin-top:4px;`;

  if (!sugs.length) {
    // digitou algo que nunca foi lançado: avisa com desenho em vez de sumir
    if (q.length >= 3) {
      box.innerHTML = `<div class="auto-vazio">${ilus("doc", "var(--navy)", 56)}
        <div><b>Nenhum lançamento parecido</b><span>“${esc(q)}” será um lançamento novo.</span></div></div>`;
      box.style.cssText = estilo;
    } else box.style.display = "none";
    return;
  }

  const catMap = Object.fromEntries((State.cats || []).map(c => [c.id, c]));
  const cntMap = Object.fromEntries((State.contas || []).map(c => [c.id, c]));

  box.innerHTML = `<div class="auto-cab">${icon("clock")} Usados antes, toque para preencher</div>` + sugs.map(l => {
    const cat = catMap[l.categoria_id];
    const cnt = cntMap[l.conta_id];
    const rec = l.tipo === "receita";
    return `<div class="auto-item" onmousedown="event.preventDefault()" onclick="_escolherDesc(${l.id})">
      <span class="auto-ic ${rec ? "rec" : "desp"}">${icon(rec ? "arrowUp" : "arrowDown")}</span>
      <div class="auto-txt">
      <div style="font-size:13.5px;font-weight:600;color:var(--ink)">${_highlight(esc(l.descricao), esc(q))}</div>
      <div style="font-size:11.5px;color:var(--ink-3);margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">
        ${cat ? `<span style="color:${cat.cor||'var(--ink-3)'}">${esc(cat.nome)}</span>` : ""}
        ${cnt ? `<span>${esc(cnt.nome)}</span>` : ""}
        <span class="mono-num">${money(l.valor)}</span>
      </div>
      </div>
    </div>`;
  }).join("");

  box.style.cssText = estilo;
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
    ...(document.getElementById("f-resp") ? { responsavel_id: +$("#f-resp").value || null } : {}),
    data_vencimento: $("#f-venc").value || null,
    data_competencia: $("#f-comp").value || null,
    data_pagamento: pago ? ($("#f-venc").value || hojeISO()) : null,
    obs: $("#f-obs").value.trim() || null,
    juros: parseFloat($("#f-juros").value || "0"),
    multa: parseFloat($("#f-multa").value || "0"),
  };
  if (!body.descricao) return erroCampo("descricao", "Descrição: preenchimento obrigatório.");
  if (!body.valor) return erroCampo("valor", "Valor: informe um valor maior que zero.");
  if (!id) body.import_id = _offChave();
  try {
    const salvo = id ? await api(`/api/lancamentos/${id}`, { method: "PUT", body: JSON.stringify(body) })
                     : await api("/api/lancamentos", { method: "POST", body: JSON.stringify(body) });
    const lid = id || salvo?.id;
    const nAnx = lid && _ANX.fila.length ? await _anxEnviarFila(lid) : 0;
    const rep = document.getElementById("f-repetir")?.value;
    if (lid && rep) {
      try {
        const r = await api("/api/recorrencias", { method: "POST", body: JSON.stringify({ lancamento_id: lid, frequencia: rep, ate: $("#f-rep-ate")?.value || null }) });
        toast(rep === "mensal" ? `Vai se repetir todo dia ${r.dia}${r.criadas ? ` (${r.criadas} próxima(s) já criada(s))` : ""}` : "Vai se repetir todo ano", "ok");
      } catch (e) { toast(`Lançamento salvo, mas a repetição não: ${e.message}`, "err"); }
    }
    fecharModal(); toast(nAnx ? `Lançamento salvo com ${nAnx} comprovante(s)` : "Lançamento salvo", "ok");
    if (body.tipo === "despesa") _avisoOrcamento(body.categoria_id, body.data_competencia);
    await recarregarTabela(); atualizarBadge();
  } catch (e) {
    if (e.rede && !id) {            // sem internet: guarda no aparelho e manda quando a conexão voltar
      _offGuardar(body);
      fecharModal();
      toast(_ANX.fila.length || document.getElementById("f-repetir")?.value
        ? "Sem internet: lançamento guardado no aparelho. Comprovante e repetição você adiciona depois que ele subir."
        : "Sem internet: lançamento guardado no aparelho, sobe sozinho quando a conexão voltar", "warn");
      return;
    }
    toast(e.message, "err");
  }
}


/* ── Lançar sem internet ─────────────────────────────────────────
   O lançamento novo que não chegou ao servidor fica numa fila no aparelho
   (localStorage) com uma chave única. Quando a internet volta, ou ao abrir
   o app, a fila é enviada em ordem; o servidor reconhece a chave e nunca
   cria o mesmo lançamento duas vezes, mesmo se o envio cair no meio. */
const _OFF_K = "tomelin.fila_offline";
function _offChave() {
  try { if (crypto.randomUUID) return "off:" + crypto.randomUUID(); } catch {}
  return "off:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}
function _offLer() { try { return JSON.parse(localStorage.getItem(_OFF_K) || "[]") || []; } catch { return []; } }
function _offGravar(l) { try { localStorage.setItem(_OFF_K, JSON.stringify(l)); } catch {} _offSelo(); }
function _offGuardar(body) {
  const l = _offLer().filter(x => x.import_id !== body.import_id);
  l.push({ ...body, _quando: new Date().toISOString() });
  _offGravar(l);
}
function _offSelo() {
  const n = _offLer().length;
  let b = document.getElementById("fila-off");
  if (!n || !State.token) { b?.remove(); return; }
  if (!b) {
    b = document.createElement("button"); b.id = "fila-off"; b.type = "button"; b.className = "fila-off";
    b.onclick = () => _offVer();
    document.body.appendChild(b);
  }
  b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 13 3 3 0 0 0 6 19z"/><path d="M12 12v5M9.5 14.5 12 12l2.5 2.5"/></svg>
    <span>${n} ${n === 1 ? "lançamento esperando" : "lançamentos esperando"} a internet</span>`;
}
function _offVer() {
  const l = _offLer();
  if (!l.length) return _offSelo();
  abrirModal(`
    <div class="modal" style="max-width:440px">
      <div class="modal-h">
        <span class="card-ico i-navy">${icon("bell")}</span>
        <h3>Guardados no aparelho</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b">
        <p class="muted" style="margin:0 0 10px">Foram lançados sem internet. Sobem sozinhos quando a conexão voltar, sem duplicar.</p>
        <div class="off-lista">${l.map(x => `<div class="off-item">
            <div class="off-txt"><b>${esc(x.descricao)}</b><small>${x.tipo === "receita" ? "Receita" : "Despesa"} · guardado ${esc(new Date(x._quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))}</small></div>
            <span class="off-val ${x.tipo === "receita" ? "pos" : "neg"}">${money(x.valor)}</span>
            <button class="close-btn" title="Descartar" aria-label="Descartar" onclick="_offDescartar('${esc(x.import_id)}')">${icon("x")}</button>
          </div>`).join("")}</div>
      </div>
      <div class="modal-f"><button class="btn" onclick="fecharModal()">Fechar</button><button class="btn btn-primary" onclick="fecharModal(); _offEnviar(true)">Enviar agora</button></div>
    </div>`);
}
async function _offDescartar(chave) {
  if (!(await confirmar({ tipo: "perigo", titulo: "Descartar lançamento?", texto: "Ele está só neste aparelho e não vai para o sistema." }))) return;
  _offGravar(_offLer().filter(x => x.import_id !== chave));
  _offLer().length ? _offVer() : fecharModal();
}
let _offEnviando = false;
async function _offEnviar(manual) {
  if (_offEnviando || !State.token) return;
  let fila = _offLer();
  if (!fila.length) return _offSelo();
  _offEnviando = true;
  let ok = 0, recusados = 0;
  try {
    for (const item of fila) {
      const { _quando, ...corpo } = item;
      try {
        await api("/api/lancamentos", { method: "POST", body: JSON.stringify(corpo) });
        ok++;
      } catch (e) {
        if (e.rede) break;                        // ainda sem conexão: tenta na próxima
        if (e.status && e.status < 500) recusados++; else break;   // dado recusado sai da fila; erro do servidor espera
        if (e.status && e.status < 500) toast(`"${corpo.descricao}" não entrou: ${e.message}`, "err");
      }
      fila = _offLer().filter(x => x.import_id !== item.import_id);
      _offGravar(fila);
    }
  } finally { _offEnviando = false; }
  if (ok) {
    toast(ok === 1 ? "Lançamento feito sem internet foi enviado" : `${ok} lançamentos feitos sem internet foram enviados`, "ok");
    if (["lancamentos", "dashboard", "receitas", "despesas"].includes(State.view)) setView(State.view);
    atualizarBadge();
  } else if (manual && _offLer().length) toast("Ainda sem conexão com o servidor. Fica guardado e tento de novo sozinho.", "warn");
}
addEventListener("online", () => setTimeout(() => _offEnviar(), 800));
setInterval(() => { if (navigator.onLine !== false && _offLer().length) _offEnviar(); }, 60000);


// Wrappers seguros para onclick: buscam o objeto do cache global em vez de
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
  if (!o) try { o = await api(`/api/contas/${id}`); } catch (e) { return toast(`Não abri a conta: ${e.message}`, "err"); }
  if (o) formConta(o); else toast("Conta não encontrada.", "err");
}
async function _editarCategoria(id) {
  let o = _CACHE.cats?.[id];
  if (!o) try { const list = await api("/api/categorias"); list.forEach(c => _CACHE.cats[c.id]=c); o = _CACHE.cats[id]; } catch (e) { return toast(`Não abri a categoria: ${e.message}`, "err"); }
  if (o) formCategoria(o); else toast("Categoria não encontrada.", "err");
}
async function _editarContato(id) {
  let o = _CACHE.contatos?.[id];
  if (!o) {
    try { o = await api(`/api/contatos/${id}`); } catch (e) { return toast(`Não abri o contato: ${e.message}`, "err"); }
  }
  if (o) formContato(o);
  else toast("Contato não encontrado.", "err");
}
async function _editarVeiculo(id) {
  let o = _CACHE.veiculos?.[id];
  if (!o) try { o = await api(`/api/veiculos/${id}`); } catch (e) { return toast(`Não abri o veículo: ${e.message}`, "err"); }
  if (o) formVeiculo(o); else toast("Veículo não encontrado.", "err");
}
async function _editarUsuario(id) {
  let o = _CACHE.usuarios?.[id];
  if (!o) try { const list = await api("/api/usuarios"); list.forEach(u => _CACHE.usuarios[u.id]=u); o = _CACHE.usuarios[id]; } catch (e) { return toast(`Não abri o usuário: ${e.message}`, "err"); }
  if (o) formUsuario(o); else toast("Usuário não encontrado.", "err");
}

function formBaixa(l) {
  const rec = l.tipo === "receita";
  abrirModal(`
    <div class="modal" style="max-width:420px">
      <div class="modal-h"><span class="card-ico i-green">${icon("checkCircle")}</span>
        <h3>Dar baixa</h3><button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b">
        <p style="margin-bottom:16px;color:var(--ink-2)">Confirmar ${rec ? 'recebimento' : 'pagamento'} de <b>${esc(l.descricao)}</b> no valor de <b class="${rec ? 'val-rec' : 'val-desp'}">${money(l.valor)}</b>?</p>
        <div class="frm">
          <div class="campo"><label>Data</label><input id="b-data" type="date" value="${hojeISO()}"></div>
          <div class="campo"><label>Conta</label><select id="b-conta"><option value="">Manter</option>${State.contas.map(c => `<option value="${c.id}" ${l.conta_id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join("")}</select></div>
          <div class="campo"><label>Juros (R$)</label><input id="b-juros" type="number" step="0.01" value="${l.juros && +l.juros ? l.juros : ''}" placeholder="0,00"></div>
          <div class="campo"><label>Multa (R$)</label><input id="b-multa" type="number" step="0.01" value="${l.multa && +l.multa ? l.multa : ''}" placeholder="0,00"></div>
          ${_formaChips(l.forma_pagamento)}
          ${_anxBloco("Opcional: o comprovante do pagamento fica guardado no lançamento.")}
        </div>
      </div>
      <div class="modal-f"><button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-green" onclick="confirmarBaixa(${l.id})">${icon("check")}Confirmar</button></div>
    </div>`);
  _ANX = { lid: null, fila: [], salvos: [] }; _anxRender();   // envia só ao confirmar
}
async function confirmarBaixa(id) {
  try {
    await api(`/api/lancamentos/${id}/baixa`, { method: "POST", body: JSON.stringify({
      data_pagamento: $("#b-data").value, conta_id: +$("#b-conta").value || null, forma_pagamento: $("#b-forma")?.value || null,
      juros: parseFloat($("#b-juros").value || "0"), multa: parseFloat($("#b-multa").value || "0"),
    }) });
    const nAnx = _ANX.fila.length ? await _anxEnviarFila(id) : 0;
    fecharModal(); celebrar(_LANC_CACHE.get(id)?.tipo === "receita" ? "Recebido!" : "Pago!");
    toast(nAnx ? `Baixa registrada com ${nAnx} comprovante(s)` : "Baixa registrada", "ok");
    _baixaFeita(id);
  } catch (e) { toast(e.message, "err"); }
}

function reciboWhats(id) { return _waDisparar(`/api/lancamentos/${id}/recibo/whatsapp`, null); }
async function estornar(id) {
  try { await api(`/api/lancamentos/${id}/estornar`, { method: "POST" }); toast("Estornado", "ok"); await recarregarTabela(); atualizarBadge(); }
  catch (e) { toast(e.message, "err"); }
}
async function excluirLanc(id) {
  const lx = _LANC_CACHE.get(id);
  if (!(await confirmar({ tipo: "perigo", figura: "lixeira", ok: "Excluir",
    titulo: lx ? `Excluir "${lx.descricao}"?` : "Excluir este lançamento?",
    texto: lx ? `${lx.tipo === "receita" ? "Receita" : "Despesa"} de ${money(Number(lx.valor_total ?? lx.valor ?? 0))}.` : "",
    detalhe: "Os comprovantes anexados também são apagados. Não dá para desfazer." }))) return;
  try { await api(`/api/lancamentos/${id}`, { method: "DELETE" }); toast("Excluído", "ok"); await recarregarTabela(); atualizarBadge(); }
  catch (e) { toast(e.message, "err"); }
}
