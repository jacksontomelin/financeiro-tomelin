/* Tomelin Gestão Financeira · Vencimentos, contas, categorias e contatos.
   Arquivo 5 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ============================================================
   VIEW: VENCIMENTOS
   ============================================================ */
async function viewVencimentos(v) {
  const venc = await api("/api/dashboard/vencimentos?dias=15");
  const bloco = (titulo, arr, ic, cls) => `
    <div class="card card-pad">
      <div class="card-h"><span class="card-ico ${cls}">${icon(ic)}</span><div class="grow"><h3>${titulo} (${arr.length})</h3></div></div>
      <div class="venc-list">${arr.length ? arr.map(item(true)).join("") : `<div class="empty">${ilus("checkCircle")}<p>Nada por aqui.</p></div>`}</div>
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
        <div class="d"><div class="n">${esc(l.descricao)}</div><div class="w">${quando} · ${dataBR(l.vencimento)}${l.categoria ? " · " + l.categoria : ""}</div></div>
        <div class="vv ${rec ? 'val-rec' : 'val-desp'}">${money(l.valor)}</div>
        ${mostrarBotao ? `<button class="btn btn-green btn-sm" onclick="event.stopPropagation();formBaixaId(${l.id})">${icon("check")}Baixar</button>` : ""}
      </div>`;
    };
  }
  const totAtraso = venc.atrasados.reduce((s, x) => s + (x.tipo === 'despesa' ? x.valor : 0), 0);
  setTimeout(() => _calVenc(), 0);
  v.innerHTML = `
    <div class="wa-faixa">
      <div class="wa-faixa-txt"><b>Avisar a família</b><small>Manda a lista de contas a vencer no grupo do WhatsApp.</small></div>
      ${btnWA("Mandar no WhatsApp", "waEnviar('vencer', this)")}
    </div>
    <div class="card card-pad cal-card" id="cal-venc" style="margin-bottom:16px"><div class="sub">Montando o calendário...</div></div>
    <div class="kpi-grid">
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
  const [todas, trs] = await Promise.all([api("/api/contas"), api("/api/transferencias?limite=8").catch(() => [])]);
  todas.forEach(c => _CACHE.contas[c.id] = c);
  const contas = todas.filter(c => c.tipo !== "cartao");   // cartões aparecem como cartão, no banner
  setTimeout(() => _ccFaixa("cc-contas", true), 0);
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
      ${contas.length ? `<button class="btn btn-ghost" onclick="formImportar()">${icon("download")}Importar extrato</button>` : ""}
      ${contas.length >= 2 ? `<button class="btn btn-ghost" onclick="formTransferencia()">${icon("transfer")}Transferir</button>` : ""}
      <button class="btn btn-primary" onclick="formConta(null)">${icon("plus")}Nova conta</button>
    </div>
    <div id="cc-contas" class="cc-secao"></div>
    <div class="grid-3">
      ${contas.map(c => `
        <div class="card card-pad conta-card" style="--cor:${_corOk(c.cor)};cursor:pointer;transition:all .15s"
             onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(8,45,81,.12)'"
             onmouseout="this.style.transform='';this.style.boxShadow=''"
             onclick="FILTRO.conta=${c.id};FILTRO.status='';window._tipoFixo='';setView('lancamentos')"
             title="Ver lançamentos de ${esc(c.nome)}">
          <div class="card-h">
            ${c.logo ? avatarLogo(c.logo, c.nome, 40) : `<span class="card-ico" style="background:${c.cor}22;color:${c.cor}">${icon(c.tipo === "carteira" ? "cash" : "bank")}</span>`}
            <div class="grow"><h3>${esc(c.nome)}</h3><div class="sub">${c.tipo === "carteira" ? "Carteira / dinheiro" : (c.banco || "Conta bancária")}</div></div>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div class="val mono-num" style="font-size:26px;color:${Number(c.saldo_atual) < 0 ? 'var(--red)' : 'var(--navy)'};margin:6px 0 2px">${money(c.saldo_atual)}</div>
          <div class="meta">Saldo inicial ${money(c.saldo_inicial)} · toque para ver os lançamentos</div>
          <div class="conta-acoes">
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_editarConta(${c.id})">${icon("edit")}Editar</button>
            ${contas.length >= 2 ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();formTransferencia(${c.id})">${icon("transfer")}Transferir</button>` : ""}
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();formImportar(${c.id})" title="Importar extrato desta conta">${icon("download")}Extrato</button>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();excluirConta(${c.id})">${icon("trash")}Excluir</button>
          </div>
        </div>`).join("") || `<div class="empty">${ilus("wallet")}<p>Nenhuma conta ainda.</p></div>`}
    </div>
    ${trs.length ? `
    <div class="card card-pad" style="margin-top:16px">
      <div class="card-h"><span class="card-ico i-navy">${icon("transfer")}</span>
        <div class="grow"><h3>Transferências recentes</h3><div class="sub">Movem dinheiro entre contas, sem contar como receita ou despesa</div></div></div>
      ${trs.map(t => `
        <div class="tr-item">
          <div class="tr-rota"><div><b>${esc(t.origem)}</b> <span class="tr-seta">→</span> <b>${esc(t.destino)}</b></div>
            <div class="sub">${dataBR(t.data)}${t.descricao ? " · " + esc(t.descricao) : ""}</div></div>
          <div class="mono-num tr-val">${money(t.valor)}</div>
          <button class="btn btn-ghost btn-sm" title="Desfazer transferência" onclick="excluirTransferencia(${t.id})">${icon("trash")}</button>
        </div>`).join("")}
    </div>` : ""}`;
}
function formConta(c) {
  const e = c || {};
  abrirModal(`
    <div class="modal">
      <div class="modal-h"><span class="card-ico i-navy">${icon("wallet")}</span><h3>${e.id ? (e.tipo === "cartao" ? "Editar cartão" : "Editar conta") : (e.tipo === "cartao" ? "Novo cartão de crédito" : "Nova conta")}</h3><button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b"><div class="frm">
        <div class="campo full"><label>Nome</label><input id="c-nome" value="${esc(e.nome || "")}" placeholder="Nome da conta"></div>
        <div class="campo"><label>Tipo</label><select id="c-tipo" onchange="_contaTipo()">
          <option value="banco"${e.tipo === "banco" ? " selected" : ""}>Conta bancária</option>
          <option value="carteira"${e.tipo === "carteira" ? " selected" : ""}>Carteira / dinheiro</option>
          <option value="cartao"${e.tipo === "cartao" ? " selected" : ""}>Cartão de crédito</option>
        </select></div>
        <div class="campo"><label>Banco (opcional)</label><input id="c-banco" value="${e.banco || ""}" placeholder="Nome do banco"></div>
        <div class="campo" id="c-saldo-campo"><label>Saldo inicial</label><input id="c-saldo" type="number" step="0.01" value="${e.saldo_inicial ?? 0}"></div>
        <div class="campo"><label>Cor</label><input id="c-cor" type="color" value="${e.cor || "#305C74"}" oninput="_contaPrev()"></div>
        <div id="c-cartao-campos" style="display:none">
          <div class="campo full"><div id="c-prev-cartao" class="c-prev-cartao"></div></div>
          <div class="campo"><label>Bandeira</label><select id="c-bandeira" onchange="_contaPrev()">
            <option value="">Selecione</option>
            ${Object.entries(CC_BANDEIRAS).map(([k, n]) => `<option value="${k}"${e.bandeira === k ? " selected" : ""}>${n || "Outra"}</option>`).join("")}
          </select></div>
          <div class="campo"><label>Final do cartão</label><input id="c-final_cartao" inputmode="numeric" maxlength="24" placeholder="4 últimos dígitos"
               value="${esc(e.final_cartao || "")}" oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(-4);_contaPrev()">
            <div class="campo-dica">Só os 4 últimos. O número completo nunca é guardado.</div></div>
          <div class="campo"><label>Limite (R$)</label><input id="c-limite" type="number" step="0.01" min="0" placeholder="0,00" value="${e.limite ?? ""}"></div>
          <div class="campo"><label>Dia de fechamento</label><input id="c-dia_fechamento" type="number" min="1" max="31" placeholder="Ex.: 3" value="${e.dia_fechamento ?? ""}"></div>
          <div class="campo"><label>Dia de vencimento</label><input id="c-dia_vencimento" type="number" min="1" max="31" placeholder="Ex.: 10" value="${e.dia_vencimento ?? ""}"></div>
        </div>
        ${campoLogo("Logo do banco ou do cartão: arquivo ou link. A imagem fica guardada no sistema, sem depender do link.")}
      </div></div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarConta(${e.id || "null"})">${icon("check")}Salvar</button>
      </div>
    </div>`, "lg");
  initLogo(e.logo);
  _contaTipo();
  document.querySelector("#c-nome")?.addEventListener("input", _contaPrev);
  document.querySelector("#c-banco")?.addEventListener("input", _contaPrev);
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
  if (body.tipo === "cartao") {
    const num = id => { const v = $(id)?.value; return v === "" || v == null ? null : Number(v); };
    Object.assign(body, { saldo_inicial: 0, bandeira: $("#c-bandeira").value || null, final_cartao: $("#c-final_cartao").value || null,
      limite: num("#c-limite"), dia_fechamento: num("#c-dia_fechamento"), dia_vencimento: num("#c-dia_vencimento") });
    if (body.final_cartao && !/^\d{4}$/.test(body.final_cartao)) return erroCampo("final_cartao", "Final do cartão: informe só os 4 últimos dígitos.");
  }
  if (!body.nome) return erroCampo("nome", "Nome: preenchimento obrigatório.");
  try {
    if (id) await api(`/api/contas/${id}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/contas", { method: "POST", body: JSON.stringify(body) });
    fecharModal(); toast("Conta salva", "ok"); setView("contas");
  } catch (e) { toast(e.message, "err"); }
}
async function excluirConta(id) {
  const cx = _CACHE.contas?.[id];
  if (!(await confirmar({ tipo: "perigo", figura: "lixeira", ok: "Excluir",
    titulo: cx ? `Excluir ${cx.tipo === "cartao" ? "o cartão" : "a conta"} "${cx.nome}"?` : "Excluir esta conta?",
    texto: "Se ela tiver lançamentos, transferências ou parcelas, o sistema avisa e não exclui." }))) return;
  try { await api(`/api/contas/${id}`, { method: "DELETE" }); toast("Conta excluída", "ok"); setView("contas"); }
  catch (e) { toast(e.message, "err"); }
}

/* ============================================================
   VIEW: CATEGORIAS
   ============================================================ */
async function viewCategorias(v) {
  const [cats, orc] = await Promise.all([api("/api/categorias"), api("/api/orcamento").catch(() => null)]);
  const gasto = Object.fromEntries((orc?.itens || []).map(i => [i.categoria_id, i]));
  const rec = cats.filter(c => c.tipo === "receita"), desp = cats.filter(c => c.tipo === "despesa");
  const tile = (c, i) => {
    const g = gasto[c.id], cor = _corOk(c.cor, "#7E8C9A");
    const pct = g?.limite ? Math.min(100, g.pct || 0) : null;
    return `<div class="cat-tile" style="--cor:${cor};--i:${i}" role="button" tabindex="0"
        onclick="window._filtroInicial={cat:${c.id}};window._tipoFixo='';setView('lancamentos')" onkeydown="if(event.key==='Enter')this.click()"
        title="Ver lançamentos de ${esc(c.nome)}">
      <div class="cat-tile-acoes">
        <button class="cat-bt" onclick="event.stopPropagation();_editarCategoria(${c.id})" title="Editar">${icon("edit")}</button>
        <button class="cat-bt" onclick="event.stopPropagation();excluirCategoria(${c.id})" title="Excluir">${icon("trash")}</button></div>
      <span class="cat-tile-ic">${icon(c.icone || "tag")}</span>
      <b>${esc(c.nome)}</b>
      ${g ? `<small class="mono-num">${money(g.gasto)} este mês</small>` : `<small>Ver lançamentos</small>`}
      ${pct != null ? `<div class="cat-barra" title="${Math.round(g.pct)}% do limite"><i style="width:${pct}%"></i></div><span class="cat-pct">${Math.round(g.pct)}% de ${money0(g.limite)}</span>` : ""}
    </div>`;
  };
  const bloco = (titulo, arr, ic, cls, tipo) => `
    <div class="card card-pad">
      <div class="card-h"><span class="card-ico ${cls}">${icon(ic)}</span><div class="grow"><h3>${titulo}</h3><div class="sub">${arr.length} categoria(s)</div></div>
        <button class="btn btn-ghost btn-sm" onclick="formCategoria(null,'${tipo}')">${icon("plus")}Nova</button></div>
      <div class="cat-mosaico">${arr.map(tile).join("") || `<div class="empty" style="padding:20px">${ilus("tag")}<p>Nenhuma categoria ainda.</p></div>`}</div>
    </div>`;
  v.innerHTML = `
    <div class="toolbar"><div class="grow"></div>
      <button class="btn btn-green" onclick="formCategoria(null,'receita')">${icon("plus")}Categoria de receita</button>
      <button class="btn btn-primary" onclick="formCategoria(null,'despesa')">${icon("plus")}Categoria de despesa</button>
    </div>
    <div class="grid-2 grid-2-igual">
      ${bloco("Despesas", desp, "arrowUp", "i-red", "despesa")}
      ${bloco("Receitas", rec, "arrowDown", "i-green", "receita")}
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
        <div class="campo full"><div class="cat-tile cat-prev" id="k-prev"></div></div>
        <div class="campo full"><label>Nome</label><input id="k-nome" value="${esc(e.nome || "")}" placeholder="Nome da categoria" oninput="_catPrev()"></div>
        <div class="campo"><label>Tipo</label><select id="k-tipo" onchange="_catPrev()">
          <option value="despesa"${tipo === "despesa" ? " selected" : ""}>Despesa</option>
          <option value="receita"${tipo === "receita" ? " selected" : ""}>Receita</option>
        </select></div>
        <div class="campo"><label>Cor</label><input id="k-cor" type="color" value="${e.cor || (tipo === "receita" ? "#3E9079" : "#C9A94E")}" oninput="_catPrev()"></div>
        <div class="campo full" id="k-ir-campo"><label>Imposto de Renda</label><select id="k-ir">
          ${[["", "Não entra no IR"], ["saude", "Dedutível: saúde"], ["educacao", "Dedutível: educação"], ["previdencia", "Dedutível: previdência privada"], ["pensao", "Dedutível: pensão alimentícia"]]
            .map(([v, t]) => `<option value="${v}"${(e.ir_tipo || "") === v ? " selected" : ""}>${t}</option>`).join("")}
        </select><small class="campo-dica">Os pagamentos desta categoria entram no relatório do Imposto de Renda (Relatórios).</small></div>
        <div class="campo full"><div class="cor-grid" id="k-cores">${CAT_CORES.map(c => `<button type="button" class="cor-opt" data-cor="${c}" style="background:${c}" aria-label="Cor ${c}"
            onclick="document.getElementById('k-cor').value='${c}';_catPrev()"></button>`).join("")}</div></div>
        <div class="campo full"><label>Ícone</label><input type="hidden" id="k-icone" value="${esc(e.icone || "tag")}">
          <div class="av-grid" id="k-ic-grade">${CAT_ICONES.map(i => `<button type="button" class="av-opt" data-ic="${i}" onclick="document.getElementById('k-icone').value='${i}';_catPrev()">${icon(i)}</button>`).join("")}</div></div>
      </div></div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarCategoria(${c ? e.id : "null"})">${icon("check")}Salvar</button>
      </div>
    </div>`);
  _catPrev();
}
async function salvarCategoria(id) {
  const body = { nome: $("#k-nome").value.trim(), tipo: $("#k-tipo").value, cor: $("#k-cor").value, icone: $("#k-icone").value,
                 ir_tipo: $("#k-tipo").value === "despesa" ? ($("#k-ir")?.value || "") : "" };
  if (!body.nome) return erroCampo("nome", "Nome: preenchimento obrigatório.");
  try {
    if (id) await api(`/api/categorias/${id}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/categorias", { method: "POST", body: JSON.stringify(body) });
    fecharModal(); toast("Categoria salva", "ok"); setView("categorias");
  } catch (e) { toast(e.message, "err"); }
}
async function excluirCategoria(id) {
  const ct = (State.cats || []).find(c => c.id === id);
  if (!(await confirmar({ tipo: "perigo", figura: "lixeira", ok: "Excluir",
    titulo: ct ? `Excluir a categoria "${ct.nome}"?` : "Excluir esta categoria?",
    texto: "Se ela estiver em uso em algum lançamento, o sistema avisa e não exclui." }))) return;
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
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <div class="seg" id="seg-cont" style="flex:1;min-width:0">
          <button data-t="" class="on" onclick="filtroContato('')">Todos</button>
          <button data-t="cliente" onclick="filtroContato('cliente')">Recebo de</button>
          <button data-t="fornecedor" onclick="filtroContato('fornecedor')">Pago para</button>
        </div>
        <button class="btn btn-primary" onclick="formContato(null)" title="Novo contato">${icon("plus")}<span class="so-desktop"> Novo contato</span></button>
      </div>
      <div class="search"><span>${icon("search")}</span>
        <input class="search-i" id="bc" placeholder="Buscar por nome, documento ou cidade..." oninput="renderContatos()">
      </div>
    </div>
    <div id="lista-contatos" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:12px"></div>
    <div id="cache-info" style="margin-top:16px;font-size:11.5px;color:var(--ink-3);text-align:center"></div>`;
  FCONTATO = ""; renderContatos();

  // contador do cache local de CNPJ/CEP
  api("/api/contatos/cache/estatisticas").then(e => {
    const box = document.getElementById("cache-info");
    if (box && (e.cnpjs || e.ceps)) {
      box.innerHTML = `${e.cnpjs} CNPJ e ${e.ceps} CEP guardados localmente: as consultas repetidas não usam internet.`;
    }
  }).catch(() => {});
}

function filtroContato(t) {
  FCONTATO = t;
  document.querySelectorAll("#seg-cont button").forEach(b => b.classList.toggle("on", b.dataset.t === t));
  renderContatos();
}

function renderContatos() {
  const busca = ($("#bc")?.value || "").toLowerCase().replace(/\D/g, "") || ($("#bc")?.value || "").toLowerCase();
  const txt   = ($("#bc")?.value || "").toLowerCase();
  const arr = (window._contatos || []).filter(c => {
    if (FCONTATO && c.tipo !== FCONTATO) return false;
    if (!txt) return true;
    return (c.nome || "").toLowerCase().includes(txt)
        || (c.documento || "").includes(txt.replace(/\D/g, ""))
        || (c.cidade || "").toLowerCase().includes(txt);
  });

  const box = document.getElementById("lista-contatos");
  if (!box) return;

  if (!arr.length) {
    box.innerHTML = `<div class="empty" style="grid-column:1/-1">${ilus("users")}<p>Nenhum contato encontrado.</p></div>`;
    return;
  }

  box.innerHTML = arr.map(c => {
    const cli = c.tipo === "cliente";
    const doc = c.documento ? fmtDoc(c.documento) : "";
    const end = [c.logradouro && (c.logradouro + (c.numero ? ", " + c.numero : "")),
                 c.bairro, c.cidade && (c.cidade + (c.estado ? "/" + c.estado : ""))]
                .filter(Boolean).join(" · ");
    return `<div class="card card-pad" style="cursor:pointer;transition:all .15s;border-left:3px solid ${cli ? "#16A34A" : "#D97706"}"
        onclick="verContato(${c.id})"
        onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(8,45,81,.12)'"
        onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="display:flex;align-items:flex-start;gap:11px;margin-bottom:10px">
        ${avatarLogo(c.logo, c.nome, 40)}
        <div style="flex:1;min-width:0">
          <div style="font-size:14.5px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.nome)}</div>
          <span class="tag ${cli ? "pago" : "pendente"}" style="margin-top:3px;display:inline-block">${cli ? "Recebo de" : "Pago para"}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:var(--ink-3)">
        ${doc ? `<div style="font-family:monospace">${esc(doc)}</div>` : ""}
        ${c.telefone ? `<div>${esc(c.telefone)}</div>` : ""}
        ${c.email ? `<div style="overflow:hidden;text-overflow:ellipsis">${esc(c.email)}</div>` : ""}
        ${end ? `<div style="overflow:hidden;text-overflow:ellipsis">${esc(end)}</div>` : ""}
      </div>
      <div style="display:flex;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_editarContato(${c.id})">${icon("edit")} Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();FILTRO.contato=${c.id};FILTRO.status='';window._tipoFixo='';setView('lancamentos')">${icon("terminal")} Extrato</button>
        ${_waNumero(c.telefone) ? `<a class="btn btn-wa btn-sm btn-wa-mini" href="${esc(_waLink(c.telefone))}" target="_blank" rel="noopener"
            onclick="event.stopPropagation()" title="Conversar no WhatsApp" aria-label="Conversar no WhatsApp"><span class="wa-ic">${waDesenho()}</span></a>` : ""}
        <button class="btn btn-ghost btn-sm" style="color:var(--red);margin-left:auto" onclick="event.stopPropagation();excluirContato(${c.id})">${icon("trash")}</button>
      </div>
    </div>`;
  }).join("");
}

/* Máscara dinâmica: detecta CPF ou CNPJ conforme digita */
function _maskDoc(el) {
  const c = el.value.replace(/\D/g, "").slice(0, 14);
  el.value = c.length <= 11
    ? c.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4")
    : c.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
  const msg = document.getElementById("o-doc-msg");
  if (msg && c.length < 11) { msg.textContent = ""; }
}

/* Valida dígito verificador de CPF/CNPJ */
function _validaCPF(c) {
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const i of [9, 10]) {
    let soma = 0;
    for (let n = 0; n < i; n++) soma += +c[n] * ((i + 1) - n);
    let dv = (soma * 10) % 11;
    if (dv === 10) dv = 0;
    if (dv !== +c[i]) return false;
  }
  return true;
}

function _validaCNPJ(c) {
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const p1 = [5,4,3,2,9,8,7,6,5,4,3,2], p2 = [6, ...p1];
  for (const [pesos, pos] of [[p1, 12], [p2, 13]]) {
    let soma = 0;
    for (let i = 0; i < pos; i++) soma += +c[i] * pesos[i];
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== +c[pos]) return false;
  }
  return true;
}

function _validaDoc(el) {
  const msg = document.getElementById("o-doc-msg");
  if (!msg) return true;
  const c = el.value.replace(/\D/g, "");
  if (!c) { msg.textContent = ""; el.style.borderColor = ""; return true; }

  let ok = false, tipo = "";
  if (c.length === 11)      { ok = _validaCPF(c);  tipo = "CPF";  }
  else if (c.length === 14) { ok = _validaCNPJ(c); tipo = "CNPJ"; }
  else { msg.textContent = "Documento incompleto"; msg.style.color = "var(--ink-3)"; el.style.borderColor = ""; return false; }

  msg.textContent = ok ? `${tipo} válido` : `${tipo} inválido: confira os dígitos`;
  msg.style.color = ok ? "#16A34A" : "var(--red)";
  el.style.borderColor = ok ? "#86EFAC" : "#FCA5A5";

  // se for CNPJ válido, oferece buscar os dados
  if (ok && tipo === "CNPJ") {
    const b = document.getElementById("o-cnpj-busca");
    if (b && !b.value) b.value = el.value;
  }
  return ok;
}

/* Formata CPF/CNPJ para exibição */
function fmtDoc(d) {
  const c = String(d || "").replace(/\D/g, "");
  if (c.length === 11) return `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9)}`;
  if (c.length === 14) return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`;
  return d || "";
}

