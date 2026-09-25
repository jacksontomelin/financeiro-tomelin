from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas, service
from ..security import usuario_atual

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
    db.delete(c); db.commit()
    return {"ok": True}
