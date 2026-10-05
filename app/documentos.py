"""Registro dos documentos emitidos, para a validação pelo QR code.

O código de autenticidade é determinístico (mesmos dados = mesmo código),
então gerar o mesmo recibo de novo não duplica: fica guardado o primeiro,
o documento original. Mudou algo que aparece no documento (pagamento,
valor, totais), o código muda e vira outro documento.
"""
import logging
from decimal import Decimal

log = logging.getLogger("tomelin.documentos")


def registrar(codigo: str, pdf: bytes, *, tipo: str, titulo: str, estilo: str = "padrao",
              resumo: str = "", valor=None, detalhes: dict | None = None, lancamento_id: int | None = None) -> None:
    """Guarda o PDF pelo código. Nunca quebra a geração do PDF se o banco falhar."""
    try:
        from .database import SessionLocal
        from . import models
    except Exception:          # ambiente sem banco (testes)
        return
    db = SessionLocal()
    try:
        if db.get(models.DocumentoEmitido, codigo):
            return
        db.add(models.DocumentoEmitido(
            codigo=codigo, tipo=tipo, estilo=estilo, titulo=titulo[:120], resumo=(resumo or "")[:300] or None,
            valor=Decimal(str(valor)) if valor is not None else None, detalhes=detalhes,
            lancamento_id=lancamento_id, pdf=pdf, tamanho=len(pdf)))
        db.commit()
    except Exception as e:
        db.rollback()
        log.warning("Documento %s não registrado: %s", codigo, e)
    finally:
        db.close()
