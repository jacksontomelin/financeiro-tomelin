from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..security import usuario_atual
from ..erros import bloquear_se_em_uso, ErroCampo

router = APIRouter(prefix="/api/categorias", tags=["categorias"],
                   dependencies=[Depends(usuario_atual)])


@router.get("", response_model=list[schemas.CategoriaOut])
def listar(tipo: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Categoria)
    if tipo:
        q = q.filter(models.Categoria.tipo == tipo)
    return q.order_by(models.Categoria.nome).all()


def _ir_ok(dados: schemas.CategoriaIn):
    from ..imposto_renda import TIPOS
    if dados.ir_tipo == "":
        dados.ir_tipo = None          # só quando veio vazio de propósito (limpar)
    if dados.ir_tipo is None:
        return
    if dados.ir_tipo not in TIPOS:
        raise HTTPException(422, "Imposto de Renda: escolha saúde, educação, previdência ou pensão.")
    if dados.tipo != "despesa":
        raise HTTPException(422, "Imposto de Renda: só categorias de despesa podem ser dedutíveis.")


@router.post("", response_model=schemas.CategoriaOut)
def criar(dados: schemas.CategoriaIn, db: Session = Depends(get_db)):
    _ir_ok(dados)
    c = models.Categoria(**dados.model_dump())
    db.add(c); db.commit(); db.refresh(c)
    return c


@router.put("/{cid}", response_model=schemas.CategoriaOut)
def editar(cid: int, dados: schemas.CategoriaIn, db: Session = Depends(get_db)):
    c = db.get(models.Categoria, cid)
    if not c:
        raise HTTPException(404, "Categoria não encontrada.")
    _ir_ok(dados)
    for k, v in dados.model_dump(exclude_unset=True).items():   # campo não enviado não é apagado
        setattr(c, k, v)
    db.commit(); db.refresh(c)
    return c


@router.delete("/{cid}")
def excluir(cid: int, db: Session = Depends(get_db)):
    c = db.get(models.Categoria, cid)
    if not c:
        raise HTTPException(404, "Categoria não encontrada.")
    bloquear_se_em_uso(db, "a categoria", c.nome, [
        (models.Lancamento, "categoria_id", cid, "lançamento|lançamentos"),
        (models.ItemCompra, "categoria_id", cid, "item de compra|itens de compra"),
    ])
    db.delete(c); db.commit()
    return {"ok": True}
