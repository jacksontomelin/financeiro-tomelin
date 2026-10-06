/* Tomelin Gestão Financeira · Transferências, orçamento, previsão, comprovantes, importação e campo de data.
   Arquivo 11 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ── Ícones SVG como constantes ── */
const IC_CHECK_W = `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>`;
const IC_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
const IC_EDIT_SM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const IC_WA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
const IC_RECEIPT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>`;
const IC_UNDO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`;
const IC_CSV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="15" height="15"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><polyline points="8 18 12 22 16 18"/></svg>`;
const IC_PLUS_X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;


/* ── Transferências entre contas ─────────────────────────────── */
function formTransferencia(origemId) {
  const contas = Object.values(_CACHE.contas || {}).filter(c => c.ativo !== false);
  if (contas.length < 2) return toast("Cadastre pelo menos duas contas para transferir.", "err");
  const o = origemId || contas[0].id;
  const d = (contas.find(c => c.id !== o) || {}).id;
  const opt = sel => contas.map(c => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.nome)} · ${money(c.saldo_atual)}</option>`).join("");
  abrirModal(`
    <div class="modal" style="max-width:480px">
      <div class="modal-h"><span class="card-ico i-navy">${icon("transfer")}</span><h3>Transferir entre contas</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b"><div class="frm">
        <div class="campo full"><label>Sai de</label><select id="tr-origem" onchange="_prevTransf()">${opt(o)}</select></div>
        <div class="campo full tr-troca"><button type="button" class="btn btn-ghost btn-sm" onclick="_trocarTransf()" title="Inverter origem e destino">${icon("transfer")}Inverter</button></div>
        <div class="campo full"><label>Vai para</label><select id="tr-destino" onchange="_prevTransf()">${opt(d)}</select></div>
        <div class="campo"><label>Valor (R$)</label><input id="tr-valor" type="number" step="0.01" min="0" placeholder="0,00" oninput="_prevTransf()"></div>
        <div class="campo"><label>Data</label><input id="tr-data" type="date" value="${hojeISO()}" max="${hojeISO()}"></div>
        <div class="campo full"><label>Descrição (opcional)</label><input id="tr-desc" maxlength="200" placeholder="Ex.: reserva do mês, saque no caixa"></div>
        <div class="campo full"><div class="tr-prev" id="tr-prev"></div></div>
      </div>
      <div class="dica azul" style="margin-top:4px">${icon("shield")}<div>Transferência só move o dinheiro: não conta como receita nem despesa nos relatórios.</div></div>
      </div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarTransferencia()">${icon("check")}Transferir</button>
      </div>
    </div>`);
  _prevTransf();
  setTimeout(() => document.getElementById("tr-valor")?.focus(), 50);
}

function _trocarTransf() {
  const a = document.getElementById("tr-origem"), b = document.getElementById("tr-destino");
  if (!a || !b) return;
  [a.value, b.value] = [b.value, a.value];
  _prevTransf();
}

function _prevTransf() {
  const box = document.getElementById("tr-prev"); if (!box) return;
  const o = _CACHE.contas[Number(document.getElementById("tr-origem").value)];
  const d = _CACHE.contas[Number(document.getElementById("tr-destino").value)];
  const v = Number(document.getElementById("tr-valor").value || 0);
  if (!o || !d) { box.innerHTML = ""; return; }
  if (o.id === d.id) { box.innerHTML = `<div class="tr-aviso">Escolha contas diferentes.</div>`; return; }
  const so = Number(o.saldo_atual || 0), sd = Number(d.saldo_atual || 0);
  const linha = (c, antes, depois) => `<div class="tr-linha"><span>${esc(c.nome)}</span>
      <span class="mono-num">${money(antes)} <span class="tr-seta">→</span> <b class="${depois < 0 ? "neg" : ""}">${money(depois)}</b></span></div>`;
  box.innerHTML = linha(o, so, so - v) + linha(d, sd, sd + v)
    + (v > 0 && so - v < 0 ? `<div class="tr-aviso">${esc(o.nome)} vai ficar negativa.</div>` : "");
}

async function salvarTransferencia() {
  const body = {
    conta_origem_id: Number($("#tr-origem").value) || null,
    conta_destino_id: Number($("#tr-destino").value) || null,
    valor: parseFloat($("#tr-valor").value || "0"),
    data: $("#tr-data").value || null,
    descricao: $("#tr-desc").value.trim() || null,
  };
  if (body.conta_origem_id === body.conta_destino_id)
    return erroCampo("conta_destino_id", "Conta de destino: precisa ser diferente da conta de origem.");
  if (!(body.valor > 0)) return erroCampo("valor", "Valor: precisa ser maior que zero.");
  try {
    const t = await api("/api/transferencias", { method: "POST", body: JSON.stringify(body) });
    fecharModal(); celebrar("Transferido!");
    toast(`${money(t.valor)} transferidos de ${t.origem} para ${t.destino}`, "ok");
    setView("contas");
  } catch (e) { toast(e.message, "err"); }
}

async function excluirTransferencia(id) {
  if (!(await confirmar({ tipo: "aviso", figura: "desfazer", ok: "Desfazer", titulo: "Desfazer esta transferência?",
    texto: "Os saldos das duas contas voltam ao que eram antes dela." }))) return;
  try { await api(`/api/transferencias/${id}`, { method: "DELETE" }); toast("Transferência desfeita", "ok"); setView("contas"); }
  catch (e) { toast(e.message, "err"); }
}


/* ── Orçamento por categoria ─────────────────────────────────── */
let _ORC_MES = null, _ORC = null;
const _corOk = (c, padrao = "#305C74") => /^#[0-9a-fA-F]{3,8}$/.test(c || "") ? c : padrao;
const _ORC_COR = { estourado: "var(--red)", atencao: "var(--gold)", ok: "var(--teal)", sem_limite: "var(--ink-3)" };

function _orcLinha(i, compacto = false) {
  const pct = i.pct ?? 0, cor = _ORC_COR[i.status];
  const info = i.limite == null ? `${money(i.gasto)} gastos · sem limite`
    : i.status === "estourado" ? `${money(i.gasto)} de ${money(i.limite)} · passou ${money(-i.restante)}`
    : `${money(i.gasto)} de ${money(i.limite)} · restam ${money(i.restante)}`;
  const ritmo = i.vai_estourar && !compacto ? `<div class="orc-ritmo">Pelo padrão dos últimos meses, deve fechar em ${money(i.previsto_fim_mes)}</div>` : "";
  const c = _corOk(i.cor);
  const sug = _ORC_SUG?.sugestao?.[i.categoria_id];
  return `<div class="orc-item st-${i.status}" data-cat="${i.categoria_id}" style="--cc:${c}">
    <span class="card-ico orc-ic">${icon(i.icone || "tag")}</span>
    <div class="orc-meio">
      <div class="orc-topo"><b>${esc(i.nome)}</b>${i.pct != null ? `<span class="orc-pct" style="color:${cor}">${Math.round(pct)}%</span>` : ""}</div>
      <div class="orc-barra"><div style="width:${i.limite == null ? 0 : Math.min(100, pct)}%;background:${cor}"></div></div>
      <div class="orc-info">${info}</div>${ritmo}
    </div>
    ${compacto ? "" : (i.limite != null
      ? `<button type="button" class="orc-chip" onclick="_orcEditar(${i.categoria_id})" aria-label="Mudar o limite de ${esc(i.nome)}">
           <small>Limite</small><b class="mono-num">${money(i.limite)}</b><span class="orc-chip-ic">${icon("edit")}</span></button>`
      : `<button type="button" class="orc-chip vazio" onclick="_orcEditar(${i.categoria_id})" aria-label="Definir limite de ${esc(i.nome)}">
           <span class="orc-chip-mais">${icon("plus")}Definir limite</span>${sug ? `<small>sugestão ${money0(sug)}</small>` : ""}</button>`)}
  </div>`;
}

