/* Tomelin Gestão Financeira · WhatsApp: configuração, diagnóstico e envios.
   Arquivo 6 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ============================================================
   VIEW: WHATSAPP (estilo Sentinela)
   ============================================================ */
const WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

/* ── Tela do WhatsApp: no jeito do próprio WhatsApp ──────────────
   Cabeçalho verde com o desenho do app, três abas (Ao vivo, Configurar,
   Comandos) e o diagnóstico como conversa: o que chegou do grupo em balão
   branco e o que o sistema fez em balão verde. */
const _WZ = { aba: null, st: {}, timer: null };

function _wzFmtNum(n) {
  const d = String(n || "").replace(/\D/g, "");
  if (!d) return "";
  const loc = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (loc.length === 11) return `(${loc.slice(0, 2)}) ${loc.slice(2, 7)}-${loc.slice(7)}`;
  if (loc.length === 10) return `(${loc.slice(0, 2)}) ${loc.slice(2, 6)}-${loc.slice(6)}`;
  return d;
}

const _WZ_IC = {
  grupo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  pessoa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>`,
  chave: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2M17 6l3 3M14 9l2 2"/></svg>`,
  servidor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>`,
  ticks: `<svg viewBox="0 0 18 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6.5 4.5 10 11 2.5"/><path d="M7 9l1 1 6.5-7.5"/></svg>`,
  copiar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  foto: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="15" rx="2"/><circle cx="12" cy="12.5" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/></svg>`,
};

