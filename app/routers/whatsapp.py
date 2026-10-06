"""
Webhook WhatsApp: cópia fiel da lógica do Sentinela.
Sem dedup, sem cache, sem complexidade. Só recebe, checa e responde.
"""
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..security import usuario_atual
from .. import whatsapp, zapapi, cfg

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])

# log leve dos últimos eventos (para diagnóstico na tela)
from collections import deque
from datetime import datetime
LOG_EVENTOS: deque = deque(maxlen=40)

def _log(texto, resultado, autor=""):
    e = {
        "hora": datetime.now().strftime("%d/%m %H:%M:%S"),
        "texto": (texto or "")[:80],
        "resultado": resultado,
        "autor": autor,
        "origem": "webhook",
    }
    LOG_EVENTOS.appendleft(e)
    return e


def _responder(texto_cmd, resp, destino, autor, como="respondido", inicio=None, arquivo=None):
    """Manda a resposta em segundo plano: o webhook devolve na hora para o gateway
    (que pode estar esperando essa resposta para seguir) e o log mostra quanto levou."""
    import time as _t
    from .. import zap_fila
    ent = _log(texto_cmd, f"{como}: enviando…", autor)
    t0 = inicio or _t.time()

    def tarefa(sdb):
        if arquivo:
            pdf, nome, legenda = arquivo
            ok = zapapi.enviar_arquivo(pdf, nome, "application/pdf", legenda, destino, db=sdb)
        else:
            ok = zapapi.enviar_texto(resp, destino, db=sdb)
        seg = f"{_t.time() - t0:.1f}".replace(".", ",")
        atraso = _ATRASO.get("ultimo")
        extra = f" · a mensagem levou {atraso} s para chegar (via {_ATRASO.get('via') or 'gateway'})" if atraso \
            else f" · via {_ATRASO.get('via') or 'gateway'}"
        ent["resultado"] = (f"{como} em {seg} s{extra}" if ok
                            else "FALHOU ao enviar a resposta (veja URL, chave e conexão do gateway)")
        return ok
    zap_fila.disparar("Resposta no grupo", tarefa)


_ATRASO: dict = {"ultimo": None, "webhook_em": 0.0, "via": None}


def _id_msg(body: dict) -> str:
    for k in ("id", "msgId", "mensagemId", "messageId", "msg_id"):
        if body.get(k):
            return str(body[k])
    chave = body.get("key") if isinstance(body.get("key"), dict) else {}
    return str(chave.get("id") or "")


def _resumir(v, nivel: int = 0):
    """Cópia do payload com textos enormes (base64) trocados por um resumo."""
    if isinstance(v, dict):
        return {k: _resumir(x, nivel + 1) for k, x in v.items()} if nivel < 6 else "{…}"
    if isinstance(v, list):
        return [_resumir(x, nivel + 1) for x in v[:20]] + ([f"… +{len(v) - 20} itens"] if len(v) > 20 else [])
    if isinstance(v, str) and len(v) > 400:
        return f"{v[:60]}… ({len(v)} caracteres)"
    return v


@router.post("/webhook")
async def webhook(req: Request, db: Session = Depends(get_db)):
    try:
        raw = await req.body()
        if len(raw) > 9 * 1024 * 1024:     # foto de até 5 MB em base64 cabe; texto é ~1 KB
            return {"ok": False, "erro": "payload grande demais"}
        body = __import__("json").loads(raw)
    except Exception as e:
        _DEBUG_PAYLOADS.appendleft({"hora": datetime.now().strftime("%d/%m %H:%M:%S"),
            "payload": {"erro_parse": str(e), "raw": raw.decode("utf-8", errors="replace")[:500]}})
        return {"ok": False, "erro": "json inválido"}

    # loga TUDO que chega: antes de qualquer filtro
    import logging as _lg
    client_ip = req.headers.get("x-forwarded-for","") or (req.client.host if req.client else "?")
    _lg.getLogger("tomelin.webhook").info("webhook de %s: evento=%s jid=%s", client_ip, body.get("evento"), str(body.get("jid"))[:30])
    _DEBUG_PAYLOADS.appendleft({
        "hora": datetime.now().strftime("%d/%m %H:%M:%S"),
        "ip": client_ip,
        "payload": _resumir(body)          # base64 de foto não fica na memória nem na tela
    })

    from starlette.concurrency import run_in_threadpool
    via = "Sentinela" if req.headers.get("x-encaminhado-por") == "sentinela" else "gateway"
    return await run_in_threadpool(_tratar, body, db, via)