async function viewOrcamento(v) {
  const mes = _ORC_MES || hojeISO().slice(0, 7);
  const [o, sg] = await Promise.all([api(`/api/orcamento?mes=${mes}`), api(`/api/orcamento/sugestao?mes=${mes}`).catch(() => null)]);
  _ORC = o; _ORC_SUG = sg;
  const [a, m] = mes.split("-").map(Number);
  const nm = new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const nomeMes = nm.charAt(0).toUpperCase() + nm.slice(1);   // "Outubro de 2026"
  const comLimite = o.itens.filter(i => i.limite != null).length;
  const pctOrc = o.limite_total ? Math.round(o.gasto_orcado / o.limite_total * 100) : 0;
  const ritmo = o.itens.filter(i => i.vai_estourar);
  v.innerHTML = `
    <div class="toolbar">
      <div><h2 style="margin:0;color:var(--navy)">Orçamento</h2>
        <div class="sub">Quanto a família quer gastar por categoria em cada mês</div></div>
      <div class="grow"></div>
      <div class="mes-nav">
        <button class="btn btn-ghost btn-sm" onclick="_orcMes(-1)" title="Mês anterior" aria-label="Mês anterior">‹</button>
        <span class="mes-nome">${nomeMes}</span>
        <button class="btn btn-ghost btn-sm" onclick="_orcMes(1)" title="Próximo mês" aria-label="Próximo mês">›</button>
      </div>
      <button class="btn btn-ghost" onclick="_orcSugerir()">${icon("chart")}Sugerir pela média</button>
    </div>
    <div class="kpi-grid orc-kpis">
      <div class="kpi navy"><div class="lab"><span class="i">${icon("target")}</span>Orçado</div>
        <div class="val mono-num">${money(o.limite_total)}</div><div class="meta">${comLimite} de ${o.itens.length} categorias com limite</div></div>
      <div class="kpi ${pctOrc > 100 ? "red" : "teal"}"><div class="lab"><span class="i">${icon("arrowUp")}</span>Gasto no orçado</div>
        <div class="val mono-num">${money(o.gasto_orcado)}</div><div class="meta">${o.limite_total ? pctOrc + "% do orçado" : "defina limites abaixo"}</div></div>
      <div class="kpi ${o.disponivel < 0 ? "red" : "gold"}"><div class="lab"><span class="i">${icon("wallet")}</span>${o.disponivel < 0 ? "Passou do orçado" : "Disponível"}</div>
        <div class="val mono-num">${money(Math.abs(o.disponivel))}</div><div class="meta">${o.corrente ? `faltam ${o.dias_mes - o.dia} dia(s) no mês` : "mês encerrado"}</div></div>
    </div>
    ${o.estourados || ritmo.length ? `<div class="dica ${o.estourados ? "vermelho" : "ouro"}" style="margin-bottom:14px">${icon("alert")}<div>
      ${o.estourados ? `<b>${o.estourados} categoria(s) passaram do limite.</b> ` : ""}
      ${ritmo.length ? `Pelo padrão dos últimos meses, ${ritmo.map(i => `<b>${esc(i.nome)}</b>`).join(", ")} ${ritmo.length > 1 ? "vão passar" : "vai passar"} do limite até o fim do mês.` : ""}
    </div></div>` : ""}
    <div class="card card-pad">
      <div class="card-h"><span class="card-ico i-gold">${icon("target")}</span>
        <div class="grow"><h3>Categorias de despesa</h3><div class="sub">Toque no limite para definir ou mudar. Há atalhos com a média dos últimos meses.</div></div></div>
      ${o.itens.map(i => _orcLinha(i)).join("") || `<div class="empty">${ilus("tag")}<p>Nenhuma categoria de despesa ainda.</p></div>`}
      <div class="orc-rodape">Gasto total do mês: <b>${money(o.gasto_total)}</b>${o.sem_categoria ? ` · sem categoria: ${money(o.sem_categoria)}` : ""}. Conta pela competência, pagos e pendentes.</div>
    </div>`;
}

function _orcMes(d) {
  const [a, m] = (_ORC_MES || hojeISO().slice(0, 7)).split("-").map(Number);
  const n = new Date(a, m - 1 + d, 1);
  _ORC_MES = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  setView("orcamento");
}

async function _orcSalvar(el) {
  const novo = el.value === "" ? null : parseFloat(el.value);
  const orig = el.dataset.orig === "" ? null : parseFloat(el.dataset.orig);
  if (novo === orig) return;
  if (novo != null && !(novo >= 0)) return erroCampo("limite", "Limite: informe um valor maior ou igual a zero.");
  try {
    const r = await api(`/api/orcamento/${el.dataset.cat}`, { method: "PUT", body: JSON.stringify({ limite: novo }) });
    toast(r.limite == null ? `Limite de ${r.nome} removido` : `Limite de ${r.nome}: ${money(r.limite)} por mês`, "ok");
    setView("orcamento");
  } catch (e) { toast(e.message, "err"); el.value = el.dataset.orig; }
}

async function _orcSugerir() {
  try {
    const sg = await api(`/api/orcamento/sugestao?mes=${_ORC_MES || hojeISO().slice(0, 7)}`);
    const vazias = (_ORC?.itens || []).filter(i => i.limite == null && sg.sugestao[i.categoria_id] > 0);
    if (!vazias.length) return toast(Object.keys(sg.sugestao).length
      ? "Todas as categorias com gasto recente já têm limite." : "Ainda não há gastos nos últimos 3 meses para calcular a média.");
    const escolha = await confirmar({ tipo: "info", figura: "moedas", titulo: "Sugerir limites pela média",
      texto: "Média de gasto dos últimos 3 meses em cada categoria sem limite. Desmarque o que não quiser.",
      itens: vazias.map(i => ({ rot: i.nome, valor: money(sg.sugestao[i.categoria_id]) })),
      okItens: n => `Aplicar ${n} ${n === 1 ? "limite" : "limites"}`,
      detalhe: "Os limites que você já definiu não mudam." });
    if (!escolha || !escolha.length) return;
    const aplicar = escolha.map(k => vazias[k]);
    for (const i of aplicar)
      await api(`/api/orcamento/${i.categoria_id}`, { method: "PUT", body: JSON.stringify({ limite: sg.sugestao[i.categoria_id] }) });
    toast(`${aplicar.length} ${aplicar.length === 1 ? "limite definido" : "limites definidos"} pela média`, "ok");
    setView("orcamento");
  } catch (e) { toast(e.message, "err"); }
}