/* Modal com o resumo financeiro do contato */
async function verContato(id) {
  let r;
  try { r = await api(`/api/contatos/${id}/resumo`); }
  catch (e) { return toast(`Não carreguei o resumo: ${e.message}`, "err"); }

  const c = (window._contatos || []).find(x => x.id === id) || r.contato;
  const cli = c.tipo === "cliente";
  const end = [c.logradouro && (c.logradouro + (c.numero ? ", " + c.numero : "")),
               c.complemento, c.bairro,
               c.cidade && (c.cidade + (c.estado ? "/" + c.estado : "")),
               c.cep && fmtCep(c.cep)].filter(Boolean).join(" · ");

  const kpi = (lab, val, cor) => `
    <div style="flex:1;min-width:120px;background:var(--bg);border-radius:12px;padding:12px 14px;border:1px solid var(--line)">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:3px">${lab}</div>
      <div style="font-size:16px;font-weight:800;font-family:monospace;color:${cor}">${money(val)}</div>
    </div>`;

  abrirModal(`
    <div class="modal" style="max-width:560px">
      <div class="modal-h">
        ${avatarLogo(c.logo, c.nome, 36)}
        <h3 style="flex:1">${esc(c.nome)}</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b">
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
          <span class="tag ${cli ? "pago" : "pendente"}">${cli ? "Recebo de" : "Pago para"}</span>
          ${c.documento ? `<span class="tag info" style="font-family:monospace">${esc(fmtDoc(c.documento))}</span>` : ""}
          <span class="tag info">${r.qtd} lançamento${r.qtd !== 1 ? "s" : ""}</span>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
          ${cli ? kpi("Já recebido", r.recebido, "#15803D") : kpi("Já pago", r.pago, "#991B1B")}
          ${cli ? kpi("A receber", r.a_receber, "#CA8A04") : kpi("A pagar", r.a_pagar, "#CA8A04")}
        </div>

        ${(c.telefone || c.email || end) ? `
        <div style="background:var(--bg);border-radius:12px;padding:12px 14px;margin-bottom:14px;
                    display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--ink-2)">
          ${c.telefone ? `<div style="display:flex;gap:8px"><span style="color:var(--ink-3);min-width:70px">Telefone</span>${esc(c.telefone)}</div>` : ""}
          ${c.email    ? `<div style="display:flex;gap:8px"><span style="color:var(--ink-3);min-width:70px">E-mail</span>${esc(c.email)}</div>` : ""}
          ${end        ? `<div style="display:flex;gap:8px"><span style="color:var(--ink-3);min-width:70px">Endereço</span><span style="flex:1">${esc(end)}</span></div>` : ""}
        </div>` : ""}
        ${_waContatoBotoes(c, r)}

        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:8px">
          Últimos lançamentos
        </div>
        ${r.ultimos.length ? r.ultimos.map(l => {
          const rec = l.tipo === "receita";
          return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer"
              onclick="fecharModal();formLancamentoId(${l.id})">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.descricao)}</div>
              <div style="font-size:11px;color:var(--ink-3)">${l.vencimento ? dataBR(l.vencimento) : "sem vencimento"} · ${l.status}</div>
            </div>
            <div style="font-family:monospace;font-size:13.5px;font-weight:700;color:${rec ? "#15803D" : "#DC2626"}">
              ${rec ? "+" : "−"} ${money(l.valor)}
            </div>
          </div>`;
        }).join("") : `<div style="font-size:12.5px;color:var(--ink-3);padding:8px 0">Nenhum lançamento com este contato ainda.</div>`}
      </div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal();_editarContato(${id})">${icon("edit")} Editar</button>
        <button class="btn btn-primary" onclick="fecharModal();FILTRO.contato=${id};FILTRO.status='';window._tipoFixo='';setView('lancamentos')">
          ${icon("terminal")} Ver extrato completo
        </button>
      </div>
    </div>`);
}

function fmtCep(v) {
  const c = String(v || "").replace(/\D/g, "");
  return c.length === 8 ? `${c.slice(0,5)}-${c.slice(5)}` : (v || "");
}

function formContato(c) {
  _buscarCEP.ultimo = null;
  const e = c || {};
  abrirModal(`
    <div class="modal" style="max-width:600px">
      <div class="modal-h">
        <span class="card-ico i-navy">${icon("users")}</span>
        <h3>${e.id ? "Editar contato" : "Novo contato"}</h3>
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
          <input id="o-doc" value="${e.documento ? fmtDoc(e.documento) : ""}"
            placeholder="CPF ou CNPJ" maxlength="18" inputmode="numeric"
            oninput="_maskDoc(this)" onblur="_validaDoc(this)">
          <div id="o-doc-msg" style="font-size:11px;margin-top:3px;min-height:14px"></div>
        </div>

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
          <div id="o-cep-status"></div>
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
        ${campoLogo("Logo da empresa: arquivo ou link. A imagem fica guardada no sistema, sem depender do link.")}
        <div class="campo full"><label>Observações</label>
          <textarea id="o-obs" rows="2">${e.obs||""}</textarea></div>

      </div></div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">${icon("x")} Cancelar</button>
        <button class="btn btn-primary" onclick="salvarContato(${e.id || "null"})">${icon("check")} Salvar contato</button>
      </div>
    </div>`, "lg");
  initLogo(e.logo);
}

async function _buscarCNPJ(forcar) {
  const el  = document.getElementById("o-cnpj-busca");
  const st  = document.getElementById("o-cnpj-status");
  const raw = (el?.value || "").replace(/\D/g, "");

  const aviso = (txt, cor) => {
    if (!st) return;
    const erro = cor === "var(--red)";
    st.innerHTML = erro
      ? `<div class="busca-card erro">${ilusAlerta(44)}<div><b>${esc(txt)}</b></div></div>`
      : `<div class="busca-card">${ilusBuscaEmpresa(52)}<div><b>${esc(txt)}</b>
           <span>Consultando a Receita Federal por três fontes ao mesmo tempo</span></div></div>`;
  };

  if (raw.length !== 14) return aviso("Digite os 14 dígitos do CNPJ.", "var(--red)");
  if (!_validaCNPJ(raw)) return aviso("CNPJ inválido: confira os dígitos.", "var(--red)");

  aviso(forcar ? "Atualizando os dados da empresa..." : "Buscando os dados da empresa...", "var(--ink-3)");

  let d;
  try {
    d = await api(`/api/contatos/buscar-cnpj/${raw}${forcar ? "?forcar=true" : ""}`);
  } catch (err) {
    // a API devolve mensagens prontas para o usuário
    const msg = (err && err.message) ? err.message : "Não foi possível consultar agora.";
    aviso(msg, "var(--red)");
    toast(msg, "err");
    return;
  }

  const set = (id, val) => { const e = document.getElementById(id); if (e && val) e.value = val; };
  set("o-nome", d.nome || d.razao_social);
  set("o-doc",  fmtDoc(d.documento));
  set("o-tel",  d.telefone);
  set("o-email", d.email);
  set("o-logradouro", d.logradouro);
  set("o-numero", d.numero);
  set("o-complemento", d.complemento);
  set("o-bairro", d.bairro);
  set("o-cidade", d.cidade);
  set("o-estado", d.estado);
  if (d.cep) set("o-cep", fmtCep(d.cep));

  // revalida o campo de documento (pinta a borda de verde)
  const docEl = document.getElementById("o-doc");
  if (docEl) _validaDoc(docEl);

  const inativa = d.situacao && !/ATIVA/i.test(d.situacao);
  if (st) {
    const local = [d.cidade, d.estado].filter(Boolean).join("/");
    const fantasia = d.nome && d.nome !== d.razao_social ? d.nome : "";
    st.innerHTML = `
      <div class="busca-card ${inativa ? "aviso" : "ok"}">
        ${ilusEmpresa(!inativa, 52)}
        <div>
          <b>${esc(d.razao_social || d.nome)}</b>
          <span>${[fantasia, local].filter(Boolean).map(esc).join(" · ")}</span>
          <div class="busca-chips">
            ${d.situacao ? `<i class="chip ${inativa ? "amb" : "ver"}">${esc(d.situacao)}</i>` : ""}
            <i class="chip">${d.do_cache ? icon("clock") + " guardado no sistema" : icon("check") + " " + esc(d.fonte || "Receita")}</i>
            ${d.do_cache ? `<button type="button" class="chip link" onclick="_buscarCNPJ(true)">${icon("refresh")} atualizar</button>` : ""}
          </div>
        </div>
      </div>`;
  }
  toast(
    inativa ? `Empresa encontrada, mas a situação é ${d.situacao}`
            : (d.do_cache ? "Dados do cache local" : "Dados preenchidos"),
    inativa ? "err" : "ok"
  );
}

async function _buscarCEP(cep, forcar) {
  const raw = (cep||"").replace(/\D/g,"");
  if (raw.length !== 8) return;
  // sair do campo e clicar na lupa disparavam duas buscas iguais
  if (!forcar && raw === _buscarCEP.ultimo) return;
  _buscarCEP.ultimo = raw;
  const st = document.getElementById("o-cep-status");
  const mostra = (html) => { if (st) st.innerHTML = html; };
  mostra(`<div class="busca-card mini">${ilusMapa(true, 40)}<div><b>Buscando o endereço...</b></div></div>`);
  try {
    const d = await api(`/api/contatos/buscar-cep/${raw}`);
    mostra(`<div class="busca-card mini ok">${ilusMapa(false, 40)}<div>
      <b>${esc([d.logradouro, d.bairro].filter(Boolean).join(", ") || "CEP encontrado")}</b>
      <span>${esc([d.cidade, d.estado].filter(Boolean).join("/"))}</span></div></div>`);
    const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    set("o-logradouro", d.logradouro);
    set("o-bairro", d.bairro);
    set("o-cidade", d.cidade);
    set("o-estado", d.estado);
    document.getElementById("o-numero")?.focus();
    toast("CEP encontrado", "ok");
  } catch (e) {
    _buscarCEP.ultimo = null;   // permite tentar de novo
    mostra(`<div class="busca-card mini erro">${ilusAlerta(36)}<div><b>${esc(e.message)}</b>
      <span>Preencha o endereço manualmente.</span></div></div>`);
  }
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
  if (!body.nome) return erroCampo("nome", "Nome: preenchimento obrigatório.");
  const docEl = $("#o-doc");
  if (docEl && docEl.value.trim() && !_validaDoc(docEl)) {
    return erroCampo("documento", "CPF/CNPJ inválido: confira os dígitos.");
  }
  try {
    const salvo = id ? await api(`/api/contatos/${id}`, { method: "PUT", body: JSON.stringify(body) })
                     : await api("/api/contatos",       { method: "POST", body: JSON.stringify(body) });
    if (State._contatoRapido) {
      fecharModal();                                   // fecha só o contato
      try { await carregarRefs(); } catch {}
      _recarregarSelContato(salvo?.id);
      toast(`${body.nome} cadastrado e selecionado`, "ok");
      return;
    }
    fecharModal(); toast("Contato salvo", "ok"); setView("contatos");
  } catch (e) { toast(e.message, "err"); }
}
async function excluirContato(id) {
  const co = (window._contatos || []).find(c => c.id === id);
  if (!(await confirmar({ tipo: "perigo", figura: "lixeira", ok: "Excluir",
    titulo: co ? `Excluir o contato "${co.nome}"?` : "Excluir este contato?",
    texto: "Se ele estiver ligado a lançamentos, o sistema avisa e não exclui." }))) return;
  try { await api(`/api/contatos/${id}`, { method: "DELETE" }); toast("Contato excluído", "ok"); setView("contatos"); }
  catch (e) { toast(e.message, "err"); }
}
