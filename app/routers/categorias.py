from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..security import usuario_atual

router = APIRouter(prefix="/api/categorias", tags=["categorias"],
                   dependencies=[Depends(usuario_atual)])


@router.get("", response_model=list[schemas.CategoriaOut])
def listar(tipo: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Categoria)
    if tipo:
        q = q.filter(models.Categoria.tipo == tipo)
    return q.order_by(models.Categoria.nome).all()


@router.post("", response_model=schemas.CategoriaOut)
def criar(dados: schemas.CategoriaIn, db: Session = Depends(get_db)):
    c = models.Categoria(**dados.model_dump())
    db.add(c); db.commit(); db.refresh(c)
    return c


@router.put("/{cid}", response_model=schemas.CategoriaOut)
def editar(cid: int, dados: schemas.CategoriaIn, db: Session = Depends(get_db)):
    c = db.get(models.Categoria, cid)
    if not c:
        raise HTTPException(404, "Categoria não encontrada.")
    for k, v in dados.model_dump().items():
        setattr(c, k, v)
    db.commit(); db.refresh(c)
    return c


@router.delete("/{cid}")
def excluir(cid: int, db: Session = Depends(get_db)):
    c = db.get(models.Categoria, cid)
    if not c:
        raise HTTPException(404, "Categoria não encontrada.")
    db.delete(c); db.commit()
    return {"ok": True}
