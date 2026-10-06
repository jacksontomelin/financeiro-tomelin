/* Tomelin Gestão Financeira · Tela inicial (painel).
   Arquivo 3 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ============================================================
   VIEW: DASHBOARD: layout premium
   ============================================================ */
async function viewDashboard(v) {
  const [k, fluxo, desp, venc, jur, pat, orc, prev] = await Promise.all([
    api("/api/dashboard/kpis"),
    api("/api/dashboard/fluxo?meses=6"),
    api("/api/dashboard/despesas-categoria"),
    api("/api/dashboard/vencimentos?dias=7"),
    api("/api/relatorios/juros"),
    api("/api/relatorios/patrimonio"),
    api("/api/orcamento").catch(() => null),
    api("/api/relatorios/previsao?dias=90").catch(() => null),
  ]);

  const hora = new Date().getHours();
  const saudacao = hora < 5 ? "Boa noite" : hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";   // igual ao ícone do período
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
        <div style="font-size:13.5px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.descricao)}</div>
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
      <button class="hero-zap" onclick="event.stopPropagation();waEnviar('resumo', this)" title="Mandar o resumo do mês no WhatsApp" aria-label="Mandar o resumo do mês no WhatsApp">
        <span class="wa-ic">${waDesenho()}</span><span class="hero-zap-rot">Resumo</span><span class="wa-ticks">${_WA_TICKS}</span></button>
      <!-- spark line decorativa -->
      <svg viewBox="0 0 60 30" preserveAspectRatio="none"
           class="hero-spark" style="position:absolute;right:0;bottom:0;width:55%;height:70%">
        <defs><linearGradient id="hsG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E2C46E" stop-opacity=".14"/><stop offset=".6" stop-color="#E2C46E" stop-opacity="0"/></linearGradient></defs>
        <polygon class="hs-area" points="${sparkPts} 60,30 0,30" fill="url(#hsG)"/>
        <polyline class="hs-linha" points="${sparkPts}" fill="none" stroke="#E2C46E" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      </svg>
      <!-- saudação -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div class="hero-per">${_iconePeriodo(hora)}</div>
        <div>
          <div style="font-size:14px;font-weight:800;color:#fff">${saudacao}, ${nome}!</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5)">Família Tomelin · ${new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}</div>
        </div>
      </div>
      <!-- saldo grande -->
      <div style="margin-bottom:4px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.45)">Saldo consolidado</div>
        <div class="hero-saldo" style="font-size:clamp(22px,3.5vw,32px);font-weight:900;color:#fff;font-family:monospace;letter-spacing:-.02em;line-height:1.1">${money(k.saldo)}</div>
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
          <div class="hero-mini" style="flex:1;min-width:0;padding:10px 10px;border-right:${i<2?"1px solid rgba(255,255,255,.08)":"none"};cursor:pointer;transition:background .15s"
               onclick="${nav}"
               onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background=''">
            <div style="font-size:9.5px;color:rgba(255,255,255,.4);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px">${lab} ›</div>
            <div class="hero-mini-val" style="color:${cor}">${val}</div>
          </div>`).join("")}
      </div>
    </div>

    <!-- ── ATALHOS RÁPIDOS ── -->
    <div class="atalhos">
      ${[
        ["arrowUp",   "Despesa",      "despesa",     "#A2412F", "#E07A5F"],
        ["arrowDown", "Receita",      "receita",     "#1F6F5C", "#3EC28F"],
        ["transfer",  "Transferir",   "transferir",  "#082D51", "#2F817A"],
        ["receipt",   "Nota fiscal",  "nfe",         "#B35C1E", "#F0A04B"],
        ["target",    "Orçamento",    "orcamento",   "#8A6D1E", "#E2C46E"],
        ["star",      "Metas",        "metas",       "#A0285F", "#E35D9A"],
        ["wallet",    "Cartões",      "compras",     "#4B2A86", "#8B6BD8"],
        ["repeat",    "Repetições",   "repeticoes",  "#1C6E8C", "#38A3C9"],
        ["download",  "Extrato",      "importar",    "#24507A", "#4F8BC9"],
        ["chart",     "Relatório",    "relatorios",  "#3F3D9E", "#7C7AE6"],
        ["whatsapp",  "WhatsApp",     "zap",         "#075E54", "#25D366"],
      ].map(([ic, lab, acao, c1, c2], i) => `
        <button class="atalho" data-acao="${acao}" onclick="vibrar(10);_atalhoClick(this)" style="--c1:${c1};--c2:${c2};--i:${i}">
          <span class="atalho-ic">${icon(ic)}</span><span class="atalho-rot">${lab}</span>
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
        <div style="font-size:12px;color:var(--red);opacity:.8">${money(atrasadas.reduce((s,l)=>s+l.valor,0))} em atraso. Toque para ver</div>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>
    </div>` : ""}

    <!-- ── CONTEÚDO INFERIOR (2 colunas no desktop) ── -->
    <div class="dash-grid">
    <div class="dash-col">
    ${_saudeCard(k, orc, prev, venc)}
    <!-- ── PRÓXIMOS VENCIMENTOS ── -->
    ${todasVenc.length ? `
    <div class="card card-pad" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <h3 style="font-size:15px;color:var(--navy)">Próximos vencimentos</h3>
        <button class="btn btn-ghost btn-sm" onclick="setView('vencimentos')">${icon("clock")} Ver todos</button>
      </div>
      ${todasVenc.slice(0,5).map(itemVenc).join("")}
    </div>` : ""}

    <!-- ── ORÇAMENTO DO MÊS ── -->
    ${orc ? (orc.limite_total ? `
    <div class="card card-pad" style="margin-bottom:16px">
      <div class="card-h"><span class="card-ico i-gold">${icon("target")}</span>
        <div class="grow"><h3>Orçamento do mês</h3><div class="sub">${money(orc.gasto_orcado)} de ${money(orc.limite_total)} · ${orc.disponivel < 0 ? "passou " + money(-orc.disponivel) : "disponível " + money(orc.disponivel)}</div></div>
        <button class="btn btn-ghost btn-sm" onclick="setView('orcamento')">Ver tudo</button></div>
      ${orc.itens.filter(i => i.limite != null).slice(0, 4).map(i => _orcLinha(i, true)).join("")}
    </div>` : `
    <div class="card card-pad orc-cta" style="margin-bottom:16px">
      <span class="card-ico i-gold">${icon("target")}</span>
      <div class="grow"><b>Defina quanto quer gastar por categoria</b><div class="sub">O sistema avisa quando chegar perto do limite.</div></div>
      <button class="btn btn-primary btn-sm" onclick="setView('orcamento')">Criar orçamento</button>
    </div>`) : ""}

    <!-- ── PATRIMÔNIO + JUROS ── -->
    <div class="grid-2 grid-2-igual" style="margin-bottom:16px">
      <div class="card card-pad" style="cursor:pointer;transition:all .15s" onclick="setView('relatorios')" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(8,45,81,.12)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span class="card-ico i-navy" style="width:34px;height:34px;border-radius:10px">${icon("shield")}</span>
          <div><div style="font-size:12.5px;font-weight:700;color:var(--ink-2)">Patrimônio líquido ›</div></div>
        </div>
        <div class="mono-num dash-kpi" style="font-size:22px;font-weight:900;color:var(--navy)">${money(pat.patrimonio_liquido)}</div>
        <div class="sub" style="margin-top:6px">Contas <b>${money(pat.total_contas)}</b> + Veículos <b>${money(pat.total_veiculos)}</b></div>
        ${pat.total_financiamentos > 0 ? `<div class="sub" style="color:var(--red)">Financiamentos: − ${money(pat.total_financiamentos)}</div>` : ""}
      </div>
      <div class="card card-pad" style="cursor:pointer;transition:all .15s" onclick="setView('relatorios')" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(8,45,81,.12)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span class="card-ico i-red" style="width:34px;height:34px;border-radius:10px">${icon("alert")}</span>
          <div><div style="font-size:12.5px;font-weight:700;color:var(--ink-2)">Juros pagos no ano ›</div></div>
        </div>
        <div class="mono-num dash-kpi" style="font-size:22px;font-weight:900;color:var(--red)">${money(jur.juros_pago_ano)}</div>
        <div class="sub" style="margin-top:6px">Este mês: <b>${money(jur.juros_mes)}</b></div>
        ${jur.juros_a_pagar > 0 ? `<div class="sub" style="color:var(--red)">A pagar: ${money(jur.juros_a_pagar)}</div>` : ""}
      </div>
    </div>
    </div>
    <div class="dash-col">
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

    ${prev ? `
    <div class="card card-pad pv-card" onclick="setView('relatorios')" title="Ver a previsão completa em Relatórios">
      <div class="card-h"><span class="card-ico i-green">${icon("trendUp")}</span>
        <div class="grow"><h3>Saldo previsto</h3><div class="sub">Próximos 90 dias, com estimativa</div></div>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();setView('relatorios')">Detalhes</button></div>
      <div class="pv-mini">${svgPrevisao(prev, true)}</div>
      <div class="pv-chips mini">${Object.entries(prev.marcos).map(([d, m]) => _prevChip(`Em ${d} dias`, m.estimado)).join("")}</div>
      ${(prev.primeiro_negativo.lancado || prev.primeiro_negativo.estimado)
        ? `<div class="pv-alerta">${icon("alert")}Saldo fica negativo em ${_dm(prev.primeiro_negativo.lancado || prev.primeiro_negativo.estimado)}</div>`
        : `<div class="sub">Menor saldo: <b>${money(prev.minimo.estimado.valor)}</b> em ${_dm(prev.minimo.estimado.data)}</div>`}
    </div>` : ""}
    </div>
    </div>`;

  // abertura ao entrar: resumo em histórias (uma vez por sessão; dá para ocultar no dia)
  if (!sessionStorage.getItem("tom_popup") && _bvPodeMostrar()) {
    sessionStorage.setItem("tom_popup", "1");
    setTimeout(() => boasVindas({ k, venc, orc, prev, nome, saudacao, hora }), 450);
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
      <div class="d"><div class="n">${esc(l.descricao)}</div><div class="w">${rec ? "A receber" : "A pagar"} · ${dataBRcurto(l.vencimento)} (${quando})</div></div>
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
