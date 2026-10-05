"""Imagens das bandeiras e do Pix enviadas pela própria família (Configurações).

O sistema não traz essas imagens: o administrador envia as suas, recorta e
tira o fundo na tela, e elas ficam guardadas aqui.
"""
import base64

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..security import usuario_atual

router = APIRouter(prefix="/api/bandeiras", tags=["bandeiras"])
CHAVES = ["visa", "master", "maestro", "elo", "alelo", "amex", "hiper", "diners", "pix"]
MAX_BYTES = 700 * 1024
ASSINATURAS = {"png": b"\x89PNG", "jpeg": b"\xff\xd8\xff", "webp": b"RIFF"}


class ImagemIn(BaseModel):
    imagem: str | None = None


@router.get("")
def listar(me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    rows = db.query(models.Configuracao).filter(models.Configuracao.chave.in_([f"_band_{c}" for c in CHAVES])).all()
    return {r.chave[6:]: r.valor for r in rows if r.valor}


@router.put("/{chave}")
def salvar(chave: str, dados: ImagemIn, me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    av = db.get(models.UsuarioAvatar, me.id)
    if not av or av.papel != "admin":
        raise HTTPException(403, "Só administradores podem trocar as imagens das bandeiras.")
    if chave not in CHAVES:
        raise HTTPException(404, "Bandeira desconhecida.")
    k = f"_band_{chave}"
    row = db.get(models.Configuracao, k)
    if not dados.imagem:
        if row:
            db.delete(row); db.commit()
        return {"ok": True, "removida": True}
    cab, _, b64 = dados.imagem.partition(",")
    tipo = cab.replace("data:image/", "").replace(";base64", "")
    if not cab.startswith("data:image/") or tipo not in ASSINATURAS:
        raise HTTPException(400, "Imagem: use PNG, JPG ou WEBP.")
    try:
        bruto = base64.b64decode(b64, validate=True)
    except Exception:
        raise HTTPException(400, "Imagem: arquivo inválido.")
    if len(bruto) > MAX_BYTES:
        raise HTTPException(400, f"Imagem: muito grande ({len(bruto) // 1024} KB). Limite de {MAX_BYTES // 1024} KB.")
    if not bruto.startswith(ASSINATURAS[tipo]):
        raise HTTPException(400, "Imagem: o conteúdo não confere com o tipo do arquivo.")
    if row:
        row.valor = dados.imagem
    else:
        db.add(models.Configuracao(chave=k, valor=dados.imagem, descricao="interno: imagem de bandeira"))
    db.commit()
    return {"ok": True}