// depois de salvar uma despesa: avisa se a categoria chegou perto ou passou do limite
async function _avisoOrcamento(categoriaId, competencia) {
  if (!categoriaId) return;
  try {
    const o = await api(`/api/orcamento?mes=${(competencia || hojeISO()).slice(0, 7)}`);
    const i = o.itens.find(x => x.categoria_id === categoriaId);
    if (!i || i.limite == null) return;
    if (i.status === "estourado") toast(`${i.nome} passou do orçamento: ${money(i.gasto)} de ${money(i.limite)} (${Math.round(i.pct)}%)`, "warn");
    else if (i.status === "atencao") toast(`${i.nome} já usou ${Math.round(i.pct)}% do orçamento do mês`, "warn");
  } catch {}
}


/* ── Previsão de saldo ───────────────────────────────────────── */
let _PREV_DIAS = 90, _PREV = null, _PREV_TODOS = false;
function _curto(v) {
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toFixed(1).replace(".", ",")} mi`;
  if (a >= 1e3) return `${s}R$ ${Math.round(a / 1e3)} mil`;
  return `${s}R$ ${Math.round(a)}`;
}
const _dm = iso => iso.slice(8, 10) + "/" + iso.slice(5, 7);

function svgPrevisao(p, compacto = false) {
  const S = p.serie, n = S.length - 1;
  // no celular desenha mais estreito: o texto do gráfico fica legível em vez de encolher
  const cel = innerWidth < 640;
  const W = cel ? 420 : 800, H = compacto ? 110 : (cel ? 230 : 260), L = compacto ? 4 : 62, R = compacto ? 4 : 18, T = 14, B = compacto ? 6 : 30;
  const vals = S.flatMap(x => [x.lancado, x.estimado]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 100;
  lo -= pad; hi += pad;
  const x = i => L + i / n * (W - L - R), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const linha = k => S.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(s[k]).toFixed(1)}`).join(" ");
  const area = `${linha("estimado")} L${x(n).toFixed(1)} ${H - B} L${x(0).toFixed(1)} ${H - B} Z`;
  const iMin = S.reduce((m, s, i) => s.estimado < S[m].estimado ? i : m, 0);
  let g = `<defs><linearGradient id="pvg${compacto ? "c" : ""}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--teal)" stop-opacity=".22"/><stop offset="1" stop-color="var(--teal)" stop-opacity="0"/></linearGradient></defs>`;
  if (!compacto) {
    for (let t = 0; t <= 3; t++) {
      const v = lo + (hi - lo) * t / 3;
      g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>
            <text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="pv-eixo">${_curto(v)}</text>`;
    }
    const passo = n / 3;
    for (let t = 0; t <= 3; t++) {
      const i = Math.round(t * passo);
      g += `<text x="${x(i)}" y="${H - 8}" text-anchor="${t === 0 ? "start" : t === 3 ? "end" : "middle"}" class="pv-eixo">${i === 0 ? "Hoje" : _dm(S[i].data)}</text>`;
    }
  }
  if (lo < 0 && hi > 0) g += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--red)" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  g += `<path d="${area}" fill="url(#pvg${compacto ? "c" : ""})"/>
        <path d="${linha("lancado")}" fill="none" stroke="var(--navy)" stroke-width="${compacto ? 1.5 : 1.8}" stroke-dasharray="6 5" opacity=".55"/>
        <path d="${linha("estimado")}" fill="none" stroke="var(--teal)" stroke-width="${compacto ? 2.2 : 2.6}" stroke-linejoin="round"/>
        <circle cx="${x(iMin)}" cy="${y(S[iMin].estimado)}" r="${compacto ? 3.5 : 5}" fill="var(--card)" stroke="${S[iMin].estimado < 0 ? "var(--red)" : "var(--teal)"}" stroke-width="2.5"/>`;
  if (!compacto) {
    const ax = Math.min(Math.max(x(iMin), L + (cel ? 80 : 70)), W - R - (cel ? 80 : 70));
    const yMin = y(S[iMin].estimado);
    const yRot = yMin + 22 > H - B - 2 ? yMin - 12 : yMin + 22;   // perto do eixo: rótulo vai para cima
    g += `<text x="${ax}" y="${Math.max(yRot, T + 12)}" text-anchor="middle" class="pv-min">menor: ${money(S[iMin].estimado)} em ${_dm(S[iMin].data)}</text>`;
    const w = (W - L - R) / n;
    g += `<g class="pv-guia" style="display:none">
        <line class="pv-g-linha" x1="0" x2="0" y1="${T}" y2="${H - B}"/>
        <circle class="pv-g-lan" r="4"/><circle class="pv-g-est" r="5.5"/>
        <g class="pv-g-rot"><rect width="172" height="62" rx="10"/><text x="12" y="20" class="t1"></text><text x="12" y="38" class="t2"></text><text x="12" y="54" class="t3"></text></g>
      </g>
      <rect class="pv-toque" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"
            onpointermove="_pvMover(event,this)" onpointerdown="_pvMover(event,this)" onpointerleave="_pvSair(this)"/>`;
  }
  const geo = compacto ? "" : ` data-geo='${JSON.stringify({ L, R, T, B, W, H, lo, hi })}' data-serie='${JSON.stringify(S.map(s => [s.data, s.estimado, s.lancado]))}'`;
  return `<svg viewBox="0 0 ${W} ${H}" class="pv-svg${compacto ? " mini" : ""}"${geo} role="img" aria-label="Gráfico da previsão de saldo">${g}</svg>`;
}

function _prevChip(rot, v, destaque = false) {
  return `<div class="pv-chip${destaque ? " dest" : ""}"><span>${rot}</span><b class="mono-num ${v < 0 ? "neg" : ""}">${money(v)}</b></div>`;
}

function _prevEventos() {
  const p = _PREV, box = document.getElementById("pv-eventos"); if (!p || !box) return;
  const lista = _PREV_TODOS ? p.eventos : p.eventos.slice(0, 8);
  box.innerHTML = (lista.map(e => `
    <div class="pv-ev">
      <span class="pv-ev-data">${e.atrasado ? "Atrasado" : _dm(e.data)}</span>
      <span class="pv-ev-desc">${esc(e.descricao)}${e.origem === "parcela" ? ' <span class="pv-tag">cartão</span>' : ""}</span>
      <b class="mono-num ${e.valor < 0 ? "neg" : "pos"}">${e.valor < 0 ? "−" : "+"} ${money(Math.abs(e.valor))}</b>
    </div>`).join("") || `<div class="sub" style="padding:8px 0">Nenhuma conta lançada para este período.</div>`)
    + (p.eventos.length > 8 ? `<button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="_PREV_TODOS=!_PREV_TODOS;_prevEventos()">${_PREV_TODOS ? "Mostrar menos" : `Mostrar todos (${p.eventos.length})`}</button>` : "");
}

async function _carregarPrevisao(dias) {
  if (dias) _PREV_DIAS = dias;
  const box = document.getElementById("prev-slot"); if (!box) return;
  let p;
  try { p = _PREV = await api(`/api/relatorios/previsao?dias=${_PREV_DIAS}`); }
  catch (e) { box.innerHTML = `<div class="card card-pad"><div class="dica vermelho">${icon("alert")}<div>Previsão: ${esc(e.message)}</div></div></div>`; return; }
  if (!document.getElementById("prev-slot")) return;
  const neg = p.primeiro_negativo.lancado || p.primeiro_negativo.estimado;
  const negSoLancado = !!p.primeiro_negativo.lancado;
  box.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="card-h"><span class="card-ico i-green">${icon("trendUp")}</span>
        <div class="grow"><h3>Previsão de saldo</h3><div class="sub">Contas lançadas, parcelas do cartão e o que costuma entrar e sair</div></div>
        <div class="seg pv-seg">${[30, 60, 90].map(d => `<button class="${d === _PREV_DIAS ? "on" : ""}" onclick="_carregarPrevisao(${d})">${d} dias</button>`).join("")}</div>
      </div>
      <div class="pv-chips">
        ${_prevChip("Hoje", p.saldo_hoje)}
        ${Object.entries(p.marcos).map(([k, m]) => _prevChip(`Em ${k} dias`, m.estimado, Number(k) === _PREV_DIAS)).join("")}
        ${_prevChip(`Menor saldo (${_dm(p.minimo.estimado.data)})`, p.minimo.estimado.valor)}
      </div>
      ${neg ? `<div class="dica vermelho" style="margin:10px 0 0">${icon("alert")}<div><b>${negSoLancado ? "Só com o que já está lançado" : "Pela estimativa"}, o saldo fica negativo em ${_dm(neg)}.</b> Vale antecipar uma receita ou adiar um pagamento.</div></div>` : ""}
      ${Math.abs(p.atrasados) >= 0.01 ? `<div class="dica ouro" style="margin:10px 0 0">${icon("clock")}<div>Contas atrasadas entram como se fossem pagas hoje (efeito no saldo: ${p.atrasados > 0 ? "−" : "+"} ${money(Math.abs(p.atrasados))}).</div></div>` : ""}
      <div class="pv-grafico">${svgPrevisao(p)}</div>
      <div class="pv-legenda">
        <span><i class="pv-l est"></i>Com estimativa: soma o que costuma entrar (${money(p.media_mensal.receitas)}/mês) e sair (${money(p.media_mensal.despesas)}/mês) e ainda não foi lançado</span>
        <span><i class="pv-l lan"></i>Só o que já está lançado</span>
      </div>
      <h4 class="pv-h4">Próximos movimentos lançados</h4>
      <div id="pv-eventos"></div>
    </div>`;
  _PREV_TODOS = false; _prevEventos();
}


/* ── Comprovantes (foto ou PDF) ──────────────────────────────── */
let _ANX = { lid: null, fila: [], salvos: [] };
let _ANX_CONT = {};
const _ANX_MAX = 5 * 1024 * 1024;
const _kb = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";

function _anxBloco(dica) {
  return `<div class="campo full"><label>Comprovantes</label>
    <div class="anx-lista" id="anx-lista"></div>
    <input type="file" id="anx-input" accept="image/*,application/pdf" multiple hidden onchange="_anxEscolher(this)">
    <button type="button" class="btn btn-ghost btn-sm anx-add" onclick="document.getElementById('anx-input').click()">${icon("clip")}Anexar foto ou PDF</button>
    <div class="campo-dica">${dica}</div></div>`;
}

// foto grande vira JPEG de até 1600px: comprovante continua legível e o banco não incha
function _anxReduzir(file) {
  return new Promise((ok, falha) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1600, esc_ = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * esc_); c.height = Math.round(img.height * esc_);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? ok(b) : falha(new Error("não consegui ler a imagem")), "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error("formato de imagem não suportado; envie JPG ou PNG")); };
    img.src = url;
  });
}

