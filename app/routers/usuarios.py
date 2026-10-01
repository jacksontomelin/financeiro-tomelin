"""Gestão de usuários da família: criar, editar, trocar senha, definir papel."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import re

from ..database import get_db
from .. import models, security
from ..security import usuario_atual
from ..avatares import PADRAO, COR_PADRAO, chave_avatar, cor_valida

router = APIRouter(prefix="/api/usuarios", tags=["usuarios"],
                   dependencies=[Depends(usuario_atual)])


class UsuarioIn(BaseModel):
    nome: str
    email: str
    senha: Optional[str] = None
    emoji: str = PADRAO
    cor: str = COR_PADRAO
    papel: str = "membro"
    ativo: bool = True


class SenhaIn(BaseModel):
    senha_atual: Optional[str] = None
    nova_senha: str


MIN_SENHA = 6
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _out(u: models.Usuario):
    av = u.__dict__.get("_avatar") or {}
    return {
        "id": u.id, "nome": u.nome, "email": u.email, "ativo": u.ativo,
        "criado_em": u.criado_em.isoformat() if u.criado_em else None,
        "ultimo_acesso": u.ultimo_acesso.isoformat() if u.ultimo_acesso else None,
        "ultimo_acesso_ip": u.ultimo_acesso_ip,
        "emoji": chave_avatar(av.get("emoji")), "cor": av.get("cor") or COR_PADRAO,
        "papel": av.get("papel", "membro"),
    }


def _get_av(db, uid):
    av = db.get(models.UsuarioAvatar, uid)
    if not av:
        av = models.UsuarioAvatar(usuario_id=uid)
        db.add(av); db.commit()
    return av


def _eh_admin(db, uid) -> bool:
    av = db.get(models.UsuarioAvatar, uid)
    return bool(av and av.papel == "admin")


def _outro_admin_ativo(db, uid) -> bool:
    """Existe algum administrador ativo além deste?"""
    return db.query(models.Usuario).join(
        models.UsuarioAvatar, models.UsuarioAvatar.usuario_id == models.Usuario.id
    ).filter(models.Usuario.id != uid, models.Usuario.ativo.is_(True),
             models.UsuarioAvatar.papel == "admin").count() > 0


def _valida(db, dados: UsuarioIn, uid=None):
    """Confere cada campo e devolve (nome, email) limpos. Erros dizem qual campo."""
    nome = (dados.nome or "").strip()
    if not nome:
        raise HTTPException(400, "Nome: preenchimento obrigatório.")
    email = (dados.email or "").strip().lower()
    if not email:
        raise HTTPException(400, "E-mail: preenchimento obrigatório.")
    if not EMAIL_RE.match(email):
        raise HTTPException(400, f"E-mail: formato inválido (\"{email}\"). Use algo como nome@dominio.com.")
    q = db.query(models.Usuario).filter(models.Usuario.email == email)
    if uid:
        q = q.filter(models.Usuario.id != uid)
    if q.first():
        raise HTTPException(400, f"E-mail: \"{email}\" já está cadastrado para outro membro.")
    if dados.senha is not None and dados.senha != "" and len(dados.senha) < MIN_SENHA:
        raise HTTPException(400, f"Senha: precisa ter no mínimo {MIN_SENHA} caracteres (foram {len(dados.senha)}).")
    if dados.papel not in ("admin", "membro"):
        raise HTTPException(400, "Papel: escolha Membro ou Admin.")
    if not cor_valida(dados.cor):
        raise HTTPException(400, "Cor: valor inválido. Escolha uma das cores da lista.")
    return nome, email


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
def criar(dados: UsuarioIn, me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    if not _eh_admin(db, me.id):
        raise HTTPException(403, "Só administradores podem cadastrar membros.")
    nome, email = _valida(db, dados)
    if not dados.senha:
        raise HTTPException(400, "Senha: obrigatória para novos membros.")
    u = models.Usuario(
        nome=nome, email=email,
        senha_hash=security.hash_senha(dados.senha),
        ativo=dados.ativo,
    )
    db.add(u); db.flush()
    db.add(models.UsuarioAvatar(usuario_id=u.id, emoji=chave_avatar(dados.emoji), cor=dados.cor, papel=dados.papel))
    db.commit(); db.refresh(u)
    av = db.get(models.UsuarioAvatar, u.id)
    u._avatar = {"emoji": av.emoji, "cor": av.cor, "papel": av.papel}
    return _out(u)


@router.put("/{uid}")
def editar(uid: int, dados: UsuarioIn, me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    u = db.get(models.Usuario, uid)
    if not u:
        raise HTTPException(404, "Usuário não encontrado.")
    sou_admin = _eh_admin(db, me.id)
    if not sou_admin and me.id != uid:
        raise HTTPException(403, "Só administradores podem editar outros membros.")
    av = _get_av(db, uid)
    if not sou_admin:
        # membro comum edita o próprio perfil, mas não muda o próprio papel nem o acesso
        dados.papel = av.papel
        dados.ativo = u.ativo
    nome, email = _valida(db, dados, uid)
    era_admin_ativo = av.papel == "admin" and u.ativo
    if era_admin_ativo and (dados.papel != "admin" or not dados.ativo) and not _outro_admin_ativo(db, uid):
        raise HTTPException(400, "Papel: precisa existir pelo menos um administrador ativo. Torne outro membro administrador antes.")
    u.nome = nome
    u.email = email
    u.ativo = dados.ativo
    if dados.senha:
        u.senha_hash = security.hash_senha(dados.senha)
    av.emoji = chave_avatar(dados.emoji); av.cor = dados.cor; av.papel = dados.papel
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
    if len(dados.nova_senha or "") < MIN_SENHA:
        raise HTTPException(400, f"Senha: precisa ter no mínimo {MIN_SENHA} caracteres.")
    u.senha_hash = security.hash_senha(dados.nova_senha)
    db.commit()
    return {"ok": True}


@router.delete("/{uid}")
def excluir(uid: int, me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    if not _eh_admin(db, me.id):
        raise HTTPException(403, "Só administradores podem remover membros.")
    if me.id == uid:
        raise HTTPException(400, "Não pode excluir o próprio usuário.")
    u = db.get(models.Usuario, uid)
    if not u:
        raise HTTPException(404, "Usuário não encontrado.")
    av0 = db.get(models.UsuarioAvatar, uid)
    if av0 and av0.papel == "admin" and u.ativo and not _outro_admin_ativo(db, uid):
        raise HTTPException(400, "Precisa existir pelo menos um administrador ativo.")
    av = db.get(models.UsuarioAvatar, uid)
    if av:
        db.delete(av)
    db.delete(u); db.commit()
    return {"ok": True}
