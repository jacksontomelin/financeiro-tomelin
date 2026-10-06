"""Lançamentos que se repetem: criar a partir de um lançamento, listar, pausar, alterar e encerrar."""
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, recorrencia
from ..security import usuario_atual
from ..erros import ErroCampo

router = APIRouter(prefix="/api/recorrencias", tags=["recorrencias"], dependencies=[Depends(usuario_atual)])


class NovaIn(BaseModel):
    lancamento_id: int
    frequencia: str = "mensal"
    ate: Optional[str] = None


class AlteraIn(BaseModel):
    valor: Optional[float] = None
    ativo: Optional[bool] = None


def _out(db, r: models.Recorrencia):
    prox = (db.query(models.Lancamento.data_vencimento)
            .filter(models.Lancamento.recorrencia_id == r.id, models.Lancamento.data_pagamento.is_(None),
                    models.Lancamento.data_vencimento >= date.today())
            .order_by(models.Lancamento.data_vencimento).first())
    return {"id": r.id, "descricao": r.descricao, "tipo": r.tipo.value, "valor": float(r.valor),
            "frequencia": r.frequencia, "dia": r.dia, "mes": r.mes, "inicio": r.inicio.isoformat(),
            "ate": r.ate.isoformat() if r.ate else None, "ativo": r.ativo,
            "proxima": prox[0].isoformat() if prox else None,
            "categoria_id": r.categoria_id, "conta_id": r.conta_id}


@router.get("")
def listar(db: Session = Depends(get_db)):
    return [_out(db, r) for r in db.query(models.Recorrencia).order_by(models.Recorrencia.ativo.desc(), models.Recorrencia.descricao)]


@router.post("")
def criar(dados: NovaIn, db: Session = Depends(get_db)):
    l = db.get(models.Lancamento, dados.lancamento_id)
    if not l:
        raise HTTPException(404, "Lançamento não encontrado.")
    if l.recorrencia_id:
        raise ErroCampo("frequencia", "Repetir: este lançamento já se repete.")
    if dados.frequencia not in ("mensal", "anual"):
        raise ErroCampo("frequencia", "Repetir: escolha todo mês ou todo ano.")
    base = l.data_vencimento or l.data_competencia or date.today()
    ate = None
    if dados.ate:
        try:
            ate = date.fromisoformat(dados.ate[:10])
        except ValueError:
            raise ErroCampo("ate", "Repetir até: data inválida.")
        if ate <= base:
            raise ErroCampo("ate", "Repetir até: precisa ser depois da primeira data.")
    r = models.Recorrencia(descricao=l.descricao, tipo=l.tipo, valor=Decimal(l.valor), frequencia=dados.frequencia,
                           dia=base.day, mes=base.month if dados.frequencia == "anual" else None,
                           inicio=base, ate=ate, ultima=base,
                           categoria_id=l.categoria_id, conta_id=l.conta_id, contato_id=l.contato_id,
                           responsavel_id=l.responsavel_id)
    db.add(r); db.flush()
    l.recorrencia_id = r.id; l.recorrente = True
    db.commit()
    n = recorrencia.gerar(db)
    out = _out(db, r); out["criadas"] = n
    return out


@router.put("/{rid}")
def alterar(rid: int, dados: AlteraIn, db: Session = Depends(get_db)):
    r = db.get(models.Recorrencia, rid)
    if not r:
        raise HTTPException(404, "Repetição não encontrada.")
    if dados.valor is not None:
        try:
            v = Decimal(str(dados.valor)).quantize(Decimal("0.01"))
        except (InvalidOperation, TypeError):
            raise ErroCampo("valor", "Valor: informe um número.")
        if v <= 0:
            raise ErroCampo("valor", "Valor: precisa ser maior que zero.")
        r.valor = v
        # vale para as próximas ainda não pagas; as pagas ficam como foram
        for l in db.query(models.Lancamento).filter(models.Lancamento.recorrencia_id == r.id,
                                                    models.Lancamento.data_pagamento.is_(None),
                                                    models.Lancamento.data_vencimento >= date.today()):
            l.valor = v
    if dados.ativo is not None:
        r.ativo = dados.ativo
    db.commit()
    if r.ativo:
        recorrencia.gerar(db)
    return _out(db, r)


@router.delete("/{rid}")
def encerrar(rid: int, apagar_futuras: bool = True, db: Session = Depends(get_db)):
    r = db.get(models.Recorrencia, rid)
    if not r:
        raise HTTPException(404, "Repetição não encontrada.")
    apagadas = 0
    q = db.query(models.Lancamento).filter(models.Lancamento.recorrencia_id == r.id)
    for l in q.all():
        gerada = l.data_vencimento != r.inicio          # o lançamento que originou a regra nunca é apagado
        if apagar_futuras and gerada and l.data_pagamento is None and l.data_vencimento and l.data_vencimento > date.today():
            db.query(models.Anexo).filter(models.Anexo.lancamento_id == l.id).delete()
            db.delete(l); apagadas += 1
        else:
            l.recorrencia_id = None      # histórico fica, só perde o vínculo
    db.delete(r); db.commit()
    return {"ok": True, "apagadas": apagadas}