const _paraBase64 = blob => new Promise((ok, falha) => {
  const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = () => falha(r.error); r.readAsDataURL(blob);
});

async function _anxEscolher(input) {
  const arquivos = [...input.files]; input.value = "";
  for (const f of arquivos) {
    const pdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (!pdf && !f.type.startsWith("image/")) { toast(`${f.name}: envie uma foto ou um PDF.`, "err"); continue; }
    let blob = f, nome = f.name || "comprovante";
    try {
      if (!pdf) { blob = await _anxReduzir(f); nome = nome.replace(/\.[^.]+$/, "") + ".jpg"; }
    } catch (e) { toast(`${f.name}: ${e.message}.`, "err"); continue; }
    if (blob.size > _ANX_MAX) { toast(`${f.name}: ${_kb(blob.size)}, o limite é 5 MB.`, "err"); continue; }
    _ANX.fila.push({ nome, blob, url: URL.createObjectURL(blob), pdf });
  }
  _anxRender();
  if (_ANX.lid && _ANX.fila.length) await _anxEnviarFila(_ANX.lid);   // lançamento já existe: envia na hora
}

async function _anxEnviarFila(lid) {
  let n = 0;
  while (_ANX.fila.length) {
    const f = _ANX.fila[0];
    try {
      const a = await api(`/api/lancamentos/${lid}/anexos`, { method: "POST", body: JSON.stringify({ nome: f.nome, dados: await _paraBase64(f.blob) }) });
      _ANX.salvos.push(a); n++;
    } catch (e) { toast(`${f.nome}: ${e.message}`, "err"); }
    URL.revokeObjectURL(f.url); _ANX.fila.shift();
  }
  _ANX_CONT[lid] = (_ANX_CONT[lid] || 0) + n;
  _anxRender();
  return n;
}

async function _anxCarregar(lid) {
  _ANX.lid = lid;
  try { _ANX.salvos = await api(`/api/lancamentos/${lid}/anexos`); } catch { _ANX.salvos = []; }
  _anxRender();
}

