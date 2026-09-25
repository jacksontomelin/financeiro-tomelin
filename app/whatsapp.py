"""Integração com o WhatsApp no mesmo padrão do Sentinela:
envia alertas e recebe comandos pelo grupo de controle, via gateway
Baileys do whatsapp.jackson (zap.unicontroller.com.br).

O endpoint e o payload de envio são configuráveis (WHATSAPP_ENDPOINT_ENVIAR),
porque cada gateway tem seu formato. O default cobre {grupo, mensagem}.
"""
import logging

import httpx
from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal
from . import service

log = logging.getLogger("tomelin.whatsapp")

MENU = (
    "🏠 *Tomelin — Finanças da Família*\n"
    "Responda com o número ou a palavra:\n\n"
    "1️⃣  saldo — saldo das contas\n"
    "2️⃣  vencer — contas a vencer\n"
    "3️⃣  resumo — resumo do mês\n"
    "4️⃣  apagar — contas a pagar\n"
    "5️⃣  areceber — contas a receber\n"
    "6️⃣  patrimonio — contas + veículos\n"
    "7️⃣  juros — juros e multas do ano\n\n"
    "Digite *menu* para ver isto novamente."
)


def enviar(mensagem: str, grupo: str | None = None) -> bool:
    """Envia mensagem ao grupo de controle pelo gateway."""
    if not settings.WHATSAPP_ATIVO or not settings.WHATSAPP_API_URL:
        log.info("[whatsapp desativado] %s", mensagem.replace("\n", " | ")[:120])
        return False
    grupo = grupo or settings.WHATSAPP_GRUPO
    url = settings.WHATSAPP_API_URL.rstrip("/") + settings.WHATSAPP_ENDPOINT_ENVIAR
    headers = {}
    if settings.WHATSAPP_API_TOKEN:
        headers["Authorization"] = f"Bearer {settings.WHATSAPP_API_TOKEN}"
    # payload compatível com o gateway whatsapp.jackson; aliases p/ tolerância
    payload = {
        "grupo": grupo, "group": grupo, "para": grupo, "to": grupo,
        "mensagem": mensagem, "message": mensagem, "texto": mensagem, "text": mensagem,
    }
    try:
        r = httpx.post(url, json=payload, headers=headers, timeout=20)
        ok = r.status_code < 300
        if not ok:
            log.warning("Gateway respondeu %s: %s", r.status_code, r.text[:200])
        return ok
    except Exception as e:  # noqa
        log.error("Falha ao enviar WhatsApp: %s", e)
        return False


def processar_comando(texto: str, db: Session | None = None) -> str | None:
    """Interpreta um comando recebido do grupo e devolve a resposta (ou None)."""
    if not texto:
        return None
    t = texto.strip().lower()
    fechar = False
    if db is None:
        db = SessionLocal()
        fechar = True
    try:
        if t in ("menu", "ajuda", "help", "0", "oi", "ola", "olá"):
            return MENU
        if t in ("1", "saldo"):
            return service.texto_saldo(db)
        if t in ("2", "vencimentos", "vencimento", "vencer", "vence"):
            return service.texto_vencimentos(db, dias_antes=7)
        if t in ("3", "resumo", "mes", "mês", "resumo mes"):
            return service.texto_resumo_mes(db)
        if t in ("4", "apagar", "a pagar", "pagar", "contas a pagar"):
            return service.texto_a_pagar(db)
        if t in ("5", "areceber", "a receber", "receber", "contas a receber"):
            return service.texto_a_receber(db)
        if t in ("6", "patrimonio", "patrimônio", "veiculos", "veículos", "carros"):
            return service.texto_patrimonio(db)
        if t in ("7", "juros", "multa", "multas"):
            return service.texto_juros(db)
        return None  # não é comando -> ignora silenciosamente
    finally:
        if fechar:
            db.close()


# ---------- Jobs agendados ----------
def job_alerta_vencimentos():
    db = SessionLocal()
    try:
        v = service.vencimentos(db, dias_antes=settings.ALERTA_DIAS_ANTES)
        if not v["atrasados"] and not v["proximos"]:
            return  # nada a avisar hoje — fica quieto (estilo Sentinela)
        enviar("🔔 *Contas da casa a vencer*\n\n" +
               service.texto_vencimentos(db, dias_antes=settings.ALERTA_DIAS_ANTES))
    finally:
        db.close()


def job_resumo_semanal():
    if not settings.RESUMO_SEMANAL:
        return
    db = SessionLocal()
    try:
        enviar("🗓️ *Resumo da semana — Finanças da família*\n\n" + service.texto_resumo_mes(db))
    finally:
        db.close()


def job_fechamento_dia():
    if not settings.FECHAMENTO_DIARIO:
        return
    db = SessionLocal()
    try:
        txt = service.texto_fechamento_dia(db)
        if txt:  # só envia se houve movimento no dia
            enviar(txt)
    finally:
        db.close()
