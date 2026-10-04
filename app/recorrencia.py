"""Gera as ocorrências dos lançamentos que se repetem (todo mês ou todo ano)."""
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from . import models

HORIZONTE_DIAS = 62      # deixa sempre ~2 meses de ocorrências prontas


def _no_mes(ano: int, mes: int, dia: int) -> date:
    return date(ano, mes, min(dia, monthrange(ano, mes)[1]))


def proxima(r: models.Recorrencia, depois_de: date) -> date:
    """Primeira ocorrência estritamente depois de `depois_de`."""
    if r.frequencia == "anual":
        mes = r.mes or r.inicio.month
        d = _no_mes(depois_de.year, mes, r.dia)
        return d if d > depois_de else _no_mes(depois_de.year + 1, mes, r.dia)
    d = _no_mes(depois_de.year, depois_de.month, r.dia)
    if d > depois_de:
        return d
    a, m = (depois_de.year + 1, 1) if depois_de.month == 12 else (depois_de.year, depois_de.month + 1)
    return _no_mes(a, m, r.dia)


def gerar(db: Session, hoje: date | None = None) -> int:
    """Cria as ocorrências que faltam até o horizonte. Devolve quantas criou."""
    hoje = hoje or date.today()
    limite = hoje + timedelta(days=HORIZONTE_DIAS)
    criadas = 0
    for r in db.query(models.Recorrencia).filter(models.Recorrencia.ativo.is_(True)).all():
        base = r.ultima or (r.inicio - timedelta(days=1))
        d = proxima(r, base)
        while d <= limite and (not r.ate or d <= r.ate):
            ja = db.query(models.Lancamento.id).filter(models.Lancamento.recorrencia_id == r.id,
                                                       models.Lancamento.data_vencimento == d).first()
            if not ja:
                db.add(models.Lancamento(
                    descricao=r.descricao, tipo=r.tipo, valor=Decimal(r.valor),
                    data_competencia=d, data_vencimento=d, data_pagamento=None,
                    categoria_id=r.categoria_id, conta_id=r.conta_id, contato_id=r.contato_id,
                    recorrente=True, recorrencia_id=r.id))
                criadas += 1
            r.ultima = d
            d = proxima(r, d)
    db.commit()
    return criadas


def job_diario():
    from .database import SessionLocal
    db = SessionLocal()
    try:
        gerar(db)
    finally:
        db.close()