function _anxRender() {
  const box = document.getElementById("anx-lista"); if (!box) return;
  const item = (nome, tam, pdf, thumb, acoes, pend) => `
    <div class="anx-item${pend ? " pend" : ""}">
      <div class="anx-th">${pdf ? icon("doc") : (thumb ? `<img src="${thumb}" alt="">` : icon("doc"))}</div>
      <div class="anx-nome"><b>${esc(nome)}</b><span>${_kb(tam)}${pend ? " · aguardando envio" : ""}</span></div>
      ${acoes}
    </div>`;
  box.innerHTML =
    _ANX.salvos.map(a => item(a.nome, a.tamanho, a.mime === "application/pdf", null,
      `<button type="button" class="btn btn-ghost btn-sm" onclick="_anxVer(${a.id})" title="Ver">${icon("eye")}</button>
       <button type="button" class="btn btn-ghost btn-sm" onclick="_anxExcluir(${a.id})" title="Remover">${icon("trash")}</button>`, false)).join("")
    + _ANX.fila.map((f, i) => item(f.nome, f.blob.size, f.pdf, f.pdf ? null : f.url,
      `<button type="button" class="btn btn-ghost btn-sm" onclick="_anxTirar(${i})" title="Tirar">${icon("x")}</button>`, true)).join("");
  // miniaturas das imagens já salvas
  _ANX.salvos.filter(a => a.mime !== "application/pdf").forEach(async a => {
    try {
      const r = await fetch(_url(`/api/anexos/${a.id}`), { headers: { Authorization: `Bearer ${State.token}` } });
      if (!r.ok) return;
      const u = URL.createObjectURL(await r.blob());
      const th = [...box.querySelectorAll(".anx-item")][_ANX.salvos.indexOf(a)]?.querySelector(".anx-th");
      if (th) th.innerHTML = `<img src="${u}" alt="">`;
    } catch {}
  });
}

function _anxTirar(i) { const f = _ANX.fila.splice(i, 1)[0]; if (f) URL.revokeObjectURL(f.url); _anxRender(); }

async function _anxExcluir(aid) {
  const ax = _ANX.salvos.find(a => a.id === aid);
  if (!(await confirmar({ tipo: "perigo", figura: "lixeira", ok: "Remover",
    titulo: "Remover este comprovante?", texto: ax ? `"${ax.nome}" sai do lançamento.` : "" }))) return;
  try {
    await api(`/api/anexos/${aid}`, { method: "DELETE" });
    _ANX.salvos = _ANX.salvos.filter(a => a.id !== aid);
    if (_ANX.lid) _ANX_CONT[_ANX.lid] = Math.max(0, (_ANX_CONT[_ANX.lid] || 1) - 1);
    _anxRender(); toast("Comprovante removido", "ok");
  } catch (e) { toast(e.message, "err"); }
}

async function _anxVer(aid) {
  const a = _ANX.salvos.find(x => x.id === aid);
  const pdf = a && a.mime === "application/pdf";
  const janela = pdf ? window.open("", "_blank") : null;   // abre já no clique: o navegador não bloqueia
  try {
    const r = await fetch(_url(`/api/anexos/${aid}`), { headers: { Authorization: `Bearer ${State.token}` } });
    if (!r.ok) throw new Error("não consegui abrir o comprovante");
    const u = URL.createObjectURL(await r.blob());
    if (pdf) { if (janela) janela.location = u; else window.open(u, "_blank"); return; }
    const v = document.createElement("div");
    v.className = "anx-viewer"; v.title = "Toque para fechar";
    v.innerHTML = `<img src="${u}" alt="Comprovante"><button class="anx-fechar" aria-label="Fechar">${icon("x")}</button>`;
    v.onclick = () => { v.remove(); URL.revokeObjectURL(u); };
    document.body.appendChild(v);
  } catch (e) { if (janela) janela.close(); toast(e.message, "err"); }
}

async function _anxContagem() { try { _ANX_CONT = await api("/api/anexos/contagem"); } catch { _ANX_CONT = {}; } }


/* ── Importar extrato (OFX/CSV) ──────────────────────────────── */
let _IMP = null;