def _tratar(body: dict, db: Session, via: str = "gateway"):
    import time as _t
    inicio = _t.time()
    _ATRASO["via"] = via
    # mesma mensagem lida pela escuta do grupo: não responde duas vezes
    ts_msg = _ts_aware(body.get("ts"))
    if str(body.get("jid") or "").endswith("@g.us"):
        _ATRASO["webhook_em"] = _t.time()      # webhook vivo: a escuta do grupo descansa
    if ts_msg and str(body.get("jid") or "").endswith("@g.us"):   # quanto o WhatsApp/gateway demorou para avisar o sistema
        from datetime import timezone as _tz
        seg = (datetime.now(_tz.utc) - ts_msg).total_seconds()
        _ATRASO["ultimo"] = f"{seg:.0f}" if seg >= 3 else None
    mid = _id_msg(body)
    if mid and not _marcar_vista(mid):
        return {"ok": True, "ignorado": "já respondida pela escuta"}
    # --- campos exatos do gateway whatsapp.jackson (igual ao Sentinela) ---
    jid      = str(body.get("jid") or "")
    texto    = str(body.get("texto") or "").strip()
    de_mim   = bool(body.get("deMim", False))
    autor_num = str(body.get("autorNumero") or "")
    evento   = str(body.get("evento") or "")
    from .. import zap_midia
    midia    = zap_midia.achar_midia(body)
    if midia and not texto and isinstance(midia, dict):      # legenda pode vir dentro da mídia
        texto = str(midia.get("legenda") or midia.get("caption") or "").strip()

    # ignora eventos sem texto nem arquivo (status, leitura, etc)
    if not texto and not midia:
        _log(f"[{evento}] sem texto", "ignorado", "")
        return {"ok": True, "ignorado": f"sem texto (evento={evento})"}

    # só o grupo configurado, e exatamente ele. Sem grupo definido, nada é
    # processado: antes qualquer POST aqui lançava/baixava contas e a resposta
    # (saldos, contas) ia para o número que viesse no "jid".
    grupo = (cfg.get(db, "WHATSAPP_GRUPO", "") or "").strip()
    if not grupo:
        _log(texto, "ignorado: grupo não configurado")
        return {"ok": True, "ignorado": "grupo não configurado"}
    if jid.strip().lower() != grupo.lower():
        if jid.endswith("@g.us"):          # canais (@newsletter) e conversas privadas não poluem o log
            _log(texto or "[arquivo]", f"ignorado: veio de outro chat ({jid[:40] or 'sem jid'})", autor_num)
        return {"ok": True, "ignorado": "outro grupo"}

    # só o dono: igual ao Sentinela
    meu_num = (cfg.get(db, "WHATSAPP_MEU_NUMERO", "") or "").replace("+","").replace("-","").replace(" ","")
    autor_limpo = autor_num.replace("+","").replace("-","").replace(" ","")
    eh_meu = de_mim or (meu_num and autor_limpo.endswith(meu_num[-8:]))
    if meu_num and not eh_meu:
        _log(texto, "ignorado: não é o dono", autor_limpo)
        return {"ok": True, "ignorado": "não é o dono"}

    # ignora respostas do próprio bot (anti-loop)
    if de_mim and texto and zapapi.foi_enviado_pelo_sistema(texto):
        _log(texto, "ignorado: é a própria resposta do sistema")
        return {"ok": True, "ignorado": "eco do bot"}

    # --- processa e responde (sempre no grupo configurado) ---
    destino = grupo

    # foto ou PDF: comprovante de um lançamento. Se não for pedido de anexo e
    # houver texto, segue como comando normal (nunca deixa o grupo sem resposta).
    if midia and not (de_mim and zapapi.arquivo_recente_do_sistema()):
        resp = None
        try:
            resp = zap_midia.processar(midia, texto, db, remetente=autor_limpo or destino)
        except Exception as e:
            _log(texto or "[arquivo]", f"erro comprovante: {e}")
        if resp:
            _responder(texto or "[arquivo]", resp, destino, autor_limpo, "comprovante", inicio)
            return {"ok": True}
        if not texto:
            _log("[arquivo]", "arquivo ignorado", autor_limpo)
            return {"ok": True, "ignorado": "arquivo sem pedido de anexo"}
    elif midia and not texto:
        _log("[arquivo]", "ignorado: arquivo enviado pelo sistema")
        return {"ok": True, "ignorado": "arquivo enviado pelo sistema"}

    # comando que gera PDF
    arq = None
    try:
        arq = whatsapp.processar_arquivo(texto, db)
    except Exception as e:
        _log(texto, f"erro PDF: {e}")

    if arq:
        if arq[0] == "ERRO":
            _responder(texto, arq[1], destino, autor_limpo, "não encontrado", inicio)
        else:
            _responder(texto, None, destino, autor_limpo, f"PDF {arq[1]}", inicio, arquivo=arq)
        return {"ok": True}

    # "anexo 42" chegou sem arquivo: explica como mandar
    import re as _re
    m = _re.match(r"^(anexo|anexar|comprovante)\s*#?(\d+)\s*$", whatsapp._sem_acento(texto.lower()))
    if m and not midia:
        _responder(texto, f"📎 Para anexar no #{m.group(2)}, mande a *foto ou o PDF* com a legenda `anexo {m.group(2)}` "
                   "(escreva na legenda da foto, na mesma mensagem).", destino, autor_limpo, "respondido (anexo sem arquivo)", inicio)
        return {"ok": True}

    # comando de texto
    try:
        resp = whatsapp.processar_comando(texto, db, remetente=autor_limpo or destino)
    except Exception as e:
        _log(texto, f"erro: {e}")
        return {"ok": False}

    if not resp:
        _log(texto, "não é comando")
        return {"ok": True, "ignorado": "não é comando"}

    _responder(texto, resp, destino, autor_limpo, "respondido", inicio)
    return {"ok": True}


