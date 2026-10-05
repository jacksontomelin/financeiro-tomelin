"""Comprovante pelo WhatsApp: foto ou PDF mandado no grupo vira anexo do lançamento.

  foto com legenda "anexo 42"            → anexa no lançamento #42
  foto com legenda "despesa 89 farmácia" → lança a despesa e anexa a foto nela
  foto sem legenda, logo depois de lançar pelo WhatsApp (15 min) → anexa nesse
  "remover anexo 42"                     → tira o último comprovante do #42

O formato da mídia que o gateway manda varia: aceita base64, data URI ou
link (baixado com a chave do gateway quando é dele).
"""
import base64
import binascii
import logging
import re
import time

import httpx
from sqlalchemy import func

from . import models, zapapi
from .routers.anexos import MAX_BYTES, MAX_POR_LANCAMENTO, _tipo_real

log = logging.getLogger("tomelin.zap_midia")
JANELA_SEG = 15 * 60
_ULTIMO: dict[str, tuple[int, float]] = {}      # remetente -> (lançamento, quando)


def lembrar_lancamento(remetente: str | None, lid: int):
    _ULTIMO[remetente or "?"] = (lid, time.time())


def _recente(remetente: str | None) -> int | None:
    lid, quando = _ULTIMO.get(remetente or "?", (None, 0))
    return lid if lid and time.time() - quando < JANELA_SEG else None


def _campo(d: dict, *nomes):
    for n in nomes:
        if d.get(n):
            return d[n]
    return None


def obter_arquivo(midia, db) -> tuple[bytes, str] | None:
    """(bytes, nome) da mídia, ou None se não der para pegar."""
    nome = "comprovante"
    if isinstance(midia, dict):
        nome = str(_campo(midia, "fileName", "filename", "nome", "name") or nome)
        dado = _campo(midia, "base64", "data", "b64", "conteudo")
        url = _campo(midia, "url", "link", "mediaUrl", "href")
    else:
        s = str(midia or "")
        dado, url = (None, s) if s.startswith(("http://", "https://", "/")) else (s, None)
    if dado:
        try:
            return base64.b64decode(str(dado).split(",", 1)[-1], validate=False), nome
        except (binascii.Error, ValueError):
            return None
    if not url:
        return None
    c = zapapi.config(db)
    if url.startswith("/"):
        url = c["url"] + url
    headers = zapapi._headers(c) if c["url"] and url.startswith(c["url"]) else {}
    try:
        with httpx.stream("GET", url, headers=headers, timeout=25, follow_redirects=True) as r:
            r.raise_for_status()
            bruto = b""
            for parte in r.iter_bytes():
                bruto += parte
                if len(bruto) > MAX_BYTES:
                    return bruto, nome           # anexar() recusa pelo tamanho
            return bruto, nome
    except Exception as e:
        log.warning("Não baixei a mídia do WhatsApp: %s", e)
        return None


def anexar(db, lid: int, bruto: bytes, nome: str) -> str | None:
    """Anexa; devolve mensagem de erro ou None se deu certo."""
    if not db.get(models.Lancamento, lid):
        return f"❌ Lançamento #{lid} não encontrado."
    n = db.query(func.count(models.Anexo.id)).filter(models.Anexo.lancamento_id == lid).scalar() or 0
    if n >= MAX_POR_LANCAMENTO:
        return f"❌ O #{lid} já tem {MAX_POR_LANCAMENTO} comprovantes (o máximo)."
    if len(bruto) > MAX_BYTES:
        return "❌ Arquivo grande demais: o limite é 5 MB."
    mime, ext = _tipo_real(bruto)
    if not mime:
        return "❌ Só dá para anexar foto (JPG, PNG, WEBP) ou PDF."
    nome = re.sub(r"[\x00-\x1f/\\]", "", nome)[:150] or "comprovante"
    if "." not in nome:
        nome += f".{ext}"
    db.add(models.Anexo(lancamento_id=lid, nome=nome, mime=mime, tamanho=len(bruto), dados=bruto))
    db.commit()
    return None


def processar(midia, legenda: str, db, remetente: str | None = None) -> str | None:
    """Resposta para o grupo, ou None para ficar quieto (foto qualquer da família)."""
    from . import whatsapp
    leg = (legenda or "").strip()
    baixo = whatsapp._sem_acento(leg.lower())
    m = re.match(r"^(anexo|anexar|comprovante)\s*#?(\d+)\b", baixo)
    novo = None
    if m:
        lid = int(m.group(2))
    elif re.match(r"^(despesa|gasto|receita|recebimento|d|r)\s+\S", baixo):
        resp = whatsapp.processar_comando(leg, db, remetente=remetente)
        lid = _recente(remetente)
        if not resp or not lid:
            return resp
        novo = resp
    else:
        lid = _recente(remetente)
        if not lid:
            return None
    arq = obter_arquivo(midia, db)
    if not arq:
        return (novo + "\n\n" if novo else "") + "⚠️ Não consegui baixar o arquivo do WhatsApp. Anexe pelo sistema."
    erro = anexar(db, lid, *arq)
    if erro:
        return (novo + "\n\n" if novo else "") + erro
    l = db.get(models.Lancamento, lid)
    ok = f"📎 Comprovante anexado no *#{lid}: {l.descricao}*.\nErrado? Mande `remover anexo {lid}`."
    return f"{novo}\n\n{ok}" if novo else ok


def remover(db, lid: int) -> str:
    a = (db.query(models.Anexo).filter(models.Anexo.lancamento_id == lid)
         .order_by(models.Anexo.id.desc()).first())
    if not a:
        return f"ℹ️ O #{lid} não tem comprovante."
    db.delete(a); db.commit()
    return f"🗑️ Tirei o comprovante \"{a.nome}\" do #{lid}."
