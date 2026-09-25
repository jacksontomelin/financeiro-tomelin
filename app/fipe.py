"""Cliente da FIPEConsulta (tecnologia própria do Jackson) para valor automático de veículos.

É tolerante ao formato da resposta: procura o preço em várias chaves comuns
(valor, preco, price, valor_fipe, fipe...). Configurável por variáveis de ambiente,
igual ao gateway do WhatsApp — assim funciona com o endpoint que você já tem.
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


def consultar(codigo: str):
    """Consulta a FIPEConsulta pelo código/parametro do veículo.

    Retorna (valor: float|None, erro: str|None).
    """
    if not settings.FIPE_ATIVO:
        return None, "Integração FIPE desativada (defina FIPE_ATIVO=true)"
    if not settings.FIPE_API_URL or not codigo:
        return None, "Configuração FIPE incompleta (URL ou código do veículo)"

    path = settings.FIPE_ENDPOINT.replace("{codigo}", str(codigo))
    url = settings.FIPE_API_URL.rstrip("/") + "/" + path.lstrip("/")
    headers = {}
    if settings.FIPE_API_TOKEN:
        headers["Authorization"] = f"Bearer {settings.FIPE_API_TOKEN}"
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
