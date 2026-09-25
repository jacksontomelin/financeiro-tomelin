"""Autenticação: hash de senha + JWT."""
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import bcrypt
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from . import models

bearer = HTTPBearer(auto_error=False)


def _prep(s: str) -> bytes:
    # bcrypt limita a senha a 72 bytes; truncamos com segurança.
    return s.encode("utf-8")[:72]


def hash_senha(s: str) -> str:
    return bcrypt.hashpw(_prep(s), bcrypt.gensalt()).decode("utf-8")


def confere_senha(s: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(_prep(s), h.encode("utf-8"))
    except Exception:
        return False


def cria_token(usuario: models.Usuario) -> str:
    exp = datetime.utcnow() + timedelta(hours=settings.TOKEN_HORAS)
    payload = {"sub": str(usuario.id), "nome": usuario.nome, "email": usuario.email, "exp": exp}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def usuario_atual(
    cred: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> models.Usuario:
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Faça login para continuar.")
    try:
        dados = jwt.decode(cred.credentials, settings.SECRET_KEY, algorithms=["HS256"])
        uid = int(dados["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão expirada. Entre novamente.")
    u = db.get(models.Usuario, uid)
    if not u or not u.ativo:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuário indisponível.")
    return u
