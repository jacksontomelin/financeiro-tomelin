"""Endereço público do sistema, usado nos QR codes e links dos PDFs.

Ordem:
1. APP_URL definido no servidor (.env) ou em Configurações → PDFs e recibos;
2. o domínio que a família usa para abrir o sistema, aprendido sozinho
   das requisições do navegador (guardado no banco, sobrevive a reinícios).

Antes o QR caía em http://localhost:8000 quando APP_URL estava vazio.
"""
import logging
import re

log = logging.getLogger("tomelin.urls")

CHAVE_DETECTADA = "APP_URL_DETECTADA"
_MEMORIA = {"url": ""}
_IP = re.compile(r"^\d{1,3}(\.\d{1,3}){3}$|^\[?[0-9a-f:]+\]?$", re.I)


def _host_publico(host: str) -> bool:
    h = (host or "").split(":")[0].strip().lower()
    if not h or "." not in h or h == "localhost" or h.endswith((".local", ".internal", ".lan")):
        return False
    return not _IP.match(h)


def _limpa(url: str) -> str:
    url = (url or "").strip().rstrip("/")
    if url and not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def aprender(request) -> None:
    """Guarda o domínio pelo qual um usuário logado abriu o sistema."""
    try:
        if not request.headers.get("authorization"):
            return
        if request.url.path.startswith("/api/whatsapp/webhook"):
            return
        host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
        if not _host_publico(host):
            return
        proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
        url = f"{proto}://{host}"
        if url == _MEMORIA["url"]:
            return
        _MEMORIA["url"] = url
        from .database import SessionLocal
        from . import models
        db = SessionLocal()
        try:
            item = db.get(models.Configuracao, CHAVE_DETECTADA)
            if item is None:
                db.add(models.Configuracao(chave=CHAVE_DETECTADA, valor=url,
                                           descricao="Endereço detectado automaticamente (QR codes)"))
            elif item.valor != url:
                item.valor = url
            else:
                return
            db.commit()
            log.info("Endereço público detectado: %s", url)
        finally:
            db.close()
    except Exception as e:   # nunca atrapalha a requisição
        log.debug("aprender url: %s", e)


def publica() -> str:
    """URL base pública (sem barra no fim) ou "" se ainda desconhecida."""
    from .config import settings
    if settings.APP_URL.strip():
        return _limpa(settings.APP_URL)
    from .database import SessionLocal
    from . import models
    db = SessionLocal()
    try:
        manual = db.get(models.Configuracao, "APP_URL")
        if manual and (manual.valor or "").strip():
            return _limpa(manual.valor)
        if _MEMORIA["url"]:
            return _MEMORIA["url"]
        det = db.get(models.Configuracao, CHAVE_DETECTADA)
        return _limpa(det.valor) if det and det.valor else ""
    except Exception:
        return _MEMORIA["url"]
    finally:
        db.close()


def verificar(codigo: str) -> str:
    """O que vai dentro do QR: link de verificação ou, sem endereço, só o código."""
    base = publica()
    return f"{base}/verificar/{codigo}" if base else codigo
