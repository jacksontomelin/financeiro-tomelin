"""Avatares dos membros: ícones desenhados no navegador, guardados por nome.

Antes eram emojis; os emojis antigos já gravados viram o ícone equivalente.
"""
import re

AVATARES = (
    "pessoa", "homem", "mulher", "menino", "menina", "idoso", "idosa", "coroa",
    "casa", "maleta", "estrela", "coracao", "sol", "lua", "raio", "folha",
    "pata", "carro", "livro", "alvo", "foguete", "diamante", "escudo", "chave",
)
PADRAO = "pessoa"
COR_PADRAO = "#305C74"
COR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

_LEGADO = {
    "\U0001F464": "pessoa", "\U0001F9D1": "pessoa", "\U0001F468": "homem", "\U0001F9D4": "homem",
    "\U0001F469": "mulher", "\U0001F466": "menino", "\U0001F467": "menina",
    "\U0001F474": "idoso", "\U0001F475": "idosa", "\U0001F934": "coroa", "\U0001F478": "coroa",
    "\U0001F4BC": "maleta", "\U0001F3E0": "casa", "\u2B50": "estrela", "\U0001F31F": "estrela",
    "\u2764\uFE0F": "coracao", "\u2764": "coracao",
    "\U0001F981": "pata", "\U0001F42F": "pata", "\U0001F98A": "pata", "\U0001F436": "pata",
    "\U0001F431": "pata", "\U0001F308": "sol", "\U0001F3AF": "alvo", "\U0001F680": "foguete",
    "\U0001F48E": "diamante",
}


def chave_avatar(valor) -> str:
    """Nome do ícone para qualquer valor guardado (nome novo ou emoji antigo)."""
    v = (valor or "").strip()
    if v in AVATARES:
        return v
    return _LEGADO.get(v, PADRAO)


def cor_valida(cor) -> bool:
    return bool(cor and COR_RE.match(cor))
