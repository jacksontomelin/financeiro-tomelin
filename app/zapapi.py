"""
Cliente da API pública v1 do gateway WhatsApp Jackson (zap.unicontroller.com.br).

Autenticação: header  X-API-Key: <chave>   (ou Authorization: Bearer <chave>)
A chave é gerada no painel do gateway → API Keys.

Endpoints v1 (todos exigem a chave):
  GET  /api/v1/status                         conexão do WhatsApp
  POST /api/v1/enviar        {jid|numero, texto}
  POST /api/v1/enviar-anexo  multipart: arquivo + jid|numero + caption
  GET  /api/v1/chats                           últimas 200 conversas
  GET  /api/v1/grupos        ?busca=           todos os grupos {total, grupos:[{jid,nome}]}
  GET  /api/v1/mensagens     ?jid=&limite=     mensagens de um chat
  POST /api/v1/send-image    {jid|numero, url, caption}
  POST /api/v1/send-document {jid|numero, url, fileName, mimetype, caption}
  POST /api/v1/send-video    {jid|numero, url, caption}
  POST /api/v1/send-audio    {jid|numero, url, mimetype}
  POST /api/v1/send-location {jid|numero, lat, lng, nome, endereco}
  POST /api/v1/send-contact  {jid|numero, nome, telefone}
  POST /api/v1/send-reaction {msgId, emoji}
  POST /api/v1/reply         {msgId, texto}   (responde citando a mensagem)
  POST /api/v1/delete-message{msgId}
  POST /api/v1/read-message  {jid|numero}

Webhook (cadastrado no painel do gateway → Webhooks) — POST JSON:
  { evento: received|sent|status|mensagem_apagada, jid, deMim, tipo, texto,
    autorNome, autorNumero, id, ts, midia, timestamp }
"""
import logging
import time

import httpx

from . import cfg
from .database import SessionLocal

log = logging.getLogger("tomelin.zapapi")

# textos enviados recentemente pelo próprio sistema (anti-loop do webhook "sent")
_ENVIADOS: dict[str, float] = {}


def _lembrar(texto: str):
    agora = time.time()
    for k in [k for k, t in _ENVIADOS.items() if agora - t > 120]:
        _ENVIADOS.pop(k, None)
    _ENVIADOS[texto.strip()[:500]] = agora


def foi_enviado_pelo_sistema(texto: str) -> bool:
    t = _ENVIADOS.get((texto or "").strip()[:500])
    return bool(t and time.time() - t < 120)


def config(db=None) -> dict:
    """Lê a configuração do painel (banco) com fallback nas variáveis de ambiente."""
    fechar = db is None
    db = db or SessionLocal()
    try:
        endpoint = cfg.get(db, "WHATSAPP_ENDPOINT_ENVIAR", "/api/v1/enviar") or "/api/v1/enviar"
        if endpoint.strip() in ("/api/enviar", "api/enviar", ""):
            endpoint = "/api/v1/enviar"  # rota antiga exige login do painel — migra para v1
        return {
            "ativo": cfg.get_bool(db, "WHATSAPP_ATIVO", False),
            "url": (cfg.get(db, "WHATSAPP_API_URL", "") or "").rstrip("/"),
            "chave": (cfg.get(db, "WHATSAPP_API_TOKEN", "") or "").strip(),
            "grupo": (cfg.get(db, "WHATSAPP_GRUPO", "") or "").strip(),
            "endpoint": endpoint,
        }
    finally:
        if fechar:
            db.close()


def _headers(c: dict) -> dict:
    return {"X-API-Key": c["chave"], "Authorization": f"Bearer {c['chave']}"}


def _destino(alvo: str) -> dict:
    """jid completo (…@g.us / …@s.whatsapp.net) ou número com DDD."""
    alvo = (alvo or "").strip()
    if "@" in alvo:
        return {"jid": alvo}
    return {"numero": alvo}


def _req(metodo: str, caminho: str, db=None, **kw):
    c = config(db)
    if not c["url"] or not c["chave"]:
        raise RuntimeError("Gateway não configurado (URL e chave de API).")
    r = httpx.request(metodo, c["url"] + caminho, headers=_headers(c), timeout=25, **kw)
    if r.status_code == 401:
        raise RuntimeError("Chave de API inválida ou revogada no gateway.")
    if r.status_code >= 400:
        try:
            erro = r.json().get("erro")
        except Exception:
            erro = r.text[:200]
        raise RuntimeError(f"Gateway respondeu {r.status_code}: {erro}")
    try:
        return r.json()
    except Exception:
        return {"ok": True}


# ─────────────────────────── Envio ───────────────────────────
def enviar_texto(texto: str, destino: str | None = None, db=None) -> bool:
    c = config(db)
    if not c["ativo"]:
        log.info("[whatsapp desativado] %s", texto.replace("\n", " | ")[:120])
        return False
    destino = destino or c["grupo"]
    if not destino:
        log.warning("WHATSAPP_GRUPO não configurado.")
        return False
    try:
        _lembrar(texto)
        _req("POST", c["endpoint"], db, json={**_destino(destino), "texto": texto})
        return True
    except Exception as e:
        log.error("Falha ao enviar WhatsApp: %s", e)
        return False


def responder(msg_id: str, texto: str, db=None) -> bool:
    """Responde citando a mensagem original (fica bonito no grupo)."""
    try:
        _lembrar(texto)
        _req("POST", "/api/v1/reply", db, json={"msgId": msg_id, "texto": texto})
        return True
    except Exception as e:
        log.warning("reply falhou (%s) — caindo para envio simples", e)
        return False


def reagir(msg_id: str, emoji: str, db=None) -> bool:
    try:
        _req("POST", "/api/v1/send-reaction", db, json={"msgId": msg_id, "emoji": emoji})
        return True
    except Exception:
        return False


def enviar_arquivo(conteudo: bytes, nome: str, mimetype: str, legenda: str = "",
                   destino: str | None = None, db=None) -> bool:
    """Envia um arquivo (ex.: PDF de recibo/relatório) via multipart."""
    c = config(db)
    if not c["ativo"]:
        return False
    destino = destino or c["grupo"]
    if not destino:
        return False
    try:
        _req("POST", "/api/v1/enviar-anexo", db,
             data={**_destino(destino), "caption": legenda},
             files={"arquivo": (nome, conteudo, mimetype)})
        return True
    except Exception as e:
        log.error("Falha ao enviar anexo: %s", e)
        return False


# ─────────────────────────── Consultas ───────────────────────────
def status(db=None) -> dict:
    return _req("GET", "/api/v1/status", db)


def grupos(busca: str = "", db=None) -> list:
    r = _req("GET", "/api/v1/grupos", db, params={"busca": busca} if busca else None)
    return r.get("grupos", []) if isinstance(r, dict) else r


def mensagens(jid: str, limite: int = 30, db=None) -> list:
    return _req("GET", "/api/v1/mensagens", db, params={"jid": jid, "limite": limite})
