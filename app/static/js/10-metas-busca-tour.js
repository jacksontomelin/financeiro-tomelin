/* Tomelin Gestão Financeira · Metas, busca e tour.
   Arquivo 10 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ============================================================
   METAS FINANCEIRAS: funções que precisam ser definidas
   ============================================================ */
// Ícones das metas: o banco guarda o nome, o desenho é SVG (sem emoji).
const META_ICONES = {
  alvo:     ["Objetivo",      "<circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='5'/><circle cx='12' cy='12' r='1.2'/>"],
  reserva:  ["Reserva",       "<path d='M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'/><path d='M9 12l2 2 4-4'/>"],
  investir: ["Investimento",  "<path d='M3 17l6-6 4 4 8-8'/><path d='M15 7h6v6'/>"],
  dinheiro: ["Dinheiro",      "<circle cx='8' cy='8' r='6'/><path d='M18.1 10.4A6 6 0 1 1 10.3 18'/><path d='M7 6h1v4'/>"],
  casa:     ["Casa",          "<path d='M3 11l9-8 9 8'/><path d='M5 10v10h14V10'/><path d='M10 20v-6h4v6'/>"],
  carro:    ["Carro",         "<path d='M4 16v-4l2-5h12l2 5v4'/><path d='M4 12h16'/><circle cx='7.5' cy='16.5' r='1.8'/><circle cx='16.5' cy='16.5' r='1.8'/>"],
  aviao:    ["Viagem",        "<path d='M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'/>"],
  praia:    ["Férias",        "<path d='M22 12a10 10 0 0 0-20 0z'/><path d='M12 12v7a2 2 0 0 0 4 0'/>"],
  estudo:   ["Estudos",       "<path d='M22 10L12 5 2 10l10 5 10-5z'/><path d='M6 12v5c3 2 9 2 12 0v-5'/>"],
  livro:    ["Livros",        "<path d='M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z'/><path d='M4 19V5'/><path d='M8 7h8'/>"],
  celular:  ["Celular",       "<rect x='7' y='2' width='10' height='20' rx='2'/><path d='M11 18h2'/>"],
  pc:       ["Computador",    "<rect x='3' y='4' width='18' height='12' rx='2'/><path d='M2 20h20'/>"],
  bebe:     ["Bebê",          "<circle cx='12' cy='13' r='7'/><path d='M9.5 12h.01M14.5 12h.01'/><path d='M10 16c1 .7 3 .7 4 0'/><path d='M12 6c0-2 2-3 3-2'/>"],
  saude:    ["Saúde",         "<path d='M3 12h4l2-5 4 10 2-5h6'/>"],
  academia: ["Academia",      "<path d='M6 5v14M18 5v14M3 8v8M21 8v8M6 12h12'/>"],
  musica:   ["Música",        "<path d='M9 18V5l12-2v13'/><circle cx='6' cy='18' r='3'/><circle cx='18' cy='16' r='3'/>"],
  anel:     ["Casamento",     "<circle cx='12' cy='15' r='6'/><path d='M9 4h6l-3 5z'/>"],
};
function metaIconeSVG(chave, tam = 24) {
  const a = META_ICONES[chave] || META_ICONES.alvo;
  return `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${a[1]}</svg>`;
}
const METAS_CORES  = ["#082D51","#2F817A","#C9A94E","#B4503E","#6B3FA0","#D9772E","#1E5FA8","#3B6D11","#C74B4B","#305C74"];
let _metaFormCor = "#082D51";
let _metaFormIcone = "alvo";
const _CACHE_METAS = {};

async function viewMetas(v) {
  const metas = await api("/api/metas");
  metas.forEach(m => _CACHE_METAS[m.id] = m);
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
        ${ilus("star")}<p>Nenhuma meta ainda.</p>
        <button class="btn btn-primary" style="margin-top:20px" onclick="formMeta(null)">${icon("plus")}Criar primeira meta</button>
      </div>` : `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr));gap:16px">
        ${[...ativas,...concluidas].map(m => _cardMeta(m)).join("")}
      </div>`}`;
}

