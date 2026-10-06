"""Histórico de alterações dos lançamentos: quem fez o quê e quando."""
import logging
from datetime import date
from decimal import Decimal

from . import models

log = logging.getLogger("tomelin.historico")

CAMPOS = {
    "descricao": "Descrição", "valor": "Valor", "tipo": "Tipo", "data_competencia": "Competência",
    "data_vencimento": "Vencimento", "data_pagamento": "Pagamento", "categoria_id": "Categoria",
    "conta_id": "Conta", "contato_id": "Contato", "responsavel_id": "Quem paga", "juros": "Juros",
    "multa": "Multa", "forma_pagamento": "Forma de pagamento", "obs": "Observações",
}
_REF = {"categoria_id": models.Categoria, "conta_id": models.Conta, "contato_id": models.Contato,
        "responsavel_id": models.Usuario}


def _legivel(db, campo, v):
    if v is None or v == "":
        return None
    if campo in _REF:
        o = db.get(_REF[campo], v)
        return o.nome if o else f"#{v}"
    if isinstance(v, date):
        return v.strftime("%d/%m/%Y")
    if isinstance(v, Decimal):
        return f"{v:.2f}"
    if hasattr(v, "value"):
        return v.value
    return str(v)


def foto(l: models.Lancamento) -> dict:
    """Como o lançamento está agora (para comparar depois de editar)."""
    return {c: getattr(l, c, None) for c in CAMPOS}


def diferencas(db, antes: dict, depois: dict) -> list[dict]:
    out = []
    for c in CAMPOS:
        a, d = antes.get(c), depois.get(c)
        if isinstance(a, Decimal) or isinstance(d, Decimal):
            if Decimal(str(a or 0)) == Decimal(str(d or 0)):
                continue
        elif (a or None) == (d or None):
            continue
        out.append({"campo": CAMPOS[c], "de": _legivel(db, c, a), "para": _legivel(db, c, d)})
    return out


def registrar(db, lancamento, acao: str, usuario=None, autor: str | None = None, mudancas=None):
    """Nunca atrapalha a operação: se falhar, só registra no log."""
    try:
        db.add(models.HistoricoLancamento(
            lancamento_id=lancamento.id, descricao=(lancamento.descricao or "")[:200], acao=acao,
            usuario_id=getattr(usuario, "id", None),
            autor=(autor or getattr(usuario, "nome", None) or "Sistema")[:160], mudancas=mudancas or None))
        db.commit()
    except Exception as e:
        db.rollback()
        log.warning("Histórico não registrado (%s #%s): %s", acao, getattr(lancamento, "id", "?"), e)