# ── demais endpoints ────────────────────────────────────────
@router.get("/status", dependencies=[Depends(usuario_atual)])
def status(db: Session = Depends(get_db)):
    c = zapapi.config(db)
    info = {
        "ativo": c["ativo"], "gateway": c["url"] or None,
        "chave_configurada": bool(c["chave"]), "grupo": c["grupo"] or None,
        "meu_numero": cfg.get(db, "WHATSAPP_MEU_NUMERO", "") or "",
        "endpoint": c["endpoint"],
        "alerta_hora": cfg.get_int(db, "ALERTA_HORA", 8),
        "alerta_dias_antes": cfg.get_int(db, "ALERTA_DIAS_ANTES", 3),
        "resumo_semanal": cfg.get_bool(db, "RESUMO_SEMANAL", True),
        "fechamento_diario": cfg.get_bool(db, "FECHAMENTO_DIARIO", True),
        "fechamento_hora": cfg.get_int(db, "FECHAMENTO_HORA", 20),
        "tunnel_url": cfg.get(db, "WHATSAPP_TUNNEL_URL", "") or "",
        "conectado": None, "erro_gateway": None, "numero": None,
    }
    if c["url"] and c["chave"]:
        try:
            st = zapapi.status(db)
            info["conectado"] = bool(st.get("conectado"))
            info["numero"] = st.get("numero") or st.get("me")
        except Exception as e:
            info["erro_gateway"] = str(e)
    return info


@router.get("/grupos", dependencies=[Depends(usuario_atual)])
def listar_grupos(busca: str = "", db: Session = Depends(get_db)):
    try:
        return {"ok": True, "grupos": zapapi.grupos(busca, db)}
    except Exception as e:
        return {"ok": False, "erro": str(e), "grupos": []}


@router.post("/grupo")
def definir_grupo(body: dict, me=Depends(usuario_atual), db: Session = Depends(get_db)):
    from .configuracoes import exigir_admin
    exigir_admin(db, me)
    jid = (body.get("jid") or "").strip()
    cfg.set_many(db, {"WHATSAPP_GRUPO": jid})
    return {"ok": True, "grupo": jid}


@router.post("/teste", dependencies=[Depends(usuario_atual)])
def teste(db: Session = Depends(get_db)):
    from .. import service
    ok = whatsapp.enviar(
        "✅ *Teste Tomelin Gestão Financeira*\n\n" + service.texto_resumo_mes(db),
        db=db)
    return {"enviado": ok}