async function viewWhatsapp(v) {
  let st = {};
  try { st = await api("/api/whatsapp/status"); } catch { st = {}; }
  _WZ.st = st;
  const temGateway = !!(st.gateway && st.chave_configurada);
  const ok = st.conectado === true && st.ativo;
  if (!_WZ.aba) _WZ.aba = temGateway && st.grupo ? "vivo" : "config";

  const estado = !temGateway ? ["off", "Não configurado"]
    : st.erro_gateway ? ["erro", "Gateway com erro"]
    : !st.ativo ? ["off", "Envio desligado"]
    : st.conectado ? ["on", "Online"] : ["erro", "WhatsApp desconectado"];
  const grupoNome = st.grupo_nome || (st.grupo ? "Grupo do WhatsApp" : "");
  const meuNum = _wzFmtNum(st.meu_numero);

  const tile = (cls, ic, rot, val, sub) => `
    <div class="wz-tile ${cls}"><span class="wz-tile-ic">${ic}</span>
      <div class="wz-tile-tx"><small>${rot}</small><b>${val}</b>${sub ? `<em>${sub}</em>` : ""}</div></div>`;

  v.innerHTML = `
  <div class="wz">
    <header class="wz-top">
      <div class="wz-top-bolhas" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="wz-top-linha">
        <span class="wz-logo">${waDesenho(40)}</span>
        <div class="wz-top-tx">
          <h2>WhatsApp da família</h2>
          <div class="wz-estado wz-${estado[0]}"><i></i>${esc(estado[1])}${grupoNome ? ` · ${esc(grupoNome)}` : ""}</div>
        </div>
      </div>
      <div class="wz-top-acoes">
        ${btnWA("Testar", "testarWhatsapp(this)", `class="wz-bt-teste" ${st.ativo && st.grupo ? "" : "disabled"}`)}
        <button class="wz-bt-claro" onclick="_wzAba('vivo');rodarDiagnosticoWA()">${icon("refresh")}<span>Verificar</span></button>
      </div>
    </header>

    <div class="wz-tiles">
      ${tile(temGateway && !st.erro_gateway ? (st.conectado ? "ok" : "aviso") : "nao", _WZ_IC.servidor, "Gateway",
             !temGateway ? "Configurar" : st.erro_gateway ? "Com erro" : st.conectado ? "Conectado" : "Desconectado",
             st.numero ? esc(_wzFmtNum(st.numero)) : "")}
      ${tile(st.grupo ? "ok" : "nao", _WZ_IC.grupo, "Grupo", st.grupo ? esc(grupoNome) : "Escolher", "")}
      ${tile(meuNum ? "ok" : "neutro", _WZ_IC.pessoa, "Quem comanda", meuNum ? esc(meuNum) : "Qualquer um", meuNum ? "só este número" : "do grupo")}
    </div>

    <nav class="wz-abas" role="tablist">
      ${[["vivo", "Ao vivo"], ["config", "Configurar"], ["cmd", "Comandos"]].map(([k, t]) =>
        `<button role="tab" data-aba="${k}" class="${_WZ.aba === k ? "on" : ""}" onclick="_wzAba('${k}')">${t}</button>`).join("")}
    </nav>

    <section class="wz-painel" data-painel="vivo">
      <div class="wz-chat">
        <div class="wz-chat-cab">
          <span class="wz-av">${_WZ_IC.grupo}</span>
          <div class="grow"><b>${esc(grupoNome || "Grupo do WhatsApp")}</b><small id="wz-chat-sub">o que chegou e o que o sistema respondeu</small></div>
          <button class="wz-bt-icone" onclick="rodarDiagnosticoWA()" title="Atualizar" aria-label="Atualizar">${icon("refresh")}</button>
        </div>
        <div class="wz-chat-corpo" id="wa-diag"><div class="wz-dia">Carregando...</div></div>
      </div>
    </section>

    <section class="wz-painel" data-painel="config">
      <div class="wz-card">
        <div class="wz-card-cab"><span class="wz-passo ${temGateway && !st.erro_gateway ? "feito" : ""}">${temGateway && !st.erro_gateway ? IC_CHECK_W : 1}</span>
          <div><h3>Conectar ao gateway</h3><small>O servidor que liga o sistema ao seu WhatsApp</small></div></div>
        <label class="wz-campo"><span class="wz-campo-ic">${_WZ_IC.link}</span>
          <span class="wz-campo-tx"><small>Endereço do gateway</small>
          <input id="wa-url" value="${esc(st.gateway || "https://zap.unicontroller.com.br")}" placeholder="https://zap.unicontroller.com.br" autocomplete="off"></span></label>
        <label class="wz-campo"><span class="wz-campo-ic">${_WZ_IC.chave}</span>
          <span class="wz-campo-tx"><small>Chave de API ${st.chave_resumo ? `<em>atual: ${esc(st.chave_resumo)}</em>` : ""}</small>
          <input id="wa-chave" type="password" autocomplete="off" placeholder="${st.chave_configurada ? "Já salva. Deixe em branco para manter" : "Cole a chave gerada no painel do gateway"}"></span></label>
        <label class="wz-chave-liga"><input type="checkbox" id="wa-ativo" ${st.ativo ? "checked" : ""}><i></i><span>Enviar mensagens pelo WhatsApp</span></label>
        <button class="wz-bt-verde" onclick="salvarGatewayWA()">${icon("check")}Salvar e conectar</button>
      </div>

      <div class="wz-card">
        <div class="wz-card-cab"><span class="wz-passo ${st.grupo ? "feito" : ""}">${st.grupo ? IC_CHECK_W : 2}</span>
          <div><h3>Grupo da família</h3><small>Onde chegam os avisos e onde você manda os comandos</small></div></div>
        ${st.grupo ? `<div class="wz-grupo-atual"><span class="wz-av g">${_WZ_IC.grupo}</span>
            <div class="grow"><b>${esc(grupoNome)}</b><small>${esc(st.grupo)}</small></div>
            <span class="wz-ok">${IC_CHECK_W}</span></div>` : ""}
        <button class="wz-bt-verde ${temGateway ? "" : "off"}" ${temGateway ? "" : "disabled"} onclick="carregarGruposWA()">${_WZ_IC.grupo}${st.grupo ? "Trocar de grupo" : "Escolher o grupo"}</button>
        ${temGateway ? "" : `<p class="wz-dica">Conecte o gateway primeiro.</p>`}
        <div id="wa-grupos"></div>
      </div>

      <div class="wz-card">
        <div class="wz-card-cab"><span class="wz-passo ${meuNum ? "feito" : ""}">${meuNum ? IC_CHECK_W : 3}</span>
          <div><h3>Quem pode dar comandos</h3><small>Seu número: só você controla o sistema pelo grupo</small></div></div>
        <label class="wz-campo"><span class="wz-campo-ic br"><svg viewBox="0 0 30 20"><rect width="30" height="20" rx="3" fill="#009c3b"/><polygon points="15,2.5 27.5,10 15,17.5 2.5,10" fill="#ffdf00"/><circle cx="15" cy="10" r="4.2" fill="#002776"/></svg></span>
          <span class="wz-campo-tx"><small>WhatsApp com DDD</small>
          <input id="wa-meunumero" inputmode="tel" value="${esc(st.meu_numero || "")}" placeholder="5547999990000" autocomplete="off"
            oninput="this.value=this.value.replace(/[^0-9]/g,'');_previewNumeroWA(this.value)"></span></label>
        <p class="wz-dica" id="wa-num-preview">${meuNum ? `Só ${esc(meuNum)} controla o sistema pelo grupo.` : "Em branco: qualquer pessoa do grupo pode usar os comandos."}</p>
        <button class="wz-bt-verde" onclick="salvarNumeroWA()">${icon("check")}Salvar número</button>
      </div>

      <div class="wz-card">
        <div class="wz-card-cab"><span class="wz-passo">4</span>
          <div><h3>Webhook: resposta na hora</h3><small>Cadastre no painel do gateway → Webhooks</small></div></div>
        <div class="wz-copia"><code>${esc(location.origin)}/api/whatsapp/webhook</code>
          <button onclick="copiarTexto('${esc(location.origin)}/api/whatsapp/webhook')" aria-label="Copiar">${_WZ_IC.copiar}</button></div>
        <div class="wz-copia alt"><code>http://189.126.105.8:8788/api/whatsapp/webhook</code>
          <button onclick="copiarTexto('http://189.126.105.8:8788/api/whatsapp/webhook')" aria-label="Copiar">${_WZ_IC.copiar}</button></div>
        <p class="wz-dica">Use <b>um</b> dos dois (o primeiro é o endereço deste site; o segundo, o IP direto) com o evento <b>Mensagem recebida</b>. Cadastre só um para o Financeiro.</p>
      </div>
    </section>

    <section class="wz-painel" data-painel="cmd">
      ${_wzComandos("Consultas", "Mande no grupo e a resposta chega na hora", [
        ["saldo", "Saldo de todas as contas"], ["vencer", "Atrasadas e próximos 7 dias"], ["resumo", "Resultado do mês"],
        ["pagar", "Contas a pagar"], ["receber", "Contas a receber"], ["hoje", "O que vence e o que foi pago hoje"],
        ["semana", "Movimentos da semana"], ["gastos", "Onde o dinheiro foi"], ["projecao", "Saldo previsto"],
        ["proximo mes", "Contas do mês que vem"], ["parcelas", "Parcelas de cartão"], ["metas", "Metas e progresso"],
        ["patrimonio", "Contas + veículos"], ["carros", "Veículos e FIPE"], ["pessoas", "Quanto cada um pagou"], ["dica", "Dica com seus dados"]], "c1")}
      ${_wzComandos("Lançar e dar baixa", "O sistema registra e confirma no grupo", [
        ["despesa 150 mercado", "Lança uma despesa"], ["receita 3000 salario", "Lança uma receita"], ["baixa 42", "Marca o #42 como pago"],
        ["buscar aluguel", "Procura lançamentos"], ["ultimo", "Último lançamento"], ["aporte 500 reserva", "Guarda dinheiro na meta"],
        ["anexo 42", "Na legenda da foto: comprovante no #42"], ["nova conta Nubank", "Cria uma conta"], ["nf https://...", "Lê a nota fiscal"]], "c2")}
      ${_wzComandos("PDFs no grupo", "O arquivo chega como anexo na conversa", [
        ["recibo 42", "Recibo do #42"], ["recibo cupom 42", "Recibo estilo cupom"], ["balancete", "Balancete do mês"],
        ["balancete cupom", "Balancete estilo cupom"], ["patrimonio pdf", "Patrimônio em PDF"]], "c3")}
      <div class="wz-card wz-auto">
        <h3>Avisos automáticos</h3>
        ${[["Vencimentos do dia", `Todo dia às ${String(st.alerta_hora ?? 8).padStart(2, "0")}h, quando há algo para pagar`, true],
           ["Resumo da semana", "Toda segunda-feira", !!st.resumo_semanal],
           ["Fechamento do dia", `Às ${String(st.fechamento_hora ?? 20).padStart(2, "0")}h, com o que foi pago`, !!st.fechamento_diario],
           ["Recibo ao dar baixa", "Assim que uma conta é paga", true]].map(([t, d, on]) =>
          `<div class="wz-auto-it ${on ? "on" : ""}"><i></i><div><b>${t}</b><small>${on ? d : "Desligado em Configurações"}</small></div></div>`).join("")}
      </div>
    </section>
  </div>`;
  _wzAba(_WZ.aba, true);
  if (temGateway) rodarDiagnosticoWA();
  else document.getElementById("wa-diag").innerHTML = `<div class="wz-vazio">${waDesenho(48)}<b>Ainda não conectado</b><span>Abra a aba Configurar e siga os 4 passos.</span></div>`;
}