async function formImportar(contaId) {
  if (!State.contas?.length || !State.cats?.length) { try { await carregarRefs(); } catch {} }
  const contas = (State.contas || []).filter(c => c.ativo !== false);
  if (!contas.length) return toast("Cadastre uma conta antes de importar o extrato.", "err");
  abrirModal(`
    <div class="modal" style="max-width:500px">
      <div class="modal-h"><span class="card-ico i-navy">${icon("download")}</span><h3>Importar extrato do banco</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b"><div class="frm">
        <div class="campo full"><label>Conta do extrato</label>
          <select id="imp-conta">${contas.map(c => `<option value="${c.id}" ${c.id === contaId ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></div>
        <div class="campo full"><label>Arquivo (OFX ou CSV)</label>
          <input type="file" id="imp-arquivo" accept=".ofx,.csv,.txt,application/x-ofx,text/csv">
          <div class="campo-dica">No app ou site do banco: Extrato, Exportar, formato OFX (recomendado). CSV também funciona.</div></div>
        <div class="campo full"><label class="sw-card">
          <input type="checkbox" id="imp-inverter"><span class="sw-trilho"></span>
          <span class="sw-txt"><b>É fatura de cartão de crédito</b><small>Nas faturas as compras vêm com valor positivo. Ligue para virarem despesas.</small></span></label></div>
      </div>
      <div class="dica azul" style="margin-top:4px">${icon("shield")}<div>Nada é gravado agora: você revisa cada linha antes. Pagamentos de contas que já estão no sistema viram baixa, sem duplicar.</div></div>
      </div>
      <div class="modal-f"><button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" id="imp-ler" onclick="_impLer()">${icon("search")}Ler extrato</button></div>
    </div>`);
}

async function _impLer() {
  const arq = document.getElementById("imp-arquivo").files[0];
  const conta_id = Number(document.getElementById("imp-conta").value) || null;
  const inverter = document.getElementById("imp-inverter").checked;
  if (!arq) return erroCampo("arquivo", "Arquivo: escolha o extrato (OFX ou CSV).");
  if (arq.size > 2 * 1024 * 1024) return erroCampo("arquivo", "Arquivo: grande demais (limite de 2 MB). Exporte um período menor.");
  const bt = document.getElementById("imp-ler"); bt.disabled = true; bt.innerHTML = `${icon("refresh")}Lendo...`;
  try {
    const conteudo = await _paraBase64(arq);
    const p = await api("/api/importacao/previa", { method: "POST", body: JSON.stringify({ conta_id, nome: arq.name, conteudo, inverter }) });
    _IMP = { conta_id, previa: p };
    fecharModal(); _impRevisao();
  } catch (e) { toast(e.message, "err"); bt.disabled = false; bt.innerHTML = `${icon("search")}Ler extrato`; }
}

function _impRevisao() {
  const p = _IMP.previa, it = p.itens;
  const nNovo = it.filter(i => i.status === "novo" && !i.pendente).length;
  const nPend = it.filter(i => i.pendente).length;
  const nImp = it.filter(i => i.status === "importado").length;
  const nDup = it.filter(i => i.status === "duplicado").length;
  const optCat = (tipo, sel) => `<option value="">Sem categoria</option>` + (State.cats || []).filter(c => c.tipo === tipo)
    .map(c => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.nome)}</option>`).join("");
  const linha = i => {
    const trava = i.status === "importado";
    const marcado = i.status === "novo";
    const chip = i.status === "importado" ? `<span class="imp-chip cinza">já importado</span>`
      : i.status === "duplicado" ? `<span class="imp-chip amarelo" title="Já existe: ${esc(i.duplicado_de.descricao)}">possível duplicado</span>`
      : i.pendente ? `<span class="imp-chip verde">quita conta pendente</span>` : "";
    return `<div class="imp-linha${trava ? " trava" : ""}" data-idx="${i.idx}">
      <input type="checkbox" class="imp-ck" ${marcado ? "checked" : ""} ${trava ? "disabled" : ""} onchange="_impConta()" aria-label="Importar esta linha">
      <div class="imp-data">${_dm(i.data)}</div>
      <div class="imp-desc"><b>${esc(i.descricao)}</b>${chip}
        ${i.pendente ? `<select class="imp-acao"><option value="baixar">Dar baixa em: ${esc(i.pendente.descricao)} (venc. ${_dm(i.pendente.vencimento)})</option><option value="criar">Criar lançamento novo</option></select>` : ""}
        ${i.status === "duplicado" ? `<div class="imp-obs">Parece ser "${esc(i.duplicado_de.descricao)}", já lançado. Marque só se for outro gasto.</div>` : ""}</div>
      <select class="imp-cat" ${trava ? "disabled" : ""}>${optCat(i.tipo, i.categoria_id)}</select>
      <div class="imp-val mono-num ${i.tipo === "receita" ? "pos" : "neg"}">${i.tipo === "receita" ? "+" : "−"} ${money(i.valor)}</div>
    </div>`;
  };
  abrirModal(`
    <div class="modal imp-modal">
      <div class="modal-h"><span class="card-ico i-navy">${icon("download")}</span>
        <h3>Revisar extrato: ${esc(p.conta.nome)}</h3><button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b">
        <div class="imp-resumo">
          <span>${p.formato} · ${_dm(p.de)} a ${_dm(p.ate)}</span>
          <span class="pos">Entradas ${money(p.entradas)}</span><span class="neg">Saídas ${money(p.saidas)}</span>
        </div>
        <div class="imp-contagem">
          <b>${nNovo}</b> novos · <b>${nPend}</b> quitam contas pendentes${nDup ? ` · <b>${nDup}</b> possíveis duplicados (desmarcados)` : ""}${nImp ? ` · <b>${nImp}</b> já importados` : ""}
          <span class="grow"></span>
          <button class="btn btn-ghost btn-sm" onclick="_impMarcar(true)">Marcar todos</button>
          <button class="btn btn-ghost btn-sm" onclick="_impMarcar(false)">Nenhum</button>
        </div>
        <div class="imp-lista">${it.map(linha).join("")}</div>
      </div>
      <div class="modal-f"><button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" id="imp-ok" onclick="_impConfirmar()">${icon("check")}Importar</button></div>
    </div>`, "lg");
  // contas pendentes também vêm marcadas
  document.querySelectorAll(".imp-linha").forEach(el => { const i = it[+el.dataset.idx]; if (i.pendente) el.querySelector(".imp-ck").checked = true; });
  _impConta();
}

function _impMarcar(v) { document.querySelectorAll(".imp-ck:not(:disabled)").forEach(c => c.checked = v); _impConta(); }

function _impConta() {
  const n = document.querySelectorAll(".imp-ck:checked").length, b = document.getElementById("imp-ok");
  if (b) { b.disabled = !n; b.innerHTML = `${icon("check")}${n ? `Importar ${n} ${n === 1 ? "linha" : "linhas"}` : "Nada marcado"}`; }
}

async function _impConfirmar() {
  const it = _IMP.previa.itens;
  const itens = [...document.querySelectorAll(".imp-linha")].filter(el => el.querySelector(".imp-ck:checked")).map(el => {
    const i = it[+el.dataset.idx];
    const acao = i.pendente && el.querySelector(".imp-acao")?.value === "baixar" ? "baixar" : "criar";
    return { import_id: i.import_id, data: i.data, descricao: i.descricao, valor: i.valor, tipo: i.tipo, acao,
             pendente_id: acao === "baixar" ? i.pendente.id : null, categoria_id: Number(el.querySelector(".imp-cat").value) || null };
  });
  if (!itens.length) return;
  const b = document.getElementById("imp-ok"); b.disabled = true; b.innerHTML = `${icon("refresh")}Importando...`;
  try {
    const r = await api("/api/importacao/confirmar", { method: "POST", body: JSON.stringify({ conta_id: _IMP.conta_id, itens }) });
    fecharModal(); celebrar("Extrato importado!");
    const partes = [r.criados && `${r.criados} lançamento(s) criado(s)`, r.baixados && `${r.baixados} conta(s) baixada(s)`, r.pulados && `${r.pulados} já existia(m)`].filter(Boolean);
    toast(partes.join(", ") || "Nada a importar", "ok");
    setView(State.view || "contas"); atualizarBadge?.();
  } catch (e) { toast(e.message, "err"); b.disabled = false; _impConta(); }
}


/* ── Campo de data ───────────────────────────────────────────────
   Substitui o seletor nativo em todo o sistema, sozinho: o <input type="date">
   original continua lá (escondido) e guarda o valor em AAAA-MM-DD, então todo
   código que lê ou grava .value segue funcionando. */
const DP_MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const DP_DIA = ["dom.","seg.","ter.","qua.","qui.","sex.","sáb."];
const DP_DIA_LONGO = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
const _VAL = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
const _dpIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const _dpDeIso = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]); return d.getMonth() === +m[2] - 1 ? d : null; };
const _dpBr = d => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const _dpHoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const _dpSoma = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const _dpExtenso = d => `${d.getDate()} de ${DP_MESES[d.getMonth()]} de ${d.getFullYear()}`;
let _DP = null;

// "15/11", "15/11/26", "151126", "hoje", "amanhã", "ontem", "+7", "-3"
function _dpLer(txt) {
  const t = (txt || "").trim().toLowerCase();
  if (!t) return "";
  if (t === "hoje") return _dpHoje();
  if (/^amanh/.test(t)) return _dpSoma(_dpHoje(), 1);
  if (t === "ontem") return _dpSoma(_dpHoje(), -1);
  let m = /^([+-])\s*(\d{1,3})$/.exec(t);
  if (m) return _dpSoma(_dpHoje(), (m[1] === "-" ? -1 : 1) * +m[2]);
  m = /^(\d{1,2})[\/.\-]?(\d{1,2})(?:[\/.\-]?(\d{4}|\d{2}))?$/.exec(t.replace(/\s/g, ""));
  if (!m) return null;
  let a = m[3] ? +m[3] : _dpHoje().getFullYear(); if (a < 100) a += 2000;
  const d = new Date(a, +m[2] - 1, +m[1]);
  return d.getDate() === +m[1] && d.getMonth() === +m[2] - 1 ? d : null;
}

function _dpLimites(inp) { return { min: _dpDeIso(inp.min), max: _dpDeIso(inp.max) }; }
function _dpPermitido(inp, d) { const { min, max } = _dpLimites(inp); return !(min && d < min) && !(max && d > max); }

function _dpMostrar(inp) {
  const c = inp._dpCampo; if (!c) return;
  const d = _dpDeIso(_VAL.get.call(inp));
  c.value = d ? _dpBr(d) : "";
  inp._dpSemana.textContent = d ? DP_DIA[d.getDay()] : "";
  c.classList.remove("dp-invalido"); c.title = "";
}

