from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas, service
from ..security import usuario_atual
from ..erros import bloquear_se_em_uso, ErroCampo

router = APIRouter(prefix="/api/contas", tags=["contas"],
                   dependencies=[Depends(usuario_atual)])


@router.get("", response_model=list[schemas.ContaOut])
def listar(db: Session = Depends(get_db)):
    saida = []
    for c in db.query(models.Conta).order_by(models.Conta.nome).all():
        out = schemas.ContaOut.model_validate(c)
        out.saldo_atual = service.saldo_conta(db, c)
        saida.append(out)
    return saida


@router.post("", response_model=schemas.ContaOut)
def criar(dados: schemas.ContaIn, db: Session = Depends(get_db)):
    c = models.Conta(**dados.model_dump())
    db.add(c); db.commit(); db.refresh(c)
    out = schemas.ContaOut.model_validate(c)
    out.saldo_atual = service.saldo_conta(db, c)
    return out


@router.get("/{cid}", response_model=schemas.ContaOut)
def obter(cid: int, db: Session = Depends(get_db)):
    o = db.get(models.Conta, cid)
    if not o:
        raise HTTPException(404, "Conta não encontrada.")
    return o

@router.put("/{cid}", response_model=schemas.ContaOut)
def editar(cid: int, dados: schemas.ContaIn, db: Session = Depends(get_db)):
    c = db.get(models.Conta, cid)
    if not c:
        raise HTTPException(404, "Conta não encontrada.")
    for k, v in dados.model_dump().items():
        setattr(c, k, v)
    db.commit(); db.refresh(c)
    out = schemas.ContaOut.model_validate(c)
    out.saldo_atual = service.saldo_conta(db, c)
    return out


@router.delete("/{cid}")
def excluir(cid: int, db: Session = Depends(get_db)):
    c = db.get(models.Conta, cid)
    if not c:
        raise HTTPException(404, "Conta não encontrada.")
    bloquear_se_em_uso(db, "a conta", c.nome, [
        (models.Lancamento, "conta_id", cid, "lançamento|lançamentos"),
        (models.Parcelamento, "cartao_id", cid, "compra parcelada|compras parceladas"),
    ])
    db.delete(c); db.commit()
    return {"ok": True}