/* *negrito* _itálico_ ~riscado~ `código`, como o WhatsApp mostra */
function _wzFormata(t) {
  return esc(t)
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, "$1<i>$2</i>")
    .replace(/~([^~\n]+)~/g, "<s>$1</s>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

function _wzComandos(titulo, sub, itens, cor) {
  return `<div class="wz-card wz-cmds ${cor}"><h3>${titulo}</h3><small class="wz-sub">${sub}</small>
    <div class="wz-cmd-lista">${itens.map(([c, d]) =>
      `<button class="wz-cmd" onclick="_wzCopiarCmd('${esc(c).replace(/'/g, "&#39;")}')"><span class="wz-cmd-b">${esc(c)}<i>${_WZ_IC.ticks}</i></span><small>${esc(d)}</small></button>`).join("")}</div></div>`;
}

function _wzCopiarCmd(c) {
  (navigator.clipboard?.writeText(c) || Promise.reject()).then(() => toast(`"${c}" copiado: cole no grupo`, "wa")).catch(() => toast(c, "info"));
}

function _wzAba(k, sem) {
  _WZ.aba = k;
  document.querySelectorAll(".wz-abas button").forEach(b => b.classList.toggle("on", b.dataset.aba === k));
  document.querySelectorAll(".wz-painel").forEach(p => p.classList.toggle("on", p.dataset.painel === k));
  if (!sem) vibrar(6);
}

async function rodarDiagnosticoWA() {
  const box = document.getElementById("wa-diag");
  if (!box) return;
  const sub = document.getElementById("wz-chat-sub");
  if (sub) sub.textContent = "atualizando...";
  let d;
  try { d = await api("/api/whatsapp/debug"); }
  catch (e) { box.innerHTML = `<div class="wz-sis erro">${esc(e.message)}</div>`; if (sub) sub.textContent = "falhou"; return; }
  const cfg = d.config || {};
  const checks = [
    [cfg.ativo, "Envio ligado"],
    [!!cfg.url && cfg.chave_configurada, cfg.chave_resumo ? `Chave ${cfg.chave_resumo}` : "Chave de API"],
    [!!(cfg.grupo && cfg.grupo.includes("@g.us")), "Grupo configurado"],
    [!!cfg.meu_numero, cfg.meu_numero ? `Comandos de ${_wzFmtNum(cfg.meu_numero)}` : "Qualquer um comanda", true],
  ];
  // mensagens de outros grupos/canais não são desta conversa: viram só um resumo
  const todos = d.ultimos_eventos || [];
  const semTexto = e => /^\[[a-z_]*\] sem texto$/i.test(e.texto || "");
  const fora = e => semTexto(e) || /veio de outro chat|própria resposta do sistema|arquivo enviado pelo sistema/.test(e.resultado || "");
  const deFora = todos.filter(e => /veio de outro chat/.test(e.resultado || "")).length;
  const ecos = todos.filter(e => /própria resposta|enviado pelo sistema/.test(e.resultado || "")).length;
  const evs = todos.filter(e => !fora(e)).slice(0, 25).reverse();   // mais antigo em cima
  const corRes = r => /respondido|comprovante|PDF|anexado/i.test(r) ? "ok" : /FALH|erro/i.test(r) ? "erro" : "cinza";
  const bolha = (e) => {
    const res = e.resultado || "";
    const cls = corRes(res);
    // "respondido em 0,8 s · a mensagem levou 35 s ... [detalhe]" → título curto + detalhe pequeno
    const [principal, ...resto] = res.split(" · ");
    const det = resto.join(" · ").replace(/[\[\]]/g, "");
    return `<div class="wz-msg">
        <div class="wz-in"><span class="wz-in-tx">${_wzFormata(e.texto || "(sem texto)")}</span><time>${esc((e.hora || "").slice(-8, -3))}</time></div>
        <div class="wz-out ${cls}"><span><b>${esc(principal)}</b>${det ? `<small>${esc(det)}</small>` : ""}</span>${cls === "ok" ? `<i class="wz-tk">${_WZ_IC.ticks}</i>` : ""}</div>
      </div>`;
  };
  const midias = d.ultimas_midias || [];
  const pays = d.ultimos_payloads || [];
  box.innerHTML = `
    <div class="wz-checks">${checks.map(([ok, t, neutro]) => `<span class="wz-chk ${ok ? "ok" : neutro ? "neutro" : "nao"}">${ok ? IC_CHECK_W : "!"}${esc(t)}</span>`).join("")}</div>
    <div class="wz-dia">Hoje</div>
    ${deFora || ecos ? `<div class="wz-sis neutro">${[deFora ? `${deFora} de outros grupos` : "", ecos ? `${ecos} respostas do próprio sistema` : ""].filter(Boolean).join(" e ")} ignorada(s), como deve ser</div>` : ""}
    ${evs.length ? evs.map(bolha).join("") : `<div class="wz-vazio">${waDesenho(44)}<b>Nenhuma mensagem do grupo ainda</b><span>Mande <code>menu</code> no grupo e toque em atualizar.</span></div>`}
    ${midias.length ? `<div class="wz-dia">Comprovantes</div>${midias.map(m => `
      <div class="wz-msg"><div class="wz-in foto"><span class="wz-foto-ic">${_WZ_IC.foto}</span>
        <span class="wz-in-tx">${m.lancamento_id ? `Lançamento #${m.lancamento_id}` : "Foto/PDF"}<small>${esc(m.motivo || "")}</small></span><time>${esc((m.hora || "").slice(-8, -3))}</time></div>
        <div class="wz-out ${m.resultado === "anexado" ? "ok" : m.resultado === "falhou" ? "erro" : "cinza"}"><span>${m.resultado === "anexado" ? "Anexado" : m.resultado === "falhou" ? "Falhou" : "Ignorado"}</span></div>
        <details class="wz-tec"><summary>formato recebido</summary><pre>${esc(JSON.stringify(m.formato, null, 2))}</pre></details></div>`).join("")}` : ""}
    <details class="wz-tec grande"><summary>Dados técnicos do gateway (${pays.length} últimos)</summary>
      ${pays.length ? pays.map(p => `<div class="wz-pay"><div><time>${esc(p.hora || "")}</time><span class="wz-origem ${/Sentinela/.test(p.origem || "") ? "am" : ""}">${esc(p.origem || "recebido")}</span></div>
        <pre>${esc(JSON.stringify(p.payload, null, 2))}</pre></div>`).join("")
        : `<p class="wz-dica">Nada chegou do gateway desde que o sistema ligou. Confira o webhook na aba Configurar.</p>`}
    </details>`;
  box.scrollTop = box.scrollHeight;
  if (sub) sub.textContent = evs.length ? `${evs.length} mensagem(ns) recentes${d.ultimo_atraso ? ` · última levou ${d.ultimo_atraso} s` : ""}` : "o que chegou e o que o sistema respondeu";
}

async function salvarGatewayWA() {
  const dados = {
    WHATSAPP_API_URL: (document.getElementById("wa-url")?.value || "").trim(),
    WHATSAPP_ATIVO: document.getElementById("wa-ativo")?.checked ? "true" : "false",
    WHATSAPP_ENDPOINT_ENVIAR: "/api/v1/enviar",
  };
  const chave = (document.getElementById("wa-chave")?.value || "").trim();
  if (chave) dados.WHATSAPP_API_TOKEN = chave;
  try {
    await api("/api/configuracoes", { method: "POST", body: JSON.stringify(dados) });
    const st = await api("/api/whatsapp/status");
    if (st.erro_gateway) toast(st.erro_gateway, "err");
    else toast(st.conectado ? "Gateway conectado!" : "Salvo, mas o WhatsApp está desconectado no gateway", st.conectado ? "ok" : "err");
    setView("whatsapp");
  } catch (e) { toast(e.message, "err"); }
}

async function carregarGruposWA() {
  const box = document.getElementById("wa-grupos");
  if (!box) { toast("Abra a tela WhatsApp primeiro.", "err"); return; }
  box.innerHTML = `<div class="wz-carregando">${icon("refresh", "spin")} Buscando seus grupos...</div>`;
  const r = await api("/api/whatsapp/grupos");
  if (!r.ok || !r.grupos?.length) {
    box.innerHTML = `<div class="wz-sis erro">${esc(r.erro || "Nenhum grupo encontrado. Confira a conexão com o gateway.")}</div>`;
    return;
  }
  const cores = ["#128C7E", "#25D366", "#34B7F1", "#9E62AE", "#E65C6E", "#F47A3A", "#3B7DD8", "#C9A94E"];
  box.innerHTML = `
    <label class="wz-busca">${icon("search")}<input placeholder="Procurar grupo..." oninput="filtrarGruposWA(this.value)"></label>
    <div class="wz-grupos" id="wa-lista-grupos">${r.grupos.map((g, i) => `
      <button class="wa-grupo wz-grupo" data-nome="${esc((g.nome || "").toLowerCase())}" data-jid="${esc(g.jid)}" data-rotulo="${esc(g.nome || "")}"
        onclick="escolherGrupoWA(this.dataset.jid, this.dataset.rotulo)">
        <span class="wz-av" style="background:${cores[i % cores.length]}">${_WZ_IC.grupo}</span>
        <span class="grow"><b>${esc(g.nome || "(sem nome)")}</b><small>${esc(g.jid)}</small></span><i class="wz-seta">›</i>
      </button>`).join("")}</div>`;
}

function filtrarGruposWA(q) {
  q = (q || "").toLowerCase();
  document.querySelectorAll(".wa-grupo").forEach(el => el.style.display = el.dataset.nome.includes(q) ? "" : "none");
}

async function escolherGrupoWA(jid, nome) {
  try {
    await api("/api/whatsapp/grupo", { method: "POST", body: JSON.stringify({ jid, nome: nome || "" }) });
    toast(nome ? `Grupo "${nome}" escolhido` : "Grupo definido!", "ok");
    setView("whatsapp");
  } catch (e) { toast(e.message, "err"); }
}

function copiarTexto(t) {
  (navigator.clipboard?.writeText(t) || Promise.reject())
    .then(() => toast("URL copiada!", "ok"))
    .catch(async () => {
      if (await confirmar({ tipo: "info", figura: "copiar", titulo: "Copie o link", texto: "Não consegui copiar sozinho. O link já está selecionado abaixo.",
                            campo: t, ok: "Copiar", cancelar: "Fechar" })) {
        try { const i = document.createElement("input"); i.value = t; document.body.appendChild(i); i.select(); document.execCommand("copy"); i.remove(); toast("Link copiado", "ok"); } catch {}
      }
    });
}

function _previewNumeroWA(v) {
  const el = document.getElementById("wa-num-preview");
  if (!el) return;
  const d = String(v || "").replace(/\D/g, "");
  el.textContent = !d ? "Em branco: qualquer pessoa do grupo pode usar os comandos."
    : d.length >= 10 ? `Só ${_wzFmtNum(d)} vai controlar o sistema pelo grupo.` : "Continue digitando: DDD + número.";
}

async function salvarNumeroWA() {
  const n = (document.getElementById("wa-meunumero")?.value || "").replace(/\D/g, "").trim();
  try {
    await api("/api/configuracoes", { method: "POST", body: JSON.stringify({ WHATSAPP_MEU_NUMERO: n }) });
    toast(n ? `Número ${n} salvo` : "Filtro removido.", "ok");
    rodarDiagnosticoWA();
  } catch (e) { toast(e.message, "err"); }
}

async function testarWhatsapp(btn) {
  return _waBotao(btn, async () => {
    try {
      const r = await api("/api/whatsapp/teste", { method: "POST" });
      toast(r.enviado ? "Mensagem de teste enviada ao grupo" : "Gateway não confirmou o envio", r.enviado ? "wa" : "err");
      return !!r.enviado;
    } catch (e) { toast(e.message, "err"); return false; }
  });
}
