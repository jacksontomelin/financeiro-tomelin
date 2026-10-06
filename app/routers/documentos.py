"""Documentos emitidos (PDFs com QR de validação): lista, reenvio no WhatsApp."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..security import usuario_atual

router = APIRouter(prefix="/api/documentos", tags=["documentos"], dependencies=[Depends(usuario_atual)])


def _meta(d: models.DocumentoEmitido) -> dict:
    from ..urls import verificar
    return {"codigo": d.codigo, "tipo": d.tipo, "estilo": d.estilo, "titulo": d.titulo, "resumo": d.resumo,
            "valor": float(d.valor) if d.valor is not None else None, "tamanho": d.tamanho,
            "lancamento_id": d.lancamento_id, "emitido_em": d.emitido_em.isoformat() + "Z" if d.emitido_em else None,
            "link": verificar(d.codigo)}


@router.get("")
def listar(busca: str = "", tipo: str = "", limite: int = 200, db: Session = Depends(get_db)):
    cols = [c for c in models.DocumentoEmitido.__table__.columns if c.name != "pdf"]   # sem o arquivo: lista leve
    q = db.query(*cols)
    if tipo:
        q = q.filter(models.DocumentoEmitido.tipo == tipo)
    if busca.strip():
        b = f"%{busca.strip()}%"
        q = q.filter(or_(models.DocumentoEmitido.titulo.ilike(b), models.DocumentoEmitido.resumo.ilike(b),
                         models.DocumentoEmitido.codigo.ilike(b.upper())))
    linhas = q.order_by(models.DocumentoEmitido.emitido_em.desc()).limit(max(1, min(limite, 500))).all()
    return {"total": db.query(models.DocumentoEmitido).count(), "itens": [_meta(d) for d in linhas]}


@router.post("/{codigo}/whatsapp")
def reenviar(codigo: str, db: Session = Depends(get_db)):
    d = db.get(models.DocumentoEmitido, codigo.upper())
    if not d:
        raise HTTPException(404, "Documento não encontrado.")
    from .. import zapapi
    c = zapapi.config(db)
    if not c["ativo"] or not c["grupo"]:
        return {"enviado": False, "motivo": "Ligue o WhatsApp e escolha o grupo na tela do WhatsApp."}
    from ..urls import verificar
    link = verificar(d.codigo)
    legenda = f"📄 {d.titulo}" + (f"\n{d.resumo}" if d.resumo else "") + (f"\n✅ Validar: {link}" if link.startswith("http") else "")
    pdf, nome = d.pdf, f"{d.tipo}-{d.codigo}.pdf"
    from .. import zap_fila
    eid = zap_fila.disparar(d.titulo, lambda sdb: zapapi.enviar_arquivo(pdf, nome, "application/pdf", legenda, db=sdb))
    return {"enviado": True, "na_fila": True, "id": eid, "nome": d.titulo}