# O que dá para mandar ao grupo direto pelo app (só consultas: nada que lance ou baixe)
ENVIOS = {
    "resumo": ("resumo", "Resumo do mês"),
    "vencer": ("vencer", "Contas a vencer"),
    "saldo": ("saldo", "Saldo das contas"),
    "pagar": ("pagar", "Contas a pagar"),
    "receber": ("receber", "Contas a receber"),
    "gastos": ("gastos", "Top gastos do mês"),
    "metas": ("metas", "Metas"),
    "projecao": ("projecao", "Projeção"),
    "balancete": ("balancete", "Balancete em PDF"),
    "patrimonio": ("patrimonio pdf", "Patrimônio em PDF"),
}


@router.post("/enviar/{oque}", dependencies=[Depends(usuario_atual)])
def enviar_ao_grupo(oque: str, db: Session = Depends(get_db)):
    if oque not in ENVIOS:
        raise HTTPException(404, "Não sei enviar isso.")
    c = zapapi.config(db)
    if not c["ativo"]:
        return {"enviado": False, "motivo": "O envio pelo WhatsApp está desligado. Ative na tela do WhatsApp."}
    if not c["grupo"]:
        return {"enviado": False, "motivo": "Escolha o grupo na tela do WhatsApp."}
    comando, nome = ENVIOS[oque]

    def tarefa(sdb):   # roda em segundo plano: a tela não fica esperando o WhatsApp
        arq = whatsapp.processar_arquivo(comando, sdb)
        if arq and arq[0] != "ERRO":
            pdf, arquivo, legenda = arq
            ok = zapapi.enviar_arquivo(pdf, arquivo, "application/pdf", legenda, db=sdb)
        else:
            texto = whatsapp.processar_comando(comando, sdb)
            ok = bool(texto) and zapapi.enviar_texto(texto, db=sdb)
        if ok:
            _log(f"[app] {nome}", "enviado pelo app")
        return ok
    from .. import zap_fila
    return {"enviado": True, "na_fila": True, "id": zap_fila.disparar(nome, tarefa), "nome": nome}


@router.get("/envio/{eid}", dependencies=[Depends(usuario_atual)])
def situacao_envio(eid: str):
    from .. import zap_fila
    s = zap_fila.situacao(eid)
    if not s:
        raise HTTPException(404, "Envio não encontrado (pode ter expirado).")
    return s


@router.get("/diagnostico", dependencies=[Depends(usuario_atual)])
def diagnostico(db: Session = Depends(get_db)):
    c = zapapi.config(db)
    checks = []
    def chk(nome, ok, detalhe=""):
        checks.append({"nome": nome, "ok": bool(ok), "detalhe": detalhe})

    chk("Envio ativado", c["ativo"], "" if c["ativo"] else "Ative no passo 1")
    chk("URL do gateway", bool(c["url"]), c["url"] or "não configurada")
    chk("Chave de API", bool(c["chave"]), "configurada" if c["chave"] else "não configurada")
    chk("Grupo definido", bool(c["grupo"]) and "@g.us" in (c["grupo"] or ""),
        c["grupo"] or "escolha o grupo no passo 2")
    chk("Seu número configurado", bool(cfg.get(db, "WHATSAPP_MEU_NUMERO", "")),
        cfg.get(db, "WHATSAPP_MEU_NUMERO", "") or "deixe em branco para aceitar todos")

    conectado = False
    if c["url"] and c["chave"]:
        try:
            st = zapapi.status(db)
            conectado = bool(st.get("conectado"))
            chk("Gateway responde", True, "")
            chk("WhatsApp conectado", conectado,
                "" if conectado else "Reconecte no painel do gateway")
        except Exception as e:
            chk("Gateway responde", False, str(e))

    return {"checks": checks, "eventos": list(LOG_EVENTOS)}


# ── ESCUTA DIRETA (fallback, não substitui o webhook) ──────
# Roda a cada 4s e processa mensagens novas caso o webhook não esteja configurado.
# Quando o webhook está ativo, a escuta é redundante mas inofensiva.
_ESCUTA = {"ultimo_ts": None, "ultima_leitura": None, "erro": None}
_ESCUTADOS: "set[str]" = set()  # ids já processados (webhook ou escuta): cada mensagem é respondida uma vez
import threading as _threading
_TRAVA_VISTAS = _threading.Lock()


