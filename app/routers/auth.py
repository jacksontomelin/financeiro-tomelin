from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas, security

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=schemas.TokenOut)
def login(dados: schemas.LoginIn, request: Request, db: Session = Depends(get_db)):
    u = db.query(models.Usuario).filter(models.Usuario.email == dados.email.lower().strip()).first()
    if not u or not security.confere_senha(dados.senha, u.senha_hash):
        raise HTTPException(401, "E-mail ou senha inválidos.")
    if not u.ativo:
        raise HTTPException(403, "Usuário desativado.")

    # guarda o penúltimo acesso antes de sobrescrever (para exibir na tela de login)
    penultimo = u.ultimo_acesso
    penultimo_ip = u.ultimo_acesso_ip

    # grava novo acesso
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "")
    ip = ip.split(",")[0].strip()
    u.ultimo_acesso = datetime.utcnow()
    u.ultimo_acesso_ip = ip
    db.commit()

    return schemas.TokenOut(
        token=security.cria_token(u),
        nome=u.nome,
        email=u.email,
        ultimo_acesso=penultimo,
        ultimo_acesso_ip=penultimo_ip,
    )


@router.get("/eu")
def eu(u: models.Usuario = Depends(security.usuario_atual)):
    return {
        "nome": u.nome,
        "email": u.email,
        "ultimo_acesso": u.ultimo_acesso.isoformat() if u.ultimo_acesso else None,
        "ultimo_acesso_ip": u.ultimo_acesso_ip,
    }
