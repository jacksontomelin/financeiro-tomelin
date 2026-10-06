/* Tomelin Gestão Financeira · Configurações e família.
   Arquivo 8 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ============================================================
   VIEW: FAMÍLIA (usuários com emoji e cor)
   ============================================================ */
// Avatares dos membros: o banco guarda só o nome, o desenho é feito aqui (SVG, sem emoji).
const AVATARES = {
  pessoa:   ["Pessoa",   "<circle cx='12' cy='8' r='3.5'/><path d='M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6'/>"],
  homem:    ["Homem",    "<circle cx='12' cy='8' r='3.5'/><path d='M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6'/><path d='M12 14l-1.2 2.2L12 20l1.2-3.8z'/>"],
  mulher:   ["Mulher",   "<circle cx='12' cy='8' r='3.5'/><path d='M8.5 8v6M15.5 8v6'/><path d='M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6'/>"],
  menino:   ["Menino",   "<circle cx='12' cy='10' r='3'/><path d='M8.8 8.6a3.2 3.2 0 0 1 6.4 0'/><path d='M15 8.6h2.6'/><path d='M6 20c0-3.3 2.7-5 6-5s6 1.7 6 5'/>"],
  menina:   ["Menina",   "<circle cx='12' cy='10.5' r='3'/><path d='M12 7.2L9 5v3.4zM12 7.2L15 5v3.4z'/><path d='M6 20c0-3.3 2.7-5 6-5s6 1.7 6 5'/>"],
  idoso:    ["Idoso",    "<circle cx='12' cy='8' r='3.5'/><circle cx='10.5' cy='8' r='.9'/><circle cx='13.5' cy='8' r='.9'/><path d='M11.4 8h1.2'/><path d='M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6'/>"],
  idosa:    ["Idosa",    "<circle cx='12' cy='9.2' r='3.2'/><circle cx='12' cy='4.3' r='1.8'/><path d='M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6'/>"],
  coroa:    ["Coroa",    "<path d='M4 18h16l1-9-5 4-4-7-4 7-5-4z'/><path d='M4 21h16'/>"],
  casa:     ["Casa",     "<path d='M3 11l9-8 9 8'/><path d='M5 10v10h14V10'/><path d='M10 20v-6h4v6'/>"],
  maleta:   ["Maleta",   "<rect x='3' y='7' width='18' height='13' rx='2'/><path d='M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'/><path d='M3 13h18'/>"],
  estrela:  ["Estrela",  "<polygon points='12 2 15.1 8.6 22 9.3 16.9 14 18.2 21 12 17.5 5.8 21 7.1 14 2 9.3 8.9 8.6'/>"],
  coracao:  ["Coração",  "<path d='M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z'/>"],
  sol:      ["Sol",      "<circle cx='12' cy='12' r='4'/><path d='M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'/>"],
  lua:      ["Lua",      "<path d='M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'/>"],
  raio:     ["Raio",     "<polygon points='13 2 4 14 11 14 10 22 20 9 13 9'/>"],
  folha:    ["Folha",    "<path d='M5 19C5 10 10 5 20 4c0 10-5 15-14 15z'/><path d='M5 19c2-4 5-7 9-9'/>"],
  pata:     ["Patinha",  "<ellipse cx='12' cy='16.5' rx='4.5' ry='3.5'/><circle cx='6' cy='10.5' r='1.8'/><circle cx='10' cy='6.5' r='1.8'/><circle cx='14' cy='6.5' r='1.8'/><circle cx='18' cy='10.5' r='1.8'/>"],
  carro:    ["Carro",    "<path d='M4 16v-4l2-5h12l2 5v4'/><path d='M4 12h16'/><circle cx='7.5' cy='16.5' r='1.8'/><circle cx='16.5' cy='16.5' r='1.8'/>"],
  livro:    ["Livro",    "<path d='M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z'/><path d='M4 19V5'/><path d='M8 7h8'/>"],
  alvo:     ["Alvo",     "<circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='5'/><circle cx='12' cy='12' r='1.2'/>"],
  foguete:  ["Foguete",  "<path d='M12 2c4 2 6 6 6 10l-3 3H9l-3-3c0-4 2-8 6-10z'/><circle cx='12' cy='9' r='1.6'/><path d='M9 15l-2 5 3-1.5M15 15l2 5-3-1.5'/>"],
  diamante: ["Diamante", "<path d='M6 3h12l4 6-10 12L2 9z'/><path d='M2 9h20'/>"],
  escudo:   ["Escudo",   "<path d='M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'/>"],
  chave:    ["Chave",    "<circle cx='8' cy='15' r='4'/><path d='M11 12l9-9M17 6l3 3M15 8l2 2'/>"],
};
function avatarSVG(chave, tam = 28) {
  const a = AVATARES[chave] || AVATARES.pessoa;
  return `<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${a[1]}</svg>`;
}
const corSegura = c => /^#[0-9a-fA-F]{6}$/.test(c || "") ? c : "#305C74";
const CORES_FAM  = ['#082D51', '#2F817A', '#C9A94E', '#B4503E', '#305C74', '#3E9079', '#38648A', '#256B64', '#5E9B86', '#7F3F98', '#E67E22', '#2ECC71'];
let FORM_AV = "pessoa", FORM_COR = "#305C74";