def _marcar_vista(mid: str) -> bool:
    """True se é a primeira vez que a mensagem aparece. Webhook e escuta chegam
    no mesmo segundo às vezes: a trava garante que só um dos dois responde."""
    with _TRAVA_VISTAS:
        if mid in _ESCUTADOS:
            return False
        if len(_ESCUTADOS) > 2000:
            _ESCUTADOS.clear()
        _ESCUTADOS.add(mid)
        return True


def _ts_aware(v):
    """Converte qualquer timestamp para datetime aware UTC."""
    from datetime import datetime, timezone
    if v is None: return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        s = str(v).strip()
        if s.isdigit():
            n = int(s)
            return datetime.fromtimestamp(n/1000 if n > 1e10 else n, tz=timezone.utc)
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def job_escutar_grupo():
    import time as _t
    if _t.time() - _ATRASO["webhook_em"] < 600:
        return      # o webhook está entregando: não consulta o gateway à toa (poupa memória e CPU da VPS)
    from ..database import SessionLocal
    from datetime import datetime, timezone, timedelta
    db = SessionLocal()
    try:
        c = zapapi.config(db)
        if not (c["ativo"] and c["url"] and c["chave"] and c["grupo"]):
            return
        grupo = c["grupo"]
        if "@g.us" not in grupo:
            return
        meu_num = (cfg.get(db, "WHATSAPP_MEU_NUMERO", "") or "").replace("+","").replace("-","").replace(" ","")
        msgs = zapapi.mensagens(grupo, 10, db) or []
        _ESCUTA["ultima_leitura"] = datetime.now().strftime("%d/%m %H:%M:%S")
        _ESCUTA["erro"] = None
        tss = [_ts_aware(x.get("ts")) for x in msgs if _ts_aware(x.get("ts"))]
        if _ESCUTA["ultimo_ts"] is None:
            _ESCUTA["ultimo_ts"] = max(tss) if tss else datetime.now(timezone.utc)
            return
        limite = datetime.now(timezone.utc) - timedelta(minutes=3)
        for x in msgs:
            t = _ts_aware(x.get("ts"))
            if not t or t <= _ESCUTA["ultimo_ts"]: continue
            _ESCUTA["ultimo_ts"] = t
            if t < limite: continue                          # mensagem muito antiga
            mid = x.get("id") or ""
            if mid and not _marcar_vista(mid): continue     # já processado pelo webhook
            de_mim = bool(x.get("de_mim"))
            autor_raw = (x.get("autor_numero") or "").replace("+","").replace("-","").replace(" ","")
            if meu_num:
                eh_meu = de_mim or (autor_raw and autor_raw.endswith(meu_num[-8:]))
                if not eh_meu: continue
            texto = (x.get("texto") or "").strip()
            if not texto: continue
            if de_mim and zapapi.foi_enviado_pelo_sistema(texto): continue
            resp = whatsapp.processar_comando(texto, db, remetente=autor_raw or grupo)
            if resp:
                ok = zapapi.enviar_texto(resp, grupo, db=db)
                seg = f"{(datetime.now(timezone.utc) - t).total_seconds():.1f}".replace(".", ",")
                _log(texto, f"respondido pela escuta em {seg} s (o webhook não chegou)" if ok
                     else "FALHOU ao enviar a resposta (escuta)", autor_raw)
    except Exception as e:
        _ESCUTA["erro"] = str(e)
        import logging; logging.getLogger("tomelin.wa").error("escuta: %s", e)
    finally:
        db.close()


# ── DEBUG: captura payloads brutos do gateway ───────────────
from collections import deque as _deque
_DEBUG_PAYLOADS: _deque = _deque(maxlen=20)

@router.post("/webhook/debug")
async def webhook_debug(req: Request, db: Session = Depends(get_db)):
    """Endpoint de debug: só funciona com WHATSAPP_DEBUG ativo nas configurações."""
    if not cfg.get_bool(db, "WHATSAPP_DEBUG", False):
        raise HTTPException(404, "Não encontrado.")
    try:
        body = await req.json()
    except Exception as e:
        body = {"erro_parse": str(e), "raw": (await req.body()).decode("utf-8", errors="replace")[:500]}
    _DEBUG_PAYLOADS.appendleft({
        "hora": datetime.now().strftime("%d/%m %H:%M:%S"),
        "payload": _resumir(body),
    })
    return {"ok": True, "recebido": _resumir(body)}

