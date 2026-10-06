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
from collections import deque
from datetime import datetime
from urllib.parse import urlparse

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


# ── Diagnóstico: o que o gateway mandou e o que aconteceu ───────────
ULTIMAS: deque = deque(maxlen=12)
_CHAVES_MIDIA = ("midia", "media", "arquivo", "imagem", "image", "documento", "document", "file", "anexo", "attachment",
                 "imageMessage", "documentMessage")
_CHAVES_DADO = ("base64", "data", "b64", "conteudo", "content", "buffer", "dados")
_CHAVES_URL = ("url", "link", "mediaUrl", "media_url", "href", "urlArquivo", "downloadUrl", "download_url", "directPath")
_CHAVES_NOME = ("fileName", "filename", "file_name", "nome", "name", "nomeArquivo")


def _parece_midia(v, nivel: int = 0) -> bool:
    """Só conta como arquivo o que tem conteúdo ou link de verdade (nunca um campo vazio ou um texto curto)."""
    if isinstance(v, str):
        t = v.strip()
        return t.startswith(("data:", "http://", "https://")) or (len(t) > 200 and bool(_B64.fullmatch(t[:400])))
    if isinstance(v, dict) and nivel < 2:
        if any(v.get(k) for k in _CHAVES_DADO + _CHAVES_URL):
            return True
        return any(_parece_midia(x, nivel + 1) for x in v.values() if isinstance(x, dict))
    return False


def achar_midia(body: dict):
    """A mídia pode vir em vários nomes, no topo ou dentro de "mensagem"/"message"/"data"."""
    if not isinstance(body, dict):
        return None
    for k in _CHAVES_MIDIA:
        if _parece_midia(body.get(k)):
            return body[k]
    for k in ("mensagem", "message", "msg", "data", "payload"):
        v = body.get(k)
        if isinstance(v, dict):
            achado = achar_midia(v)
            if achado:
                return achado
    return None


_B64 = re.compile(r"[A-Za-z0-9+/=\s]+")


def formato(v, nivel: int = 0):
    """Descreve a forma da mídia sem guardar o conteúdo (nem base64 nem link inteiro)."""
    if isinstance(v, dict):
        if nivel > 2:
            return "objeto"
        return {k: formato(x, nivel + 1) for k, x in list(v.items())[:25]}
    if isinstance(v, list):
        return f"lista[{len(v)}]"
    if isinstance(v, str):
        if v.startswith(("http://", "https://")):
            host = urlparse(v).hostname or "?"
            return f"link ({host}{', criptografado' if v.split('?')[0].endswith('.enc') else ''})"
        if v.startswith("data:"):
            return f"data URI {v[5:v.find(';')] if ';' in v[:60] else ''} ({len(v)} caracteres)"
        if len(v) > 120:
            b64 = ", parece base64" if _B64.fullmatch(v[:400]) else ""
            return f"texto longo ({len(v)} caracteres{b64})"
        return v if len(v) <= 60 else f"texto ({len(v)} caracteres)"
    if isinstance(v, (int, float, bool)) or v is None:
        return v
    return type(v).__name__


def _registrar(midia, resultado: str, motivo: str = "", lid: int | None = None):
    ULTIMAS.appendleft({"hora": datetime.now().strftime("%d/%m %H:%M:%S"), "resultado": resultado,
                        "motivo": motivo, "lancamento_id": lid, "formato": formato(midia)})


