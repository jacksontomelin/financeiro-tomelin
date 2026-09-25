from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..security import usuario_atual

router = APIRouter(prefix="/api/contatos", tags=["contatos"],
                   dependencies=[Depends(usuario_atual)])


@router.get("", response_model=list[schemas.ContatoOut])
def listar(tipo: str | None = None, busca: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Contato)
    if tipo:
        q = q.filter(models.Contato.tipo == tipo)
    if busca:
        q = q.filter(models.Contato.nome.ilike(f"%{busca}%"))
    return q.order_by(models.Contato.nome).all()


@router.post("", response_model=schemas.ContatoOut)
def criar(dados: schemas.ContatoIn, db: Session = Depends(get_db)):
    c = models.Contato(**dados.model_dump())
    db.add(c); db.commit(); db.refresh(c)
    return c


@router.put("/{cid}", response_model=schemas.ContatoOut)
def editar(cid: int, dados: schemas.ContatoIn, db: Session = Depends(get_db)):
    c = db.get(models.Contato, cid)
    if not c:
        raise HTTPException(404, "Contato não encontrado.")
    for k, v in dados.model_dump().items():
        setattr(c, k, v)
    db.commit(); db.refresh(c)
    return c


@router.delete("/{cid}")
def excluir(cid: int, db: Session = Depends(get_db)):
    c = db.get(models.Contato, cid)
    if not c:
        raise HTTPException(404, "Contato não encontrado.")
    db.delete(c); db.commit()
    return {"ok": True}
