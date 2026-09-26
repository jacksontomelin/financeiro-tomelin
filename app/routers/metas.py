"""Metas financeiras — guardar dinheiro, pagar dívida, trocar o carro, etc."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date

from ..database import get_db
from .. import models
from ..security import usuario_atual

router = APIRouter(prefix="/api/metas", tags=["metas"],
                   dependencies=[Depends(usuario_atual)])


class MetaIn(BaseModel):
    nome: str
    descricao: Optional[str] = None
    valor_alvo: float
    valor_atual: float = 0
    cor: str = "#082D51"
    icone: str = "🎯"
    prazo: Optional[str] = None
    concluida: bool = False


class AporteIn(BaseModel):
    valor: float


def _out(m: models.Meta):
    return {
        "id": m.id, "nome": m.nome, "descricao": m.descricao,
        "valor_alvo": float(m.valor_alvo), "valor_atual": float(m.valor_atual),
        "cor": m.cor, "icone": m.icone,
        "prazo": m.prazo.isoformat() if m.prazo else None,
        "concluida": m.concluida,
        "progresso_pct": round(m.progresso_pct, 1),
        "falta": round(m.falta, 2),
        "criado_em": m.criado_em.isoformat() if m.criado_em else None,
    }


@router.get("")
def listar(db: Session = Depends(get_db)):
    return [_out(m) for m in db.query(models.Meta).order_by(
        models.Meta.concluida, models.Meta.prazo.asc().nullslast(), models.Meta.id).all()]


@router.post("")
def criar(dados: MetaIn, db: Session = Depends(get_db)):
    prazo = date.fromisoformat(dados.prazo[:10]) if dados.prazo else None
    m = models.Meta(**{**dados.model_dump(), "prazo": prazo, "valor_alvo": dados.valor_alvo,
                       "valor_atual": dados.valor_atual})
    db.add(m); db.commit(); db.refresh(m)
    return _out(m)


@router.put("/{mid}")
def editar(mid: int, dados: MetaIn, db: Session = Depends(get_db)):
    m = db.get(models.Meta, mid)
    if not m: raise HTTPException(404, "Meta não encontrada.")
    prazo = date.fromisoformat(dados.prazo[:10]) if dados.prazo else None
    for k, v in dados.model_dump().items():
        if k == "prazo": setattr(m, k, prazo)
        else: setattr(m, k, v)
    db.commit(); db.refresh(m)
    return _out(m)


@router.post("/{mid}/aporte")
def aporte(mid: int, body: AporteIn, db: Session = Depends(get_db)):
    m = db.get(models.Meta, mid)
    if not m: raise HTTPException(404, "Meta não encontrada.")
    m.valor_atual = float(m.valor_atual) + body.valor
    if float(m.valor_atual) >= float(m.valor_alvo):
        m.concluida = True
    db.commit(); db.refresh(m)
    return _out(m)


@router.delete("/{mid}")
def excluir(mid: int, db: Session = Depends(get_db)):
    m = db.get(models.Meta, mid)
    if not m: raise HTTPException(404, "Meta não encontrada.")
    db.delete(m); db.commit()
    return {"ok": True}
