"""Atividade recente: as últimas mudanças em lançamentos, de toda a família."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..security import usuario_atual
from .lancamentos import _hist

router = APIRouter(prefix="/api/atividade", tags=["atividade"], dependencies=[Depends(usuario_atual)])


@router.get("")
def recente(limite: int = 40, usuario_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(models.HistoricoLancamento)
    if usuario_id:
        q = q.filter(models.HistoricoLancamento.usuario_id == usuario_id)
    return [_hist(h) for h in q.order_by(models.HistoricoLancamento.quando.desc()).limit(max(1, min(limite, 200)))]
