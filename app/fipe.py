"""Cliente da FIPEConsulta (tecnologia própria do Jackson) para valor automático de veículos.

É tolerante ao formato da resposta: procura o preço em várias chaves comuns
(valor, preco, price, valor_fipe, fipe...). Configurável por variáveis de ambiente,
igual ao gateway do WhatsApp: assim funciona com o endpoint que você já tem.
"""
import logging
import re
import httpx

from .config import settings

log = logging.getLogger("tomelin.fipe")

_PRICE_KEYS = ("valor", "preco", "preço", "price", "valor_fipe", "fipe", "valorFipe", "vlrFipe")


def _to_decimal(v):
    """Converte 'R$ 89.900,00' / '89900.00' / 89900 em float."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v)
    s = re.sub(r"[^\d,\.]", "", s)
    if "," in s and "." in s:          # formato brasileiro 1.234,56
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _extrai_preco(data):
    """Procura recursivamente um valor de preço na resposta JSON."""
    if isinstance(data, dict):
        for k in _PRICE_KEYS:
            if k in data:
                val = _to_decimal(data[k])
                if val:
                    return val
        for v in data.values():
            r = _extrai_preco(v)
            if r:
                return r
    elif isinstance(data, list):
        for v in data:
            r = _extrai_preco(v)
            if r:
                return r
    return None


def config(db) -> dict:
    """Configuração da FIPE: tela de Configurações (banco) > .env > padrão."""
    from . import cfg
    return {
        "ativo": cfg.get_bool(db, "FIPE_ATIVO", settings.FIPE_ATIVO),
        "url": (cfg.get(db, "FIPE_API_URL", settings.FIPE_API_URL) or "").strip(),
        "token": (cfg.get(db, "FIPE_API_TOKEN", settings.FIPE_API_TOKEN) or "").strip(),
        "endpoint": cfg.get(db, "FIPE_ENDPOINT", settings.FIPE_ENDPOINT) or "/api/fipe/{codigo}",
    }


def consultar(codigo: str, db):
    """Consulta a FIPEConsulta pelo código/parametro do veículo.

    Retorna (valor: float|None, erro: str|None).
    """
    c = config(db)
    if not c["ativo"]:
        return None, "Integração FIPE desativada (ative em Configurações)"
    if not c["url"] or not codigo:
        return None, "Configuração FIPE incompleta (URL ou código do veículo)"

    path = c["endpoint"].replace("{codigo}", str(codigo))
    url = c["url"].rstrip("/") + "/" + path.lstrip("/")
    headers = {}
    if c["token"]:
        headers["Authorization"] = f"Bearer {c['token']}"
    try:
        with httpx.Client(timeout=12) as c:
            r = c.get(url, headers=headers)
        r.raise_for_status()
        data = r.json()
    except Exception as e:  # noqa
        log.warning("Falha na consulta FIPE: %s", e)
        return None, f"Não foi possível consultar a FIPE: {e}"

    valor = _extrai_preco(data)
    if not valor:
        return None, "A resposta da FIPE não trouxe um valor reconhecível"
    return valor, None
