"""Transferências entre contas: muda o saldo das duas, sem virar receita ou despesa."""
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, service
from ..security import usuario_atual
from ..erros import ErroCampo
from ..config import settings

router = APIRouter(prefix="/api/transferencias", tags=["transferencias"],
                   dependencies=[Depends(usuario_atual)])


class TransferenciaIn(BaseModel):
    conta_origem_id: Optional[int] = None
    conta_destino_id: Optional[int] = None
    valor: Optional[float] = None
    data: Optional[str] = None
    descricao: Optional[str] = None


def _out(t: models.Transferencia, nomes: dict):
    return {
        "id": t.id, "data": t.data.isoformat(), "valor": float(t.valor),
        "conta_origem_id": t.conta_origem_id, "conta_destino_id": t.conta_destino_id,
        "origem": nomes.get(t.conta_origem_id, "?"), "destino": nomes.get(t.conta_destino_id, "?"),
        "descricao": t.descricao,
    }


def _hoje():
    """Hoje no fuso da família (o servidor pode estar em UTC)."""
    try:
        import pytz
        from datetime import datetime
        return datetime.now(pytz.timezone(settings.TIMEZONE)).date()
    except Exception:
        return date.today()


def _nomes(db):
    return {c.id: c.nome for c in db.query(models.Conta).all()}


@router.get("")
def listar(conta_id: Optional[int] = None, limite: int = 50, db: Session = Depends(get_db)):
    q = db.query(models.Transferencia)
    if conta_id:
        q = q.filter((models.Transferencia.conta_origem_id == conta_id) |
                     (models.Transferencia.conta_destino_id == conta_id))
    nomes = _nomes(db)
    return [_out(t, nomes) for t in
            q.order_by(models.Transferencia.data.desc(), models.Transferencia.id.desc()).limit(min(limite, 500)).all()]


@router.post("")
def criar(dados: TransferenciaIn, db: Session = Depends(get_db)):
    if not dados.conta_origem_id:
        raise ErroCampo("conta_origem_id", "Conta de origem: escolha de onde o dinheiro sai.")
    if not dados.conta_destino_id:
        raise ErroCampo("conta_destino_id", "Conta de destino: escolha para onde o dinheiro vai.")
    if dados.conta_origem_id == dados.conta_destino_id:
        raise ErroCampo("conta_destino_id", "Conta de destino: precisa ser diferente da conta de origem.")
    origem = db.get(models.Conta, dados.conta_origem_id)
    destino = db.get(models.Conta, dados.conta_destino_id)
    if not origem or not origem.ativo:
        raise ErroCampo("conta_origem_id", "Conta de origem: não existe mais ou está desativada.")
    if not destino or not destino.ativo:
        raise ErroCampo("conta_destino_id", "Conta de destino: não existe mais ou está desativada.")
    try:
        valor = Decimal(str(dados.valor)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError):
        raise ErroCampo("valor", "Valor: informe um valor numérico, ex.: 250,00.")
    if valor <= 0:
        raise ErroCampo("valor", "Valor: precisa ser maior que zero.")
    try:
        quando = date.fromisoformat(dados.data[:10]) if dados.data else _hoje()
    except ValueError:
        raise ErroCampo("data", f"Data: inválida (\"{dados.data}\").")
    # 1 dia de folga: o aparelho pode estar em outro fuso (viagem, relógio errado)
    if quando > _hoje() + timedelta(days=1):
        raise ErroCampo("data", "Data: a transferência não pode ser no futuro.")
    t = models.Transferencia(conta_origem_id=origem.id, conta_destino_id=destino.id, valor=valor,
                             data=quando, descricao=(dados.descricao or "").strip() or None)
    db.add(t); db.commit(); db.refresh(t)
    out = _out(t, _nomes(db))
    out["saldo_origem"] = float(service.saldo_conta(db, origem))
    out["saldo_destino"] = float(service.saldo_conta(db, destino))
    return out


@router.delete("/{tid}")
def excluir(tid: int, db: Session = Depends(get_db)):
    t = db.get(models.Transferencia, tid)
    if not t:
        raise HTTPException(404, "Transferência não encontrada.")
    db.delete(t); db.commit()
    return {"ok": True}