@router.get("/debug", dependencies=[Depends(usuario_atual)])
def debug_log(db: Session = Depends(get_db)):
    """Retorna os últimos payloads recebidos pelo webhook + estado atual da config."""
    from .. import zap_midia
    c = zapapi.config(db)
    return {
        "config": {
            "ativo": c["ativo"],
            "url": c["url"],
            "chave_configurada": bool(c["chave"]),
            # só o começo e o fim: dá para comparar com a chave do Sentinela sem expor a chave
            "chave_resumo": (f"{c['chave'][:4]}…{c['chave'][-4:]}" if len(c["chave"] or "") >= 10 else ("configurada" if c["chave"] else "")),
            "grupo": c["grupo"],
            "meu_numero": cfg.get(db, "WHATSAPP_MEU_NUMERO", "") or "",
            "endpoint": c["endpoint"],
        },
        "ultimo_atraso": _ATRASO.get("ultimo"),
        "webhook_url_principal": "/api/whatsapp/webhook",
        "webhook_url_debug": "/api/whatsapp/webhook/debug",
        "ultimos_payloads": list(_DEBUG_PAYLOADS),
        "ultimos_eventos": list(LOG_EVENTOS),
        "ultimas_midias": list(zap_midia.ULTIMAS),
    }


@router.get("/testar-url", dependencies=[Depends(usuario_atual)])
async def testar_url(req: Request):
    """Retorna a URL pública deste servidor: confirma que o webhook está acessível."""
    host = req.headers.get("x-forwarded-host") or req.headers.get("host") or ""
    proto = req.headers.get("x-forwarded-proto") or "https"
    base = f"{proto}://{host}" if host else ""
    return {
        "webhook_url": f"{base}/api/whatsapp/webhook",
        "debug_url": f"{base}/api/whatsapp/webhook/debug",
        "host": host,
        "proto": proto,
        "instrucao": "Copie 'webhook_url' e cadastre no painel zap.unicontroller.com.br → Webhooks com evento 'Mensagem recebida'",
    }


@router.get("/webhook/ping")
@router.post("/webhook/ping")  
async def webhook_ping(req: Request):
    """Endpoint público para testar conectividade: o gateway pode chamar isso."""
    headers_dict = dict(req.headers)
    _DEBUG_PAYLOADS.appendleft({
        "hora": datetime.now().strftime("%d/%m %H:%M:%S"),
        "payload": {
            "tipo": "PING", "method": req.method,
            "host": req.headers.get("host",""),
            "x-forwarded-for": req.headers.get("x-forwarded-for",""),
            "x-forwarded-proto": req.headers.get("x-forwarded-proto",""),
            "origem_ip": req.client.host if req.client else "?"
        }
    })
    return {
        "ok": True, "pong": True, "servidor": "tomelin-financeiro",
        "host_recebido": req.headers.get("host",""),
        "proto": req.headers.get("x-forwarded-proto","http"),
        "url_webhook": f"{req.headers.get('x-forwarded-proto','http')}://{req.headers.get('x-forwarded-host') or req.headers.get('host','')}/api/whatsapp/webhook"
    }


# ── URL do túnel (salvo pelo start.sh quando cloudflared sobe) ──
_TUNNEL_URL: list = []  # [url]: lista de 1 elemento para ser mutável

@router.post("/tunnel-url")
async def salvar_tunnel_url(body: dict, req: Request, db: Session = Depends(get_db)):
    """Chamado pelo start.sh de dentro do container. Só aceita localhost."""
    origem = req.client.host if req.client else ""
    if origem not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(403, "Endpoint interno.")
    url = (body.get("url") or "").strip()
    if url:
        if _TUNNEL_URL:
            _TUNNEL_URL[0] = url
        else:
            _TUNNEL_URL.append(url)
        # Salva nas configurações para mostrar na tela
        cfg.set_many(db, {"WHATSAPP_TUNNEL_URL": url})
        import logging; logging.getLogger("tomelin.webhook").warning("TUNNEL URL: %s", url)
    return {"ok": True, "url": url}

@router.get("/tunnel-url", dependencies=[Depends(usuario_atual)])
def get_tunnel_url(db: Session = Depends(get_db)):
    url = cfg.get(db, "WHATSAPP_TUNNEL_URL", "") or ""
    return {"url": url}