function _dpDefinir(inp, d) {
  const novo = d ? _dpIso(d) : "";
  const mudou = _VAL.get.call(inp) !== novo;
  _VAL.set.call(inp, novo);
  _dpMostrar(inp);
  if (mudou) { inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); }
}

function _dpConfirmar(inp) {
  const c = inp._dpCampo, txt = c.value.trim();
  if (!txt) { if (_VAL.get.call(inp)) _dpDefinir(inp, null); return true; }
  const d = _dpLer(txt);
  if (!d) { _dpErro(inp, "Data inválida. Use dd/mm/aaaa, ex.: 05/10/2026."); return false; }
  if (!_dpPermitido(inp, d)) {
    const { min, max } = _dpLimites(inp);
    _dpErro(inp, max && d > max ? `Data: no máximo ${_dpBr(max)}.` : `Data: no mínimo ${_dpBr(min)}.`); return false;
  }
  _dpDefinir(inp, d); return true;
}

function _dpErro(inp, msg) {
  _VAL.set.call(inp, "");          // nunca deixa uma data antiga escondida valendo
  inp._dpCampo.classList.add("dp-invalido"); inp._dpCampo.title = msg; inp._dpSemana.textContent = "";
  toast(msg, "err");
}

function _dpMascara(e) {
  const c = e.target;
  if (!/^insert/.test(e.inputType || "") || /[a-zà-ú+\-]/i.test(c.value)) return;   // palavras e +7 não levam máscara
  const n = c.value.replace(/\D/g, "").slice(0, 8);
  c.value = n.length > 4 ? `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}` : n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
  const inp = c._dpOrig, d = n.length === 8 ? _dpLer(c.value) : null;
  if (d && _DP && _DP.inp === inp) { _DP.mes = new Date(d.getFullYear(), d.getMonth(), 1); _DP.foco = d; _DP.navegou = false; _dpDesenhar(); }
}

function _dpMelhorar(inp) {
  if (inp._dpCampo || inp.type !== "date") return;
  const wrap = document.createElement("div");
  wrap.className = "dp-wrap" + (inp.closest(".campo, .frm, .fld") ? "" : " dp-inline");
  inp.parentNode.insertBefore(wrap, inp);
  const c = document.createElement("input");
  c.type = "text"; c.className = "dp-campo"; c.autocomplete = "off"; c.placeholder = "dd/mm/aaaa"; c.inputMode = "numeric";
  c.spellcheck = false; c.disabled = inp.disabled; c._dpOrig = inp;
  const rot = inp.closest(".campo")?.querySelector("label")?.textContent?.trim();
  c.setAttribute("aria-label", rot ? `${rot} (dd/mm/aaaa)` : "Data (dd/mm/aaaa)");
  if (window.matchMedia?.("(pointer: coarse)").matches) c.readOnly = true;   // celular: calendário em vez do teclado
  const sem = document.createElement("span"); sem.className = "dp-semana";
  const bt = document.createElement("button"); bt.type = "button"; bt.className = "dp-bt"; bt.tabIndex = -1;
  bt.title = "Abrir calendário"; bt.innerHTML = icon("calendar");
  wrap.append(c, sem, bt, inp);                         // original por último: aviso de erro aparece embaixo
  inp.classList.add("dp-original"); inp.tabIndex = -1; inp.setAttribute("aria-hidden", "true");
  inp._dpCampo = c; inp._dpSemana = sem;
  Object.defineProperty(inp, "value", { configurable: true,
    get() { return _VAL.get.call(this); }, set(v) { _VAL.set.call(this, v); _dpMostrar(this); } });
  inp.focus = () => c.focus();
  _dpMostrar(inp);
  c.addEventListener("input", _dpMascara);
  c.addEventListener("blur", () => { if (!(_DP && _DP.inp === inp)) _dpConfirmar(inp); });
  c.addEventListener("click", () => _dpAbrir(inp));
  c.addEventListener("keydown", e => _dpTecla(e, inp));
  bt.addEventListener("click", e => { e.preventDefault(); _DP && _DP.inp === inp ? _dpFechar(true) : (c.focus(), _dpAbrir(inp)); });
}

function _dpTecla(e, inp) {
  const aberto = _DP && _DP.inp === inp;
  if (e.key === "Escape" && aberto) { e.preventDefault(); e.stopPropagation(); _dpFechar(); return; }
  if (e.key === "Enter") {
    e.preventDefault();
    // andou pelo calendário com as setas: vale o dia em destaque; senão, vale o que foi digitado
    if (aberto && _DP.modo === "dias" && _DP.navegou) { _dpEscolher(_DP.foco); return; }
    if (_dpConfirmar(inp)) _dpFechar(); return;
  }
  if (e.key === "Tab") { _dpFechar(); return; }
  if ((e.altKey && e.key === "ArrowDown") || e.key === "F4") { e.preventDefault(); _dpAbrir(inp); return; }
  const passo = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  if (aberto && _DP.modo === "dias" && passo) {
    e.preventDefault(); _DP.foco = _dpSoma(_DP.foco, passo); _DP.navegou = true;
    _DP.mes = new Date(_DP.foco.getFullYear(), _DP.foco.getMonth(), 1); _dpDesenhar(); return;
  }
  if (aberto && (e.key === "PageUp" || e.key === "PageDown")) { e.preventDefault(); _dpNavegar(e.key === "PageUp" ? -1 : 1); return; }
  if (!aberto && (e.key === "ArrowUp" || e.key === "ArrowDown")) {   // ↑↓ muda um dia
    e.preventDefault(); const base = _dpDeIso(_VAL.get.call(inp)) || _dpHoje();
    const d = _dpSoma(base, e.key === "ArrowUp" ? 1 : -1); if (_dpPermitido(inp, d)) _dpDefinir(inp, d);
  }
}

function _dpAbrir(inp) {
  if (inp._dpCampo.disabled) return;
  if (_DP && _DP.inp === inp) return;
  _dpFechar();
  const sel = _dpDeIso(_VAL.get.call(inp)), base = sel || _dpHoje();
  const folha = innerWidth < 640;
  const el = document.createElement("div");
  el.className = "dp-pop" + (folha ? " folha" : ""); el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Calendário");
  el.addEventListener("pointerdown", e => { if (e.target.closest("button")) e.preventDefault(); });   // não tira o foco do campo
  el.addEventListener("click", _dpClique);
  let fundo = null;
  if (folha) { fundo = document.createElement("div"); fundo.className = "dp-fundo"; fundo.onclick = () => _dpFechar(); document.body.appendChild(fundo); }
  document.body.appendChild(el);
  _DP = { inp, el, fundo, modo: "dias", mes: new Date(base.getFullYear(), base.getMonth(), 1), foco: base };
  _dpDesenhar(); _dpPosicionar();
  setTimeout(() => document.addEventListener("pointerdown", _dpFora, true));
  addEventListener("resize", _dpPosicionar); addEventListener("scroll", _dpPosicionar, true);
}

