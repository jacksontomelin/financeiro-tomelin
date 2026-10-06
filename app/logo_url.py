"""Logo colado como link: o sistema baixa a imagem e guarda dentro do banco.

Assim o logo não some se o site de origem trocar o endereço ou sair do ar.
Só baixa imagem (PNG, JPG, WEBP, GIF, SVG), até 3 MB, de endereços públicos
(nunca da rede interna do servidor). Imagem grande é reduzida para 256 px.
"""
import base64
import io
import ipaddress
import logging
import socket
import threading
from urllib.parse import urlparse

import httpx

log = logging.getLogger("tomelin.logo")
MAX_BYTES = 3 * 1024 * 1024
LADO = 256


class ErroLogo(Exception):
    pass


def eh_link(v) -> bool:
    return isinstance(v, str) and v.strip().lower().startswith(("http://", "https://"))


def _host_publico(url: str):
    host = urlparse(url).hostname or ""
    if not host:
        raise ErroLogo("link inválido")
    try:
        ips = {i[4][0] for i in socket.getaddrinfo(host, None)}
    except socket.gaierror:
        raise ErroLogo("o site não foi encontrado")
    for ip in ips:
        a = ipaddress.ip_address(ip.split("%")[0])
        if a.is_private or a.is_loopback or a.is_link_local or a.is_reserved or a.is_multicast or a.is_unspecified:
            raise ErroLogo("endereço da rede interna não é permitido")


def _tipo(b: bytes) -> str | None:
    if b[:8] == b"\x89PNG\r\n\x1a\n": return "image/png"
    if b[:3] == b"\xff\xd8\xff": return "image/jpeg"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP": return "image/webp"
    if b[:6] in (b"GIF87a", b"GIF89a"): return "image/gif"
    ini = b[:1024].lstrip().lower()
    if ini.startswith(b"<svg") or (ini.startswith(b"<?xml") and b"<svg" in b[:4096].lower()): return "image/svg+xml"
    return None


def _reduzir(b: bytes, mime: str) -> tuple[bytes, str]:
    """Raster grande vira PNG de até 256 px (mantém o fundo transparente)."""
    if mime == "image/svg+xml":
        return b, mime
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(b))
        im.seek(0)
        if max(im.size) <= LADO and len(b) <= 200 * 1024:
            return b, mime
        im = im.convert("RGBA")
        im.thumbnail((LADO, LADO), Image.LANCZOS)
        out = io.BytesIO(); im.save(out, "PNG", optimize=True)
        return out.getvalue(), "image/png"
    except Exception:
        return b, mime


def baixar(url: str) -> str:
    """Devolve a imagem como data URI; ErroLogo com o motivo se não der."""
    url = url.strip()
    if not eh_link(url):
        raise ErroLogo("o link precisa começar com http:// ou https://")
    _host_publico(url)

    def confere(req):            # redirecionamento para a rede interna também é barrado
        _host_publico(str(req.url))
    try:
        with httpx.Client(timeout=12, follow_redirects=True, max_redirects=5, event_hooks={"request": [confere]},
                          headers={"User-Agent": "Mozilla/5.0 (TomelinFinanceiro; logo)", "Accept": "image/*,*/*;q=0.5"}) as c:
            with c.stream("GET", url) as r:
                if r.status_code >= 400:
                    raise ErroLogo(f"o site respondeu {r.status_code}")
                bruto = b""
                for parte in r.iter_bytes():
                    bruto += parte
                    if len(bruto) > MAX_BYTES:
                        raise ErroLogo("imagem grande demais (máximo 3 MB)")
    except ErroLogo:
        raise
    except httpx.HTTPError as e:
        raise ErroLogo(f"não consegui abrir o link ({type(e).__name__})")
    mime = _tipo(bruto)
    if not mime:
        raise ErroLogo("o link não é de uma imagem (PNG, JPG, WEBP, GIF ou SVG)")
    bruto, mime = _reduzir(bruto, mime)
    return f"data:{mime};base64,{base64.b64encode(bruto).decode()}"


def guardar_no_payload(payload: dict, campo: str = "logo"):
    """Se o logo veio como link, troca pela imagem baixada (erro 422 com o motivo)."""
    from .erros import ErroCampo
    v = payload.get(campo)
    if eh_link(v):
        try:
            payload[campo] = baixar(v)
        except ErroLogo as e:
            raise ErroCampo(campo, f"Logo: {e}. Envie o arquivo da imagem ou tente outro link.")


def converter_antigos():
    """Na subida: logos antigos salvos como link viram imagem guardada (o que falhar fica como está)."""
    def rodar():
        from .database import SessionLocal
        from . import models
        db = SessionLocal()
        try:
            n = 0
            for modelo in (models.Contato, models.Conta):
                for o in db.query(modelo).filter(modelo.logo.ilike("http%")).all():
                    try:
                        o.logo = baixar(o.logo); n += 1
                        db.commit()
                    except Exception as e:
                        db.rollback()
                        log.info("Logo de %s #%s continua como link: %s", modelo.__tablename__, o.id, e)
            if n:
                log.info("%d logo(s) antigos guardados no sistema", n)
        finally:
            db.close()
    threading.Thread(target=rodar, daemon=True).start()
