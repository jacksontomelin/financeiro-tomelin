"""Webhook e endpoints do WhatsApp — integração com gateway Baileys (whatsapp.jackson)."""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..config import settings
from ..security import usuario_atual
from .. import whatsapp

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])


def _extrai(data: dict) -> tuple[str, str, str]:
    """
    Extrai (grupo, texto, remetente) de vários formatos de payload Baileys/Evolution.
    Retorna tupla de strings vazias se não achar.
    """
    def first(*keys):
        for k in keys:
            if k in data and data[k]:
                return str(data[k])
        return ""

    # formato Baileys 6.x via whatsapp.jackson
    grupo = first("grupo", "group", "from", "remoteJid", "chatId", "de", "para", "jid")
    texto = first("mensagem", "message", "texto", "text", "body", "conteudo", "content")
    remetente = first("remetente", "sender", "senderJid", "author", "pushName", "numero")

    # formatos aninhados (Evolution API, outros gateways)
    if not texto:
        for campo in ("data", "message", "evento", "event", "payload"):
            if isinstance(data.get(campo), dict):
                g2, t2, r2 = _extrai(data[campo])
                if t2:
                    grupo = grupo or g2
                    remetente = remetente or r2
                    return grupo, t2, remetente

    # Baileys aninhado: data.message.conversation ou data.message.extendedTextMessage.text
    msg = data.get("message", {})
    if isinstance(msg, dict):
        texto = texto or msg.get("conversation", "") or \
                (msg.get("extendedTextMessage") or {}).get("text", "")

    return grupo, texto, remetente


@router.post("/webhook")
async def webhook(req: Request, db: Session = Depends(get_db)):
    """Recebe mensagens do grupo e responde a comandos."""
    try:
        raw = await req.json()
    except Exception:
        return {"ok": False, "erro": "payload inválido"}

    data = raw if isinstance(raw, dict) else {}
    grupo, texto, remetente = _extrai(data)

    # Se um grupo de controle está configurado, só responde a ele
    alvo = settings.WHATSAPP_GRUPO
    if alvo and grupo and alvo not in grupo and grupo not in alvo:
        return {"ok": True, "ignorado": "fora do grupo de controle"}

    if not texto:
        return {"ok": True, "ignorado": "sem texto"}

    resposta = whatsapp.processar_comando(texto, db, remetente=remetente or grupo)
    if resposta:
        whatsapp.enviar(resposta, grupo or alvo)
        return {"ok": True, "respondido": True, "comando": texto[:80]}

    return {"ok": True, "respondido": False}


@router.get("/status", dependencies=[Depends(usuario_atual)])
def status():
    return {
        "ativo": settings.WHATSAPP_ATIVO,
        "gateway": settings.WHATSAPP_API_URL or None,
        "grupo": settings.WHATSAPP_GRUPO or None,
        "alerta_hora": settings.ALERTA_HORA,
        "alerta_dias_antes": settings.ALERTA_DIAS_ANTES,
        "resumo_semanal": settings.RESUMO_SEMANAL,
        "fechamento_diario": settings.FECHAMENTO_DIARIO,
    }


@router.post("/teste", dependencies=[Depends(usuario_atual)])
def teste(db: Session = Depends(get_db)):
    from .. import service
    ok = whatsapp.enviar(
        "✅ *Teste Tomelin Gestão Financeira*\n\n" +
        service.texto_resumo_mes(db))
    return {"enviado": ok}
