"""
Webhook e endpoints do WhatsApp — integração com o gateway WhatsApp Jackson
(zap.unicontroller.com.br) pela API pública v1.

Webhook do gateway (painel → Webhooks, eventos: received + sent):
  { evento, jid, deMim, tipo, texto, autorNome, autorNumero, id, ts, midia, timestamp }
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..security import usuario_atual
from .. import whatsapp, zapapi, cfg

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])


def _extrai(data: dict) -> dict:
    """Normaliza o payload (formato WhatsApp Jackson + fallbacks Baileys/Evolution)."""
    def first(d, *keys):
        for k in keys:
            v = d.get(k)
            if v not in (None, ""):
                return v
        return None

    d = data
    for campo in ("data", "payload"):
        if isinstance(data.get(campo), dict) and not data.get("texto"):
            d = {**data, **data[campo]}
    msg = d.get("message") if isinstance(d.get("message"), dict) else {}
    texto = first(d, "texto", "text", "mensagem", "body", "conteudo") or \
        msg.get("conversation") or (msg.get("extendedTextMessage") or {}).get("text") or ""
    key = d.get("key") if isinstance(d.get("key"), dict) else {}
    return {
        "evento": first(d, "evento", "event") or "received",
        "jid": first(d, "jid", "remoteJid", "chatId", "grupo", "from") or key.get("remoteJid") or "",
        "texto": str(texto).strip(),
        "id": first(d, "id", "msgId", "messageId") or key.get("id"),
        "deMim": bool(first(d, "deMim", "fromMe") or key.get("fromMe")),
        "autor": first(d, "autorNome", "pushName", "autorNumero", "remetente") or "",
    }


@router.post("/webhook")
async def webhook(req: Request, db: Session = Depends(get_db)):
    """Recebe eventos do gateway e responde a comandos do grupo de controle."""
    try:
        raw = await req.json()
    except Exception:
        return {"ok": False, "erro": "payload inválido"}
    if not isinstance(raw, dict):
        return {"ok": False, "erro": "payload inválido"}

    return processar_mensagem(_extrai(raw), db, origem="webhook")


# ───────────── processamento comum (webhook + escuta direta) ─────────────
from collections import deque
from datetime import datetime

_PROCESSADOS: deque = deque(maxlen=500)   # ids já tratados (evita responder 2x)
LOG_EVENTOS: deque = deque(maxlen=40)     # últimos eventos para o diagnóstico


def _log(m: dict, origem: str, resultado: str):
    LOG_EVENTOS.appendleft({
        "hora": datetime.now().strftime("%d/%m %H:%M:%S"), "origem": origem,
        "autor": ("você" if m.get("deMim") else (m.get("autor") or "")), "texto": (m.get("texto") or "")[:80],
        "resultado": resultado,
    })


def processar_mensagem(m: dict, db, origem: str = "webhook") -> dict:
    if m.get("id"):
        if m["id"] in _PROCESSADOS:
            return {"ok": True, "ignorado": "já processada"}
        _PROCESSADOS.append(m["id"])
    if m["evento"] not in ("received", "sent", "message", "messages.upsert"):
        return {"ok": True, "ignorado": f"evento {m['evento']}"}
    if not m["texto"]:
        return {"ok": True, "ignorado": "sem texto"}
    if m["deMim"] and zapapi.foi_enviado_pelo_sistema(m["texto"]):
        return {"ok": True, "ignorado": "mensagem do próprio sistema"}

    c = zapapi.config(db)
    alvo = c["grupo"]
    if alvo and m["jid"] and alvo != m["jid"] and alvo not in m["jid"]:
        return {"ok": True, "ignorado": "fora do grupo de controle"}
    destino = m["jid"] or alvo

    # verifica se é o dono (igual ao Sentinela): deMim=true OU autorNumero bate com meu número
    meu_num = (cfg.get(db, "WHATSAPP_MEU_NUMERO", "") or "").replace("+","").replace("-","").replace(" ","")
    if meu_num:
        autor_raw = (m.get("autor_num") or "").replace("+","").replace("-","").replace(" ","")
        eh_meu = m.get("deMim") or (autor_raw and autor_raw.endswith(meu_num[-8:]))
        if not eh_meu:
            _log(m, "webhook", "ignorado: não é o dono")
            return {"ok": True, "ignorado": "não é o dono"}

    try:
        arq = whatsapp.processar_arquivo(m["texto"], db)
    except Exception as e:
        _log(m, origem, f"erro ao gerar PDF: {e}")
        _responder(m, "⚠️ Erro ao gerar o PDF.", destino, db)
        return {"ok": False}
    if arq:
        if arq[0] == "ERRO":
            _responder(m, arq[1], destino, db); _log(m, origem, "respondido (não encontrado)")
        else:
            pdf, nome, legenda = arq
            ok = zapapi.enviar_arquivo(pdf, nome, "application/pdf", legenda, destino, db=db)
            _log(m, origem, f"PDF {nome} {'enviado' if ok else 'FALHOU no envio'}")
            if not ok:
                _responder(m, "⚠️ Não consegui enviar o PDF agora. Tente novamente.", destino, db)
        return {"ok": True, "respondido": True, "arquivo": True}

    try:
        resposta = whatsapp.processar_comando(m["texto"], db, remetente=m["autor"] or destino)
    except Exception as e:
        _log(m, origem, f"erro no comando: {e}")
        _responder(m, "⚠️ Deu um erro ao processar esse comando.", destino, db)
        return {"ok": False}
    if not resposta:
        _log(m, origem, "não é comando")
        return {"ok": True, "respondido": False}
    enviado = _responder(m, resposta, destino, db)
    _log(m, origem, "respondido" if enviado else "resposta FALHOU no envio")
    if m["id"] and resposta.startswith(("💸", "💵", "✅")):
        zapapi.reagir(m["id"], "✅", db=db)
    return {"ok": True, "respondido": True}


def _responder(m: dict, texto: str, destino: str, db) -> bool:
    """Responde citando o comando (reply); se falhar, envia mensagem simples."""
    if m.get("id") and zapapi.config(db)["ativo"] and zapapi.responder(m["id"], texto, db=db):
        return True
    return whatsapp.enviar(texto, destino, db=db)


@router.get("/status", dependencies=[Depends(usuario_atual)])
def status(db: Session = Depends(get_db)):
    c = zapapi.config(db)
    info = {
        "ativo": c["ativo"], "gateway": c["url"] or None,
        "chave_configurada": bool(c["chave"]), "grupo": c["grupo"] or None,
        "endpoint": c["endpoint"], "meu_numero": cfg.get(db, "WHATSAPP_MEU_NUMERO", "") or "",
        "alerta_hora": cfg.get_int(db, "ALERTA_HORA", 8),
        "alerta_dias_antes": cfg.get_int(db, "ALERTA_DIAS_ANTES", 3),
        "resumo_semanal": cfg.get_bool(db, "RESUMO_SEMANAL", True),
        "fechamento_diario": cfg.get_bool(db, "FECHAMENTO_DIARIO", True),
        "conectado": None, "erro_gateway": None, "numero": None,
    }
    if c["url"] and c["chave"]:
        try:
            st = zapapi.status(db)
            info["conectado"] = bool(st.get("conectado"))
            info["numero"] = st.get("numero") or st.get("me") or st.get("usuario")
        except Exception as e:
            info["erro_gateway"] = str(e)
    return info


@router.get("/grupos", dependencies=[Depends(usuario_atual)])
def listar_grupos(busca: str = "", db: Session = Depends(get_db)):
    try:
        return {"ok": True, "grupos": zapapi.grupos(busca, db)}
    except Exception as e:
        return {"ok": False, "erro": str(e), "grupos": []}


@router.post("/grupo", dependencies=[Depends(usuario_atual)])
def definir_grupo(body: dict, db: Session = Depends(get_db)):
    jid = (body.get("jid") or "").strip()
    cfg.set_many(db, {"WHATSAPP_GRUPO": jid})
    return {"ok": True, "grupo": jid}


@router.post("/teste", dependencies=[Depends(usuario_atual)])
def teste(db: Session = Depends(get_db)):
    from .. import service
    ok = whatsapp.enviar("✅ *Teste Tomelin Gestão Financeira*\n\n" + service.texto_resumo_mes(db), db=db)
    return {"enviado": ok}


# ───────────── ESCUTA DIRETA DO GRUPO (não depende de webhook) ─────────────
#  A cada poucos segundos lê as mensagens novas do grupo por GET /api/v1/mensagens.
#  Pega inclusive as mensagens que VOCÊ digita (no gateway elas são "enviadas",
#  e o webhook "Mensagem recebida" não as entrega).
_ESCUTA = {"ultimo_ts": None, "ultima_leitura": None, "erro": None}


def _ts(v) -> datetime | None:
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None


def _resolver_grupo(c: dict, db) -> str:
    """Se WHATSAPP_GRUPO for um NOME, descobre o JID e salva."""
    g = c["grupo"]
    if not g or "@" in g:
        return g
    candidatos = [x for x in zapapi.grupos(g, db) if (x.get("nome") or "").strip().lower() == g.strip().lower()] \
        or zapapi.grupos(g, db)
    if len(candidatos) == 1:
        cfg.set_many(db, {"WHATSAPP_GRUPO": candidatos[0]["jid"]})
        return candidatos[0]["jid"]
    raise RuntimeError(f"Grupo '{g}' não encontrado (ou ambíguo) — escolha na tela WhatsApp.")


def job_escutar_grupo():
    from ..database import SessionLocal
    from datetime import timezone, timedelta
    db = SessionLocal()
    try:
        c = zapapi.config(db)
        if not (c["ativo"] and c["url"] and c["chave"] and c["grupo"]):
            return
        if not cfg.get_bool(db, "WHATSAPP_ESCUTA", True):
            return
        jid = _resolver_grupo(c, db)
        meu_num = (cfg.get(db, "WHATSAPP_MEU_NUMERO", "") or "").replace("+","").replace("-","").replace(" ","")
        msgs = zapapi.mensagens(jid, 15, db) or []
        _ESCUTA["ultima_leitura"] = datetime.now().strftime("%d/%m %H:%M:%S"); _ESCUTA["erro"] = None
        tss = [_ts(x.get("ts")) for x in msgs if _ts(x.get("ts"))]
        if _ESCUTA["ultimo_ts"] is None:            # primeira leitura: só marca o ponto de partida
            _ESCUTA["ultimo_ts"] = max(tss) if tss else datetime.now(timezone.utc)
            return
        limite_idade = datetime.now(timezone.utc) - timedelta(minutes=5)
        for x in msgs:
            t = _ts(x.get("ts"))
            if not t or t <= _ESCUTA["ultimo_ts"]:
                continue
            _ESCUTA["ultimo_ts"] = t
            if t.tzinfo and t < limite_idade:       # mensagem antiga (servidor ficou fora) → não responde
                continue
            autor_raw = (x.get("autor_numero") or "").replace("+","").replace("-","").replace(" ","")
            de_mim = bool(x.get("de_mim"))
            if meu_num:
                eh_meu = de_mim or (autor_raw and autor_raw.endswith(meu_num[-8:]))
                if not eh_meu:
                    continue
            processar_mensagem({
                "evento": "sent" if de_mim else "received", "jid": jid,
                "texto": (x.get("texto") or "").strip(), "id": x.get("id"),
                "autor_num": autor_raw,
                "deMim": de_mim, "autor": x.get("autor_nome") or x.get("autor_numero") or "",
            }, db, origem="escuta")
    except Exception as e:
        _ESCUTA["erro"] = str(e)
    finally:
        db.close()


@router.get("/diagnostico", dependencies=[Depends(usuario_atual)])
def diagnostico(db: Session = Depends(get_db)):
    c = zapapi.config(db)
    checks = []
    def chk(nome, ok, detalhe=""):
        checks.append({"nome": nome, "ok": bool(ok), "detalhe": detalhe})
    chk("Envio ativado", c["ativo"], "" if c["ativo"] else "Ative no passo 1")
    chk("URL do gateway", c["url"], c["url"] or "não configurada")
    chk("Chave de API", c["chave"], "configurada" if c["chave"] else "não configurada")
    conectado, ultimas = False, []
    if c["url"] and c["chave"]:
        try:
            st = zapapi.status(db); conectado = bool(st.get("conectado"))
            chk("Gateway responde com a chave", True, "")
            chk("WhatsApp conectado no gateway", conectado, "" if conectado else "Reconecte o WhatsApp no painel do gateway")
        except Exception as e:
            chk("Gateway responde com a chave", False, str(e))
    grupo_ok = bool(c["grupo"]) and "@g.us" in c["grupo"]
    chk("Grupo definido (JID @g.us)", grupo_ok, c["grupo"] or "escolha o grupo no passo 2")
    if grupo_ok and conectado:
        try:
            ultimas = zapapi.mensagens(c["grupo"], 5, db) or []
            chk("Leitura das mensagens do grupo", True, f"{len(ultimas)} mensagem(ns) lida(s)")
        except Exception as e:
            chk("Leitura das mensagens do grupo", False, str(e))
    chk("Escuta direta do grupo", cfg.get_bool(db, "WHATSAPP_ESCUTA", True) and not _ESCUTA["erro"],
        _ESCUTA["erro"] or (f"última leitura {_ESCUTA['ultima_leitura']}" if _ESCUTA["ultima_leitura"] else "aguardando primeira leitura"))
    return {
        "checks": checks,
        "ultimas_mensagens": [{"autor": "você" if u.get("de_mim") else (u.get("autor_nome") or ""),
                               "texto": (u.get("texto") or "")[:80], "ts": u.get("ts")} for u in ultimas[-5:]],
        "eventos": list(LOG_EVENTOS),
    }