function _cardMeta(m) {
  const pct = m.progresso_pct;
  const dias = m.prazo ? Math.ceil((new Date(m.prazo) - new Date()) / 86400000) : null;
  const prazoStr = m.prazo ? (dias < 0 ? `Prazo vencido há ${Math.abs(dias)}d` : dias === 0 ? "Prazo hoje!" : `${dias} dias restantes`) : "Sem prazo";
  const prazoClass = dias !== null && dias <= 30 && !m.concluida ? "color:var(--red)" : "color:var(--ink-2)";
  return `<div class="card card-pad${m.concluida ? " op-6" : ""}" style="position:relative;cursor:pointer;transition:all .15s" onclick="_editarMeta(${m.id})" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(8,45,81,.12)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
    ${m.concluida ? `<div style="position:absolute;top:10px;right:10px"><span class="tag pago">Concluída <span class="ic-inline">${icon("check")}</span></span></div>` : ""}
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <div class="meta-anel${m.concluida || pct >= 100 ? " cheio" : ""}" style="--cor:${m.cor};--c:169.6;--fim:${(169.6 * (1 - Math.min(100, pct) / 100)).toFixed(1)}">
        <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" class="ma-trilho"/><circle cx="32" cy="32" r="27" class="ma-prog"/></svg>
        <div class="ma-ic" style="color:${m.cor};background:${m.cor}18">${metaIconeSVG(m.icone, 22)}</div>
      </div>
      <div><div style="font-weight:700;color:var(--ink)">${esc(m.nome)}</div>
        ${m.descricao ? `<div class="sub">${esc(m.descricao)}</div>` : ""}</div>
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
      ${!m.concluida ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();formAporte(${m.id})">${icon("plus")}Aportar</button>` : ""}
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();_editarMeta(${m.id})">${icon("edit")}</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="event.stopPropagation();excluirMeta(${m.id})"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='15' height='15'><polyline points='3 6 5 6 21 6'/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
    </div>
  </div>`;
}

function formMeta(m) {
  _metaFormCor = m?.cor || "#082D51";
  _metaFormIcone = META_ICONES[m?.icone] ? m.icone : "alvo";
  if (m) _CACHE_METAS[m.id] = m;
  abrirModal(`
    <div class="modal" style="max-width:500px">
      <div class="modal-h"><span class="card-ico i-gold">${icon("star")}</span>
        <h3>${m ? "Editar meta" : "Nova meta financeira"}</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b"><div class="frm">
        <div class="campo full" style="text-align:center">
          <div id="meta-prev" class="meta-prev" style="background:${_metaFormCor}20;color:${_metaFormCor}">${metaIconeSVG(_metaFormIcone, 32)}</div>
          <div class="sub" id="meta-prev-nome">${META_ICONES[_metaFormIcone][0]}</div>
        </div>
        <div class="campo full"><label>Ícone <span class="av-nome" id="mt-ic-nome">${META_ICONES[_metaFormIcone][0]}</span></label>
          <div class="av-grid" id="mt-ic-grid">
            ${Object.entries(META_ICONES).map(([k, a]) => `<button type="button" class="av-opt${k === _metaFormIcone ? " sel" : ""}" data-mi="${k}" title="${a[0]}" aria-label="${a[0]}" onclick="_setMetaIcone('${k}')">${metaIconeSVG(k, 22)}</button>`).join("")}
          </div></div>
        <div class="campo full"><label>Cor</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:2px">
            ${METAS_CORES.map(c => `<div onclick="_setMetaCor('${c}')" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:3px solid ${c===_metaFormCor?'var(--navy)':'transparent'};outline:2px solid ${c===_metaFormCor?c:'transparent'}"></div>`).join("")}
          </div></div>
        <div class="campo full"><label>Nome da meta</label>
          <input id="mt-nome" value="${esc(m?.nome||'')}" placeholder="Ex.: Reserva de emergência, Viagem..."></div>
        <div class="campo full"><label>Descrição (opcional)</label>
          <input id="mt-desc" value="${esc(m?.descricao||'')}" placeholder="Detalhes adicionais"></div>
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
  _metaFormIcone = META_ICONES[ic] ? ic : "alvo";
  document.querySelectorAll("#mt-ic-grid .av-opt").forEach(el => el.classList.toggle("sel", el.dataset.mi === _metaFormIcone));
  const p = document.getElementById("meta-prev"); if (p) p.innerHTML = metaIconeSVG(_metaFormIcone, 32);
  const nome = META_ICONES[_metaFormIcone][0];
  ["mt-ic-nome", "meta-prev-nome"].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = nome; });
}

function _setMetaCor(cor) {
  _metaFormCor = cor;
  document.querySelectorAll("[onclick^='_setMetaCor']").forEach(el => {
    const bg = el.style.backgroundColor || el.style.background;
    el.style.border = `3px solid ${el.getAttribute("onclick")?.includes(cor) ? "var(--navy)" : "transparent"}`;
  });
  const p = document.getElementById("meta-prev"); if (p) { p.style.background = cor + "20"; p.style.color = cor; }
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
  if (!body.nome) return erroCampo("nome", "Nome da meta: preenchimento obrigatório.");
  if (!body.valor_alvo) return erroCampo("valor_alvo", "Valor da meta: informe um valor maior que zero.");
  try {
    if (id) await api(`/api/metas/${id}`, {method:"PUT", body:JSON.stringify(body)});
    else     await api("/api/metas",       {method:"POST",body:JSON.stringify(body)});
    fecharModal(); toast("Meta salva!", "ok"); setView("metas");
  } catch(e) { toast(e.message, "err"); }
}

