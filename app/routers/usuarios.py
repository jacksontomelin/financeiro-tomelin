"""Gestão de usuários da família — criar, editar, trocar senha, definir papel."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from ..database import get_db
from .. import models, security
from ..security import usuario_atual

router = APIRouter(prefix="/api/usuarios", tags=["usuarios"],
                   dependencies=[Depends(usuario_atual)])


class UsuarioIn(BaseModel):
    nome: str
    email: str
    senha: Optional[str] = None
    emoji: str = "👤"
    cor: str = "#305C74"
    papel: str = "membro"
    ativo: bool = True


class SenhaIn(BaseModel):
    senha_atual: Optional[str] = None
    nova_senha: str


def _out(u: models.Usuario):
    av = u.__dict__.get("_avatar") or {}
    return {
        "id": u.id, "nome": u.nome, "email": u.email, "ativo": u.ativo,
        "criado_em": u.criado_em.isoformat() if u.criado_em else None,
        "ultimo_acesso": u.ultimo_acesso.isoformat() if u.ultimo_acesso else None,
        "ultimo_acesso_ip": u.ultimo_acesso_ip,
        "emoji": av.get("emoji", "👤"), "cor": av.get("cor", "#305C74"),
        "papel": av.get("papel", "membro"),
    }


def _get_av(db, uid):
    av = db.get(models.UsuarioAvatar, uid)
    if not av:
        av = models.UsuarioAvatar(usuario_id=uid)
        db.add(av); db.commit()
    return av


@router.get("")
def listar(db: Session = Depends(get_db)):
    us = db.query(models.Usuario).order_by(models.Usuario.nome).all()
    result = []
    for u in us:
        av = db.get(models.UsuarioAvatar, u.id) or models.UsuarioAvatar()
        u._avatar = {"emoji": av.emoji, "cor": av.cor, "papel": av.papel}
        result.append(_out(u))
    return result


@router.post("")
def criar(dados: UsuarioIn, db: Session = Depends(get_db)):
    if db.query(models.Usuario).filter(models.Usuario.email == dados.email.lower()).first():
        raise HTTPException(400, "E-mail já cadastrado.")
    if not dados.senha:
        raise HTTPException(400, "Senha obrigatória para novos usuários.")
    u = models.Usuario(
        nome=dados.nome.strip(),
        email=dados.email.lower().strip(),
        senha_hash=security.hash_senha(dados.senha),
        ativo=dados.ativo,
    )
    db.add(u); db.flush()
    db.add(models.UsuarioAvatar(usuario_id=u.id, emoji=dados.emoji, cor=dados.cor, papel=dados.papel))
    db.commit(); db.refresh(u)
    av = db.get(models.UsuarioAvatar, u.id)
    u._avatar = {"emoji": av.emoji, "cor": av.cor, "papel": av.papel}
    return _out(u)


@router.put("/{uid}")
def editar(uid: int, dados: UsuarioIn, db: Session = Depends(get_db)):
    u = db.get(models.Usuario, uid)
    if not u:
        raise HTTPException(404, "Usuário não encontrado.")
    u.nome = dados.nome.strip()
    u.email = dados.email.lower().strip()
    u.ativo = dados.ativo
    if dados.senha:
        u.senha_hash = security.hash_senha(dados.senha)
    av = _get_av(db, uid)
    av.emoji = dados.emoji; av.cor = dados.cor; av.papel = dados.papel
    db.commit(); db.refresh(u)
    u._avatar = {"emoji": av.emoji, "cor": av.cor, "papel": av.papel}
    return _out(u)


@router.post("/{uid}/senha")
def trocar_senha(uid: int, dados: SenhaIn, me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    u = db.get(models.Usuario, uid)
    if not u:
        raise HTTPException(404, "Usuário não encontrado.")
    # só admin pode trocar senha de outro; usuário comum só a própria
    av_me = db.get(models.UsuarioAvatar, me.id)
    if me.id != uid and (not av_me or av_me.papel != "admin"):
        raise HTTPException(403, "Sem permissão.")
    if me.id == uid and dados.senha_atual:
        if not security.confere_senha(dados.senha_atual, u.senha_hash):
            raise HTTPException(400, "Senha atual incorreta.")
    u.senha_hash = security.hash_senha(dados.nova_senha)
    db.commit()
    return {"ok": True}


@router.delete("/{uid}")
def excluir(uid: int, me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    if me.id == uid:
        raise HTTPException(400, "Não pode excluir o próprio usuário.")
    u = db.get(models.Usuario, uid)
    if not u:
        raise HTTPException(404, "Usuário não encontrado.")
    av = db.get(models.UsuarioAvatar, uid)
    if av:
        db.delete(av)
    db.delete(u); db.commit()
    return {"ok": True}
