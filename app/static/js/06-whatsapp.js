/* Tomelin Gestão Financeira · WhatsApp: configuração, diagnóstico e envios.
   Arquivo 6 de 15: os scripts carregam em ordem e dividem o mesmo escopo global. */

/* ============================================================
   VIEW: WHATSAPP (estilo Sentinela)
   ============================================================ */
const WA_SVG = `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;

async function viewWhatsapp(v) {
  let st = {}, tunnelUrl = "";
  try { st = await api("/api/whatsapp/status"); } catch { st = {}; }
  try { const t = await api("/api/whatsapp/tunnel-url"); tunnelUrl = t.url || ""; } catch {}
  // URL direta por IP:porta: igual ao Sentinela (bypassa o Traefik)
  const _host = location.hostname;
  const webhookUrl = tunnelUrl || st.tunnel_url || `http://189.126.105.8:8788/api/whatsapp/webhook`;
  const webhookUrlAlt = location.origin + "/api/whatsapp/webhook";
  const ok       = st.conectado === true && st.ativo;
  const semCfg   = !st.gateway || !st.chave_configurada;
  const statusTxt = semCfg ? "Não configurado"
    : st.erro_gateway ? "Erro no gateway"
    : st.conectado ? (st.numero ? st.numero : "Conectado")
    : "WhatsApp desconectado";

  // ── helpers ──────────────────────────────────────────────
  const stepCircle = (n, done) =>
    `<div style="width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;
       font-size:12px;font-weight:800;transition:all .2s;
       background:${done?"#25D366":"var(--bg)"};color:${done?"#fff":"var(--ink-3)"};
       border:2px solid ${done?"#25D366":"var(--line)"}">${done?IC_CHECK_W:n}</div>`;

  const section = (titulo, sub, ico, corpo, accent="#25D366") =>
    `<div style="background:var(--card);border-radius:18px;border:1.5px solid var(--line);overflow:hidden;margin-bottom:14px">
       <div style="display:flex;align-items:center;gap:12px;padding:16px 18px 0">
         <div style="width:38px;height:38px;border-radius:12px;background:${accent}18;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${accent}">${ico}</div>
         <div><div style="font-weight:800;font-size:15px;color:var(--ink)">${titulo}</div>
           <div style="font-size:12px;color:var(--ink-3);margin-top:1px">${sub}</div></div>
       </div>
       <div style="padding:14px 18px 18px">${corpo}</div>
     </div>`;

  const cmdChip = (cmd, desc, cor="#128C7E") =>
    `<div style="display:flex;flex-direction:column;gap:3px;padding:10px 12px;background:var(--bg);border-radius:12px;border:1px solid var(--line);min-width:0">
       <code style="font-size:12.5px;font-weight:700;color:${cor};overflow-wrap:anywhere">${cmd}</code>
       <span style="font-size:11.5px;color:var(--ink-2);line-height:1.3">${desc}</span>
     </div>`;

  const cmdGrid = (arr, cor) =>
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:8px">${arr.map(([c,d])=>cmdChip(c,d,cor)).join("")}</div>`;

  // ── conteúdo principal ────────────────────────────────────
  v.innerHTML = `

  <!-- HERO VERDE -->
  <div style="background:linear-gradient(135deg,#075E54 0%,#128C7E 55%,#25D366 100%);
              border-radius:22px;padding:24px 22px 20px;margin-bottom:16px;position:relative;overflow:hidden">
    <!-- bolhas decorativas -->
    <div style="position:absolute;right:-20px;top:-20px;width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.06)"></div>
    <div style="position:absolute;right:30px;bottom:-30px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.05)"></div>

    <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:18px">
      <span class="zap-logo wa-hero-logo"><i class="wa-onda"></i><i class="wa-onda o2"></i>${waDesenho(36)}</span>
      <div>
        <div style="font-size:19px;font-weight:900;color:#fff;line-height:1.1">Central WhatsApp</div>
        <div style="font-size:12.5px;color:rgba(255,255,255,.65);margin-top:3px">Comandos financeiros no grupo</div>
      </div>
    </div>

    <!-- status pill -->
    <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(0,0,0,.25);
         border-radius:20px;padding:7px 14px;margin-bottom:18px">
      <span style="width:8px;height:8px;border-radius:50%;background:${ok?"#25D366":semCfg?"#aaa":"#FF6B6B"};
        ${ok?"box-shadow:0 0 0 3px rgba(37,211,102,.35)":""}"></span>
      <span style="font-size:13px;font-weight:700;color:#fff">${statusTxt}</span>
      ${ok?`<span style="font-size:11px;color:rgba(255,255,255,.5)">· respondendo a cada 4s</span>`:""}
    </div>

    <!-- mini-stats -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:rgba(255,255,255,.1);border-radius:14px;overflow:hidden">
      ${[
        ["Escuta","a cada 4s","lê o grupo sozinho"],
        ["PDFs","no grupo","recibos e relatórios"],
        ["Respostas","instantâneas","pelo webhook"],
      ].map(([e,t,s])=>`
        <div style="background:rgba(0,0,0,.2);padding:12px 10px;text-align:center">
          <div style="font-size:clamp(14px,4.6vw,20px);margin-bottom:4px;overflow-wrap:anywhere">${e}</div>
          <div style="font-size:12px;font-weight:700;color:#fff">${t}</div>
          <div style="font-size:10.5px;color:rgba(255,255,255,.5)">${s}</div>
        </div>`).join("")}
    </div>
  </div>

  <!-- BOTÕES DE AÇÃO RÁPIDA -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
    ${btnWA("Testar agora", "testarWhatsapp(this)", `style="padding:14px;border-radius:14px;font-size:14px" ${st.ativo&&st.grupo?"":'disabled'}`)}
    <button onclick="rodarDiagnosticoWA()"
      style="display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;border-radius:14px;
             background:var(--card);color:var(--navy);font-weight:700;font-size:14px;
             border:1.5px solid var(--line);cursor:pointer;transition:all .15s">
      <span class="wa-diag-ic">${icon("shield")}</span> Diagnóstico
    </button>
  </div>

  <!-- DIAGNÓSTICO (expande) -->
  <div style="background:var(--card);border-radius:18px;border:1.5px solid var(--line);margin-bottom:14px;overflow:hidden">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 18px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:36px;height:36px;border-radius:10px;background:#128C7E18;display:flex;align-items:center;justify-content:center;color:#128C7E">${icon("shield")}</div>
        <div><div style="font-weight:700;color:var(--ink)">Diagnóstico</div>
          <div style="font-size:12px;color:var(--ink-3)">Verificação em tempo real</div></div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="rodarDiagnosticoWA()">${icon("refresh")} Verificar</button>
    </div>
    <div id="wa-diag" style="padding:0 18px 16px"><div style="font-size:13px;color:var(--ink-3)">Toque em Verificar para checar a conexão.</div></div>
  </div>

  <!-- PASSO 1: GATEWAY -->
  <div style="background:var(--card);border-radius:18px;border:1.5px solid var(--line);margin-bottom:14px;overflow:hidden">
    <div style="display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)">
      ${stepCircle(1, !!(st.gateway && st.chave_configurada && !st.erro_gateway))}
      <div>
        <div style="font-weight:800;font-size:15px;color:var(--ink)">Conectar ao gateway</div>
        <div style="font-size:12px;color:var(--ink-3)">${st.gateway||"zap.unicontroller.com.br"}</div>
      </div>
    </div>
    <div style="padding:16px 18px">
      <div class="frm">
        <div class="campo full"><label>URL do gateway</label>
          <input id="wa-url" value="${st.gateway||"https://zap.unicontroller.com.br"}" placeholder="https://zap.unicontroller.com.br"></div>
        <div class="campo full"><label>Chave de API <span style="font-weight:400;color:var(--ink-3)">(API Keys no painel do gateway)</span></label>
          <input id="wa-chave" type="password" placeholder="${st.chave_configurada?"••••••••  (já salva, deixe em branco para manter)":"Cole a chave gerada no painel"}"></div>
        <div class="campo full" style="flex-direction:row;align-items:center;gap:10px">
          <label class="switch"><input type="checkbox" id="wa-ativo" ${st.ativo?"checked":""}><span class="slider"></span></label>
          <span style="font-size:13.5px;color:var(--ink);font-weight:600">Ativar envio de mensagens</span>
        </div>
      </div>
      <button onclick="salvarGatewayWA()"
        style="margin-top:14px;width:100%;padding:12px 16px;border-radius:12px;background:#128C7E;color:#fff;
               font-weight:700;font-size:14px;border:none;cursor:pointer;display:flex;align-items:center;
               justify-content:center;gap:8px;transition:opacity .15s">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" width="18" height="18"><polyline points="20 6 9 17 4 12"/></svg>
        Salvar e verificar conexão
      </button>
    </div>
  </div>

  <!-- PASSO 2: GRUPO + NÚMERO -->
  <div style="background:var(--card);border-radius:18px;border:1.5px solid var(--line);margin-bottom:14px;overflow:hidden">

    <!-- header do passo -->
    <div style="display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)">
      ${stepCircle(2, !!st.grupo)}
      <div>
        <div style="font-weight:800;font-size:15px;color:var(--ink)">Grupo e seu número</div>
        <div style="font-size:12px;color:var(--ink-3)">${st.grupo ? "Grupo configurado" : "Nenhum grupo configurado"}</div>
      </div>
    </div>

    <div style="padding:18px">

      <!-- ── SEÇÃO: GRUPO ── -->
      <div style="font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;
                  color:#128C7E;margin-bottom:12px">Grupo de controle</div>

      <!-- chip do grupo atual (quando configurado) -->
      ${st.grupo ? `
      <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;
           background:linear-gradient(135deg,rgba(37,211,102,.08),rgba(7,94,84,.06));
           border:2px solid rgba(37,211,102,.35);border-radius:16px;margin-bottom:14px;
           position:relative;overflow:hidden">
        <div style="position:absolute;right:-10px;top:-10px;width:60px;height:60px;border-radius:50%;
             background:rgba(37,211,102,.08)"></div>
        <div style="width:46px;height:46px;border-radius:14px;
             background:linear-gradient(135deg,#25D366,#128C7E);
             display:flex;align-items:center;justify-content:center;flex-shrink:0;
             box-shadow:0 4px 12px rgba(37,211,102,.3)">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="24" height="24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;color:#128C7E;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">Grupo ativo</div>
          <div style="font-size:13.5px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Família Tomelin</div>
          <div style="font-size:11px;color:var(--ink-3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace">${st.grupo}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <span><svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg></span>
          <button onclick="carregarGruposWA()"
            style="font-size:11px;font-weight:700;color:#128C7E;background:rgba(18,140,126,.1);
                   border:none;border-radius:8px;padding:4px 8px;cursor:pointer">Trocar</button>
        </div>
      </div>` : `
      <!-- placeholder quando não tem grupo -->
      <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;
           background:var(--bg);border:2px dashed var(--line);border-radius:16px;margin-bottom:14px">
        <div style="width:46px;height:46px;border-radius:14px;background:var(--line);
             display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.8" width="24" height="24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div style="flex:1">
          <div style="font-size:13.5px;font-weight:700;color:var(--ink-3)">Nenhum grupo selecionado</div>
          <div style="font-size:12px;color:var(--ink-3);margin-top:2px">Toque em Listar grupos abaixo</div>
        </div>
        <span style="style="opacity:.3"><svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="28" height="28" ><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
      </div>`}

      <!-- botão listar grupos -->
      <button onclick="carregarGruposWA()" ${st.gateway && st.chave_configurada ? "" : "disabled"}
        style="width:100%;padding:13px 16px;border-radius:14px;cursor:pointer;
               display:flex;align-items:center;gap:12px;margin-bottom:4px;
               background:${st.gateway && st.chave_configurada ? "linear-gradient(135deg,#075E54,#128C7E)" : "var(--bg)"};
               color:${st.gateway && st.chave_configurada ? "#fff" : "var(--ink-3)"};
               border:${st.gateway && st.chave_configurada ? "none" : "1.5px solid var(--line)"};
               box-shadow:${st.gateway && st.chave_configurada ? "0 4px 14px rgba(7,94,84,.3)" : "none"};
               opacity:${st.gateway && st.chave_configurada ? "1" : ".5"};transition:all .15s">
        <div style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.15);
             display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div style="text-align:left;flex:1">
          <div style="font-size:14px;font-weight:800">${st.grupo ? "Trocar grupo" : "Listar grupos e escolher"}</div>
          <div style="font-size:11.5px;opacity:.75">${st.gateway && st.chave_configurada ? "Busca no seu WhatsApp" : "Configure o gateway primeiro"}</div>
        </div>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
      <div id="wa-grupos" style="margin-top:4px"></div>

      <!-- ── SEPARADOR ── -->
      <div style="display:flex;align-items:center;gap:10px;margin:20px 0 16px">
        <div style="flex:1;height:1px;background:var(--line)"></div>
        <span style="font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#128C7E">Seu número</span>
        <div style="flex:1;height:1px;background:var(--line)"></div>
      </div>

      <!-- ── CHIP DO NÚMERO (estilo contato salvo no celular) ── -->
      <div style="background:var(--bg);border-radius:18px;border:1.5px solid var(--line);overflow:hidden;
                  transition:border-color .15s" onclick="document.getElementById('wa-meunumero').focus()"
           id="wa-num-chip">
        <!-- topo do chip: avatar + nome -->
        <div style="display:flex;align-items:center;gap:14px;padding:16px 16px 12px">
          <div style="width:52px;height:52px;border-radius:50%;
               background:${st.meu_numero ? "linear-gradient(135deg,#25D366,#128C7E)" : "var(--line)"};
               display:flex;align-items:center;justify-content:center;flex-shrink:0;
               box-shadow:${st.meu_numero ? "0 3px 10px rgba(37,211,102,.3)" : "none"};
               transition:all .3s" id="wa-num-avatar">
            ${st.meu_numero ? `
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="26" height="26">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>` : `
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.8" width="26" height="26">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
              <line x1="12" y1="1" x2="12" y2="5"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            </svg>`}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:700;color:var(--ink-3);text-transform:uppercase;
                        letter-spacing:.06em;margin-bottom:3px">Responsável pelo grupo</div>
            <div id="wa-num-nome" style="font-size:15px;font-weight:800;color:var(--ink)">
              ${st.meu_numero ? (State.nome || "Jackson Tomelin") : "Não configurado"}
            </div>
          </div>
          <span id="wa-num-ico" style="font-size:22px">${st.meu_numero ? `<svg viewBox='0 0 24 24' fill='none' stroke='#16A34A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' width='18' height='18' ><polyline points='20 6 9 17 4 12'/></svg>` : `<svg viewBox='0 0 24 24' fill='none' stroke='var(--ink-3)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' width='20' height='20' ><line x1='12' y1='5' x2='12' y2='19'/><line x1="5" y1="12" x2="19" y2="12"/></svg>`}</span>
        </div>

        <!-- linha divisória -->
        <div style="height:1px;background:var(--line);margin:0 16px"></div>

        <!-- campo de número estilo app de contato -->
        <div style="padding:12px 16px 16px">
          <div style="font-size:10.5px;font-weight:700;color:#128C7E;text-transform:uppercase;
                      letter-spacing:.08em;margin-bottom:6px"><svg viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg> WhatsApp (DDI+DDD+número)</div>
          <div style="display:flex;align-items:center;gap:10px">
            <!-- bandeira BR decorativa -->
            <div style="width:32px;height:32px;border-radius:8px;background:#009c3b;
                 display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden"><svg viewBox="0 0 30 20" width="30" height="20" style="border-radius:3px"><rect width="30" height="20" fill="#009c3b"/><polygon points="15,2 28,10 15,18 2,10" fill="#ffdf00"/><circle cx="15" cy="10" r="4.5" fill="#002776"/><text x="15" y="13.5" text-anchor="middle" font-size="4" fill="#fff" font-weight="bold">BR</text></svg></div>
            <input id="wa-meunumero" value="${st.meu_numero || ""}" placeholder="5547 9 9999-0000"
              style="flex:1;border:none;background:transparent;font-size:17px;font-weight:700;
                     color:var(--ink);padding:0;font-family:monospace;outline:none;min-width:0"
              oninput="this.value=this.value.replace(/[^0-9]/g,'');_previewNumeroWA(this.value)">
            <div id="wa-num-status" style="font-size:20px;flex-shrink:0">${st.meu_numero ? `<svg viewBox='0 0 24 24' fill='none' stroke='#16A34A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' width='18' height='18' ><polyline points='20 6 9 17 4 12'/></svg>` : ""}</div>
          </div>
          <div id="wa-num-preview" style="margin-top:6px;font-size:12.5px;
            color:${st.meu_numero ? "#128C7E" : "var(--ink-3)"}">
            ${st.meu_numero ? `<span class="ic-inline" style="color:currentColor">${icon("check")}</span> Somente você controla o sistema pelo grupo.`
              : "Deixe em branco para qualquer membro do grupo usar."}
          </div>
        </div>
      </div>

      <!-- botão salvar número -->
      <button onclick="salvarNumeroWA()"
        style="margin-top:12px;width:100%;padding:13px 16px;border-radius:14px;
               background:linear-gradient(135deg,#075E54,#128C7E);color:#fff;
               font-weight:800;font-size:14px;border:none;cursor:pointer;
               display:flex;align-items:center;justify-content:center;gap:8px;
               box-shadow:0 4px 14px rgba(7,94,84,.3);transition:all .15s">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" width="18" height="18">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Salvar número
      </button>

    </div>
  </div>

  <!-- PASSO 3: WEBHOOK -->
  <div style="background:var(--card);border-radius:18px;border:1.5px solid var(--line);margin-bottom:14px;overflow:hidden">
    <div style="display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line)">
      ${stepCircle(3, false)}
      <div>
        <div style="font-weight:800;font-size:15px;color:var(--ink)">Webhook: resposta imediata</div>
        <div style="font-size:12px;color:var(--ink-3)">Igual ao Sentinela: sem atraso, responde na hora</div>
      </div>
    </div>
    <div style="padding:16px 18px">
      <div style="padding:14px 16px;background:linear-gradient(135deg,rgba(37,211,102,.08),rgba(7,94,84,.05));border:2px solid rgba(37,211,102,.4);border-radius:14px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:800;color:#128C7E;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
          <span class="ic-inline" style="color:var(--gold)">${icon("send")}</span> URL por IP direto: igual ao Sentinela (recomendado)
        </div>
        <div style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.05);border-radius:10px;padding:10px 12px;margin-bottom:6px">
          <code style="flex:1;font-size:12.5px;color:var(--navy);font-weight:700;overflow-wrap:anywhere">http://189.126.105.8:8788/api/whatsapp/webhook</code>
          <button onclick="copiarTexto('http://189.126.105.8:8788/api/whatsapp/webhook')"
            style="background:#25D366;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;color:#fff;font-size:12px;font-weight:700;flex-shrink:0">
            Copiar
          </button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:12px;color:var(--ink-2);flex-shrink:0">Evento:</span>
          <span style="background:#25D366;color:#fff;font-size:12px;font-weight:800;padding:2px 10px;border-radius:8px">Mensagem recebida</span>
        </div>
        <div style="font-size:11.5px;color:var(--ink-3)">
          <span class="ic-inline" style="color:#CA8A04">${icon("alert")}</span> Apague o webhook antigo com a URL do domínio e cadastre este com o IP direto.
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:11px 13px;background:var(--bg);border:1px solid var(--line);border-radius:12px">
        <code style="flex:1;min-width:0;font-size:11.5px;color:var(--navy);overflow-wrap:anywhere">${webhookUrl}</code>
        <button onclick="copiarTexto('${webhookUrl}')" title="Copiar"
          style="width:32px;height:32px;border-radius:9px;background:#25D36618;border:none;cursor:pointer;
                 display:flex;align-items:center;justify-content:center;color:#128C7E;flex-shrink:0">
          ${icon("doc")}
        </button>
      </div>
    </div>
  </div>

  <!-- COMANDOS: CONSULTAS -->
  ${section("Consultas financeiras", "Digite qualquer um no grupo", WA_SVG, `
    ${cmdGrid([
      ["1 · saldo","Saldo de todas as contas"],
      ["2 · vencer","Atrasados + próx. 7 dias"],
      ["3 · resumo","Resultado do mês"],
      ["4 · pagar","Contas a pagar"],
      ["5 · receber","Contas a receber"],
      ["6 · patrimonio","Contas + veículos"],
      ["7 · juros","Juros no ano"],
      ["8 · metas","Metas financeiras"],
      ["9 · categorias","Lista de categorias"],
      ["10 · contas","Saldo por conta"],
      ["hoje","Resumo do dia"],
      ["semana","Movimentos da semana"],
      ["fluxo","Gráfico 6 meses"],
      ["gastos","Top categorias"],
      ["projecao","Saldo previsto"],
      ["proximo mes","Mês que vem"],
      ["parcelas","Parcelas de cartão"],
      ["carros","Veículos e fin."],
      ["dica","Dica personalizada"],
      ["menu","Lista de comandos"],
    ], "#128C7E")}`, "#25D366")}

  <!-- COMANDOS: AÇÕES -->
  ${section("Lançamentos e ações", "O sistema reage ao registrar", icon("edit"), `
    ${cmdGrid([
      ["despesa 150 mercado","Registra uma despesa"],
      ["receita 3000 salario","Registra uma receita"],
      ["baixa 42","Dá baixa no lançamento"],
      ["buscar aluguel","Busca lançamentos"],
      ["ultimo","Último lançamento"],
      ["aporte 500 reserva","Deposita numa meta"],
      ["nova conta Nubank","Cria conta bancária"],
      ["nova cat Pets","Cria categoria"],
      ["nf https://...","Consulta NF-e"],
      ["ajuda baixa","Ajuda de qualquer cmd"],
    ], "#075E54")}`, "#34B7F1")}

  <!-- COMANDOS: PDFs -->
  ${section("PDFs direto no grupo", "O arquivo chega como anexo no chat", icon("download"), `
    ${cmdGrid([
      ["recibo 42","Recibo #42 em PDF"],
      ["recibo cupom 42","Estilo impressora"],
      ["balancete","Balancete do mês"],
      ["balancete cupom","Balancete cupom"],
      ["patrimonio pdf","Patrimônio em PDF"],
    ], "#B4503E")}`, "#FF6B35")}

  <!-- API v1 (expansível) -->
  <div style="background:var(--card);border-radius:18px;border:1.5px solid var(--line);margin-bottom:14px;overflow:hidden">
    <div onclick="document.getElementById('wa-api-body').classList.toggle('hidden')"
         style="display:flex;align-items:center;gap:12px;padding:16px 18px;cursor:pointer">
      <div style="width:36px;height:36px;border-radius:10px;background:#075E5418;color:#075E54;display:flex;align-items:center;justify-content:center">${icon("terminal")}</div>
      <div style="flex:1">
        <div style="font-weight:800;font-size:15px;color:var(--ink)">API pública v1</div>
        <div style="font-size:12px;color:var(--ink-3)">16 endpoints · header X-API-Key · toque para expandir</div>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2" width="18" height="18"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div id="wa-api-body" class="hidden" style="padding:0 18px 18px">
      ${[
        ["GET","/api/v1/status","Conexão do WhatsApp"],
        ["POST","/api/v1/enviar","Enviar texto · {jid|numero, texto}"],
        ["POST","/api/v1/enviar-anexo","Enviar arquivo (PDF, imagem) · multipart"],
        ["GET","/api/v1/chats","Últimas 200 conversas"],
        ["GET","/api/v1/grupos","Todos os grupos · ?busca="],
        ["GET","/api/v1/mensagens","Mensagens de um chat · ?jid=&limite="],
        ["POST","/api/v1/send-image","Imagem por URL"],
        ["POST","/api/v1/send-document","Documento por URL"],
        ["POST","/api/v1/send-video","Vídeo por URL"],
        ["POST","/api/v1/send-audio","Áudio por URL"],
        ["POST","/api/v1/send-location","Localização · {lat,lng,nome}"],
        ["POST","/api/v1/send-contact","Cartão de contato"],
        ["POST","/api/v1/send-reaction","Reagir · {msgId, emoji}"],
        ["POST","/api/v1/reply","Responder citando · {msgId, texto}"],
        ["POST","/api/v1/delete-message","Apagar para todos · {msgId}"],
        ["POST","/api/v1/read-message","Marcar como lida"],
      ].map(([m,p,d])=>`
        <div style="display:flex;gap:10px;align-items:baseline;padding:9px 0;border-bottom:1px solid var(--line)">
          <span style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:6px;color:#fff;
            background:${m==="GET"?"#128C7E":"#075E54"};flex-shrink:0">${m}</span>
          <div style="min-width:0">
            <code style="font-size:12.5px;color:var(--ink);display:block;overflow-wrap:anywhere">${p}</code>
            <span style="font-size:11.5px;color:var(--ink-3)">${d}</span>
          </div>
        </div>`).join("")}
    </div>
  </div>

  <!-- AUTOMAÇÕES -->
  <div style="background:linear-gradient(135deg,#075E54,#128C7E);border-radius:18px;padding:18px 20px">
    <div style="font-size:13px;font-weight:800;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">Automações ativas</div>
    ${[
      ["Alerta diário",`Vencimentos às ${String(st.alerta_hora??8).padStart(2,"0")}:00 (só quando há algo pendente)`],
      ["Resumo semanal","Resumo semanal",st.resumo_semanal?"Todo dia segunda-feira":"Desativado"],
      ["Fechamento do dia",st.fechamento_diario?`Contas pagas do dia às ${String(st.fechamento_hora??20).padStart(2,"0")}:00`:"Desativado"],
      ["Escuta do grupo","Escuta do grupo","Lê e responde mensagens novas a cada 4 segundos"],
    ].map(([e,t,d])=>`
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.1)">
        <span style="font-size:20px;flex-shrink:0">${e}</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:#fff">${t}</div>
          <div style="font-size:11.5px;color:rgba(255,255,255,.55)">${d}</div>
        </div>
      </div>`).join("")}
  </div>`;
}