function formAporte(id, nome) {
  nome = nome ?? _CACHE_METAS[id]?.nome ?? "";
  abrirModal(`
    <div class="modal" style="max-width:360px">
      <div class="modal-h"><span class="card-ico i-green">${icon("plus")}</span>
        <h3>Aportar na meta</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b">
        <p style="color:var(--ink-2);margin-bottom:16px">Quanto você guardou para <b>${esc(nome)}</b>?</p>
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
  if (!v || v <= 0) return erroCampo("valor", "Valor: informe um valor maior que zero.");
  try {
    const r = await api(`/api/metas/${id}/aporte`, {method:"POST", body:JSON.stringify({valor:v})});
    fecharModal();
    const alvo = Number(r?.valor_alvo || 0), atual = Number(r?.valor_atual || 0);
    if (alvo && atual >= alvo) { celebrar("Meta concluída!"); toast(`Parabéns! A meta ${r.nome || ""} foi alcançada.`, "ok"); }
    else toast("Aporte registrado!", "ok");
    setView("metas");
  } catch(e) { toast(e.message, "err"); }
}

async function excluirMeta(id) {
  const mx = _CACHE_METAS?.[id];
  if (!(await confirmar({ tipo: "perigo", figura: "lixeira", ok: "Excluir",
    titulo: mx ? `Excluir a meta "${mx.nome}"?` : "Excluir esta meta?",
    texto: mx ? `Ela tem ${money(Number(mx.valor_atual || 0))} guardados de ${money(Number(mx.valor_alvo || 0))}.` : "",
    detalhe: "A meta e o histórico de aportes somem. Não dá para desfazer." }))) return;
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
      box.innerHTML = `<div class="auto-vazio">${ilus("search", "var(--navy)", 56)}<div><b>Nenhum resultado</b><span>Tente outra palavra, um valor ou o nome do contato.</span></div></div>`;
      box.style.display = "block"; return;
    }
    box.innerHTML = res.map(r => {
      if (r.tipo === "lanc") {
        const l = r.l;
        return `<div class="busca-item" onclick="setView('lancamentos');fecharBusca()">
          <span style="font-size:16px">${l.tipo==="receita" ? `<svg viewBox='0 0 24 24' fill='none' stroke='#15803D' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' width='22' height='22' ><line x1='12' y1='5' x2='12' y2='19'/><polyline points="19 12 12 19 5 12"/></svg>` : `<svg viewBox='0 0 24 24' fill='none' stroke='#991B1B' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' width='22' height='22' ><line x1='12' y1='19' x2='12' y2='5'/><polyline points="5 12 12 5 19 12"/></svg>`}</span>
          <div style="flex:1;min-width:0"><div class="busca-nome">${esc(l.descricao)}</div>
            <div class="busca-sub">${l.data_vencimento?dataBR(l.data_vencimento):""} · ${l.categoria_nome||"-"}</div></div>
          <span class="mono-num" style="font-size:12px;font-weight:700">${money(l.valor)}</span>
        </div>`;
      }
      const c = r.c;
      return `<div class="busca-item" onclick="setView('contatos');fecharBusca()">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <div style="flex:1"><div class="busca-nome">${esc(c.nome)}</div>
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
         ${ilus("search")}<p style="margin-top:10px;font-size:14px">Digite para buscar lançamentos e contatos</p>
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
      res.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--ink-3)">${ilus("search")}<p style="margin-top:10px">Nenhum resultado para <b>${esc(q)}</b></p></div>`;
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
            <div style="font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.descricao)}</div>
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
            <div style="font-weight:600;color:var(--ink)">${esc(c.nome)}</div>
            <div style="font-size:12px;color:var(--ink-2)">${c.tipo || ""}${c.documento ? " · " + c.documento : ""}</div>
          </div>
        </div>`;
      }
    }
    res.innerHTML = html;
  } catch (e) { res.innerHTML = `<div style="padding:30px 16px;text-align:center;color:var(--red)">${ilusAlerta(64)}<p style="margin-top:8px">Erro na busca: ${esc(e.message)}</p></div>`; }
}


/* ============================================================
   TOUR INTERATIVO: guia completo do sistema
   ============================================================ */
const TOUR_PASSOS = [
  {
    titulo: "Bem-vindo ao Tomelin Gestão Financeira!",
    texto: "Este tour vai te mostrar todas as telas e funcionalidades. Toque em <b>Próximo</b> para navegar ou <b>Pular</b> para sair a qualquer momento.",
    acao: null,
    destaque: null,
  },
  {
    titulo: "Dashboard: Visão geral",
    texto: "A tela principal mostra seu <b>saldo consolidado</b>, receitas e despesas do mês, alertas de vencimento e atalhos rápidos.",
    acao: () => setView("dashboard"),
    destaque: null,
  },
  {
    titulo: "Hero card: Saldo",
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
    texto: "Toque no botão <b>Baixar</b> de qualquer lançamento para registrar o pagamento. Você define a data, conta e eventuais juros/multa.",
    acao: () => setView("pagar"),
    destaque: ".btn-green",
  },
  {
    titulo: "Contas a receber",
    texto: "Suas <b>receitas pendentes e recebidas</b>. Mesmo sistema das despesas: filtre, busque, confirme recebimento.",
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
    texto: "No desktop, use a <b>barra de busca</b> no topo. No celular, toque na <b>lupa</b> para abrir uma busca fullscreen de lançamentos e contatos.",
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
