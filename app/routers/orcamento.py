"""Orçamento: limite mensal de gasto por categoria de despesa."""
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, service
from ..models import TipoMov
from ..security import usuario_atual
from ..erros import ErroCampo

router = APIRouter(prefix="/api/orcamento", tags=["orcamento"],
                   dependencies=[Depends(usuario_atual)])


class LimiteIn(BaseModel):
    limite: Optional[float] = None   # vazio ou 0 remove o limite


def _ref(mes: Optional[str]) -> date:
    if not mes:
        return date.today()
    try:
        a, m = mes[:7].split("-")
        return date(int(a), int(m), 1)
    except Exception:
        raise ErroCampo("mes", f"Mês: inválido (\"{mes}\"). Use o formato AAAA-MM.")


@router.get("")
def ver(mes: Optional[str] = None, db: Session = Depends(get_db)):
    return service.orcamento(db, _ref(mes))


@router.get("/sugestao")
def sugestao(mes: Optional[str] = None, db: Session = Depends(get_db)):
    return service.sugestao_orcamento(db, _ref(mes))


@router.put("/{categoria_id}")
def definir(categoria_id: int, dados: LimiteIn, db: Session = Depends(get_db)):
    c = db.get(models.Categoria, categoria_id)
    if not c:
        raise HTTPException(404, "Categoria não encontrada.")
    if c.tipo != TipoMov.despesa:
        raise ErroCampo("limite", f"Limite: só categorias de despesa têm orçamento (\"{c.nome}\" é de receita).")
    if dados.limite in (None, 0):
        c.orcamento_mensal = None
    else:
        try:
            v = Decimal(str(dados.limite)).quantize(Decimal("0.01"))
        except (InvalidOperation, TypeError):
            raise ErroCampo("limite", "Limite: informe um valor numérico, ex.: 800,00.")
        if v < 0:
            raise ErroCampo("limite", "Limite: não pode ser negativo.")
        c.orcamento_mensal = v
    db.commit()
    return {"categoria_id": c.id, "nome": c.nome,
            "limite": float(c.orcamento_mensal) if c.orcamento_mensal is not None else None}
