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

    m = _extrai(raw)
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

    arq = whatsapp.processar_arquivo(m["texto"], db)
    if arq:
        if arq[0] == "ERRO":
            _responder(m, arq[1], destino, db)
        else:
            pdf, nome, legenda = arq
            if not zapapi.enviar_arquivo(pdf, nome, "application/pdf", legenda, destino, db=db):
                _responder(m, "⚠️ Não consegui enviar o PDF agora. Tente novamente.", destino, db)
        return {"ok": True, "respondido": True, "arquivo": True}

    resposta = whatsapp.processar_comando(m["texto"], db, remetente=m["autor"] or destino)
    if not resposta:
        return {"ok": True, "respondido": False}
    _responder(m, resposta, destino, db)
    if m["id"] and resposta.startswith(("💸", "💵", "✅")):
        zapapi.reagir(m["id"], "✅", db=db)
    return {"ok": True, "respondido": True}


def _responder(m: dict, texto: str, destino: str, db):
    """Responde citando o comando (reply); se falhar, envia mensagem simples."""
    if m.get("id") and zapapi.config(db)["ativo"] and zapapi.responder(m["id"], texto, db=db):
        return
    whatsapp.enviar(texto, destino, db=db)


@router.get("/status", dependencies=[Depends(usuario_atual)])
def status(db: Session = Depends(get_db)):
    c = zapapi.config(db)
    info = {
        "ativo": c["ativo"], "gateway": c["url"] or None,
        "chave_configurada": bool(c["chave"]), "grupo": c["grupo"] or None,
        "endpoint": c["endpoint"],
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