function _dpFechar(focar) {
  if (!_DP) return;
  const { inp, el, fundo } = _DP; _DP = null;
  el.remove(); fundo?.remove();
  document.removeEventListener("pointerdown", _dpFora, true);
  removeEventListener("resize", _dpPosicionar); removeEventListener("scroll", _dpPosicionar, true);
  if (focar) inp._dpCampo?.focus();
}

function _dpFora(e) {
  if (!_DP) return;
  if (_DP.el.contains(e.target) || e.target === _DP.inp._dpCampo || _DP.inp._dpCampo.parentNode.contains(e.target)) return;
  const inp = _DP.inp; _dpFechar(); _dpConfirmar(inp);
}

function _dpPosicionar() {
  if (!_DP) return;
  const { inp, el } = _DP;
  if (!document.body.contains(inp)) return _dpFechar();
  if (el.classList.contains("folha")) return;
  const r = inp._dpCampo.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  let top = r.bottom + 6;
  if (top + h > innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
  el.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
  el.style.top = Math.max(8, top) + "px";
}

function _dpNavegar(n) {
  if (_DP.modo === "meses") _DP.mes = new Date(_DP.mes.getFullYear() + n, _DP.mes.getMonth(), 1);
  else { _DP.mes = new Date(_DP.mes.getFullYear(), _DP.mes.getMonth() + n, 1);
         _DP.foco = new Date(_DP.mes.getFullYear(), _DP.mes.getMonth(), Math.min(_DP.foco.getDate(), 28)); }
  _dpDesenhar();
}

function _dpEscolher(d) {
  if (!_DP || !_dpPermitido(_DP.inp, d)) return;
  const inp = _DP.inp; _dpDefinir(inp, d); _dpFechar(innerWidth >= 640);
}

function _dpClique(e) {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  const a = b.dataset.a;
  if (b.dataset.iso) return _dpEscolher(_dpDeIso(b.dataset.iso));
  if (a === "ant") return _dpNavegar(-1);
  if (a === "prox") return _dpNavegar(1);
  if (a === "modo") { _DP.modo = _DP.modo === "dias" ? "meses" : "dias"; return _dpDesenhar(); }
  if (b.dataset.mes) { _DP.mes = new Date(_DP.mes.getFullYear(), +b.dataset.mes, 1); _DP.modo = "dias"; return _dpDesenhar(); }
  if (a === "limpar") { const inp = _DP.inp; _dpDefinir(inp, null); return _dpFechar(innerWidth >= 640); }
  if (a === "fechar") return _dpFechar();
  const h = _dpHoje();
  const atalho = { hoje: h, amanha: _dpSoma(h, 1), sete: _dpSoma(h, 7), fim: new Date(h.getFullYear(), h.getMonth() + 1, 0) }[a];
  if (atalho) _dpEscolher(atalho);
}

function _dpDesenhar() {
  const { inp, el, mes, foco, modo } = _DP;
  const sel = _dpDeIso(_VAL.get.call(inp)), hoje = _dpHoje();
  const titulo = modo === "dias" ? `${DP_MESES[mes.getMonth()]} de ${mes.getFullYear()}` : String(mes.getFullYear());
  let corpo;
  if (modo === "dias") {
    const ini = _dpSoma(mes, -mes.getDay());
    corpo = `<div class="dp-sem">${["D","S","T","Q","Q","S","S"].map(s => `<span>${s}</span>`).join("")}</div><div class="dp-grade">` +
      Array.from({ length: 42 }, (_, i) => {
        const d = _dpSoma(ini, i), iso = _dpIso(d);
        const cl = ["dp-d", (d.getDay() === 0 || d.getDay() === 6) && "fds", d.getMonth() !== mes.getMonth() && "fora", iso === _dpIso(hoje) && "hoje",
                    sel && iso === _dpIso(sel) && "sel", iso === _dpIso(foco) && "foco"].filter(Boolean).join(" ");
        return `<button type="button" class="${cl}" data-iso="${iso}" ${_dpPermitido(inp, d) ? "" : "disabled"} aria-label="${_dpExtenso(d)}">${d.getDate()}</button>`;
      }).join("") + `</div>`;
  } else {
    corpo = `<div class="dp-meses">${DP_MESES.map((m, i) => `<button type="button" data-mes="${i}" class="${sel && sel.getMonth() === i && sel.getFullYear() === mes.getFullYear() ? "sel" : ""}">${m.slice(0, 3)}</button>`).join("")}</div>`;
  }
  const h = hoje, ok = d => _dpPermitido(inp, d) ? "" : "disabled";
  const rotulo = inp._dpCampo.getAttribute("aria-label").replace(" (dd/mm/aaaa)", "");
  el.innerHTML = `
    <div class="dp-topo">
      <div class="dp-topo-rot">${esc(rotulo)}</div>
      <div class="dp-topo-data">${sel ? `${DP_DIA_LONGO[sel.getDay()]}, ${sel.getDate()} de ${DP_MESES[sel.getMonth()]}` : "Escolha uma data"}</div>
      <div class="dp-topo-ano">${sel ? sel.getFullYear() : "Toque em um dia ou digite no campo"}</div>
      ${el.classList.contains("folha") ? `<button type="button" class="dp-x" data-a="fechar" aria-label="Fechar">${icon("x")}</button>` : ""}
    </div>
    <div class="dp-corpo">
    <div class="dp-cab">
      <button type="button" class="dp-nav" data-a="ant" aria-label="${modo === "dias" ? "Mês anterior" : "Ano anterior"}">‹</button>
      <button type="button" class="dp-titulo" data-a="modo" title="${modo === "dias" ? "Escolher mês e ano" : "Voltar aos dias"}">${titulo.charAt(0).toUpperCase() + titulo.slice(1)}<span>▾</span></button>
      <button type="button" class="dp-nav" data-a="prox" aria-label="${modo === "dias" ? "Próximo mês" : "Próximo ano"}">›</button>
    </div>
    ${corpo}
    <div class="dp-atalhos">
      <button type="button" data-a="hoje" ${ok(h)}>Hoje</button>
      <button type="button" data-a="amanha" ${ok(_dpSoma(h, 1))}>Amanhã</button>
      <button type="button" data-a="sete" ${ok(_dpSoma(h, 7))}>+7 dias</button>
      <button type="button" data-a="fim" ${ok(new Date(h.getFullYear(), h.getMonth() + 1, 0))}>Fim do mês</button>
      ${inp.required ? "" : `<button type="button" data-a="limpar" class="dp-limpar">Limpar</button>`}
    </div>
    </div>`;
  _dpPosicionar();
}

function _dpVarrer(raiz) {
  if (raiz.matches?.('input[type="date"]')) _dpMelhorar(raiz);
  raiz.querySelectorAll?.('input[type="date"]').forEach(_dpMelhorar);
}
new MutationObserver(ms => {
  for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) _dpVarrer(n);
  if (_DP && !document.body.contains(_DP.inp)) _dpFechar();
}).observe(document.body, { childList: true, subtree: true });
_dpVarrer(document);
