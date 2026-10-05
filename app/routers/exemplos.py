"""Carregar e apagar dados de exemplo; zerar os dados para começar de verdade (só administradores)."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, exemplos
from ..security import usuario_atual

router = APIRouter(prefix="/api/exemplos", tags=["exemplos"])


def _admin(me: models.Usuario, db: Session):
    av = db.get(models.UsuarioAvatar, me.id)
    if not av or av.papel != "admin":
        raise HTTPException(403, "Só administradores podem fazer isso.")


class ZerarIn(BaseModel):
    confirmacao: str = ""


@router.get("")
def status(me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    return {"exemplos": exemplos.quantos(db), "lancamentos": db.query(models.Lancamento).count()}


@router.post("")
def carregar(me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _admin(me, db)
    try:
        criados = exemplos.carregar(db)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "criados": criados, "total": exemplos.quantos(db)}


@router.delete("")
def apagar(me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _admin(me, db)
    return {"ok": True, "apagados": exemplos.apagar(db)}


@router.post("/zerar")
def zerar(dados: ZerarIn, me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _admin(me, db)
    if dados.confirmacao.strip().upper() != "ZERAR":
        raise HTTPException(400, "Para zerar, digite ZERAR.")
    return {"ok": True, "apagados": exemplos.zerar(db)}