def _ler(midia, db) -> tuple[tuple[bytes, str] | None, str]:
    """((bytes, nome) ou None, motivo quando não deu)."""
    nome = "comprovante"
    dado = url = None
    if isinstance(midia, dict):
        nome = str(_campo(midia, *_CHAVES_NOME) or nome)
        dado = _campo(midia, *_CHAVES_DADO)
        url = _campo(midia, *_CHAVES_URL)
        if isinstance(dado, dict):            # {"data": {"base64": ...}} ou Buffer do Node {"type":"Buffer","data":[...]}
            if isinstance(dado.get("data"), list):
                try:
                    return (bytes(dado["data"]), nome), ""
                except (ValueError, TypeError):
                    return None, "buffer em formato desconhecido"
            arq, motivo = _ler({**dado, "fileName": nome}, db)
            return arq, motivo
        if not dado and not url:
            for v in midia.values():          # um nível abaixo: {"imagem": {"url": ...}}
                if isinstance(v, dict):
                    arq, motivo = _ler({"fileName": nome, **v}, db)
                    if arq:
                        return arq, ""
            return None, "não achei o arquivo (nem base64 nem link) nos campos: " + ", ".join(list(midia)[:15])
    elif isinstance(midia, str):
        s = midia.strip()
        dado, url = (None, s) if s.startswith(("http://", "https://", "/")) else (s, None)
    else:
        return None, f"mídia veio como {type(midia).__name__}"
    if dado:
        try:
            bruto = base64.b64decode(re.sub(r"\s", "", str(dado).split(",", 1)[-1]), validate=False)
        except (binascii.Error, ValueError) as e:
            return None, f"base64 inválido ({e})"
        if not bruto:
            return None, "base64 vazio"
        return (bruto, nome), ""
    if not url:
        return None, "sem conteúdo"
    if "mmg.whatsapp.net" in url or url.split("?")[0].endswith(".enc"):
        return None, ("link criptografado do WhatsApp: o gateway precisa mandar o arquivo já baixado "
                      "(base64) ou um link dele mesmo")
    c = zapapi.config(db)
    if url.startswith("/"):
        if not c["url"]:
            return None, "link relativo e sem URL do gateway configurada"
        url = c["url"] + url
    headers = zapapi._headers(c) if c["url"] and url.startswith(c["url"]) else {}
    try:
        with httpx.stream("GET", url, headers=headers, timeout=25, follow_redirects=True) as r:
            if r.status_code >= 400:
                return None, f"o link respondeu {r.status_code}" + (" (precisa de login: chave do gateway?)" if r.status_code in (401, 403) else "")
            bruto = b""
            for parte in r.iter_bytes():
                bruto += parte
                if len(bruto) > MAX_BYTES:
                    break                    # anexar() recusa pelo tamanho
            return (bruto, nome), ""
    except Exception as e:
        log.warning("Não baixei a mídia do WhatsApp: %s", e)
        return None, f"não consegui baixar o link ({type(e).__name__})"


def obter_arquivo(midia, db) -> tuple[bytes, str] | None:
    """(bytes, nome) da mídia, ou None se não der para pegar."""
    return _ler(midia, db)[0]


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
    from . import historico
    historico.registrar(db, db.get(models.Lancamento, lid), "comprovante", autor="WhatsApp",
                        mudancas=[{"campo": "Comprovante", "de": None, "para": nome}])
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
            _registrar(midia, "ignorado", "sem legenda \"anexo N\" e nenhum lançamento feito pelo WhatsApp nos últimos 15 min")
            return None
    arq, motivo = _ler(midia, db)
    if not arq:
        _registrar(midia, "falhou", motivo, lid)
        return (novo + "\n\n" if novo else "") + f"⚠️ Não consegui pegar o arquivo: {motivo}. Anexe pelo sistema."
    erro = anexar(db, lid, *arq)
    if erro:
        _registrar(midia, "falhou", erro.lstrip("❌ "), lid)
        return (novo + "\n\n" if novo else "") + erro
    _registrar(midia, "anexado", f"{len(arq[0]) // 1024 or 1} KB", lid)
    l = db.get(models.Lancamento, lid)
    ok = f"📎 Comprovante anexado no *#{lid}: {l.descricao}*.\nErrado? Mande `remover anexo {lid}`."
    return f"{novo}\n\n{ok}" if novo else ok


def remover(db, lid: int) -> str:
    a = (db.query(models.Anexo).filter(models.Anexo.lancamento_id == lid)
         .order_by(models.Anexo.id.desc()).first())
    if not a:
        return f"ℹ️ O #{lid} não tem comprovante."
    nome = a.nome
    db.delete(a); db.commit()
    l = db.get(models.Lancamento, lid)
    if l:
        from . import historico
        historico.registrar(db, l, "comprovante", autor="WhatsApp", mudancas=[{"campo": "Comprovante", "de": nome, "para": None}])
    return f"🗑️ Tirei o comprovante \"{nome}\" do #{lid}."
