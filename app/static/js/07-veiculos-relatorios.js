/* Tomelin Gestão Financeira · Veículos e relatórios.
   Arquivo 7 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

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
      ${veics.map(cardVeiculo).join("") || `<div class="empty">${ilus("car")}<p>Nenhum veículo cadastrado.</p></div>`}
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
        <div class="grow"><h3>${x.nome}</h3><div class="sub">${[x.marca, x.modelo, x.ano].filter(Boolean).join(" · ") || "-"}</div></div>
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
  if (!body.nome) return erroCampo("nome", "Nome do veículo: preenchimento obrigatório.");
  try {
    if (id) await api(`/api/veiculos/${id}`, { method: "PUT", body: JSON.stringify(body) });
    else await api("/api/veiculos", { method: "POST", body: JSON.stringify(body) });
    fecharModal(); toast("Veículo salvo", "ok"); setView("veiculos");
  } catch (e) { toast(e.message, "err"); }
}
async function excluirVeiculo(id) {
  if (!(await confirmar({ tipo: "perigo", figura: "lixeira", ok: "Excluir", titulo: "Excluir este veículo?",
    texto: "Os dados do veículo e do financiamento saem do patrimônio." }))) return;
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

  // linha de categoria clicável: filtra o extrato por categoria
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

  setTimeout(() => _carregarPrevisao(), 0);   // monta a previsão depois do HTML
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
      <div class="pdf-cards">
        <button class="pdf-card" style="--c1:#061E38;--c2:#2F817A" onclick="vibrar(10);abrirPDF('/api/relatorios/balancete.pdf?de=${PERIODO.de}&ate=${PERIODO.ate}')">
          <svg viewBox="0 0 44 54" class="pdf-doc" aria-hidden="true"><path d="M4 2h26l10 10v38a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#fff"/><path d="M30 2v10h10" fill="#E6ECF1"/><rect x="2" y="2" width="28" height="12" rx="2" fill="#2F817A"/><rect x="6" y="6" width="10" height="4" rx="1" fill="#fff" opacity=".9"/><rect class="pdf-b" x="8" y="34" width="5" height="12" rx="1" fill="#2F9E7E"/><rect class="pdf-b b2" x="16" y="28" width="5" height="18" rx="1" fill="#C9A94E"/><rect class="pdf-b b3" x="24" y="38" width="5" height="8" rx="1" fill="#C9573F"/><path d="M8 20h26M8 24h18" stroke="#C9D3DC" stroke-width="2" stroke-linecap="round"/></svg><span><b>Balancete</b><small>Receitas, despesas e gráficos do período</small></span>${icon("download")}</button>
        <button class="pdf-card" style="--c1:#7A5E16;--c2:#D4B25A" onclick="vibrar(10);abrirPDF('/api/relatorios/patrimonio.pdf')">
          <svg viewBox="0 0 44 54" class="pdf-doc" aria-hidden="true"><path d="M4 2h26l10 10v38a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#fff"/><path d="M30 2v10h10" fill="#E6ECF1"/><rect x="2" y="2" width="28" height="12" rx="2" fill="#C9A94E"/><rect x="6" y="6" width="10" height="4" rx="1" fill="#fff" opacity=".9"/><circle cx="21" cy="36" r="9" fill="none" stroke="#E6ECF1" stroke-width="5"/><circle class="pdf-anel" cx="21" cy="36" r="9" fill="none" stroke="#C9A94E" stroke-width="5" stroke-dasharray="40 57" transform="rotate(-90 21 36)"/><path d="M8 20h26" stroke="#C9D3DC" stroke-width="2" stroke-linecap="round"/></svg><span><b>Patrimônio</b><small>Contas, veículos e financiamentos</small></span>${icon("download")}</button>
        <button class="pdf-card" style="--c1:#14594C;--c2:#3EC28F" onclick="vibrar(10);abrirIR()">
          <svg viewBox="0 0 44 54" class="pdf-doc" aria-hidden="true"><path d="M4 2h26l10 10v38a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#fff"/><path d="M30 2v10h10" fill="#E6ECF1"/><rect x="2" y="2" width="28" height="12" rx="2" fill="#2F9E7E"/><text x="16" y="11" font-size="8" font-weight="800" fill="#fff" text-anchor="middle" font-family="Arial">IR</text><circle cx="21" cy="35" r="10" fill="#E8F7F0"/><path d="M15.5 35.5l3.6 3.6 7.4-8" fill="none" stroke="#2F9E7E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span><b>Imposto de Renda</b><small>Saúde, educação e outras despesas dedutíveis do ano</small></span>${icon("download")}</button>
        <button class="pdf-card" style="--c1:#3A4654;--c2:#7E8C9A" onclick="vibrar(10);abrirPDF('/api/relatorios/balancete.pdf?de=${PERIODO.de}&ate=${PERIODO.ate}&estilo=matricial')">
          <svg viewBox="0 0 44 54" class="pdf-doc" aria-hidden="true"><path d="M4 2h26l10 10v38a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#fff"/><path d="M30 2v10h10" fill="#E6ECF1"/><rect x="2" y="2" width="28" height="12" rx="2" fill="#5B6876"/><rect x="6" y="6" width="10" height="4" rx="1" fill="#fff" opacity=".9"/><path d="M8 20h26M8 25h22M8 30h26M8 35h16M8 40h26" stroke="#9AA7B4" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 2"/></svg><span><b>Cupom</b><small>Para impressora térmica (preto e branco)</small></span>${icon("download")}</button>
      </div>
    </div>

    <div class="card card-pad" id="comp-ano" style="margin-bottom:16px"><div class="sub">Carregando o comparativo do ano...</div></div>
    <div class="card card-pad" id="por-pessoa" style="margin-bottom:16px"><div class="sub">Carregando quem paga o quê...</div></div>

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
    <div id="prev-slot"></div>

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
          <h3>Projeção: próximos 6 meses</h3>
          <div class="sub">Saldo projetado: <b>${money(proj[proj.length - 1]?.saldo || 0)}</b></div>
        </div>
      </div>
      <div style="overflow-x:auto;margin-top:8px">${barChart(proj)}</div>
    </div>

    <!-- Patrimônio: cada linha clicável -->
    <div class="card card-pad" style="margin-bottom:14px">
      <div class="card-h" style="margin-bottom:16px">
        <span class="card-ico i-navy">${icon("shield")}</span>
        <div class="grow"><h3>Patrimônio detalhado</h3></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="pat-linha" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;
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

        <div class="pat-linha" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;
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
        <div class="pat-linha" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;
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

        <div class="pat-linha pat-total" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;
             background:linear-gradient(135deg,var(--navy),var(--navy-2));border-radius:14px;margin-top:4px;
             ${clicavel}" ${hoverEfect} onclick="abrirPDF('/api/relatorios/patrimonio.pdf')"
             title="Baixar PDF do patrimônio">
          <span style="font-size:14px;font-weight:700;color:#fff">Patrimônio líquido</span>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="mono-num" style="font-size:clamp(15px,4.6vw,20px);font-weight:800;color:#fff">${money(pat.patrimonio_liquido)}</span>
            <svg viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,.6)' stroke-width='2' width='16' height='16'>${P.download||""}</svg>
          </div>
        </div>
      </div>
    </div>`;
  setTimeout(_porPessoaCarregar, 0);
  setTimeout(() => _compCarregar(), 0);
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
    chaves: ["ALERTA_HORA","ALERTA_DIAS_ANTES","RESUMO_SEMANAL","FECHAMENTO_DIARIO","FECHAMENTO_HORA","ORCAMENTO_AVISO"],
  },
  {
    titulo: "FIPEConsulta", ic: "car", cor: "i-navy",
    desc: "Integração com sua API FIPEConsulta para atualização automática do valor dos veículos.",
    chaves: ["FIPE_ATIVO","FIPE_API_URL","FIPE_API_TOKEN","FIPE_ENDPOINT"],
  },
  {
    titulo: "Backup automático", ic: "shield", cor: "i-green",
    desc: "Cópia de todos os dados feita sozinha todo dia. Ligue o envio pelo WhatsApp para ter uma cópia fora do servidor.",
    chaves: ["BACKUP_AUTO","BACKUP_HORA","BACKUP_MANTER","BACKUP_WHATSAPP","BACKUP_COMPROVANTES"],
  },
  {
    titulo: "PDFs e recibos", ic: "doc", cor: "i-gold",
    desc: "Nome e dados da empresa que aparecem no cabeçalho e rodapé dos PDFs gerados.",
    chaves: ["EMPRESA_NOME","EMPRESA_DOC","EMPRESA_CIDADE","APP_URL"],
  },
];
const BOOL_CHAVES = new Set(["ORCAMENTO_AVISO","WHATSAPP_ATIVO","RECIBO_WHATSAPP_AUTO","RESUMO_SEMANAL","FECHAMENTO_DIARIO","FIPE_ATIVO","BACKUP_AUTO","BACKUP_WHATSAPP","BACKUP_COMPROVANTES"]);
const INT_CHAVES  = new Set(["ALERTA_HORA","ALERTA_DIAS_ANTES","FECHAMENTO_HORA","BACKUP_HORA","BACKUP_MANTER"]);
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
          value="${esc(val)}" placeholder="${c.chave}" autocomplete="off">
      </div>`;
  }

  setTimeout(() => { _exStatus(); _bandGrade(); _bkCarregar(); }, 0);
  v.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="card-h"><span class="card-ico i-green">${icon("download")}</span>
        <div class="grow"><h3>Backup completo</h3><div class="sub">Um arquivo com todos os dados da família. Guarde fora do servidor.</div></div></div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="bk-bt" onclick="baixarBackup()">${icon("download")}Baixar backup</button>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--ink-2);cursor:pointer"><input type="checkbox" id="bk-comp"> Incluir comprovantes (arquivo maior)</label>
      </div>
      <div class="campo-dica" style="margin-top:8px">Senhas não vão no arquivo. Só administradores podem baixar.</div>
      <div class="bk-auto" id="bk-auto"><div class="sub">Carregando backups automáticos...</div></div>
    </div>
    ${_bandCard()}
    <div class="card card-pad ex-card" id="ex-card" style="margin-bottom:16px">
      <div class="ex-topo">
        <svg viewBox="0 0 120 80" class="ex-fig" aria-hidden="true">
          <rect x="10" y="30" width="34" height="40" rx="6" fill="#2F817A" class="ex-cx c1"/><rect x="48" y="18" width="34" height="52" rx="6" fill="#C9A94E" class="ex-cx c2"/>
          <rect x="86" y="38" width="26" height="32" rx="6" fill="#C9573F" class="ex-cx c3"/>
          <path d="M18 42h18M18 50h12M56 30h18M56 38h12M92 48h14" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/>
          <circle cx="100" cy="16" r="8" fill="#F4D27A" stroke="#8C6D24" stroke-width="1.5" class="ex-moeda"/>
        </svg>
        <div class="grow"><h3>Dados de exemplo</h3>
          <div class="sub">Uma família de teste com 6 meses de histórico: salário, contas, cartões, parcelas, metas, veículos e orçamento. Teste tudo e depois apague.</div></div>
      </div>
      <div class="ex-status" id="ex-status">Verificando...</div>
      <div class="ex-bts">
        <button class="btn btn-primary" id="ex-carregar" onclick="exemplosCarregar()">${icon("plus")}Carregar exemplos</button>
        <button class="btn btn-ghost" id="ex-apagar" style="color:var(--red);display:none" onclick="exemplosApagar()">${icon("trash")}Apagar exemplos</button>
      </div>
      <div class="ex-perigo">
        <div><b>Começar de verdade</b><small>Apaga todos os lançamentos, contas, cartões, compras, metas, veículos e contatos (inclusive os exemplos antigos). Mantém usuários, categorias e configurações.</small></div>
        <div class="ex-bts">
          <button class="btn btn-ghost btn-sm" onclick="baixarBackup()">${icon("download")}Baixar backup antes</button>
          <button class="btn btn-sm ex-zerar" onclick="exemplosZerar()">${icon("alert")}Zerar o sistema</button>
        </div>
      </div>
    </div>
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
            ${g.titulo === "WhatsApp" ? btnWA("Testar", "testarWhatsappCfg(this)", 'style="padding:7px 12px;font-size:12.5px"') : ""}
          </div>
          <div class="cfg-campos">
            ${g.chaves.map(k => campo(map[k] || {chave:k,valor:"",descricao:k})).join("")}
          </div>
        </div>`).join("")}
    </div>
    <div class="card card-pad" style="margin-top:4px">
      <div class="meta"> As configurações são salvas no banco de dados e valem na hora, sem reiniciar o sistema. Se alguma chave não estiver salva aqui, o sistema usa o valor definido no servidor.</div>
    </div>
    <div class="card card-pad sobre-card">
      <span class="sobre-logo">${LOGO_MARK}</span>
      <div class="grow">
        <h3>Tomelin Gestão Financeira</h3>
        ${creditoDev("cd-sobre")}
        <div class="sub" id="sobre-versao">Versão ${esc(document.getElementById("sb-version")?.textContent || "")}</div>
      </div>
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

async function testarWhatsappCfg(btn) {
  return _waBotao(btn, async () => {
    await salvarConfiguracoes();   // salva primeiro, depois testa
    try {
      const r = await api("/api/configuracoes/whatsapp/testar");
      toast(r.enviado ? "Mensagem enviada no grupo!" : "Falha: verifique URL, token e grupo.", r.enviado ? "wa" : "err");
      return !!r.enviado;
    } catch (e) { toast(e.message, "err"); return false; }
  });
}
