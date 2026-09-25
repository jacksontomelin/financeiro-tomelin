from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..config import settings
from ..security import usuario_atual
from .. import whatsapp

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])


def _extrai(data: dict) -> tuple[str, str]:
    """Tenta achar (grupo, texto) em vários formatos de payload de gateway."""
    def first(*keys):
        for k in keys:
            if k in data and data[k]:
                return str(data[k])
        return ""
    grupo = first("grupo", "group", "from", "remoteJid", "chatId", "de", "para")
    texto = first("mensagem", "message", "texto", "text", "body", "conteudo")
    # formatos aninhados comuns (Baileys / whatsapp.jackson)
    if not texto and isinstance(data.get("data"), dict):
        return _extrai(data["data"])
    if not texto and isinstance(data.get("message"), dict):
        return _extrai(data["message"])
    return grupo, texto


@router.post("/webhook")
async def webhook(req: Request, db: Session = Depends(get_db)):
    """Recebe mensagens do grupo de controle e responde a comandos (estilo Sentinela)."""
    try:
        data = await req.json()
    except Exception:
        return {"ok": False, "erro": "payload inválido"}

    grupo, texto = _extrai(data if isinstance(data, dict) else {})

    # se um grupo de controle está configurado, só responde a ele
    alvo = settings.WHATSAPP_GRUPO
    if alvo and grupo and alvo not in grupo and grupo not in alvo:
        return {"ok": True, "ignorado": "fora do grupo de controle"}

    resposta = whatsapp.processar_comando(texto, db)
    if resposta:
        whatsapp.enviar(resposta, grupo or alvo)
        return {"ok": True, "respondido": True}
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
    }


@router.post("/teste", dependencies=[Depends(usuario_atual)])
def teste(db: Session = Depends(get_db)):
    from .. import service
    ok = whatsapp.enviar("✅ *Teste Tomelin Gestão Financeira*\n\n"
                         + service.texto_resumo_mes(db))
    return {"enviado": ok}
