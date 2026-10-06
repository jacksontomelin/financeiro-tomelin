/* Tomelin Gestão Financeira · Bandeiras, fatura do cartão e WhatsApp rápido.
   Arquivo 14 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ── Imagens das bandeiras e do Pix (enviadas pela família) ── */
const BAND_LISTA = [["visa", "Visa"], ["master", "Mastercard"], ["maestro", "Maestro"], ["elo", "Elo"], ["alelo", "Alelo"],
  ["amex", "American Express"], ["hiper", "Hipercard"], ["diners", "Diners Club"], ["pix", "Pix"]];
const FORMAS_PAG = [["pix", "Pix", "send"], ["dinheiro", "Dinheiro", "cash"], ["debito", "Débito", "wallet"],
  ["credito", "Crédito", "wallet"], ["boleto", "Boleto", "receipt"], ["transferencia", "Transferência", "transfer"]];
async function _bandeirasCarregar(forcar) {
  if (State.bandeiras && !forcar) return State.bandeiras;
  try { State.bandeiras = await api("/api/bandeiras"); } catch { State.bandeiras = State.bandeiras || {}; }
  return State.bandeiras;
}
const _bandImg = k => (State.bandeiras || {})[k] || null;

function _bandCard() {
  return `<div class="card card-pad" id="band-card" style="margin-bottom:16px">
    <div class="card-h"><span class="card-ico i-navy">${icon("wallet")}</span>
      <div class="grow"><h3>Imagens das bandeiras e do Pix</h3>
        <div class="sub">Envie a imagem de cada bandeira. Dá para recortar e tirar o fundo aqui mesmo. Aparecem nos cartões e nos pagamentos.</div></div></div>
    <div class="band-grade" id="band-grade"><div class="sub">Carregando...</div></div>
    <input type="file" id="band-arq" accept="image/png,image/jpeg,image/webp" hidden onchange="_bandArquivo(this)">
  </div>`;
}
async function _bandGrade() {
  const g = document.getElementById("band-grade"); if (!g) return;
  await _bandeirasCarregar(true);
  g.innerHTML = BAND_LISTA.map(([k, n]) => {
    const img = _bandImg(k);
    return `<div class="band-item${img ? " tem" : ""}">
      <div class="band-prev xadrez">${img ? `<img src="${img}" alt="${esc(n)}">` : `<span>${esc(n)}</span>`}</div>
      <b>${esc(n)}</b>
      <div class="band-bts">
        <button class="btn btn-ghost btn-sm" onclick="_bandEscolher('${k}')">${icon(img ? "edit" : "plus")}${img ? "Trocar" : "Enviar"}</button>
        ${img ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" title="Remover" onclick="_bandRemover('${k}')">${icon("trash")}</button>` : ""}
      </div></div>`;
  }).join("");
}
function _bandEscolher(k) { window._bandChave = k; const i = document.getElementById("band-arq"); i.value = ""; i.click(); }
async function _bandRemover(k) {
  const n = (BAND_LISTA.find(b => b[0] === k) || [])[1];
  if (!(await confirmar({ tipo: "perigo", figura: "lixeira", titulo: `Remover a imagem de ${n}?`, ok: "Remover",
    texto: "No lugar dela volta a aparecer o nome escrito." }))) return;
  try { await api(`/api/bandeiras/${k}`, { method: "PUT", body: JSON.stringify({ imagem: null }) }); toast("Imagem removida", "ok"); _bandGrade(); }
  catch (e) { toast(e.message, "err"); }
}
function _bandArquivo(inp) {
  const f = inp.files?.[0]; if (!f) return;
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast("Use uma imagem PNG, JPG ou WEBP.", "err");
  const img = new Image();
  img.onload = () => _recorteAbrir(img, window._bandChave);
  img.onerror = () => toast("Não consegui abrir essa imagem.", "err");
  img.src = URL.createObjectURL(f);
}

/* ferramenta de recorte: arraste para escolher a área; tira o fundo pela cor dos cantos */
let _RC = null;
function _recorteAbrir(img, chave) {
  const nome = (BAND_LISTA.find(b => b[0] === chave) || [])[1] || chave;
  _RC = { img, chave, sel: null, fundo: true, tol: 30 };
  abrirModal(`
    <div class="modal" style="max-width:720px">
      <div class="modal-h"><span class="card-ico i-navy">${icon("edit")}</span><h3>Recortar: ${esc(nome)}</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button></div>
      <div class="modal-b">
        <div class="rc-dica">${icon("target")}<span>Arraste sobre a imagem para marcar só a parte de <b>${esc(nome)}</b>. Sem marcar, usa a imagem inteira.</span></div>
        <div class="rc-area"><canvas id="rc-tela"></canvas></div>
        <div class="rc-ctrl">
          <label class="rc-fundo"><input type="checkbox" id="rc-fundo" checked onchange="_RC.fundo=this.checked;_recortePrev()"> Tirar o fundo (deixar transparente)</label>
          <label class="rc-tol">Sensibilidade <input type="range" id="rc-tol" min="5" max="90" value="30" oninput="_RC.tol=+this.value;_recortePrev()"></label>
          <button type="button" class="btn btn-ghost btn-sm" onclick="_RC.sel=null;_recorteDesenhar();_recortePrev()">Imagem inteira</button>
        </div>
        <div class="rc-res"><span>Resultado</span><div class="xadrez rc-prev-box"><canvas id="rc-prev"></canvas></div><small id="rc-info"></small></div>
      </div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="_recorteSalvar()">${icon("check")}Salvar imagem</button>
      </div>
    </div>`, "lg");
  const cv = document.getElementById("rc-tela");
  const larg = Math.min(660, cv.parentElement.clientWidth || 660);
  _RC.esc = larg / img.naturalWidth;
  cv.width = Math.round(img.naturalWidth * _RC.esc); cv.height = Math.round(img.naturalHeight * _RC.esc);
  let ini = null;
  const pos = e => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(cv.width, (e.clientX - r.left) * cv.width / r.width)), Math.max(0, Math.min(cv.height, (e.clientY - r.top) * cv.height / r.height))]; };
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); ini = pos(e); _RC.sel = null; };
  cv.onpointermove = e => { if (!ini) return; const p = pos(e);
    _RC.sel = [Math.min(ini[0], p[0]), Math.min(ini[1], p[1]), Math.abs(p[0] - ini[0]), Math.abs(p[1] - ini[1])]; _recorteDesenhar(); };
  cv.onpointerup = () => { ini = null; if (_RC.sel && (_RC.sel[2] < 6 || _RC.sel[3] < 6)) _RC.sel = null; _recorteDesenhar(); _recortePrev(); };
  _recorteDesenhar(); _recortePrev();
}
function _recorteDesenhar() {
  const cv = document.getElementById("rc-tela"); if (!cv) return;
  const c = cv.getContext("2d"); c.clearRect(0, 0, cv.width, cv.height); c.drawImage(_RC.img, 0, 0, cv.width, cv.height);
  if (!_RC.sel) return;
  const [x, y, w, h] = _RC.sel;
  c.fillStyle = "rgba(6,22,42,.55)";
  c.fillRect(0, 0, cv.width, y); c.fillRect(0, y + h, cv.width, cv.height - y - h); c.fillRect(0, y, x, h); c.fillRect(x + w, y, cv.width - x - w, h);
  c.setLineDash([6, 4]); c.lineWidth = 2; c.strokeStyle = "#E9B84E"; c.strokeRect(x + 1, y + 1, w - 2, h - 2); c.setLineDash([]);
}
/* Tira o fundo ligado às bordas (como o balde de tinta). d = ImageData já lido do contexto c. */
function _fundoTransparente(c, w, h, tol, d) {
  d = d || c.getImageData(0, 0, w, h);
  const px = d.data;
  const canto = (x, y) => { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
  const cs = [canto(0, 0), canto(w - 1, 0), canto(0, h - 1), canto(w - 1, h - 1)];
  const bg = [0, 1, 2].map(j => cs.map(q => q[j]).sort((a, b) => a - b)[1] / 2 + cs.map(q => q[j]).sort((a, b) => a - b)[2] / 2);
  const N = w * h;
  const dist = p => Math.hypot(px[p * 4] - bg[0], px[p * 4 + 1] - bg[1], px[p * 4 + 2] - bg[2]);
  // como o balde de tinta: só o fundo LIGADO às bordas some; partes claras de dentro do desenho ficam
  const fora = new Uint8Array(N), fila = new Int32Array(N); let ini = 0, fim = 0;
  const tenta = p => { if (!fora[p] && dist(p) < tol) { fora[p] = 1; fila[fim++] = p; } };
  for (let x = 0; x < w; x++) { tenta(x); tenta((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { tenta(y * w); tenta(y * w + w - 1); }
  while (ini < fim) {
    const p = fila[ini++], x = p % w;
    if (x > 0) tenta(p - 1); if (x < w - 1) tenta(p + 1); if (p >= w) tenta(p - w); if (p < N - w) tenta(p + w);
  }
  for (let p = 0; p < N; p++) {
    if (fora[p]) { px[p * 4 + 3] = 0; continue; }
    const x = p % w, vizinho = (x > 0 && fora[p - 1]) || (x < w - 1 && fora[p + 1]) || (p >= w && fora[p - w]) || (p < N - w && fora[p + w]);
    const dd = dist(p);
    if (vizinho && dd < tol * 1.6) px[p * 4 + 3] = Math.round(px[p * 4 + 3] * Math.max(0, dd - tol) / (tol * .6));   // borda suave
  }
  c.putImageData(d, 0, 0);
}

/* Bandeira no cartão: fundo branco sai, e a bandeira se ajusta à cor do cartão
   como nos cartões de verdade: de uma cor só e sem contraste (Visa azul no cartão
   escuro) fica branca; colorida sem contraste ganha um selo branco; com contraste fica igual. */
const _SEM_FUNDO = new Map();
const _lumRGB = (r, g, b) => { const f = v => (v /= 255) <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
function _lumHex(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return .1; const n = parseInt(m[1], 16); return _lumRGB(n >> 16 & 255, n >> 8 & 255, n & 255); }
function _bandAnalise(px, w, h) {
  // cor média, luminância e se é "de uma cor só" (uma faixa de matiz domina)
  const faixas = {}; let n = 0, lum = 0, sat0 = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 140) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    n++; lum += _lumRGB(r, g, b);
    if (!mx || d / mx < .25) { sat0++; continue; }
    let hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const k = Math.round(((hh * 60 + 360) % 360) / 30) % 12; faixas[k] = (faixas[k] || 0) + 1;
  }
  if (!n) return { mono: true, lum: 1 };
  const coloridos = Object.values(faixas).reduce((a, b) => a + b, 0);
  const topo = Object.entries(faixas).sort((a, b) => b[1] - a[1])[0];
  // uma cor domina sozinha (o detalhe amarelo da Visa não conta; o vermelho + laranja da Master conta como duas)
  const mono = coloridos < n * .15 || (topo ? topo[1] : 0) / coloridos > .8;
  return { mono, lum: lum / n };
}
function _bandAjusta(img, info) {
  if (!info) return;
  if (info.fundo) { img.classList.add("com-fundo"); return; }
  const cc = getComputedStyle(img.closest(".cc") || document.body).getPropertyValue("--cc").trim();
  const lc = _lumHex(cc), lo = info.lum;
  const contraste = (Math.max(lc, lo) + .05) / (Math.min(lc, lo) + .05);
  img.classList.remove("branca", "selo");
  if (contraste < 2.6) img.classList.add(info.mono ? "branca" : "selo");
}
function _semFundo(img) {
  if (img.dataset.limpo) return;
  img.dataset.limpo = "1";
  const orig = img.getAttribute("src");
  const usa = info => { if (info?.src && info.src !== orig) { img.dataset.limpo = "1"; img.src = info.src; } _bandAjusta(img, info); };
  if (_SEM_FUNDO.has(orig)) return usa(_SEM_FUNDO.get(orig));
  try {
    const w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) return;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const c = cv.getContext("2d", { willReadFrequently: true }); c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, w, h), px = d.data;
    const canto = (x, y) => { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2], px[i + 3]]; };
    const cs = [canto(0, 0), canto(w - 1, 0), canto(0, h - 1), canto(w - 1, h - 1)];
    let info;
    if (cs.every(q => q[3] < 20)) info = { src: orig, ..._bandAnalise(px, w, h) };                 // já transparente
    else if (cs.filter(q => q[3] > 200 && Math.min(q[0], q[1], q[2]) > 228).length < 3) info = { src: orig, fundo: true };  // fundo colorido de propósito
    else {
      const copia = new Uint8ClampedArray(px);
      _fundoTransparente(c, w, h, 34, d);
      let tirou = 0; for (let i = 3; i < px.length; i += 4) if (px[i] === 0 && copia[i] !== 0) tirou++;
      info = tirou / (w * h) > .9 ? { src: orig, fundo: true } : { src: cv.toDataURL("image/png"), ..._bandAnalise(px, w, h) };
    }
    _SEM_FUNDO.set(orig, info); usa(info);
  } catch { /* imagem de outro endereço: fica como está */ }
}
function _recorteProcessar() {
  const { img, sel, esc: k } = _RC;
  const [sx, sy, sw, sh] = sel ? sel.map(v => v / k) : [0, 0, img.naturalWidth, img.naturalHeight];
  const w = Math.max(1, Math.round(sw)), h = Math.max(1, Math.round(sh));
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const c = cv.getContext("2d"); c.imageSmoothingQuality = "high"; c.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h), px = d.data;
  if (_RC.fundo) _fundoTransparente(c, w, h, _RC.tol * 2.2, d);
  // corta as margens vazias
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return cv;
  const out = document.createElement("canvas"); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d").drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
function _recortePrev() {
  const r = _recorteProcessar(), p = document.getElementById("rc-prev"); if (!p) return;
  const k = Math.min(1, 300 / r.width, 110 / r.height);
  p.width = Math.max(1, Math.round(r.width * k)); p.height = Math.max(1, Math.round(r.height * k));
  const c = p.getContext("2d"); c.imageSmoothingQuality = "high"; c.drawImage(r, 0, 0, p.width, p.height);
  document.getElementById("rc-info").textContent = `${r.width} × ${r.height} pixels${r.width < 120 ? " · imagem pequena: uma foto maior fica mais nítida" : ""}`;
}
async function _recorteSalvar() {
  let r = _recorteProcessar();
  if (r.width > 800) { const k = 800 / r.width, o = document.createElement("canvas"); o.width = 800; o.height = Math.round(r.height * k);
    const c = o.getContext("2d"); c.imageSmoothingQuality = "high"; c.drawImage(r, 0, 0, o.width, o.height); r = o; }
  try {
    await api(`/api/bandeiras/${_RC.chave}`, { method: "PUT", body: JSON.stringify({ imagem: r.toDataURL("image/png") }) });
    fecharModal(); toast("Imagem salva", "ok"); vibrar(12); _bandGrade();
  } catch (e) { toast(e.message, "err"); }
}

/* forma de pagamento: escolhida ao dar baixa; selo nos lançamentos pagos */
function _formaChips(atual) {
  return `<div class="campo full"><label>Forma de pagamento</label><input type="hidden" id="b-forma" value="${esc(atual || "")}">
    <div class="forma-grade">${FORMAS_PAG.map(([k, n, ic]) => `<button type="button" class="forma-chip${atual === k ? " on" : ""}" data-f="${k}"
        onclick="document.getElementById('b-forma').value=this.classList.contains('on')?'':'${k}';document.querySelectorAll('.forma-chip').forEach(b=>b.classList.toggle('on',b===this&&document.getElementById('b-forma').value==='${k}'));vibrar(8)">
        ${_bandImg(k) ? `<img src="${_bandImg(k)}" alt="">` : icon(ic)}<span>${n}</span></button>`).join("")}</div></div>`;
}
function _formaSelo(l) {
  if (!l.data_pagamento || !l.forma_pagamento) return "";
  const f = FORMAS_PAG.find(x => x[0] === l.forma_pagamento); if (!f) return "";
  const img = _bandImg(f[0]);
  return `<span class="forma-selo" title="Pago com ${f[1]}">${img ? `<img src="${img}" alt="${f[1]}">` : `${icon(f[2])}${f[1]}`}</span>`;
}


/* ── Fatura do cartão (abre ao tocar no cartão) ── */
const _MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const _ST_FATURA = { aberta: ["Aberta", "#2F817A"], fechada: ["Fechada", "#C2742A"], paga: ["Paga", "#1F7A55"], atrasada: ["Atrasada", "#C9573F"], futura: ["Futura", "#5B6876"] };
let _FAT = null;
function _fatGestos(cid, ant, prox) {                       // deslizar o dedo no topo troca o mês
  const t = document.getElementById("fat-topo"); if (!t) return;
  let x0 = null;
  t.addEventListener("pointerdown", e => { if (!e.target.closest("button")) x0 = e.clientX; });
  t.addEventListener("pointerup", e => {
    if (x0 == null) return; const dx = e.clientX - x0; x0 = null;
    if (dx < -60 && prox) { vibrar(8); abrirFatura(cid, prox); } else if (dx > 60 && ant) { vibrar(8); abrirFatura(cid, ant); }
  });
}


/* ── Fatura do cartão em tela própria ── */
function abrirFatura(cid, mes) {
  State._fatura = { cid, mes: mes || null };
  vibrar(8);
  if (State.view === "fatura") return setView("fatura", { silencioso: true });
  return setView("fatura");
}
function _voltarTela() {
  const ant = _PILHA_TELAS.pop() || "compras";
  _naVolta = true; setView(ant); _naVolta = false;
}
async function viewFatura(v) {
  const sel = State._fatura || {};
  const cartoes = await api("/api/contas/cartoes").catch(() => []);
  if (!sel.cid) {
    if (!cartoes.length) {
      v.innerHTML = `<div class="empty" style="padding:50px">${ilus("wallet")}<p>Nenhum cartão de crédito cadastrado.</p>
        <button class="btn btn-primary" onclick="formConta({tipo:'cartao'})">${icon("plus")}Adicionar cartão</button></div>`;
      return;
    }
    sel.cid = cartoes[0].id; State._fatura = sel;
  }
  if (!Object.keys(_CACHE.contas || {}).length) { try { (await api("/api/contas")).forEach(c => _CACHE.contas[c.id] = c); } catch {} }
  const f = await api(`/api/contas/${sel.cid}/fatura${sel.mes ? `?mes=${sel.mes}` : ""}`);
  _FAT = f;
  const [a, m] = f.mes.split("-").map(Number);
  const k = f.meses.indexOf(f.mes), ant = f.meses[k - 1], prox = f.meses[k + 1];
  const st = _ST_FATURA[f.status] || _ST_FATURA.aberta;
  const cor = _corOk(f.cartao.cor, "#305C74");
  const resumo = cartoes.find(c => c.id === f.cartao.id) || {};
  const pago = Math.round((f.total - f.em_aberto) * 100) / 100;
  // agrupado por data
  const grupos = [];
  for (const it of f.itens) { const g = it.data || ""; if (!grupos.length || grupos.at(-1).k !== g) grupos.push({ k: g, itens: [] }); grupos.at(-1).itens.push(it); }
  const linha = it => {
    const cat = (State.cats || []).find(c => c.id === it.categoria_id);
    return `<div class="fat-item${it.pago ? " pago" : ""}${it.contato_logo ? " pinta-logo" : ""}" style="--cat:${_corOk(cat?.cor, "#7E8C9A")}">
      ${it.contato_nome ? `<span class="fat-ic fat-logo">${avatarLogo(it.contato_logo, it.contato_nome, 34)}</span>` : `<span class="fat-ic">${icon(it.tipo === "parcela" ? "wallet" : (cat?.icone || "receipt"))}</span>`}
      <div class="fat-txt"><b>${esc(it.descricao)}</b><small>${it.parcela ? `<span class="fat-parc">Parcela ${it.parcela}</span>` : "À vista"}${cat ? ` · ${esc(cat.nome)}` : ""}${it.local && it.local !== it.descricao ? ` · ${esc(it.local)}` : ""}</small></div>
      <span class="fat-val mono-num">${money(it.valor)}</span>${it.pago ? `<span class="fat-ok" title="Pago">${icon("check")}</span>` : ""}
    </div>`;
  };
  // por categoria
  const porCat = {};
  f.itens.forEach(it => { porCat[it.categoria_id || 0] = (porCat[it.categoria_id || 0] || 0) + it.valor; });
  const cats = Object.entries(porCat).map(([id, val]) => ({ cat: (State.cats || []).find(c => c.id === +id), val })).sort((x, y) => y.val - x.val);
  // histórico dos meses (barras clicáveis)
  const hist = f.historico || [];
  const maxH = Math.max(1, ...hist.map(h => h.total));
  const contas = Object.values(_CACHE.contas || {}).filter(c => c.tipo !== "cartao");
  v.innerHTML = `
    <div class="fv" style="--cc:${cor}">
      <div class="fv-volta">
        <button class="btn btn-ghost btn-sm" onclick="_voltarTela()">‹ Voltar</button>
        ${cartoes.length > 1 ? `<div class="fv-cartoes">${cartoes.map(c => `<button class="fv-cc${c.id === f.cartao.id ? " on" : ""}" style="--c:${_corOk(c.cor, "#305C74")}"
            onclick="abrirFatura(${c.id})"><i></i>${esc(c.nome)}</button>`).join("")}</div>` : ""}
      </div>
      <div class="fv-topo" id="fat-topo">
        <div class="fv-cartao">${cartaoVisual({ ...f.cartao, ...resumo }, { semVerso: true })}</div>
        <div class="fv-resumo">
          <div class="fat-nav">
            <button class="fat-seta" ${ant ? `onclick="abrirFatura(${f.cartao.id},'${ant}')"` : "disabled"} aria-label="Fatura anterior">‹</button>
            <div class="fat-mes"><small>Fatura de</small><b>${_MESES_LONGOS[m - 1]} ${a}</b></div>
            <button class="fat-seta" ${prox ? `onclick="abrirFatura(${f.cartao.id},'${prox}')"` : "disabled"} aria-label="Próxima fatura">›</button>
            <span class="fat-st" style="--sc:${st[1]}">${st[0]}</span>
          </div>
          <div class="fat-total mono-num">${money(f.total)}</div>
          <div class="fat-datas">${icon("calendar")}vence ${dataBR(f.vencimento)} · fecha ${dataBR(f.fechamento)}</div>
          <div class="fv-numeros">
            <div><small>Em aberto</small><b class="mono-num">${money(f.em_aberto)}</b></div>
            <div><small>Já pago</small><b class="mono-num">${money(pago)}</b></div>
            ${resumo.limite != null ? `<div><small>Limite disponível</small><b class="mono-num">${money(resumo.disponivel ?? resumo.limite)}</b></div>` : ""}
          </div>
        </div>
      </div>
      ${hist.length > 1 ? `<div class="card card-pad fv-hist">
        <div class="fv-hist-tit">Faturas mês a mês <small>toque numa barra para abrir</small></div>
        <div class="fv-barras">${hist.map(h => { const [ha, hm] = h.mes.split("-").map(Number);
          return `<button class="fv-barra${h.mes === f.mes ? " on" : ""}${h.mes === f.atual ? " atual" : ""}" onclick="abrirFatura(${f.cartao.id},'${h.mes}')" title="${_MESES_LONGOS[hm - 1]} ${ha}: ${money(h.total)}">
            <span class="fv-b-val mono-num">${h.total ? money0(h.total) : ""}</span>
            <span class="fv-b-col"><i style="height:${Math.max(4, h.total / maxH * 100)}%"></i>${h.em_aberto && h.em_aberto < h.total ? `<em style="height:${h.em_aberto / maxH * 100}%"></em>` : ""}</span>
            <span class="fv-b-mes">${_MESES_LONGOS[hm - 1].slice(0, 3)}${ha !== new Date().getFullYear() ? `/${String(ha).slice(2)}` : ""}</span></button>`; }).join("")}</div>
      </div>` : ""}
      <div class="fv-grade">
        <div class="card card-pad fv-itens">
          <div class="card-h"><span class="card-ico i-navy">${icon("receipt")}</span><div class="grow"><h3>Compras da fatura</h3>
            <div class="sub">${f.itens.length} item(ns)${f.itens.some(i => i.parcela) ? " · inclui parcelas" : ""}</div></div></div>
          ${f.itens.length ? grupos.map(g => `<div class="fat-dia">${g.k ? _rotDia(g.k) : "Sem data"}</div>${g.itens.map(linha).join("")}`).join("")
            : `<div class="empty" style="padding:24px">${ilus("wallet")}<p>Nenhuma compra nesta fatura.</p></div>`}
        </div>
        <div class="fv-lado">
          <div class="card card-pad fv-pagar" id="fat-pe">
            ${f.status === "paga" ? `<div class="fat-paga grande">${icon("checkCircle")}<span><b>Fatura paga</b><small>Tudo certo com ${_MESES_LONGOS[m - 1].toLowerCase()}.</small></span></div>`
              : f.em_aberto > 0 && f.status !== "futura" ? `
                <div class="fat-falta"><small>Para pagar</small><b class="mono-num">${money(f.em_aberto)}</b></div>
                <label class="fv-campo">Pagar com<select id="fat-conta">${contas.map(c => `<option value="${c.id}">${esc(c.nome)} · ${money(c.saldo_atual || 0)}</option>`).join("")}</select></label>
                <label class="fv-campo">Data do pagamento<input type="date" id="fat-data" value="${hojeISO()}"></label>
                <button class="btn btn-primary fv-pagar-bt" onclick="_fatPagar()">${icon("check")}Pagar fatura</button>
                <small class="campo-dica">O valor sai da conta escolhida e as compras ficam pagas.</small>`
              : `<div class="fat-futura grande">${icon("clock")}<span><b>Fatura ainda aberta para compras</b><small>Ela fecha em ${dataBR(f.fechamento)}.</small></span></div>`}
          </div>
          ${cats.length ? `<div class="card card-pad">
            <div class="card-h"><span class="card-ico i-gold">${icon("pie")}</span><div class="grow"><h3>Por categoria</h3></div></div>
            ${cats.map(({ cat, val }) => `<div class="fv-cat" style="--cat:${_corOk(cat?.cor, "#7E8C9A")}">
                <span class="fv-cat-nome"><i></i>${esc(cat?.nome || "Sem categoria")}</span><b class="mono-num">${money(val)}</b>
                <span class="fv-cat-barra"><em style="width:${Math.round(val / (f.total || 1) * 100)}%"></em></span></div>`).join("")}
          </div>` : ""}
        </div>
      </div>
    </div>`;
  _fatGestos(f.cartao.id, ant, prox);
  _pintarPorLogo(v);
}
async function _fatPagar() {
  const cid = _FAT.cartao.id, mes = _FAT.mes;
  try {
    await api(`/api/contas/${cid}/fatura/pagar`, { method: "POST", body: JSON.stringify({ mes, conta_id: +$("#fat-conta").value, data: $("#fat-data").value || null }) });
    celebrar("Fatura paga!");
    try { (await api("/api/contas")).forEach(c => _CACHE.contas[c.id] = c); } catch {}
    State._fatura = { cid, mes }; await setView("fatura", { silencioso: true }); atualizarBadge?.();
  } catch (e) { toast(e.message, "err"); }
}

/* ══════════════════════════════════════════════════════════════
   WhatsApp desenhado + mais interações
   ══════════════════════════════════════════════════════════════ */

/* Balão verde com o telefone: desenho próprio, colorido, em qualquer tamanho.
   tam = null: o tamanho vem do CSS (igual aos outros ícones). */
let _waSeq = 0;
function waDesenho(tam = null, cls = "") {
  const g = "wag" + (++_waSeq);
  const dim = tam ? ` width="${tam}" height="${tam}"` : "";
  return `<svg class="wa-desenho ${cls}" viewBox="0 0 48 48"${dim} aria-hidden="true">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6CF59C"/><stop offset=".5" stop-color="#25D366"/><stop offset="1" stop-color="#0B8F6A"/></linearGradient></defs>
    <path class="wa-balao" d="M24 3.5C12.7 3.5 3.6 12.3 3.6 23.2c0 3.9 1.2 7.5 3.2 10.6L4.3 43.6l10.2-2.7c2.8 1.5 6.1 2.4 9.5 2.4 11.3 0 20.4-8.8 20.4-19.9S35.3 3.5 24 3.5z" fill="url(#${g})"/>
    <ellipse cx="16" cy="12.5" rx="8.5" ry="3.6" fill="#fff" opacity=".28" transform="rotate(-28 16 12.5)"/>
    <g class="wa-fone" transform="translate(24.4 23.2) scale(1.32) translate(-12.2 -12.1)">
      <path fill="#fff" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
    </g>
  </svg>`;
}
const _WA_TICKS = `<svg viewBox="0 0 26 16" width="20" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8.5l4 4L14 3"/><path d="M10 12.5L20.5 3"/></svg>`;

/* Todo ícone "whatsapp" do sistema (menu, telas, configurações) vira o desenho colorido */
const _iconTraco = icon;
icon = function (name, cls = "") { return name === "whatsapp" ? waDesenho(null, cls) : _iconTraco(name, cls); };

/* Botão verde do WhatsApp: balão que balança enquanto envia e ✓✓ azuis quando chega */
function btnWA(rotulo, acao, extra = "") {
  return `<button class="btn btn-wa" onclick="${acao}" ${extra}><span class="wa-ic">${waDesenho()}</span><span class="wa-rot">${rotulo}</span><span class="wa-ticks">${_WA_TICKS}</span></button>`;
}
async function _waBotao(btn, fn) {
  if (!btn) return fn();
  if (btn.classList.contains("enviando")) return false;
  btn.classList.remove("enviado", "falhou"); btn.classList.add("enviando");
  let ok = false;
  try { ok = await fn(); }
  finally {
    btn.classList.remove("enviando");
    btn.classList.add(ok ? "enviado" : "falhou");
    if (ok) { vibrar(14); _waVoo(btn); } else vibrar(40);
    clearTimeout(btn._waT); btn._waT = setTimeout(() => btn.classList.remove("enviado", "falhou"), 2800);
  }
  return ok;
}
/* Balãozinho voando do botão para o canto da tela */
function _waVoo(el) {
  if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = el.getBoundingClientRect();
  const b = document.createElement("div"); b.className = "wa-voo"; b.innerHTML = waDesenho(30);
  b.style.left = (r.left + r.width / 2 - 15) + "px"; b.style.top = (r.top + r.height / 2 - 15) + "px";
  document.body.appendChild(b);
  const dx = innerWidth - 60 - (r.left + r.width / 2), dy = 40 - (r.top + r.height / 2);
  b.animate([
    { transform: "translate(0,0) scale(.6) rotate(0)", opacity: 0 },
    { transform: `translate(${dx * .25}px,${dy * .25 - 40}px) scale(1.15) rotate(-14deg)`, opacity: 1, offset: .3 },
    { transform: `translate(${dx}px,${dy}px) scale(.4) rotate(12deg)`, opacity: 0 },
  ], { duration: 900, easing: "cubic-bezier(.3,.7,.4,1)" }).onfinish = () => b.remove();
}

/* Manda resumos e relatórios para o grupo direto do app.
   O servidor responde na hora (✓ cinza: indo para o grupo) e o envio segue por trás;
   quando o gateway confirma, vira ✓✓ azul. Ninguém fica olhando um botão girando. */
async function _waAcompanhar(r, btn) {
  if (btn) { btn.classList.remove("enviando", "enviado", "falhou"); btn.classList.add("fila"); clearTimeout(btn._waT); }
  toast(`${r.nome || "Mensagem"}: indo para o grupo`, "wa-fila");
  const fim = Date.now() + 45000;
  while (Date.now() < fim) {
    await new Promise(ok => setTimeout(ok, 700));
    let st; try { st = await api(`/api/whatsapp/envio/${r.id}`); } catch { break; }
    if (st.status === "ok") {
      if (btn) { btn.classList.remove("fila"); btn.classList.add("enviado"); _waVoo(btn); btn._waT = setTimeout(() => btn.classList.remove("enviado"), 3000); }
      vibrar(14); toast(`${r.nome || "Mensagem"}: chegou no grupo`, "wa"); return true;
    }
    if (st.status === "erro") {
      if (btn) { btn.classList.remove("fila"); btn.classList.add("falhou"); btn._waT = setTimeout(() => btn.classList.remove("falhou"), 2000); }
      vibrar(40); toast(st.motivo || "Não foi enviado.", "err"); return false;
    }
  }
  btn?.classList.remove("fila");
  toast("O WhatsApp está demorando: a mensagem segue sendo enviada, confira no grupo.", "warn");
  return false;
}
async function _waDisparar(url, btn) {
  if (btn && (btn.classList.contains("fila") || btn.classList.contains("enviando"))) return false;
  btn?.classList.add("enviando");
  try {
    const r = await api(url, { method: "POST" });
    btn?.classList.remove("enviando");
    if (!r.enviado) { toast(r.motivo || "Não foi enviado.", "warn"); btn?.classList.add("falhou"); setTimeout(() => btn?.classList.remove("falhou"), 1500); return false; }
    return _waAcompanhar(r, btn);
  } catch (e) { btn?.classList.remove("enviando"); toast(e.message, "err"); return false; }
}
function waEnviar(oque, btn) { return _waDisparar(`/api/whatsapp/enviar/${oque}`, btn); }

/* Folha "Mandar no WhatsApp" (atalho do painel) */
const _ZAP_OPCOES = [
  ["resumo", "Resumo do mês", "chart", "#1F6F5C", "#3EC28F"],
  ["vencer", "A vencer", "clock", "#8A6D1E", "#E2C46E"],
  ["saldo", "Saldos", "wallet", "#24507A", "#4F8BC9"],
  ["pagar", "A pagar", "arrowUp", "#A2412F", "#E07A5F"],
  ["receber", "A receber", "arrowDown", "#1C6E8C", "#38A3C9"],
  ["gastos", "Gastos", "pie", "#A0285F", "#E35D9A"],
  ["metas", "Metas", "target", "#5B3FA0", "#8B6BD8"],
  ["projecao", "Projeção", "trendUp", "#3F3D9E", "#7C7AE6"],
  ["balancete", "Balancete PDF", "doc", "#B35C1E", "#F0A04B"],
  ["patrimonio", "Patrimônio PDF", "bank", "#2F5D50", "#4E9C84"],
];
function abrirZap() {
  document.getElementById("menu-lanc")?.remove();
  const el = document.createElement("div"); el.id = "menu-lanc"; el.className = "folha folha-zap";
  el.innerHTML = `
    <div class="folha-fundo" onclick="_folhaFechar()"></div>
    <div class="folha-caixa">
      <div class="folha-alca"></div>
      <div class="zap-cab">
        <span class="zap-logo"><i class="wa-onda"></i><i class="wa-onda o2"></i>${waDesenho(36)}</span>
        <div class="folha-tit"><b>Mandar no WhatsApp</b><small>Vai direto para o grupo da família. Toque e pronto.</small></div>
      </div>
      <div class="folha-grade">
        ${_ZAP_OPCOES.map(([k, rot, ic, c1, c2], i) => `<button class="folha-bt zap-bt" style="--c1:${c1};--c2:${c2};--i:${i}" onclick="waEnviar('${k}', this)">
            <span class="folha-bt-ic">${icon(ic)}<span class="zap-mini">${waDesenho()}</span><span class="zap-ok">${_WA_TICKS}</span></span><span>${rot}</span></button>`).join("")}
      </div>
      <button class="btn btn-ghost zap-config" onclick="_folhaFechar();setView('whatsapp')">${icon("cog")}Configurar o WhatsApp</button>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("aberta"));
  _DLG_ATUAL_FOLHA = true; vibrar(10);
}

/* Contatos: abrir conversa e lembrar de valor em aberto */
function _waNumero(tel) {
  let d = String(tel || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d.length >= 12 && d.length <= 13 ? d : "";
}
function _waLink(tel, texto = "") {
  const n = _waNumero(tel);
  return n ? `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ""}` : "";
}
function _waContatoBotoes(c, r) {
  if (!_waNumero(c.telefone)) return "";
  const nome = esc((c.nome || "").split(" ")[0]);
  const aberto = c.tipo === "cliente" ? Number(r?.a_receber || 0) : 0;
  const msg = `Olá ${(c.nome || "").split(" ")[0]}, tudo bem? Passando para lembrar do valor de ${money(aberto)} em aberto. Qualquer dúvida, me chama!`;
  return `<div class="wa-contato">
    <a class="btn btn-wa btn-sm" href="${esc(_waLink(c.telefone))}" target="_blank" rel="noopener"><span class="wa-ic">${waDesenho()}</span>Conversar com ${nome}</a>
    ${aberto > 0 ? `<a class="btn btn-wa-claro btn-sm" href="${esc(_waLink(c.telefone, msg))}" target="_blank" rel="noopener"><span class="wa-ic">${waDesenho()}</span>Lembrar ${money(aberto)}</a>` : ""}
  </div>`;
}

/* Brilho que segue o mouse nos cards (só com mouse; no toque não faz nada) */
document.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "mouse") return;
  const c = e.target.closest?.(".card, .kpi, .atalho");
  if (!c) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty("--mx", (e.clientX - r.left) + "px");
  c.style.setProperty("--my", (e.clientY - r.top) + "px");
}, { passive: true });

/* Ondinha também nos botões claros */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-ghost");
  if (!btn || btn.classList.contains("btn-icon")) return;
  const r = document.createElement("span"); r.className = "ripple";
  const rect = btn.getBoundingClientRect(); const size = Math.max(rect.width, rect.height) * 1.5;
  r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
  btn.appendChild(r); r.addEventListener("animationend", () => r.remove());
});