let _FAM = { admin: false, meuId: null };

async function viewUsuarios(v) {
  const [us, eu] = await Promise.all([api("/api/usuarios"), api("/api/auth/eu").catch(() => ({}))]);
  const meuId = eu.id ?? State.uid;
  if (eu.id) State.uid = eu.id;
  _FAM = { admin: eu.papel === "admin", meuId };
  us.forEach(u => _CACHE.usuarios[u.id] = u);
  v.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 style="margin:0;color:var(--navy)">Família Tomelin</h2>
        <div class="sub">Quem tem acesso ao sistema</div>
      </div>
      <div class="grow"></div>
      ${_FAM.admin ? `<button class="btn btn-primary" onclick="formUsuario(null)">${icon("users")}Novo membro</button>` : ""}
    </div>
    <div class="familia-grid">
      ${us.map(u => {
        const sou = u.id === meuId;
        return `
        <div class="familia-card${u.ativo === false ? " inativo" : ""}">
          <div class="familia-avatar" style="background:${corSegura(u.cor)}">${avatarSVG(u.emoji, 30)}</div>
          <div class="familia-nome">${esc(u.nome)}${sou ? ' <span class="fam-voce">você</span>' : ""}</div>
          <div class="familia-email">${esc(u.email)}</div>
          <div class="fam-tags">
            <span class="familia-papel ${u.papel === "admin" ? "admin" : "membro"}">${u.papel === "admin" ? "Admin" : "Membro"}</span>
            ${u.ativo === false ? '<span class="familia-papel bloq">Sem acesso</span>' : ""}
          </div>
          <div class="familia-acesso">${u.ultimo_acesso
            ? "Último acesso: " + new Date(u.ultimo_acesso).toLocaleDateString("pt-BR")
            : "Nunca acessou"}</div>
          <div class="card-actions">
            ${_FAM.admin || sou ? `<button class="btn btn-ghost btn-sm" onclick="_editarUsuario(${u.id})">${icon("edit")}Editar</button>` : ""}
            ${_FAM.admin && !sou ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="excluirUsuario(${u.id})">Excluir</button>` : ""}
          </div>
        </div>`;
      }).join("")}
    </div>
    <div class="dica azul" style="margin-top:16px">
      ${icon("shield")}<div><b>Como funciona:</b> cada membro entra com o próprio e-mail e senha. O <b>Admin</b> cadastra, edita e remove membros; o <b>Membro</b> só edita o próprio perfil. Sempre fica pelo menos um admin com acesso.</div>
    </div>
    <div class="card card-pad" id="atividade" style="margin-top:16px"><div class="sub">Carregando atividade...</div></div>`;
  setTimeout(_atividadeCarregar, 0);
}

function formUsuario(u) {
  const e = u || {};
  const novo = !u;
  const sou = !novo && u.id === _FAM.meuId;
  const travado = !_FAM.admin;                      // membro editando o próprio perfil
  FORM_AV  = AVATARES[e.emoji] ? e.emoji : "pessoa";
  FORM_COR = corSegura(e.cor);
  abrirModal(`
    <div class="modal" style="max-width:540px">
      <div class="modal-h">
        <span class="card-ico i-navy">${icon("users")}</span>
        <h3>${novo ? "Novo membro da família" : (sou ? "Meu perfil" : "Editar membro")}</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b">
        <div class="av-topo">
          <div id="fam-av-prev" class="familia-avatar av-grande" style="background:${FORM_COR}">${avatarSVG(FORM_AV, 38)}</div>
          <div style="min-width:0">
            <div class="av-topo-nome" id="fam-av-nome">${esc(e.nome || "Novo membro")}</div>
            <div class="sub">Assim aparece na lista da família</div>
          </div>
        </div>
        <div class="frm">
          <div class="campo full">
            <label>Ícone <span class="av-nome" id="av-nome">${AVATARES[FORM_AV][0]}</span></label>
            <div class="av-grid" id="av-grid">
              ${Object.entries(AVATARES).map(([k, a]) => `<button type="button" class="av-opt${k === FORM_AV ? " sel" : ""}" data-av="${k}" title="${a[0]}" aria-label="${a[0]}" onclick="selecionarAvatar('${k}')">${avatarSVG(k, 22)}</button>`).join("")}
            </div>
          </div>
          <div class="campo full">
            <label>Cor de fundo</label>
            <div class="cor-grid" id="cor-grid">
              ${CORES_FAM.map(c => `<button type="button" class="cor-opt${c === FORM_COR ? " sel" : ""}" data-cor="${c}" style="background:${c}" title="${c}" aria-label="Cor ${c}" onclick="selecionarCor('${c}')"></button>`).join("")}
            </div>
          </div>
          <div class="campo full">
            <label>Nome completo</label>
            <input id="fu-nome" value="${esc(e.nome || "")}" placeholder="Ex.: Maria Tomelin" autocomplete="off"
                   oninput="document.getElementById('fam-av-nome').textContent = this.value.trim() || 'Novo membro'">
          </div>
          <div class="campo full">
            <label>E-mail de acesso</label>
            <input id="fu-email" type="email" value="${esc(e.email || "")}" placeholder="nome@dominio.com" autocomplete="off">
            <div class="campo-dica">É com este e-mail que a pessoa entra no sistema.</div>
          </div>
          <div class="campo full">
            <label>WhatsApp</label>
            <input id="fu-whatsapp" inputmode="tel" value="${esc(_fmtZapNum(e.whatsapp || ""))}" placeholder="(47) 99999-0000" autocomplete="off">
            <div class="campo-dica">Recebe o código quando a pessoa esquecer a senha. Opcional.</div>
          </div>
          <div class="campo full">
            <label>Senha</label>
            <div class="senha-wrap">
              <input id="fu-senha" type="password" autocomplete="new-password" placeholder="${novo ? "Mínimo de 6 caracteres" : "Preencha só se quiser trocar"}">
              <button type="button" class="senha-olho" onmousedown="event.preventDefault()" onclick="_verSenhaFu()" title="Mostrar ou ocultar a senha">${icon("eye")}</button>
            </div>
            <div class="campo-dica">${novo ? "Senha inicial. A pessoa pode trocar depois." : "Deixe em branco para manter a senha atual."}</div>
          </div>
          <div class="campo full">
            <label>Papel</label>
            <select id="fu-papel" onchange="_dicaPapel()" ${travado ? "disabled" : ""}>
              <option value="membro" ${e.papel !== "admin" ? "selected" : ""}>Membro</option>
              <option value="admin" ${e.papel === "admin" ? "selected" : ""}>Admin</option>
            </select>
            <div class="campo-dica" id="fu-papel-dica"></div>
          </div>
          <div class="campo full">
            <label class="sw-card${travado ? " off" : ""}">
              <input type="checkbox" id="fu-ativo" ${e.ativo !== false ? "checked" : ""} ${travado ? "disabled" : ""} onchange="_dicaAtivo()">
              <span class="sw-trilho"></span>
              <span class="sw-txt"><b>Acesso liberado</b><small id="fu-ativo-dica"></small></span>
            </label>
          </div>
        </div>
      </div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarUsuario(${novo ? "null" : e.id})">${icon("check")}Salvar</button>
      </div>
    </div>`, "lg");
  _dicaPapel(); _dicaAtivo();
}

function _dicaPapel() {
  const p = document.getElementById("fu-papel"), d = document.getElementById("fu-papel-dica");
  if (!p || !d) return;
  d.textContent = (p.value === "admin"
    ? "Admin: usa o sistema e também cadastra, edita e remove membros."
    : "Membro: usa o sistema normalmente (lançamentos, contas e relatórios), mas não gerencia outros membros.")
    + (p.disabled ? " Só um admin pode alterar isto." : "");
}

function _dicaAtivo() {
  const c = document.getElementById("fu-ativo"), d = document.getElementById("fu-ativo-dica");
  if (!c || !d) return;
  d.textContent = (c.checked
    ? "Pode entrar no sistema com o e-mail e a senha."
    : "Bloqueado: não consegue entrar. Nada é apagado, basta liberar de novo.")
    + (c.disabled ? " Só um admin pode alterar isto." : "");
}

function _verSenhaFu() {
  const i = document.getElementById("fu-senha");
  if (i) i.type = i.type === "password" ? "text" : "password";
}

function selecionarAvatar(k) {
  FORM_AV = AVATARES[k] ? k : "pessoa";
  document.querySelectorAll("#av-grid .av-opt").forEach(el => el.classList.toggle("sel", el.dataset.av === FORM_AV));
  const prev = document.getElementById("fam-av-prev");
  if (prev) prev.innerHTML = avatarSVG(FORM_AV, 38);
  const nm = document.getElementById("av-nome");
  if (nm) nm.textContent = AVATARES[FORM_AV][0];
}

function selecionarCor(cor) {
  FORM_COR = corSegura(cor);
  document.querySelectorAll("#cor-grid .cor-opt").forEach(el => el.classList.toggle("sel", el.dataset.cor === FORM_COR));
  const prev = document.getElementById("fam-av-prev");
  if (prev) prev.style.background = FORM_COR;
}


async function verHistoricoLogin(uid, nome) {
  const endpoint = uid === State.uid ? "/api/auth/historico" : `/api/auth/historico/${uid}`;
  let rows;
  try { rows = await api(endpoint + "?limite=30"); }
  catch(e) { toast(e.message, "err"); return; }

  const linhas = rows.length ? rows.map(r => {
    const dt = new Date(r.data_hora);
    const data = dt.toLocaleDateString("pt-BR");
    const hora = dt.toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"});
    const agora = new Date();
    const diffMin = Math.round((agora - dt) / 60000);
    const quando = diffMin < 1 ? "agora" : diffMin < 60 ? `${diffMin}min atrás`
      : diffMin < 1440 ? `${Math.floor(diffMin/60)}h atrás`
      : `${Math.floor(diffMin/1440)}d atrás`;
    const ok = r.sucesso;
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)">
      <span style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${ok ? '#2F817A18' : '#B4503E18'};flex-shrink:0">${ok ? icon("checkCircle") : icon("x")}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:600;color:var(--ink)">${r.dispositivo || "-"}</div>
        <div style="font-size:11.5px;color:var(--ink-2)">${data} às ${hora} · ${r.ip || "-"}</div>
      </div>
      <div style="font-size:11px;color:var(--ink-3);white-space:nowrap">${quando}</div>
    </div>`;
  }).join("") : `<div class="empty" style="padding:30px">${ilus("clock")}<p>Nenhum login registrado.</p></div>`;

  const falhas = rows.filter(r => !r.sucesso).length;
  const aviso = falhas > 0
    ? `<div class="dica vermelho" style="margin-bottom:12px">${icon("alert")}<div><b>${falhas} tentativa(s) com senha errada</b> nos últimos acessos.</div></div>`
    : `<div class="dica verde" style="margin-bottom:12px">${icon("checkCircle")}<div>Nenhuma tentativa suspeita nos últimos logins.</div></div>`;

  abrirModal(`
    <div class="modal" style="max-width:480px">
      <div class="modal-h">
        <span class="card-ico i-navy">${icon("clock")}</span>
        <h3>Histórico de logins: ${nome}</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b">
        ${aviso}
        <div style="max-height:400px;overflow-y:auto">
          ${linhas}
        </div>
      </div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Fechar</button>
      </div>
    </div>`, "lg");
}

async function meuHistoricoLogin() {
  verHistoricoLogin(State.uid, State.nome || "Meu histórico");
}

async function salvarUsuario(id) {
  const body = {
    nome: $("#fu-nome").value.trim(),
    email: $("#fu-email").value.trim(),
    senha: $("#fu-senha").value || undefined,
    papel: $("#fu-papel").value,
    ativo: $("#fu-ativo").checked,
    emoji: FORM_AV,
    cor: FORM_COR,
    whatsapp: ($("#fu-whatsapp")?.value || "").trim(),
  };
  if (!body.nome) return erroCampo("nome", "Nome: preenchimento obrigatório.");
  if (!body.email) return erroCampo("email", "E-mail: preenchimento obrigatório.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email))
    return erroCampo("email", `E-mail: formato inválido ("${body.email}"). Use algo como nome@dominio.com.`);
  if (!id && !body.senha) return erroCampo("senha", "Senha: obrigatória para novos membros.");
  if (body.senha && body.senha.length < 6)
    return erroCampo("senha", `Senha: precisa ter no mínimo 6 caracteres (foram ${body.senha.length}).`);
  try {
    if (id) await api(`/api/usuarios/${id}`, { method:"PUT", body:JSON.stringify(body) });
    else     await api("/api/usuarios",         { method:"POST", body:JSON.stringify(body) });
    fecharModal(); toast("Membro salvo", "ok"); setView("usuarios");
  } catch (e) {
    // o servidor começa a mensagem pelo nome do campo: destaca o campo certo
    const campos = { "Nome": "nome", "E-mail": "email", "Senha": "senha", "Papel": "papel", "Cor": "cor", "WhatsApp": "whatsapp" };
    const m = /^(Nome|E-mail|Senha|Papel|Cor|WhatsApp):/.exec(e.message || "");
    if (m) erroCampo(campos[m[1]], e.message); else toast(e.message, "err");
  }
}

async function excluirUsuario(id) {
  const ux = _CACHE.usuarios?.[id];
  if (!(await confirmar({ tipo: "perigo", figura: "pessoa", ok: "Remover",
    titulo: ux ? `Remover ${ux.nome} da família?` : "Remover este membro?",
    texto: "A pessoa perde o acesso ao sistema. Os lançamentos continuam guardados." }))) return;
  try { await api(`/api/usuarios/${id}`, {method:"DELETE"}); toast("Removido","ok"); setView("usuarios"); }
  catch(e) { toast(e.message,"err"); }
}


/* ============================================================
   LEITOR DE NF-e / NFC-e POR QR CODE
   ============================================================ */

async function abrirLeitorNFe() {
  abrirModal(`
    <div class="modal" style="max-width:520px">
      <div class="modal-h">
        <span class="card-ico i-navy">${icon("receipt")}</span>
        <h3>Ler Nota Fiscal (NF-e / NFC-e)</h3>
        <button class="close-btn" onclick="fecharModal()">${icon("x")}</button>
      </div>
      <div class="modal-b">
        <div class="dica azul" style="margin-bottom:16px">
          <span style="flex-shrink:0;width:20px;height:20px;display:flex;margin-top:1px">${icon("alert")}</span>
      <div>Cole a <b>URL do QR code</b> da nota ou a <b>chave de acesso</b> (44 dígitos) impressa no cupom fiscal.</div>
        </div>

        <div class="campo full">
          <label>URL do QR code ou chave de acesso</label>
          <textarea id="nfe-url" rows="4" placeholder="https://sat.sef.sc.gov.br/nfce/consulta?p=...&#10;&#10;ou cole a chave de acesso de 44 dígitos:" style="font-family:monospace;font-size:13px;resize:vertical"></textarea>
        </div>

        <div id="nfe-preview" style="display:none"></div>
        <div id="nfe-erro" class="login-erro hidden"></div>
      </div>
      <div class="modal-f">
        <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
        <button class="btn btn-gold" id="nfe-btn-consultar" onclick="consultarNFe()">
          ${icon("search")}Consultar nota
        </button>
      </div>
    </div>`, "lg");
}

async function consultarNFe() {
  const url = (document.getElementById("nfe-url")?.value || "").trim();
  if (!url) return erroCampo("url", "Cole a URL do QR Code ou a chave de acesso (44 dígitos) da nota.");

  const btn = document.getElementById("nfe-btn-consultar");
  const erro = document.getElementById("nfe-erro");
  const prev = document.getElementById("nfe-preview");
  if (erro) { erro.textContent = ""; erro.classList.add("hidden"); }
  if (prev) prev.style.display = "none";
  if (btn) { btn.disabled = true; btn.innerHTML = icon("refresh") + " Consultando..."; }

  try {
    const d = await api("/api/nfe/consultar", {
      method: "POST",
      body: JSON.stringify({ url })
    });
    _renderPreviewNFe(d);
  } catch(e) {
    if (erro) { erro.textContent = e.message; erro.classList.remove("hidden"); }
    toast(`NF-e: ${e.message}`, "err");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = icon("search") + " Consultar nota"; }
  }
}

let _nfeDados = null;

function _renderPreviewNFe(d) {
  _nfeDados = d;
  const prev = document.getElementById("nfe-preview");
  if (!prev) return;

  const itens = (d.itens || []);
  const itensHtml = itens.length
    ? `<div style="max-height:180px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;margin-top:8px">
        <table style="width:100%;border-collapse:collapse;font-size:12.5px">
          <thead><tr style="background:var(--bg);position:sticky;top:0">
            <th style="padding:8px 10px;text-align:left;color:var(--ink-2);font-weight:600">Item</th>
            <th style="padding:8px 10px;text-align:right;color:var(--ink-2);font-weight:600">Valor</th>
          </tr></thead>
          <tbody>
            ${itens.map(i => `<tr style="border-top:1px solid var(--line)">
              <td style="padding:7px 10px;color:var(--ink)">${i.descricao}</td>
              <td style="padding:7px 10px;text-align:right;color:var(--ink);font-family:monospace">${money(i.valor)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
       </div>`
    : `<div class="dica ouro" style="margin-top:8px">${icon("alert")} <span>O portal não retornou a lista de itens: apenas o valor total está disponível.</span></div>`;

  prev.style.display = "block";
  prev.innerHTML = `
    <div style="background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span class="card-ico i-green" style="width:36px;height:36px">${icon("checkCircle")}</span>
        <div>
          <div style="font-weight:700;font-size:15px;color:var(--ink)">${d.emitente || "Emitente não identificado"}</div>
          <div style="font-size:12px;color:var(--ink-2)">${d.cnpj_emitente || ""} ${d.uf ? "· " + d.uf : ""}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div style="font-size:22px;font-weight:800;color:var(--navy);font-family:monospace">${money(d.valor_total || 0)}</div>
          <div style="font-size:11px;color:var(--ink-2)">${d.data_emissao ? "Emissão: " + dataBR(d.data_emissao) : ""}${d.numero_nota ? " · NF " + d.numero_nota : ""}</div>
        </div>
      </div>

      ${d.categoria_sugerida ? `<div style="margin-bottom:8px"><span style="font-size:12px;color:var(--ink-2)">Categoria sugerida: </span><span class="tag" style="background:${d.categoria_sugerida.cor}20;color:${d.categoria_sugerida.cor};border:1px solid ${d.categoria_sugerida.cor}44">${d.categoria_sugerida.nome}</span></div>` : ""}

      <div style="font-size:12.5px;color:var(--ink-2);margin-bottom:6px">${itens.length ? itens.length + " itens encontrados:" : ""}</div>
      ${itensHtml}
    </div>

    <div class="dica verde" style="margin-bottom:0">
      <span style="flex-shrink:0;width:20px;height:20px;display:flex;margin-top:1px">${icon("checkCircle")}</span>
      <div>Tudo certo! Clique em <b>Cadastrar lançamento</b> para criar a despesa com esses dados.</div>
    </div>`;

  // Troca botões
  const footer = prev.closest(".modal")?.querySelector(".modal-f");
  if (footer) {
    footer.innerHTML = `
      <button class="btn btn-ghost" onclick="fecharModal()">Cancelar</button>
      <button class="btn btn-gold" onclick="consultarNFe()">${icon("refresh")}Nova consulta</button>
      <button class="btn btn-primary" onclick="cadastrarDaNFe()">${icon("check")}Cadastrar lançamento</button>`;
  }
}

async function cadastrarDaNFe() {
  if (!_nfeDados) return;
  fecharModal();
  abrirFormCompra(null, _nfeDados);
}


/* 5547999990000 → (47) 99999-0000 */
function _fmtZapNum(n) {
  let d = String(n || "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return n || "";
}
