"""Comprovantes dos lançamentos: foto ou PDF, guardados no banco."""
import base64, binascii, os, re
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..security import usuario_atual
from ..erros import ErroCampo

router = APIRouter(tags=["anexos"], dependencies=[Depends(usuario_atual)])

MAX_BYTES = 5 * 1024 * 1024
MAX_POR_LANCAMENTO = 6


class AnexoIn(BaseModel):
    nome: str
    dados: str          # base64 do arquivo


def _tipo_real(b: bytes):
    """Tipo pelo conteúdo, não pelo nome: só imagem e PDF passam."""
    if b[:3] == b"\xff\xd8\xff": return "image/jpeg", "jpg"
    if b[:8] == b"\x89PNG\r\n\x1a\n": return "image/png", "png"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP": return "image/webp", "webp"
    if b[:5] == b"%PDF-": return "application/pdf", "pdf"
    return None, None


def _meta(a: models.Anexo):
    return {"id": a.id, "lancamento_id": a.lancamento_id, "nome": a.nome, "mime": a.mime,
            "tamanho": a.tamanho, "criado_em": a.criado_em.isoformat() if a.criado_em else None}


@router.get("/api/lancamentos/{lid}/anexos")
def listar(lid: int, db: Session = Depends(get_db)):
    q = db.query(models.Anexo.id, models.Anexo.lancamento_id, models.Anexo.nome, models.Anexo.mime,
                 models.Anexo.tamanho, models.Anexo.criado_em).filter(models.Anexo.lancamento_id == lid)
    return [{"id": a.id, "lancamento_id": a.lancamento_id, "nome": a.nome, "mime": a.mime, "tamanho": a.tamanho,
             "criado_em": a.criado_em.isoformat() if a.criado_em else None} for a in q.order_by(models.Anexo.id)]


@router.post("/api/lancamentos/{lid}/anexos")
def enviar(lid: int, dados: AnexoIn, db: Session = Depends(get_db)):
    if not db.get(models.Lancamento, lid):
        raise HTTPException(404, "Lançamento não encontrado.")
    n = db.query(func.count(models.Anexo.id)).filter(models.Anexo.lancamento_id == lid).scalar() or 0
    if n >= MAX_POR_LANCAMENTO:
        raise ErroCampo("anexo", f"Comprovante: no máximo {MAX_POR_LANCAMENTO} arquivos por lançamento.")
    try:
        bruto = base64.b64decode(dados.dados.split(",", 1)[-1], validate=True)
    except (binascii.Error, ValueError):
        raise ErroCampo("anexo", "Comprovante: arquivo corrompido no envio. Tente de novo.")
    if not bruto:
        raise ErroCampo("anexo", "Comprovante: arquivo vazio.")
    if len(bruto) > MAX_BYTES:
        raise ErroCampo("anexo", f"Comprovante: arquivo grande demais ({len(bruto) / 1048576:.1f} MB). O limite é 5 MB.")
    mime, ext = _tipo_real(bruto)
    if not mime:
        raise ErroCampo("anexo", "Comprovante: envie uma foto (JPG, PNG, WEBP) ou um PDF.")
    nome = os.path.basename((dados.nome or "").replace("\\", "/")).strip() or f"comprovante.{ext}"
    nome = re.sub(r"[\x00-\x1f]", "", nome)[:200]
    a = models.Anexo(lancamento_id=lid, nome=nome, mime=mime, tamanho=len(bruto), dados=bruto)
    db.add(a); db.commit(); db.refresh(a)
    return _meta(a)


@router.get("/api/anexos/contagem")
def contagem(db: Session = Depends(get_db)):
    """{lancamento_id: quantidade} para marcar na lista quem tem comprovante."""
    rows = db.query(models.Anexo.lancamento_id, func.count(models.Anexo.id)).group_by(models.Anexo.lancamento_id).all()
    return {str(lid): n for lid, n in rows}


@router.get("/api/anexos/{aid}")
def baixar(aid: int, db: Session = Depends(get_db)):
    a = db.get(models.Anexo, aid)
    if not a:
        raise HTTPException(404, "Comprovante não encontrado.")
    return Response(content=a.dados, media_type=a.mime, headers={
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(a.nome)}",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
    })


@router.delete("/api/anexos/{aid}")
def excluir(aid: int, db: Session = Depends(get_db)):
    a = db.get(models.Anexo, aid)
    if not a:
        raise HTTPException(404, "Comprovante não encontrado.")
    db.delete(a); db.commit()
    return {"ok": True}