async function rodarDiagnosticoWA() {
  const box = document.getElementById("wa-diag");
  if (!box) return;  // tela não está aberta
  box.innerHTML = `<div style="font-size:13px;color:var(--ink-3);padding:4px 0;display:flex;align-items:center;gap:6px">${icon("refresh", "spin")} Verificando...</div>`;
  let d;
  try { d = await api("/api/whatsapp/debug"); }
  catch (e) { box.innerHTML = `<div style="color:var(--red);font-size:13px">${e.message}</div>`; return; }

  const cor = r => /respondido/.test(r) ? "#25D366" : /erro|FALH/.test(r) ? "var(--red)" : "var(--ink-3)";
  const cfg = d.config || {};

  // ── CHECKLIST DE CONFIGURAÇÃO ──
  const checks = [
    [cfg.ativo,                        "Envio ativado",           cfg.ativo?"":"Ative no passo 1"],
    [!!cfg.url,                        "URL do gateway",          cfg.url||"não configurada"],
    [cfg.chave_configurada,            "Chave de API",            cfg.chave_configurada ? `${cfg.chave_resumo || "configurada"} · precisa ser a mesma ZAP_API_KEY do Sentinela` : "não configurada"],
    [!!(cfg.grupo&&cfg.grupo.includes("@g.us")), "Grupo definido",cfg.grupo||"escolha no passo 2"],
    [!!cfg.meu_numero,                 "Seu número",              cfg.meu_numero||"qualquer membro pode usar"],
  ];

  // ── URL DO WEBHOOK ──
  const hookUrl = (d.config && d.config.tunnel_url) || "http://189.126.105.8:8788/api/whatsapp/webhook";
  const hookUrlAlt = location.origin + "/api/whatsapp/webhook";
  const hookDbg  = location.origin + "/api/whatsapp/webhook/debug";

  box.innerHTML = `
    <!-- checklist -->
    <div style="margin-bottom:12px">
      ${checks.map(([ok,nome,det])=>`
        <div style="display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--line)">
          <span style="flex-shrink:0">${ok ? `<svg viewBox='0 0 24 24' fill='none' stroke='#16A34A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' width='18' height='18' ><polyline points='20 6 9 17 4 12'/></svg>` : `<svg viewBox='0 0 24 24' fill='none' stroke='#DC2626' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' width='18' height='18' ><line x1='18' y1='6' x2='6' y2='18'/><line x1="6" y1="6" x2="18" y2="18"/></svg>`}</span>
          <div style="min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--ink)">${nome}</div>
            ${det?`<div style="font-size:11.5px;color:var(--ink-3);overflow-wrap:anywhere">${det}</div>`:""}
          </div>
        </div>`).join("")}
    </div>

    <!-- URL do webhook -->
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:8px">
      <span class="ic-inline" style="color:var(--gold)">${icon("send")}</span> URL do webhook: cadastre no gateway
    </div>
    <div style="padding:14px;background:linear-gradient(135deg,rgba(37,211,102,.08),rgba(7,94,84,.05));border:2px solid rgba(37,211,102,.4);border-radius:14px;margin-bottom:10px">
      <div style="font-size:11px;color:#128C7E;font-weight:700;margin-bottom:6px">
        zap.unicontroller.com.br → Webhooks → Adicionar
      </div>
      <div style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,.04);border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <code id="wa-hook-url" style="flex:1;font-size:12px;color:var(--navy);overflow-wrap:anywhere;font-weight:700">${hookUrl}</code>
        <button onclick="copiarTexto('${hookUrl}')"
          style="background:#25D366;border:none;border-radius:8px;padding:6px 10px;cursor:pointer;color:#fff;flex-shrink:0;font-size:12px;font-weight:700">
          Copiar
        </button>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;color:var(--ink-2);flex-shrink:0">Evento:</span>
        <span style="font-size:12px;font-weight:800;background:#25D366;color:#fff;padding:2px 10px;border-radius:8px">Mensagem recebida</span>
        <span style="font-size:12px;color:var(--ink-3)">só este, uma vez</span>
      </div>
    </div>

    <!-- payloads recebidos -->
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:6px">
      Payloads recebidos do gateway (últimos ${(d.ultimos_payloads||[]).length})
    </div>
    ${(d.ultimos_payloads||[]).length === 0 ? `
      <div style="padding:14px;background:rgba(255,193,7,.08);border:1.5px solid rgba(255,193,7,.3);border-radius:12px;margin-bottom:10px">
        <div style="font-size:13px;font-weight:700;color:#8A6A1A;margin-bottom:8px"><span class="ic-inline" style="color:#CA8A04">${icon("alert")}</span> Gateway não está chamando o webhook</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;gap:8px;align-items:flex-start">
            <span style="width:20px;height:20px;border-radius:50%;background:#C9A94E;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">1</span>
            <span style="font-size:12.5px;color:var(--ink-2)">Acesse <b>zap.unicontroller.com.br</b> → <b>Webhooks</b> → <b>Adicionar</b></span>
          </div>
          <div style="display:flex;gap:8px;align-items:flex-start">
            <span style="width:20px;height:20px;border-radius:50%;background:#C9A94E;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">2</span>
            <span style="font-size:12.5px;color:var(--ink-2)">Cole a URL acima e selecione evento <b>Mensagem recebida</b></span>
          </div>
          <div style="display:flex;gap:8px;align-items:flex-start">
            <span style="width:20px;height:20px;border-radius:50%;background:#C9A94E;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0">3</span>
            <span style="font-size:12.5px;color:var(--ink-2)">Mande <b>menu</b> no grupo e toque em <b>Verificar</b> aqui</span>
          </div>
        </div>
      </div>` : `
      <div style="max-height:200px;overflow-y:auto;border:1px solid var(--line);border-radius:12px;margin-bottom:10px">
        ${(d.ultimos_payloads||[]).map(p=>`
          <div style="padding:10px 12px;border-bottom:1px solid var(--line)">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:11px;color:var(--ink-3)">${p.hora}</span>
              <span style="font-size:11px;background:#25D36620;color:#128C7E;padding:1px 6px;border-radius:6px">recebido</span>
            </div>
            <pre style="font-size:11px;color:var(--ink);margin:0;overflow-x:auto;white-space:pre-wrap;word-break:break-all">${JSON.stringify(p.payload,null,2).replace(/</g,"&lt;")}</pre>
          </div>`).join("")}
      </div>`}

    <!-- fotos e PDFs recebidos -->
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:6px">
      Comprovantes recebidos (últimos ${(d.ultimas_midias||[]).length})
    </div>
    ${(d.ultimas_midias||[]).length === 0 ? `
      <div class="zm-vazio">Nenhuma foto ou PDF chegou ainda. Para testar, mande no grupo uma foto com a legenda <b>anexo</b> e o número do lançamento (ex.: <b>anexo 42</b>).</div>` :
      `<div class="zm-lista">${(d.ultimas_midias||[]).map(m => `
        <details class="zm-item zm-${esc(m.resultado)}">
          <summary>
            <span class="zm-sit">${m.resultado === "anexado" ? "Anexado" : m.resultado === "falhou" ? "Falhou" : "Ignorado"}</span>
            <span class="zm-txt">${m.lancamento_id ? `#${m.lancamento_id} · ` : ""}${esc(m.motivo || "")}</span>
            <span class="zm-hora">${esc(m.hora)}</span>
          </summary>
          <div class="zm-forma"><small>Formato que o gateway mandou (sem o conteúdo):</small>
            <pre>${esc(JSON.stringify(m.formato, null, 2))}</pre></div>
        </details>`).join("")}</div>`}

    <!-- eventos processados -->
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:6px">
      Comandos processados (últimos ${(d.ultimos_eventos||[]).length})
    </div>
    ${(d.ultimos_eventos||[]).length === 0 ? `
      <div style="font-size:12.5px;color:var(--ink-3);padding:10px 0">
        Nenhum comando processado. Mande <b>menu</b> no grupo depois de configurar o webhook.
      </div>` :
      (d.ultimos_eventos||[]).slice(0,10).map(e=>`
        <div style="display:flex;gap:8px;align-items:baseline;padding:7px 0;border-bottom:1px solid var(--line)">
          <code style="font-size:12px;color:var(--navy);flex:1;overflow-wrap:anywhere">${(e.texto||"").replace(/</g,"&lt;")}</code>
          <span style="font-size:11px;color:${cor(e.resultado)};flex-shrink:0">${e.resultado}</span>
          <span style="font-size:10px;color:var(--ink-3);flex-shrink:0">${e.hora}</span>
        </div>`).join("")}

    <!-- URL debug -->
    <div style="margin-top:12px;padding:10px 12px;background:var(--bg);border-radius:10px;border:1px solid var(--line)">
      <div style="font-size:11px;color:var(--ink-3);margin-bottom:3px">URL alternativa para testar o webhook:</div>
      <code style="font-size:11px;color:var(--ink-2);overflow-wrap:anywhere">${hookDbg}</code>
    </div>`;
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
  box.innerHTML = `<div style="padding:12px 0;text-align:center;color:var(--ink-3);font-size:13px">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"
         style="animation:spin 1s linear infinite;vertical-align:middle">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg> Buscando grupos…
  </div>`;

  const r = await api("/api/whatsapp/grupos");
  if (!r.ok || !r.grupos?.length) {
    box.innerHTML = `<div style="padding:12px;background:rgba(180,80,62,.06);border-radius:12px;font-size:13px;color:var(--red)">
      ${r.erro || "Nenhum grupo encontrado. Verifique a conexão com o gateway."}</div>`;
    return;
  }

  // paleta de avatares para os grupos
  const cores = ["#075E54","#128C7E","#25D366","#34B7F1","#9E62AE","#E65C6E","#F47A3A","#3B7DD8"];
  const ini = (nome) => (nome || "G").replace(/[^a-zA-ZÀ-ú0-9]/g,"").slice(0,2).toUpperCase();

  box.innerHTML = `
    <div style="margin-top:8px">
      <div style="position:relative;margin-bottom:8px">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2"
             width="16" height="16" style="position:absolute;left:12px;top:50%;transform:translateY(-50%)">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input placeholder="Filtrar grupos…" oninput="filtrarGruposWA(this.value)"
          style="width:100%;padding:10px 12px 10px 36px;border:1.5px solid var(--line);
                 border-radius:12px;background:var(--bg);font-size:13.5px;box-sizing:border-box">
      </div>
      <div id="wa-lista-grupos" style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto">
        ${r.grupos.map((g, i) => {
          const cor = cores[i % cores.length];
          const sigla = ini(g.nome);
          return `<div class="wa-grupo" data-nome="${(g.nome||"").toLowerCase()}"
            onclick="escolherGrupoWA('${g.jid}')"
            style="display:flex;align-items:center;gap:12px;padding:12px 14px;
                   background:var(--bg);border:1.5px solid var(--line);border-radius:14px;
                   cursor:pointer;transition:all .15s"
            onmouseover="this.style.borderColor='#25D366';this.style.background='rgba(37,211,102,.04)'"
            onmouseout="this.style.borderColor='var(--line)';this.style.background='var(--bg)'">
            <div style="width:44px;height:44px;border-radius:14px;background:${cor};
                 display:flex;align-items:center;justify-content:center;flex-shrink:0;
                 box-shadow:0 2px 8px ${cor}44;position:relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" stroke-width="1.8" width="22" height="22">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:14px;color:var(--ink);
                          overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.nome || "(sem nome)")}</div>
              <div style="font-size:11px;color:var(--ink-3);font-family:monospace;margin-top:2px;
                          overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.jid}</div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" stroke-width="2.5" width="18" height="18">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>`;
        }).join("")}
      </div>
    </div>`;
}

function filtrarGruposWA(q) {
  q = (q || "").toLowerCase();
  document.querySelectorAll(".wa-grupo").forEach(el =>
    el.style.display = el.dataset.nome.includes(q) ? "" : "none");
}

async function escolherGrupoWA(jid) {
  try {
    await api("/api/whatsapp/grupo", { method: "POST", body: JSON.stringify({ jid }) });
    toast("Grupo definido!", "ok");
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
  const ico = document.getElementById("wa-num-ico");
  const st2 = document.getElementById("wa-num-status");
  const nome = document.getElementById("wa-num-nome");
  const avatar = document.getElementById("wa-num-avatar");
  const d = v.replace(/\D/g, "");

  let fmt = d ? "+" + d : "";
  if (d.length >= 2)  fmt = "+" + d.slice(0,2) + " " + d.slice(2);
  if (d.length >= 4)  fmt = "+" + d.slice(0,2) + " " + d.slice(2,4) + " " + d.slice(4);
  if (d.length >= 9)  fmt = "+" + d.slice(0,2) + " " + d.slice(2,4) + " " + d.slice(4,9) + "-" + d.slice(9);
  const completo = d.length >= 10;

  if (el) {
    el.innerHTML = !d ? "Deixe em branco para qualquer membro do grupo usar."
      : completo ? `<span class="ic-inline">${icon("check")}</span> Somente você controla o sistema pelo grupo.`
      : esc(fmt) + "…";
    el.style.color = completo ? "#128C7E" : "var(--ink-3)";
  }
  if (st2) st2.innerHTML = completo ? `<svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>` : "";
  if (ico) ico.innerHTML = completo ? `<svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>` : `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  if (nome) nome.textContent = completo ? (State.nome || "Jackson Tomelin") : "Não configurado";
  if (avatar && avatar.style !== undefined) {
    avatar.style.background = completo
      ? "linear-gradient(135deg,#25D366,#128C7E)"
      : "var(--line)";
    avatar.style.boxShadow = completo ? "0 3px 10px rgba(37,211,102,.3)" : "none";
    avatar.innerHTML = completo
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" width="26" height="26">
           <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
           <circle cx="12" cy="7" r="4"/>
         </svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" stroke-width="1.8" width="26" height="26">
           <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
           <circle cx="12" cy="7" r="4"/>
           <line x1="12" y1="1" x2="12" y2="5"/>
           <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
         </svg>`;
  }
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
