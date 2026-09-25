from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas, security

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=schemas.TokenOut)
def login(dados: schemas.LoginIn, db: Session = Depends(get_db)):
    u = db.query(models.Usuario).filter(models.Usuario.email == dados.email.lower().strip()).first()
    if not u or not security.confere_senha(dados.senha, u.senha_hash):
        raise HTTPException(401, "E-mail ou senha inválidos.")
    if not u.ativo:
        raise HTTPException(403, "Usuário desativado.")
    return schemas.TokenOut(token=security.cria_token(u), nome=u.nome, email=u.email)


@router.get("/eu")
def eu(u: models.Usuario = Depends(security.usuario_atual)):
    return {"nome": u.nome, "email": u.email}
