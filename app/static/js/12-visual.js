/* Tomelin Gestão Financeira · Detalhes visuais: valores, gráficos, cartões desenhados, repetições, backup, comparativo.
   Arquivo 12 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ── Valores em reais: "R$" e centavos menores, número em destaque ──
   Aplicado sozinho a todo valor que aparece na tela (o texto continua igual). */
const _MOEDA_SEL = '.mono-num, .kpi .val, .hero-saldo, .hero-mini-val, .dash-kpi, .pv-chip b, .tr-val, .imp-val, [style*="font-family:monospace"]';
function _moedaPartes(txt) {
  const m = /^(\s*[+−-]?\s*)R\$[\s\u00a0]?([\d.]+),(\d{2})\s*$/.exec(txt || "");
  return m ? { sinal: m[1], inteiro: m[2], cent: m[3] } : null;
}
const _moedaHTML = p => `${p.sinal.trim() ? `<span class="sn">${p.sinal}</span>` : ""}<span class="rs">R$\u00a0</span>${p.inteiro}<span class="cent">,${p.cent}</span>`;
const _soNossos = el => ![...el.children].some(c => !c.matches(".rs, .cent, .sn"));
function _moedas(raiz) {
  if (!raiz || raiz.nodeType !== 1) return;
  const els = raiz.matches(_MOEDA_SEL) ? [raiz] : [];
  els.push(...raiz.querySelectorAll(_MOEDA_SEL));
  for (const el of els) {
    if (el.dataset.rs || !_soNossos(el)) continue;
    const p = _moedaPartes(el.textContent);
    if (!p) continue;
    el.dataset.rs = "1"; el.innerHTML = _moedaHTML(p);
  }
}
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && !n.matches(".rs, .cent, .sn")) _moedas(n); })
  .observe(document.body, { childList: true, subtree: true });
_moedas(document.body);


/* ── Gráfico de rosca: tocar/passar numa fatia mostra a categoria no centro ── */
function _donutFoco(el) {
  const svg = el.closest(".dn-wrap")?.querySelector("svg"); if (!svg) return;
  const i = el.dataset.i, seg = svg.querySelector(`.dn-seg[data-i="${i}"]`); if (!seg) return;
  svg.classList.add("foco"); svg.querySelectorAll(".dn-seg").forEach(s => s.classList.toggle("on", s === seg));
  el.closest(".dn-wrap").querySelectorAll(".dn-leg").forEach(l => l.classList.toggle("on", l.dataset.i === i));
  svg.querySelector(".dn-rot").textContent = `${seg.dataset.nome} · ${seg.dataset.pct}%`;
  svg.querySelector(".dn-val").textContent = seg.dataset.valor;
}
function _donutSai(el) {
  const w = el.closest(".dn-wrap"); if (!w) return;
  const svg = w.querySelector("svg"); svg.classList.remove("foco");
  w.querySelectorAll(".on").forEach(x => x.classList.remove("on"));
  svg.querySelector(".dn-rot").textContent = "Total mês"; svg.querySelector(".dn-val").textContent = svg.dataset.total;
}
function _donutAbrir(id) {
  if (!id) return;
  window._filtroInicial = { cat: id }; window._tipoFixo = ""; setView("lancamentos");
}

/* ── Ícone do período do dia ao lado da saudação ── */
function _iconePeriodo(hora) {
  if (hora >= 5 && hora < 12) return `<svg viewBox="0 0 32 32" class="per per-manha" aria-hidden="true">
    <g class="per-raios" stroke="#F4D27A" stroke-width="2" stroke-linecap="round">
      ${[0,45,90,135,180,225,270,315].map(a => `<line x1="16" y1="3.5" x2="16" y2="6.5" transform="rotate(${a} 16 16)"/>`).join("")}</g>
    <circle cx="16" cy="16" r="6.5" fill="url(#perSol)"/>
    <defs><radialGradient id="perSol"><stop offset="0" stop-color="#FFE9A8"/><stop offset="1" stop-color="#E2B84E"/></radialGradient></defs></svg>`;
  if (hora >= 12 && hora < 18) return `<svg viewBox="0 0 32 32" class="per per-tarde" aria-hidden="true">
    <defs><radialGradient id="perSol2"><stop offset="0" stop-color="#FFE3A0"/><stop offset="1" stop-color="#E09A4E"/></radialGradient></defs>
    <g class="per-raios" stroke="#F2C27A" stroke-width="2" stroke-linecap="round">
      ${[0,60,120,180,240,300].map(a => `<line x1="12" y1="2.5" x2="12" y2="5" transform="rotate(${a} 12 12)"/>`).join("")}</g>
    <circle cx="12" cy="12" r="5.5" fill="url(#perSol2)"/>
    <path class="per-nuvem" d="M10 25h13a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.4 1.6A3.8 3.8 0 0 0 10 25z" fill="#fff" fill-opacity=".92"/></svg>`;
  return `<svg viewBox="0 0 32 32" class="per per-noite" aria-hidden="true">
    <path d="M21 22.5A9 9 0 0 1 13.2 7a9.5 9.5 0 1 0 11.6 13.4A9 9 0 0 1 21 22.5z" fill="#E9EEF7"/>
    <circle class="per-estrela e1" cx="24" cy="7" r="1.3" fill="#F4D27A"/>
    <circle class="per-estrela e2" cx="28" cy="13" r="1" fill="#fff"/>
    <circle class="per-estrela e3" cx="19" cy="4" r=".8" fill="#fff"/></svg>`;
}

/* ── Comemoração: check desenhado e confetes nas cores da marca ── */
function celebrar(texto) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const cores = ["#2F817A", "#C9A94E", "#082D51", "#E07A5F", "#3EA88A", "#E2C46E", "#305C74"];
  let conf = "";
  for (let i = 0; i < 38; i++) {
    const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 150;
    conf += `<i style="--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d - 50).toFixed(0)}px;--r:${(Math.random() * 900 - 450).toFixed(0)}deg;background:${cores[i % cores.length]};animation-delay:${(Math.random() * 90).toFixed(0)}ms;${i % 3 === 0 ? "border-radius:50%;width:9px;height:9px;" : ""}"></i>`;
  }
  vibrar([20, 40, 30]);
  const box = document.createElement("div");
  box.className = "festa";
  box.innerHTML = `${conf}<div class="festa-centro"><svg viewBox="0 0 52 52" aria-hidden="true"><circle class="fc-fundo" cx="26" cy="26" r="23"/><circle class="fc-circ" cx="26" cy="26" r="23"/><path class="fc-check" d="M15.5 27l7 7 14.5-15"/></svg>${texto ? `<b>${esc(texto)}</b>` : ""}</div>`;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1800);
}


/* ── Saúde financeira: medidor com 4 fatores, cada um vale 25 pontos ── */
function _saudeFatores(k, orc, prev, venc) {
  const res = (k.receitas_mes || 0) - (k.despesas_mes || 0);
  const atras = (venc?.atrasados || []).filter(l => l.tipo === "despesa").length;
  const negData = prev?.primeiro_negativo?.lancado || prev?.primeiro_negativo?.estimado;
  const minimo = prev?.minimo?.estimado?.valor;
  return [
    { nome: "Resultado do mês", ir: "relatorios", ic: "trendUp",
      pts: res >= 0 ? 25 : Math.max(0, Math.round(25 + res / Math.max(1, k.receitas_mes || 1) * 50)),
      txt: res >= 0 ? `Sobrou ${money0(res)}` : `Faltou ${money0(-res)}` },
    { nome: "Contas em dia", ir: "vencimentos", ic: "clock",
      pts: atras ? Math.max(0, 25 - atras * 7) : 25, txt: atras ? `${atras} conta(s) vencida(s)` : "Nenhuma vencida" },
    { nome: "Orçamento", ir: "orcamento", ic: "target",
      pts: !orc?.limite_total ? 15 : orc.estourados ? Math.max(0, 25 - orc.estourados * 8) : 25,
      txt: !orc?.limite_total ? "Defina limites" : orc.estourados ? `${orc.estourados} estourado(s)` : "Dentro do limite" },
    { nome: "Próximos 90 dias", ir: "relatorios", ic: "chart",
      pts: !prev ? 15 : negData ? 0 : (minimo < (k.despesas_mes || 0) * 0.5 ? 15 : 25),
      txt: !prev ? "Sem previsão" : negData ? `Negativo em ${_dm(negData)}` : `Menor saldo ${money0(minimo)}` },
  ];
}

function _saudeCard(k, orc, prev, venc) {
  const F = _saudeFatores(k, orc, prev, venc);
  _MC_DICAS = _mascoteDicas(k, orc, prev, venc); _MC_I = 0;
  const nota = F.reduce((s, f) => s + f.pts, 0);
  const faixa = nota >= 85 ? ["Excelente", "#2F9E7E"] : nota >= 65 ? ["Boa", "#2F817A"] : nota >= 40 ? ["Atenção", "#C9A94E"] : ["Crítica", "#B4503E"];
  const corF = p => p >= 20 ? "url(#sdVerde)" : p >= 10 ? "url(#sdOuro)" : "url(#sdVerm)";
  const cx = 110, cy = 112, R = 88;
  const pt = a => [cx + R * Math.cos(a * Math.PI / 180), cy + R * Math.sin(a * Math.PI / 180)];
  const arcos = F.map((f, i) => {
    const a0 = 180 + i * 45 + 2, a1 = 180 + (i + 1) * 45 - 2, [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    const d = `M${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    return `<path class="sd-trilho" d="${d}"/>
      <path class="sd-arco" data-i="${i}" d="${d}" pathLength="100" stroke="${corF(f.pts)}" style="--fim:${100 - f.pts * 4};--i:${i}"
            onmouseenter="_saudeFoco(${i})" onclick="setView('${f.ir}')"><title>${f.nome}: ${f.pts} de 25</title></path>`;
  }).join("");
  const marcas = [0, 25, 50, 75, 100].map(v => { const a = 180 + v * 1.8, [x0, y0] = [cx + 70 * Math.cos(a * Math.PI / 180), cy + 70 * Math.sin(a * Math.PI / 180)];
    return `<circle cx="${x0.toFixed(1)}" cy="${y0.toFixed(1)}" r="1.6" class="sd-marca"/>`; }).join("");
  return `
    <div class="card card-pad sd-card" style="margin-bottom:16px" onmouseleave="_saudeSai()">
      <div class="card-h"><span class="card-ico i-green">${icon("heart")}</span>
        <div class="grow"><h3>Saúde financeira</h3><div class="sub">Toque num fator para ver os detalhes</div></div>
        <button type="button" class="mascote" onclick="_mascoteToque(this)" title="Toque para uma dica" aria-label="Mascote: toque para uma dica">
          ${_mascoteSVG(nota)}<span class="mc-fala" role="status"></span></button></div>
      <div class="sd-corpo">
        <svg class="sd" viewBox="0 0 220 128" role="img" aria-label="Saúde financeira: ${nota} de 100, ${faixa[0]}">
          <defs>
            <linearGradient id="sdVerde" x1="0" x2="1"><stop offset="0" stop-color="#2F817A"/><stop offset="1" stop-color="#3EC28F"/></linearGradient>
            <linearGradient id="sdOuro" x1="0" x2="1"><stop offset="0" stop-color="#C9A94E"/><stop offset="1" stop-color="#E9C863"/></linearGradient>
            <linearGradient id="sdVerm" x1="0" x2="1"><stop offset="0" stop-color="#B4503E"/><stop offset="1" stop-color="#E07A5F"/></linearGradient>
            <radialGradient id="sdBrilho"><stop offset="0" stop-color="${faixa[1]}" stop-opacity=".22"/><stop offset="1" stop-color="${faixa[1]}" stop-opacity="0"/></radialGradient>
          </defs>
          <circle cx="${cx}" cy="${cy}" r="60" fill="url(#sdBrilho)" class="sd-pulso"/>
          ${arcos}${marcas}
          <g class="sd-ponteiro" style="--ang:${(nota * 1.8).toFixed(1)}deg">
            <path d="M${cx} ${cy - 4} L${cx - 66} ${cy} L${cx} ${cy + 4} Z" fill="var(--ink)"/>
          </g>
          <circle cx="${cx}" cy="${cy}" r="9" fill="var(--card)" stroke="var(--ink)" stroke-width="3"/>
          <text x="${cx}" y="${cy - 30}" text-anchor="middle" class="sd-nota" data-contar="${nota}">${nota}</text>
          <text x="${cx}" y="${cy - 14}" text-anchor="middle" class="sd-faixa" fill="${faixa[1]}">${faixa[0]}</text>
        </svg>
        <div class="sd-fatores">
          ${F.map((f, i) => `<button type="button" class="sd-fator" data-i="${i}" onmouseenter="_saudeFoco(${i})" onfocus="_saudeFoco(${i})" onclick="setView('${f.ir}')">
              <span class="sd-f-ic" style="--c:${f.pts >= 20 ? "#2F9E7E" : f.pts >= 10 ? "#C9A94E" : "#B4503E"}">${icon(f.ic)}</span>
              <span class="sd-f-txt"><b>${f.nome}</b><small>${esc(f.txt)}</small></span>
              <span class="sd-f-pts"><i style="--w:${f.pts * 4}%;--c:${f.pts >= 20 ? "#2F9E7E" : f.pts >= 10 ? "#C9A94E" : "#B4503E"}"></i>${f.pts}/25</span>
            </button>`).join("")}
        </div>
      </div>
    </div>`;
}
function _saudeFoco(i) {
  document.querySelectorAll(".sd-card").forEach(c => {
    c.classList.add("foco");
    c.querySelectorAll("[data-i]").forEach(e => e.classList.toggle("on", e.dataset.i === String(i)));
  });
}
function _saudeSai() { document.querySelectorAll(".sd-card").forEach(c => { c.classList.remove("foco"); c.querySelectorAll(".on").forEach(e => e.classList.remove("on")); }); }

/* ── Previsão: linha guia acompanha o dedo/mouse e mostra o saldo do dia ── */
function _pvMover(ev, alvo) {
  const svg = alvo.ownerSVGElement || alvo.closest("svg");
  const g = svg._geo || (svg._geo = JSON.parse(svg.dataset.geo));
  const S = svg._serie || (svg._serie = JSON.parse(svg.dataset.serie));
  const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
  const loc = p.matrixTransform(svg.getScreenCTM().inverse());
  const n = S.length - 1, i = Math.max(0, Math.min(n, Math.round((loc.x - g.L) / (g.W - g.L - g.R) * n)));
  const x = g.L + i / n * (g.W - g.L - g.R), y = v => g.T + (g.hi - v) / (g.hi - g.lo) * (g.H - g.T - g.B);
  const [data, est, lan] = S[i];
  const guia = svg.querySelector(".pv-guia"); guia.style.display = "";
  guia.querySelector(".pv-g-linha").setAttribute("x1", x); guia.querySelector(".pv-g-linha").setAttribute("x2", x);
  const ce = guia.querySelector(".pv-g-est"), cl = guia.querySelector(".pv-g-lan");
  ce.setAttribute("cx", x); ce.setAttribute("cy", y(est)); cl.setAttribute("cx", x); cl.setAttribute("cy", y(lan));
  const rot = guia.querySelector(".pv-g-rot"), bw = 172;
  const bx = x + 12 + bw > g.W - g.R ? x - 12 - bw : x + 12, by = Math.max(g.T, Math.min(y(est) - 30, g.H - g.B - 62));
  rot.setAttribute("transform", `translate(${bx} ${by})`);
  const [t1, t2, t3] = rot.querySelectorAll("text");
  t1.textContent = i === 0 ? "Hoje" : `${data.slice(8, 10)}/${data.slice(5, 7)} · em ${i} dia(s)`;
  t2.textContent = `Previsto ${money(est)}`; t3.textContent = `Só lançado ${money(lan)}`;
  t2.setAttribute("fill", est < 0 ? "#F2A08F" : "#7FD3C2");
}
function _pvSair(alvo) { const g = (alvo.ownerSVGElement || alvo.closest("svg")).querySelector(".pv-guia"); if (g) g.style.display = "none"; }

/* ── Tema: troca espalhando em círculo a partir do botão (navegadores atuais) ── */
function _temaComTransicao(ev) {
  const trocar = async () => {
    aplicarTema(temaAtual() === "dark" ? "light" : "dark");
    if (State.token) { renderApp(); marcarNav(); await setView(State.view); atualizarBadge(); } else renderLogin();
  };
  if (!document.startViewTransition || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return trocar();
  const x = ev?.clientX ?? innerWidth - 60, y = ev?.clientY ?? 28;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const t = document.startViewTransition(trocar);
  t.ready.then(() => document.documentElement.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
    { duration: 600, easing: "cubic-bezier(.4,0,.2,1)", pseudoElement: "::view-transition-new(root)" })).catch(() => {});
}


/* ── Cartão de crédito desenhado (original: chip, aproximação, selo com o nome da bandeira) ── */
const CC_BANDEIRAS = { visa: "Visa", master: "Mastercard", maestro: "Maestro", alelo: "Alelo", elo: "Elo", amex: "American Express", hiper: "Hipercard", diners: "Diners Club", outra: "" };
const _CC_CHIP = `<svg class="cc-chip" viewBox="0 0 46 36" aria-hidden="true"><defs><linearGradient id="ccOuro" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#F6E3A1"/><stop offset=".5" stop-color="#D4B25A"/><stop offset="1" stop-color="#A88732"/></linearGradient></defs>
  <rect x="1" y="1" width="44" height="34" rx="7" fill="url(#ccOuro)" stroke="#8C6D24" stroke-opacity=".5"/>
  <path d="M1 13h13M1 23h13M32 13h13M32 23h13M14 1v34M32 1v34M14 18h18" stroke="#8C6D24" stroke-opacity=".55" stroke-width="1.2" fill="none"/></svg>`;
const _CC_APROX = `<svg class="cc-aprox" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
  <path d="M8.5 6.5a8 8 0 0 1 0 11"/><path d="M12 4a12 12 0 0 1 0 16"/><path d="M15.5 1.8a15.5 15.5 0 0 1 0 20.4"/><path d="M5 9a4 4 0 0 1 0 6"/></svg>`;

function cartaoVisual(c, opts = {}) {
  const cor = _corOk(c.cor, "#305C74");
  const band = CC_BANDEIRAS[c.bandeira] ?? (c.bandeira_nome || "");
  const fin = (c.final_cartao || "").padStart(4, "•");
  const venc = c.proximo_vencimento ? _dm(c.proximo_vencimento) : (c.dia_vencimento ? `dia ${c.dia_vencimento}` : "");
  const uso = c.uso_pct ?? null;
  const verso = opts.semVerso ? "" : `
      <div class="cc-face cc-verso" onclick="event.stopPropagation();_ccVira(this.closest('.cc'))">
        <div class="cc-tarja"></div>
        <div class="cc-dados">
          <div><small>Fatura atual</small><b>${money(c.fatura_atual || 0)}</b><small>${venc ? "vence " + venc : "sem vencimento definido"}</small></div>
          <div><small>Disponível</small><b>${c.limite != null ? money(c.disponivel ?? c.limite) : "Sem limite"}</b><small>${c.limite != null ? "de " + money(c.limite) : "defina o limite"}</small></div>
        </div>
        ${uso != null ? `<div class="cc-uso"><i style="--w:${Math.min(100, uso)}%;${uso >= 90 ? "--uc:#F2A08F" : ""}"></i></div>` : ""}
        <div class="cc-uso-rot">${uso != null ? `${uso.toFixed(0)}% do limite em uso` : ""}${c.dia_fechamento ? ` · fecha dia ${c.dia_fechamento}` : ""}${c.parcelas_abertas ? ` · ${c.parcelas_abertas} parcela(s) em aberto` : ""}</div>
      </div>`;
  return `
  <div class="cc${opts.mini ? " mini" : ""}" style="--cc:${cor}" ${opts.semVerso ? "" : `tabindex="0" role="button" aria-label="Cartão ${esc(c.nome || "")}: toque para abrir a fatura"
       onclick="${c.id ? `abrirFatura(${c.id})` : "_ccVira(this)"}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}"`}
       onpointermove="_ccInclina(event,this)" onpointerleave="_ccSolta(this)">
    <div class="cc-giro">
      <div class="cc-face cc-frente">
        <div class="cc-topo"><span class="cc-banco">${esc(c.banco || "Cartão de crédito")}</span>
          ${c.logo ? `<img class="cc-logo" src="${esc(c.logo)}" alt="">` : ""}</div>
        <div class="cc-meio">${_CC_CHIP}${_CC_APROX}</div>
        <div class="cc-num">•••• •••• •••• ${esc(fin)}</div>
        <div class="cc-base"><div class="cc-nome"><small>Cartão</small><b>${esc(c.nome || "Novo cartão")}</b></div>
          ${_bandImg(c.bandeira) ? `<span class="cc-band img"><img src="${_bandImg(c.bandeira)}" alt="${esc(band)}" onload="_semFundo(this)"></span>` : band ? `<span class="cc-band">${esc(band)}</span>` : ""}</div>
        <div class="cc-brilho"></div>
        ${opts.semVerso ? "" : `<button type="button" class="cc-virar" title="Ver limite e fatura no verso" onclick="event.stopPropagation();_ccVira(this.closest('.cc'))">${icon("refresh")}</button>`}
      </div>${verso}
    </div>
  </div>`;
}
function _ccInclina(e, el) {
  if (e.pointerType === "touch") return;
  const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  el.style.setProperty("--ry", `${(x - .5) * 16}deg`); el.style.setProperty("--rx", `${(.5 - y) * 12}deg`);
  el.style.setProperty("--mx", `${x * 100}%`); el.style.setProperty("--my", `${y * 100}%`);
}
function _ccSolta(el) { ["--rx", "--ry"].forEach(p => el.style.setProperty(p, "0deg")); }
function _ccVira(el) { el.classList.toggle("virado"); }

async function _ccFaixa(alvoId, comAcoes) {
  const box = document.getElementById(alvoId); if (!box) return;
  let cs = [];
  try { cs = await api("/api/contas/cartoes"); } catch { box.innerHTML = ""; return; }
  if (!document.getElementById(alvoId)) return;
  box.innerHTML = `
    <div class="cc-faixa-cab"><h3>Cartões de crédito</h3><span class="sub">${cs.length ? "Toque no cartão para abrir a fatura" : "Cadastre seu cartão para acompanhar fatura e limite"}</span></div>
    <div class="cc-faixa">
      ${cs.map(c => `<div class="cc-item">${cartaoVisual(c)}
        ${comAcoes ? `<div class="cc-acoes">
          <button class="btn btn-ghost btn-sm" onclick="_ccEditar(${c.id})">${icon("edit")}Editar</button>
          <button class="btn btn-ghost btn-sm" onclick="abrirFatura(${c.id})">${icon("receipt")}Fatura</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="excluirConta(${c.id})">${icon("trash")}</button></div>` : ""}
      </div>`).join("")}
      <button type="button" class="cc-novo" onclick="formConta({tipo:'cartao'})">${icon("plus")}<b>Adicionar cartão</b><small>Bandeira, final, limite e vencimento</small></button>
    </div>`;
}
async function _ccEditar(id) { try { formConta(await api(`/api/contas/${id}`)); } catch (e) { toast(e.message, "err"); } }

function _contaTipo() {
  const cartao = document.getElementById("c-tipo")?.value === "cartao";
  const b = document.getElementById("c-cartao-campos"); if (b) b.style.display = cartao ? "contents" : "none";
  const sd = document.getElementById("c-saldo-campo"); if (sd) sd.style.display = cartao ? "none" : "";
  _contaPrev();
}
function _contaPrev() {
  const box = document.getElementById("c-prev-cartao"); if (!box) return;
  if (document.getElementById("c-tipo")?.value !== "cartao") { box.innerHTML = ""; return; }
  const v = id => document.getElementById(id)?.value || "";
  box.innerHTML = cartaoVisual({ nome: v("c-nome"), banco: v("c-banco"), cor: v("c-cor"), bandeira: v("c-bandeira"),
    final_cartao: v("c-final_cartao").replace(/\D/g, "").slice(0, 4), logo: typeof LOGO_BUF !== "undefined" ? LOGO_BUF : null }, { semVerso: true });
}


/* ── Cena financeira animada (desenhos originais) para o fundo do login ── */
function _cenaFinanceira() {
  const B = "rgba(255,255,255,.6)", O = "#E2C46E", T = "#5FC2B6", F = "rgba(255,255,255,.05)";
  const item = (cls, x, y, z, w, svg, extra = "") =>
    `<div class="cf-item ${cls}" style="--x:${x};--y:${y};--z:${z};width:${w}px;${extra}">${svg}</div>`;
  const caderno = `<svg viewBox="0 0 120 150" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <rect x="18" y="8" width="94" height="134" rx="10" fill="${F}" stroke="${B}" stroke-width="2.5"/>
      ${[24, 44, 64, 84, 104, 124].map(y => `<path d="M10 ${y}a8 8 0 0 1 16 0" stroke="${O}" stroke-width="3"/>`).join("")}
      ${[38, 52, 66].map(y => `<path d="M34 ${y}h62" stroke="${B}" stroke-width="2" opacity=".5"/>`).join("")}
      <path class="cf-cad-linha" d="M36 122 L52 104 L66 112 L84 88 L98 94" stroke="${T}" stroke-width="3" pathLength="100"/>
      <rect class="cf-cad-b b1" x="38" y="112" width="8" height="18" rx="2" fill="${O}" opacity=".7"/>
      <rect class="cf-cad-b b2" x="52" y="104" width="8" height="26" rx="2" fill="${T}" opacity=".7"/>
      <rect class="cf-cad-b b3" x="66" y="96" width="8" height="34" rx="2" fill="${O}" opacity=".7"/>
      <path class="cf-folha" d="M18 8h94a10 10 0 0 1 10 10v114a10 10 0 0 1-10 10H18z" fill="rgba(255,255,255,.08)" stroke="${B}" stroke-width="1.5"/>
    </svg>`;
  const moedas = `<svg viewBox="0 0 90 110" fill="none">
      ${[86, 74, 62, 50].map((y, i) => `<ellipse cx="45" cy="${y + 8}" rx="30" ry="9" fill="#B8923A"/><ellipse cx="45" cy="${y}" rx="30" ry="9" fill="${O}" stroke="#8C6D24" stroke-width="1.5"/>`).join("")}
      <g class="cf-moeda-cai"><ellipse cx="45" cy="18" rx="30" ry="9" fill="${O}" stroke="#8C6D24" stroke-width="1.5"/><path d="M41 15h8M45 12v7" stroke="#8C6D24" stroke-width="2" stroke-linecap="round"/></g>
    </svg>`;
  const grafico = `<svg viewBox="0 0 140 100" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="2" width="136" height="96" rx="14" fill="${F}" stroke="${B}" stroke-width="2"/>
      <path d="M18 80h106M18 80V18" stroke="${B}" stroke-width="2" opacity=".6"/>
      <path class="cf-linha" d="M22 72 L44 58 L62 64 L84 38 L104 44 L122 22" stroke="${T}" stroke-width="3.5" pathLength="100"/>
      ${[[44, 58], [84, 38], [122, 22]].map(([x, y], i) => `<circle class="cf-ponto p${i}" cx="${x}" cy="${y}" r="4.5" fill="${O}"/>`).join("")}
    </svg>`;
  const barras = `<svg viewBox="0 0 110 90" fill="none">
      <path d="M8 82h94" stroke="${B}" stroke-width="2" stroke-linecap="round" opacity=".6"/>
      ${[[14, "#5FC2B6"], [36, "#E2C46E"], [58, "#5FC2B6"], [80, "#E2C46E"]].map(([x, c], i) => `<rect class="cf-barra c${i}" x="${x}" y="14" width="16" height="66" rx="4" fill="${c}" opacity=".8"/>`).join("")}
    </svg>`;
  const calc = `<svg viewBox="0 0 90 120" fill="none">
      <rect x="4" y="4" width="82" height="112" rx="14" fill="${F}" stroke="${B}" stroke-width="2.5"/>
      <rect x="14" y="14" width="62" height="24" rx="5" fill="rgba(95,194,182,.22)" stroke="${T}" stroke-width="1.5"/>
      <g class="cf-visor"><text x="70" y="31" text-anchor="end" font-size="12" font-weight="800" fill="#fff" font-family="Numeros, sans-serif">1.250,90</text></g>
      ${[0, 1, 2].map(r => [0, 1, 2].map(c => `<rect class="cf-tecla t${(r * 3 + c) % 5}" x="${14 + c * 22}" y="${48 + r * 20}" width="16" height="14" rx="4" fill="rgba(255,255,255,.14)"/>`).join("")).join("")}
      <rect x="14" y="108" width="0" height="0"/>
    </svg>`;
  const recibo = `<svg viewBox="0 0 80 110" fill="none" stroke-linecap="round">
      <path d="M8 6h64v90l-8-6-8 6-8-6-8 6-8-6-8 6-8-6-8 6z" fill="rgba(255,255,255,.08)" stroke="${B}" stroke-width="2" stroke-linejoin="round"/>
      ${[24, 36, 48].map(y => `<path d="M18 ${y}h44" stroke="${B}" stroke-width="2" opacity=".5"/>`).join("")}
      <path d="M18 66h26" stroke="${O}" stroke-width="3"/><path d="M52 66h10" stroke="${O}" stroke-width="3"/>
    </svg>`;
  const cofrinho = `<svg viewBox="0 0 120 100" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="58" cy="56" rx="38" ry="28" fill="rgba(226,196,110,.16)" stroke="${O}" stroke-width="2.5"/>
      <path d="M30 40l-6-12 14 6" stroke="${O}" stroke-width="2.5"/>
      <rect x="92" y="48" width="12" height="14" rx="5" stroke="${O}" stroke-width="2.5"/>
      <circle cx="78" cy="48" r="2.5" fill="${O}"/>
      <path d="M38 82v8M74 82v8" stroke="${O}" stroke-width="3"/>
      <path d="M50 30h18" stroke="${O}" stroke-width="3"/>
      <g class="cf-cofre-moeda"><circle cx="59" cy="12" r="9" fill="${O}" stroke="#8C6D24" stroke-width="1.5"/></g>
    </svg>`;
  const cartao = `<svg viewBox="0 0 120 76" fill="none">
      <rect x="2" y="2" width="116" height="72" rx="10" fill="rgba(95,194,182,.18)" stroke="${T}" stroke-width="2"/>
      <rect x="14" y="22" width="20" height="15" rx="3" fill="${O}"/>
      <path d="M14 52h18M38 52h18M62 52h18M86 52h18" stroke="${B}" stroke-width="3" stroke-linecap="round" opacity=".7"/>
    </svg>`;
  const simbolo = (t, c) => `<svg viewBox="0 0 40 40"><text x="20" y="29" text-anchor="middle" font-size="28" font-weight="800" fill="${c}" font-family="Numeros, sans-serif">${t}</text></svg>`;
  const brilho = `<svg viewBox="0 0 20 20"><path d="M10 0l2.2 7.8L20 10l-7.8 2.2L10 20l-2.2-7.8L0 10l7.8-2.2z" fill="${O}"/></svg>`;
  return [
    item("cf-caderno", "6%", "12%", 1.6, 120, caderno),
    item("cf-grafico", "74%", "8%", 1.2, 150, grafico),
    item("cf-moedas", "82%", "48%", 1.8, 86, moedas),
    item("cf-barras", "4%", "58%", 1, 104, barras),
    item("cf-calc", "88%", "74%", 1.4, 74, calc, "--rot:-8deg"),
    item("cf-recibo", "16%", "80%", .9, 64, recibo, "--rot:10deg"),
    item("cf-cofrinho", "62%", "70%", 1.1, 110, cofrinho),
    item("cf-cartao", "30%", "4%", .8, 96, cartao, "--rot:-12deg"),
    item("cf-simb s1", "48%", "16%", .6, 34, simbolo("R$", "rgba(255,255,255,.35)")),
    item("cf-simb s2", "92%", "26%", .7, 30, simbolo("%", "rgba(226,196,110,.55)")),
    item("cf-simb s3", "22%", "40%", .5, 28, simbolo("+", "rgba(95,194,182,.6)")),
    item("cf-brilho b1", "40%", "30%", .4, 14, brilho),
    item("cf-brilho b2", "70%", "36%", .5, 12, brilho),
    item("cf-brilho b3", "12%", "36%", .5, 10, brilho),
  ].join("");
}
function _loginParallax(e) {
  const el = e.currentTarget; if (e.pointerType === "touch") return;
  el.style.setProperty("--px", ((e.clientX / innerWidth) - .5).toFixed(3));
  el.style.setProperty("--py", ((e.clientY / innerHeight) - .5).toFixed(3));
}


/* ── Senha de fábrica: troca obrigatória ─────────────────────── */
async function _checarSenhaFabrica() {
  if (State._senhaChecada || !State.token) return;
  State._senhaChecada = true;
  try { const eu = await api("/api/auth/eu"); if (eu.trocar_senha) _senhaObrigatoria(eu.id); } catch {}
}
function _senhaObrigatoria(uid) {
  State._senhaObrigatoria = uid;
  abrirModal(`
    <div class="modal" style="max-width:440px">
      <div class="modal-h"><span class="card-ico i-red">${icon("shield")}</span><h3>Troque a senha de fábrica</h3></div>
      <div class="modal-b">
        <div class="dica vermelho" style="margin-bottom:12px">${icon("alert")}<div>Você entrou com a senha padrão do sistema, que qualquer pessoa pode conhecer. Escolha uma senha sua para continuar.</div></div>
        <div class="frm">
          <div class="campo full"><label>Senha atual</label><input id="sf-atual" type="password" value="" autocomplete="current-password" placeholder="A senha de fábrica"></div>
          <div class="campo full"><label>Nova senha</label><input id="sf-nova" type="password" autocomplete="new-password" placeholder="Mínimo de 6 caracteres"></div>
          <div class="campo full"><label>Repita a nova senha</label><input id="sf-nova2" type="password" autocomplete="new-password"></div>
        </div>
      </div>
      <div class="modal-f"><button class="btn btn-primary" onclick="_salvarSenhaFabrica()">${icon("check")}Salvar nova senha</button></div>
    </div>`);
}
async function _salvarSenhaFabrica() {
  const atual = $("#sf-atual").value, nova = $("#sf-nova").value, nova2 = $("#sf-nova2").value;
  if (!atual) return erroCampo("senha_atual", "Senha atual: digite a senha com que você entrou.");
  if (nova.length < 6) return erroCampo("nova_senha", `Nova senha: precisa ter no mínimo 6 caracteres (foram ${nova.length}).`);
  if (nova !== nova2) return erroCampo("nova2", "Repita a nova senha: as duas senhas não são iguais.");
  try {
    await api(`/api/usuarios/${State._senhaObrigatoria}/senha`, { method: "POST", body: JSON.stringify({ senha_atual: atual, nova_senha: nova }) });
    State._senhaObrigatoria = null; fecharModal(); celebrar("Senha trocada!");
  } catch (e) {
    const m = /^(Senha atual|Nova senha):/.exec(e.message || "");
    if (m) erroCampo(m[1] === "Senha atual" ? "senha_atual" : "nova_senha", e.message); else toast(e.message, "err");
  }
}

/* ── Repetições (lançamentos que se repetem) ─────────────────── */
function _repetirBloco(l, ed) {
  if (ed && l.recorrencia_id) return `<div class="campo full"><div class="rep-info">${icon("repeat")}<span>Este lançamento se repete automaticamente.</span>
      <button type="button" class="btn btn-ghost btn-sm" onclick="fecharModal();abrirRecorrencias()">Gerenciar</button></div></div>`;
  return `<div class="campo"><label>Repetir</label><select id="f-repetir" onchange="document.getElementById('f-rep-ate-campo').style.display=this.value?'':'none'">
      <option value="">Não repetir</option><option value="mensal">Todo mês</option><option value="anual">Todo ano</option></select></div>
    <div class="campo" id="f-rep-ate-campo" style="display:none"><label>Repetir até (opcional)</label><input id="f-rep-ate" type="date"></div>`;
}
async function abrirRecorrencias() {
  let rs = [];
  try { rs = await api("/api/recorrencias"); } catch (e) { return toast(e.message, "err"); }
  const freq = r => r.frequencia === "anual" ? `todo ano em ${String(r.dia).padStart(2, "0")}/${String(r.mes).padStart(2, "0")}` : `todo dia ${r.dia}`;
  abrirModal(`
    <div class="modal" style="max-width:640px">
      <div class="modal-h"><span class="card-ico i-navy">${icon("repeat")}</span><h3>Lançamentos que se repetem</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b">
        ${rs.length ? rs.map(r => `
          <div class="rep-item${r.ativo ? "" : " pausada"}">
            <span class="rep-ic ${r.tipo}">${icon(r.tipo === "receita" ? "arrowDown" : "arrowUp")}</span>
            <div class="rep-txt"><b>${esc(r.descricao)}</b>
              <small>${freq(r)}${r.ate ? ` até ${dataBR(r.ate)}` : ""} · ${r.ativo ? (r.proxima ? `próxima ${dataBR(r.proxima)}` : "sem próxima") : "pausada"}</small></div>
            <input class="rep-valor" type="number" step="0.01" min="0" value="${r.valor}" aria-label="Valor de ${esc(r.descricao)}"
                   onkeydown="if(event.key==='Enter')this.blur()" onchange="_recValor(${r.id}, this)">
            <button class="btn btn-ghost btn-sm" onclick="_recAtivo(${r.id}, ${!r.ativo})">${r.ativo ? "Pausar" : "Retomar"}</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" title="Parar de repetir" onclick="_recEncerrar(${r.id})">${icon("trash")}</button>
          </div>`).join("") : `<div class="empty" style="padding:24px">${ilus("repeat")}<p>Nenhum lançamento se repete ainda. Ao lançar aluguel, salário ou uma assinatura, escolha "Repetir: todo mês".</p></div>`}
        <div class="campo-dica" style="margin-top:10px">O novo valor vale para as próximas ocorrências ainda não pagas. As já pagas ficam como foram.</div>
      </div>
    </div>`, "lg");
}
async function _recValor(id, el) {
  try { await api(`/api/recorrencias/${id}`, { method: "PUT", body: JSON.stringify({ valor: parseFloat(el.value) }) }); toast("Valor atualizado nas próximas ocorrências", "ok"); }
  catch (e) { toast(e.message, "err"); }
}
async function _recAtivo(id, ativo) {
  try { await api(`/api/recorrencias/${id}`, { method: "PUT", body: JSON.stringify({ ativo }) }); fecharModal(); abrirRecorrencias(); toast(ativo ? "Repetição retomada" : "Repetição pausada", "ok"); }
  catch (e) { toast(e.message, "err"); }
}
async function _recEncerrar(id) {
  if (!(await confirmar({ tipo: "aviso", figura: "repetir", ok: "Parar de repetir", titulo: "Parar de repetir?",
    texto: "As próximas ocorrências ainda não pagas serão removidas.",
    detalhe: "O histórico e o lançamento original ficam." }))) return;
  try { const r = await api(`/api/recorrencias/${id}`, { method: "DELETE" }); fecharModal(); abrirRecorrencias(); toast(`Repetição encerrada${r.apagadas ? `, ${r.apagadas} futura(s) removida(s)` : ""}`, "ok"); if (State.view !== "dashboard") recarregarTabela?.(); }
  catch (e) { toast(e.message, "err"); }
}

/* ── Backup completo ─────────────────────────────────────────── */
async function baixarBackup() {
  const comp = document.getElementById("bk-comp")?.checked;
  const bt = document.getElementById("bk-bt"); if (bt) { bt.disabled = true; bt.innerHTML = `${icon("refresh")}Gerando...`; }
  try {
    const r = await fetch(_url(`/api/backup${comp ? "?comprovantes=true" : ""}`), { headers: { Authorization: `Bearer ${State.token}` } });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.erro || d.detail || "Não foi possível gerar o backup."); }
    const blob = await r.blob(), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || "backup-tomelin.json";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(`Backup baixado (${_kb(blob.size)})`, "ok");
  } catch (e) { toast(e.message, "err"); }
  finally { if (bt) { bt.disabled = false; bt.innerHTML = `${icon("download")}Baixar backup`; } }
}


/* Filtro de pessoa ou contato aparece como chip com X (antes ficava preso escondido) */
function _filtroChips() {
  const box = document.getElementById("filtro-chips"); if (!box) return;
  const chips = [];
  if (FILTRO.responsavel) {
    const m = (State.membros || []).find(u => u.id === +FILTRO.responsavel);
    chips.push(["responsavel", "user", `Quem paga: ${m ? m.nome.split(" ")[0] : "#" + FILTRO.responsavel}`]);
  }
  if (FILTRO.contato) {
    const c = (State.contatos || []).find(x => x.id === +FILTRO.contato);
    chips.push(["contato", "users", c ? c.nome : "Contato"]);
  }
  box.innerHTML = chips.map(([k, ic, t]) => `<button class="filtro-chip" onclick="FILTRO.${k}='';_filtroChips();recarregarTabela()">${icon(ic)}${esc(t)}${icon("x")}</button>`).join("");
}

/* ── Histórico de alterações ── */
const _ACOES = { criou: ["Criou", "plus", "#1F6F5C", "#3EC28F"], editou: ["Editou", "edit", "#082D51", "#4F8BC9"],
  baixa: ["Deu baixa", "check", "#14594C", "#2F9E7E"], estorno: ["Desfez o pagamento", "refresh", "#8A6D1E", "#E2C46E"],
  excluiu: ["Excluiu", "trash", "#8E3326", "#D0624E"], comprovante: ["Comprovante", "clip", "#B35C1E", "#E59A4B"] };
function _quandoRel(iso) {
  const d = new Date(iso), s = (Date.now() - d) / 1000;
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400 && d.getDate() === new Date().getDate()) return `hoje, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function _histItem(h, comDescricao) {
  const [rot, ic, c1, c2] = _ACOES[h.acao] || [h.acao, "clock", "#3A4654", "#7E8C9A"];
  const mud = (h.mudancas || []).map(m => `<div class="hi-mud"><span>${esc(m.campo)}</span>${m.de != null ? `<s>${esc(m.de)}</s>` : ""}${m.de != null && m.para != null ? "→" : ""}${m.para != null ? `<b>${esc(m.para)}</b>` : (m.de != null ? "<em>removido</em>" : "")}</div>`).join("");
  return `<div class="hi" style="--c1:${c1};--c2:${c2}"><span class="hi-ic">${icon(ic)}</span>
    <div class="grow"><div class="hi-top"><b>${esc(h.autor)}</b> <span>${rot.toLowerCase()}</span>
      ${comDescricao ? `<a onclick="${h.acao === "excluiu" ? "" : `formLancamentoId(${h.lancamento_id})`}">${esc(h.descricao || "#" + h.lancamento_id)}</a>` : ""}
      <small>${_quandoRel(h.quando)}</small></div>${mud}</div></div>`;
}
async function verHistoricoLanc(id) {
  const l = _LANC_CACHE.get(id);
  abrirModal(`<div class="modal" style="max-width:520px"><div class="modal-h"><span class="card-ico i-navy">${icon("clock")}</span>
    <h3>Histórico${l ? `: ${esc(l.descricao)}` : ""}</h3><button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
    <div class="modal-b" id="hist-corpo">${ilusCarregando(60)}</div></div>`);
  try {
    const h = await api(`/api/lancamentos/${id}/historico`);
    document.getElementById("hist-corpo").innerHTML = h.length ? `<div class="hi-lista">${h.map(x => _histItem(x, false)).join("")}</div>`
      : `<div class="empty" style="padding:24px">${ilus("clock")}<p>Sem registro. O histórico começou a ser guardado em outubro de 2026.</p></div>`;
  } catch (e) { document.getElementById("hist-corpo").innerHTML = `<p>${esc(e.message)}</p>`; }
}
async function _atividadeCarregar() {
  const box = document.getElementById("atividade"); if (!box) return;
  let h; try { h = await api("/api/atividade?limite=30"); } catch { box.remove(); return; }
  box.innerHTML = `<div class="card-h"><span class="card-ico i-navy">${icon("clock")}</span><div class="grow"><h3>Atividade recente</h3>
    <div class="sub">Quem criou, mudou, pagou ou excluiu cada conta</div></div></div>
    ${h.length ? `<div class="hi-lista">${h.map(x => _histItem(x, true)).join("")}</div>` : `<div class="sub">Nenhuma alteração registrada ainda.</div>`}`;
}

/* ── Documentos emitidos ── */
const _DOC_TIPOS = { recibo: ["Recibo", "receipt", "#1F6F5C", "#3EC28F"], balancete: ["Balancete", "chart", "#082D51", "#4F8BC9"],
  patrimonio: ["Patrimônio", "bank", "#8A6D1E", "#E2C46E"], imposto_renda: ["Imposto de Renda", "doc", "#14594C", "#2F9E7E"] };
let _DOC_FILTRO = { tipo: "", busca: "" }, _docTimer;
async function viewDocumentos(v) {
  v.innerHTML = `
    <div class="doc-topo">
      <div class="search" style="flex:1;min-width:200px"><span>${icon("search")}</span>
        <input class="search-i" id="doc-busca" placeholder="Buscar por nome, período ou código..." value="${esc(_DOC_FILTRO.busca)}"
          oninput="clearTimeout(_docTimer);_docTimer=setTimeout(()=>{_DOC_FILTRO.busca=this.value;_docCarregar()},300)"></div>
      <div class="periodos" style="padding:0">${[["", "Todos"], ...Object.entries(_DOC_TIPOS).map(([k, t]) => [k, t[0]])]
        .map(([k, r]) => `<button class="periodo${_DOC_FILTRO.tipo === k ? " on" : ""}" onclick="_DOC_FILTRO.tipo='${k}';this.parentElement.querySelectorAll('.periodo').forEach(b=>b.classList.toggle('on',b===this));_docCarregar()">${r}</button>`).join("")}</div>
    </div>
    <div class="doc-info">${icon("shield")}<span>Todo PDF que o sistema gera fica guardado aqui com o código do QR. Quem escaneia o QR vê se o documento é autêntico e pode baixar o original.</span></div>
    <div id="doc-lista" class="doc-lista">${ilusCarregando(70)}</div>`;
  await _docCarregar();
}
async function _docCarregar() {
  const box = document.getElementById("doc-lista"); if (!box) return;
  const q = new URLSearchParams({ busca: _DOC_FILTRO.busca, tipo: _DOC_FILTRO.tipo });
  let d; try { d = await api(`/api/documentos?${q}`); } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (!d.itens.length) {
    box.innerHTML = `<div class="empty" style="padding:40px">${ilus("doc")}<p>${d.total ? "Nada encontrado com esse filtro." : "Nenhum documento emitido ainda. Gere um recibo ou relatório em PDF e ele aparece aqui."}</p></div>`;
    return;
  }
  const quando = iso => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  box.innerHTML = d.itens.map((x, i) => { const [nome, ic, c1, c2] = _DOC_TIPOS[x.tipo] || ["Documento", "doc", "#305C74", "#7E8C9A"]; return `
    <div class="doc-item" style="--c1:${c1};--c2:${c2};--i:${Math.min(i, 12)}">
      <span class="doc-ic">${icon(ic)}${x.estilo === "cupom" ? `<em>cupom</em>` : ""}</span>
      <div class="grow doc-txt"><b>${esc(x.titulo)}</b><small>${esc(x.resumo || nome)}</small>
        <small class="doc-cod">${quando(x.emitido_em)} · <code>${x.codigo}</code></small></div>
      ${x.valor != null ? `<span class="doc-val mono-num">${money(x.valor)}</span>` : ""}
      <div class="doc-bts">
        <a class="btn btn-ghost btn-sm" href="/verificar/${x.codigo}" target="_blank" rel="noopener" title="Página de validação">${icon("checkCircle")}</a>
        <a class="btn btn-ghost btn-sm" href="/verificar/${x.codigo}/pdf?baixar=1" title="Baixar o PDF original">${icon("download")}</a>
        <button class="btn btn-wa btn-sm btn-wa-mini" onclick="_docZap('${x.codigo}', this)" title="Mandar no WhatsApp"><span class="wa-ic">${waDesenho()}</span><span class="wa-ticks">${_WA_TICKS}</span></button>
      </div>
    </div>`; }).join("") + (d.total > d.itens.length ? `<div class="sub" style="text-align:center;padding:8px">Mostrando ${d.itens.length} de ${d.total}. Use a busca para achar os mais antigos.</div>` : "");
}
function _docZap(codigo, btn) { return _waDisparar(`/api/documentos/${codigo}/whatsapp`, btn); }

/* ── Este ano x ano passado ── */
const _COMP = { ano: new Date().getFullYear(), modo: "despesas" };
async function _compCarregar(ano, modo) {
  const box = document.getElementById("comp-ano"); if (!box) return;
  if (ano) _COMP.ano = ano; if (modo) _COMP.modo = modo;
  let d; try { d = await api(`/api/relatorios/comparativo?ano=${_COMP.ano}`); } catch (e) { box.innerHTML = `<div class="sub">${esc(e.message)}</div>`; return; }
  const k = _COMP.modo, ka = k + "_ant", desp = k === "despesas";
  const t = d.totais, dif = t[k] - t[ka], pct = t[ka] ? dif / t[ka] * 100 : null;
  const bom = desp ? dif <= 0 : dif >= 0;
  const max = Math.max(1, ...d.meses.flatMap(m => [m[k], m[ka]]));
  const W = 640, H = 190, base = 160, larg = W / 12;
  const cor = desp ? "#C9573F" : "#2F9E7E";
  const barras = d.meses.map((m, i) => {
    const x = i * larg, h1 = m[ka] / max * 140, h2 = m[k] / max * 140;
    return `<g class="cp-mes${m.futuro ? " futuro" : ""}" style="--i:${i}">
      <title>${m.rotulo}: ${d.ano} ${money(m[k])} · ${d.ano_anterior} ${money(m[ka])}</title>
      <rect class="cp-ant" x="${x + larg * .16}" y="${base - h1}" width="${larg * .3}" height="${Math.max(h1, 1)}" rx="3"/>
      <rect class="cp-atu" x="${x + larg * .5}" y="${base - h2}" width="${larg * .3}" height="${Math.max(h2, 1)}" rx="3" fill="${cor}"/>
      <text x="${x + larg / 2}" y="${base + 18}" text-anchor="middle">${m.rotulo}</text></g>`;
  }).join("");
  const cats = d.categorias.filter(c => c.atual || c.anterior).slice(0, 6);
  box.innerHTML = `
    <div class="card-h"><span class="card-ico i-teal">${icon("chart")}</span><div class="grow"><h3>Este ano x ano passado</h3>
      <div class="sub">${d.ano} contra ${d.ano_anterior}, de ${d.periodo}</div></div></div>
    <div class="cp-ctrl">
      <div class="seg">${[d.ano === new Date().getFullYear() ? d.ano : new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2]
        .map(a => `<button class="${a === d.ano ? "on" : ""}" onclick="_compCarregar(${a})">${a}</button>`).join("")}</div>
      <div class="seg">${[["despesas", "Gastos"], ["receitas", "Receitas"]].map(([m, r]) => `<button class="${m === k ? "on" : ""}" onclick="_compCarregar(null,'${m}')">${r}</button>`).join("")}</div>
    </div>
    <div class="cp-total">
      <div><small>${desp ? "Gastou" : "Recebeu"} em ${d.ano}</small><b class="mono-num">${money(t[k])}</b></div>
      <div class="cp-var ${bom ? "bom" : "ruim"}">${pct == null ? "sem dados do ano anterior" : `${dif >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}% · ${dif >= 0 ? "+" : "−"}${money0(Math.abs(dif))}`}
        <small>em ${d.ano_anterior}: ${money0(t[ka])}</small></div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" class="cp-graf" role="img" aria-label="Comparativo mês a mês">${barras}</svg>
    <div class="cp-leg"><span><i class="ant"></i>${d.ano_anterior}</span><span><i style="background:${cor}"></i>${d.ano}</span></div>
    ${desp && cats.length ? `<div class="cp-cats"><div class="cp-cats-tit">Onde mudou mais (${d.periodo})</div>${cats.map(c => {
      const sobe = c.diferenca > 0; return `<div class="cp-cat"><i style="background:${_corOk(c.cor, "#7E8C9A")}"></i><span class="grow">${esc(c.nome)}</span>
        <small>${money0(c.anterior)} → <b>${money0(c.atual)}</b></small>
        <em class="${sobe ? "ruim" : "bom"}">${c.variacao_pct == null ? "novo" : `${sobe ? "▲" : "▼"} ${Math.abs(c.variacao_pct).toFixed(0)}%`}</em></div>`; }).join("")}</div>` : ""}`;
}

/* ── Quem paga ── */
function _quemEscolher(b) {
  b.parentElement.querySelectorAll(".quem-opt").forEach(x => x.classList.toggle("on", x === b));
  document.getElementById("f-resp").value = b.dataset.id || ""; vibrar(8);
}
async function _porPessoaCarregar() {
  const box = document.getElementById("por-pessoa"); if (!box) return;
  if (!State.membros) { try { await carregarRefs(); } catch {} }
  if ((State.membros || []).length < 2) { box.remove(); return; }   // só faz sentido com mais de uma pessoa
  let d; try { d = await api(`/api/relatorios/por-pessoa?de=${PERIODO.de}&ate=${PERIODO.ate}`); } catch { box.remove(); return; }
  const max = Math.max(1, ...d.map(p => p.pago + p.a_pagar));
  box.innerHTML = `<div class="card-h"><span class="card-ico i-navy">${icon("users")}</span><div class="grow"><h3>Quem paga o quê</h3>
      <div class="sub">Despesas do período por pessoa · toque para ver os lançamentos</div></div></div>
    ${d.length ? d.map(p => { const m = (State.membros || []).find(u => u.id === p.responsavel_id); const cor = _corOk(m?.cor, "#7E8C9A"); return `
      <div class="pp-linha" style="--c:${cor}" onclick="${p.responsavel_id ? `FILTRO.responsavel=${p.responsavel_id};setView('lancamentos')` : ""}">
        <span class="pp-av">${m ? avatarSVG(m.emoji, 20) : icon("users")}</span>
        <div class="grow"><b>${esc(p.nome)}</b>
          <span class="pp-barra"><i style="width:${p.pago / max * 100}%"></i><em style="width:${p.a_pagar / max * 100}%"></em></span>
          <small>Pagou ${money(p.pago)}${p.a_pagar ? ` · falta ${money(p.a_pagar)}` : ""}${p.recebido ? ` · recebeu ${money(p.recebido)}` : ""}</small></div>
        <span class="mono-num pp-tot">${money(p.pago + p.a_pagar)}</span></div>`; }).join("")
      : `<div class="sub">Nenhum lançamento no período.</div>`}`;
}

/* ── Imposto de Renda (Relatórios) ── */
const _IR_COR = { saude: ["#14594C", "#3EC28F"], educacao: ["#082D51", "#4F8BC9"], previdencia: ["#8A6D1E", "#E2C46E"], pensao: ["#5B3FA0", "#8B6BD8"] };
async function abrirIR(ano) {
  const atual = new Date().getFullYear();
  ano = ano || atual - 1;
  abrirModal(`<div class="modal" style="max-width:640px"><div class="modal-h"><span class="card-ico i-green">${icon("doc")}</span><h3>Imposto de Renda</h3>
    <button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div><div class="modal-b" id="ir-corpo">${ilusCarregando(70)}</div></div>`);
  let d;
  try { d = await api(`/api/relatorios/imposto-renda?ano=${ano}`); }
  catch (e) { document.getElementById("ir-corpo").innerHTML = `<p>${esc(e.message)}</p>`; return; }
  const anos = [atual, atual - 1, atual - 2, atual - 3];
  document.getElementById("ir-corpo").innerHTML = `
    <div class="ir-anos">${anos.map(a => `<button class="ir-ano${a === ano ? " on" : ""}" onclick="abrirIR(${a})">${a}</button>`).join("")}</div>
    <div class="ir-total"><small>Despesas dedutíveis pagas em ${ano}</small><b class="mono-num">${money(d.total)}</b><span>${d.qtd} pagamento(s)</span></div>
    ${d.sem_documento.length ? `<div class="ir-alerta">${icon("alert")}<span>Falta CPF/CNPJ de <b>${d.sem_documento.map(esc).join(", ")}</b>. Complete no cadastro do contato: a Receita pede.</span></div>` : ""}
    ${d.sem_comprovante ? `<div class="ir-alerta amarelo">${icon("clip")}<span><b>${d.sem_comprovante}</b> pagamento(s) sem comprovante anexado.</span></div>` : ""}
    ${d.grupos.length ? d.grupos.map(g => { const [c1, c2] = _IR_COR[g.tipo] || ["#305C74", "#4F8BC9"]; return `
      <div class="ir-grupo" style="--c1:${c1};--c2:${c2}">
        <div class="ir-g-topo"><b>${esc(g.nome)}</b><span class="mono-num">${money(g.total)}</span></div>
        ${g.prestadores.map(p => `<div class="ir-prest"><div class="grow"><b>${esc(p.nome)}</b>
          <small>${p.documento ? esc(p.documento) : `<em>sem CPF/CNPJ</em>`} · ${p.lancamentos.length} pagamento(s)</small></div>
          <span class="mono-num">${money(p.total)}</span></div>`).join("")}
      </div>`; }).join("")
      : `<div class="empty" style="padding:20px">${ilus("doc")}<p>Nenhuma despesa dedutível paga em ${ano}.</p></div>`}
    <div class="ir-cats"><small>Entram no relatório as categorias marcadas como dedutíveis:</small>
      ${d.categorias_marcadas.length ? d.categorias_marcadas.map(c => `<span class="ir-chip">${esc(c.nome)}</span>`).join("") : "<em>nenhuma ainda</em>"}
      <button class="btn btn-ghost btn-sm" onclick="fecharModal();setView('categorias')">${icon("tag")}Marcar categorias</button></div>
    <div class="modal-f" style="padding:14px 0 0"><button class="btn btn-ghost" onclick="fecharModal()">Fechar</button>
      <button class="btn btn-primary" onclick="abrirPDF('/api/relatorios/imposto-renda.pdf?ano=${ano}')"${d.qtd ? "" : " disabled"}>${icon("download")}Baixar PDF</button></div>
    <small class="campo-dica">Organiza os valores para a declaração. As regras e limites mudam todo ano: confira com a Receita ou seu contador.</small>`;
}

/* ── Backups automáticos (Configurações) ── */
async function _bkCarregar() {
  const box = document.getElementById("bk-auto"); if (!box) return;
  let d;
  try { d = await api("/api/backup/automaticos"); }
  catch (e) { box.innerHTML = `<div class="sub">${esc(e.message)}</div>`; return; }
  const c = d.config;
  const quando = iso => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  box.innerHTML = `
    <div class="bk-topo">
      <div><b>Backup automático</b> <span class="bk-st ${c.ativo ? "on" : ""}">${c.ativo ? `ligado · todo dia às ${String(c.hora).padStart(2, "0")}:30` : "desligado"}</span>
        <small>Guarda os últimos ${c.manter}${c.whatsapp ? " e manda uma cópia no grupo do WhatsApp" : ". Para ter uma cópia fora do servidor, ligue o envio pelo WhatsApp abaixo"}.</small></div>
      <div class="bk-bts"><button class="btn btn-ghost btn-sm" id="bk-agora" onclick="_bkAgora()">${icon("shield")}Fazer backup agora</button>
        <button class="btn btn-ghost btn-sm" onclick="_bkRestaurar()">${icon("refresh")}Restaurar de um arquivo</button></div>
    </div>
    ${d.ultimo_erro ? `<div class="bk-erro">${icon("alert")}Último backup automático falhou: ${esc(d.ultimo_erro)}</div>` : ""}
    ${d.itens.length ? `<div class="bk-lista">${d.itens.map(b => `
      <div class="bk-item"><span class="bk-ic">${icon("shield")}</span>
        <div class="grow"><b>${quando(b.criado_em)}</b><small>${{ manual: "feito na hora", antes_restaurar: "antes de restaurar" }[b.origem] || "automático"} · ${_kb(b.tamanho)} · ${b.lancamentos} lançamentos${b.com_comprovantes ? " · com comprovantes" : ""}${b.enviado_whatsapp ? " · enviado no WhatsApp" : ""}</small></div>
        <button class="btn btn-ghost btn-sm" onclick="_bkRestaurar(${b.id}, '${quando(b.criado_em)}')" title="Voltar os dados para este ponto">${icon("refresh")}</button>
        <button class="btn btn-ghost btn-sm" onclick="_bkBaixar(${b.id})" title="Baixar">${icon("download")}</button></div>`).join("")}</div>`
      : `<div class="sub" style="margin-top:8px">Nenhum backup automático ainda. O primeiro sai hoje de madrugada, ou toque em "Fazer backup agora".</div>`}`;
}
async function _bkAgora() {
  const bt = document.getElementById("bk-agora"); if (bt) { bt.disabled = true; bt.innerHTML = `${icon("refresh", "spin")}Fazendo...`; }
  try {
    const r = await api("/api/backup/automaticos/agora", { method: "POST" });
    toast(`Backup feito (${_kb(r.tamanho)})${r.enviado_whatsapp ? " e enviado no WhatsApp" : ""}`, r.enviado_whatsapp ? "wa" : "ok");
  } catch (e) { toast(e.message, "err"); }
  _bkCarregar();
}
/* Restaurar: de um backup da lista (id) ou de um arquivo baixado antes */
let _BK_ARQ = null;
function _bkRestaurar(id, quando) {
  _BK_ARQ = null;
  abrirModal(`<div class="modal" style="max-width:520px"><div class="modal-h"><span class="card-ico i-red">${icon("refresh")}</span>
    <h3>Restaurar backup</h3><button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
    <div class="modal-b">
      ${id ? `<div class="bk-r-info">${icon("shield")}<span>Backup de <b>${esc(quando)}</b></span></div>`
        : `<label class="bk-r-arq"><input type="file" accept=".json,.gz,application/json,application/gzip" onchange="_bkPrevia(this.files[0])">
            ${icon("download")}<span><b>Escolher o arquivo do backup</b><small>.json ou .json.gz baixado do sistema</small></span></label>
           <div id="bk-r-prev"></div>`}
      <div class="bk-r-aviso">${icon("alert")}<div><b>Os dados voltam para como estavam no backup.</b> Lançamentos, contas, cartões, categorias, contatos, metas e veículos de agora são trocados pelos do arquivo.
        Usuários e senhas não mudam. Antes de restaurar, o sistema guarda um backup de agora, para dar para desfazer.</div></div>
      <label class="campo" style="margin-top:12px"><span style="font-size:12.5px;font-weight:700">Para confirmar, digite <b>RESTAURAR</b></span>
        <input id="bk-r-conf" autocomplete="off" placeholder="RESTAURAR" oninput="document.getElementById('bk-r-bt').disabled=this.value.trim().toUpperCase()!=='RESTAURAR'||(!${id || 0}&&!_BK_ARQ)"></label>
    </div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-primary" id="bk-r-bt" style="background:linear-gradient(135deg,#8E3326,#D0624E)" disabled onclick="_bkRestaurarIr(${id || 0})">${icon("refresh")}Restaurar</button></div></div>`);
}
async function _bkPrevia(arq) {
  const box = document.getElementById("bk-r-prev"); if (!arq || !box) return;
  _BK_ARQ = null; box.innerHTML = `<div class="sub" style="margin:8px 0">Lendo o arquivo...</div>`;
  const fd = new FormData(); fd.append("arquivo", arq);
  try {
    const r = await fetch(_url("/api/backup/restaurar/previa"), { method: "POST", body: fd, headers: { Authorization: `Bearer ${State.token}` } });
    const d = await r.json(); if (!r.ok) throw new Error(d.detail || "Arquivo inválido.");
    _BK_ARQ = arq;
    const c = d.contagem || {};
    box.innerHTML = `<div class="bk-r-info ok">${icon("checkCircle")}<span>Backup de <b>${d.gerado_em ? new Date(d.gerado_em).toLocaleString("pt-BR") : "data desconhecida"}</b>
      · ${c.lancamentos || 0} lançamentos · ${c.contas || 0} contas · ${c.categorias || 0} categorias${d.com_comprovantes ? " · com comprovantes" : ""}</span></div>
      ${(d.avisos || []).map(a => `<div class="bk-r-info amarelo">${icon("alert")}<span>${esc(a)}</span></div>`).join("")}`;
    document.getElementById("bk-r-conf").dispatchEvent(new Event("input"));
  } catch (e) { box.innerHTML = `<div class="bk-r-info erro">${icon("alert")}<span>${esc(e.message)}</span></div>`; }
}
async function _bkRestaurarIr(id) {
  const bt = document.getElementById("bk-r-bt"), conf = document.getElementById("bk-r-conf").value;
  bt.disabled = true; bt.innerHTML = `${icon("refresh", "spin")}Restaurando...`;
  try {
    let r, d;
    if (id) { d = await api(`/api/backup/automaticos/${id}/restaurar`, { method: "POST", body: JSON.stringify({ confirmar: conf }) }); }
    else {
      const fd = new FormData(); fd.append("arquivo", _BK_ARQ); fd.append("confirmar", conf);
      r = await fetch(_url("/api/backup/restaurar"), { method: "POST", body: fd, headers: { Authorization: `Bearer ${State.token}` } });
      d = await r.json(); if (!r.ok) throw new Error(d.detail || "Não foi possível restaurar.");
    }
    fecharModal(); celebrar("Dados restaurados!");
    toast(`Restaurado: ${d.restaurados?.lancamentos ?? 0} lançamentos. Um backup de antes ficou guardado.`, "ok");
    setTimeout(() => location.reload(), 1600);
  } catch (e) { toast(e.message, "err"); bt.disabled = false; bt.innerHTML = `${icon("refresh")}Restaurar`; }
}
async function _bkBaixar(id) {
  try {
    const r = await fetch(_url(`/api/backup/automaticos/${id}`), { headers: { Authorization: `Bearer ${State.token}` } });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || "Não foi possível baixar."); }
    const blob = await r.blob(), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/)?.[1] || "backup-tomelin.json.gz";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) { toast(e.message, "err"); }
}
