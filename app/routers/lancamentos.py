from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from .. import models, schemas
from ..security import usuario_atual

router = APIRouter(prefix="/api/lancamentos", tags=["lancamentos"],
                   dependencies=[Depends(usuario_atual)])


def _out(l: models.Lancamento) -> schemas.LancamentoOut:
    o = schemas.LancamentoOut.model_validate(l)
    o.categoria_nome = l.categoria.nome if l.categoria else None
    o.contato_nome = l.contato.nome if l.contato else None
    o.contato_logo = l.contato.logo if l.contato else None
    o.conta_nome = l.conta.nome if l.conta else None
    return o


@router.get("", response_model=list[schemas.LancamentoOut])
def listar(
    tipo: str | None = None,
    status: str | None = Query(None, description="pago | pendente | atrasado"),
    categoria_id: int | None = None,
    contato_id: int | None = None,
    de: date | None = None,
    ate: date | None = None,
    busca: str | None = None,
    limite: int = 300,
    db: Session = Depends(get_db),
):
    q = db.query(models.Lancamento).options(
        joinedload(models.Lancamento.categoria),
        joinedload(models.Lancamento.contato),
        joinedload(models.Lancamento.conta),
    )
    if tipo:
        q = q.filter(models.Lancamento.tipo == tipo)
    if categoria_id:
        q = q.filter(models.Lancamento.categoria_id == categoria_id)
    if contato_id:
        q = q.filter(models.Lancamento.contato_id == contato_id)
    if de:
        q = q.filter(models.Lancamento.data_competencia >= de)
    if ate:
        q = q.filter(models.Lancamento.data_competencia <= ate)
    if busca:
        q = q.filter(models.Lancamento.descricao.ilike(f"%{busca}%"))
    if status == "pago":
        q = q.filter(models.Lancamento.data_pagamento.isnot(None))
    elif status == "pendente":
        q = q.filter(models.Lancamento.data_pagamento.is_(None),
                     (models.Lancamento.data_vencimento.is_(None)) |
                     (models.Lancamento.data_vencimento >= date.today()))
    elif status == "atrasado":
        q = q.filter(models.Lancamento.data_pagamento.is_(None),
                     models.Lancamento.data_vencimento < date.today())

    itens = q.order_by(models.Lancamento.data_competencia.desc(),
                       models.Lancamento.id.desc()).limit(limite).all()
    return [_out(i) for i in itens]


@router.post("", response_model=schemas.LancamentoOut)
def criar(dados: schemas.LancamentoIn, db: Session = Depends(get_db)):
    payload = dados.model_dump()
    if not payload.get("data_competencia"):
        payload["data_competencia"] = date.today()
    l = models.Lancamento(**payload)
    db.add(l); db.commit(); db.refresh(l)
    if l.data_pagamento:
        _auto_recibo(l, db=db)
    return _out(l)


@router.put("/{lid}", response_model=schemas.LancamentoOut)
def editar(lid: int, dados: schemas.LancamentoIn, db: Session = Depends(get_db)):
    l = db.get(models.Lancamento, lid)
    if not l:
        raise HTTPException(404, "Lançamento não encontrado.")
    era_pago = l.data_pagamento is not None
    for k, v in dados.model_dump().items():
        setattr(l, k, v)
    db.commit(); db.refresh(l)
    if l.data_pagamento and not era_pago:
        _auto_recibo(l, db=db)
    return _out(l)


@router.post("/{lid}/baixa", response_model=schemas.LancamentoOut)
def dar_baixa(lid: int, dados: schemas.BaixaIn, db: Session = Depends(get_db)):
    l = db.get(models.Lancamento, lid)
    if not l:
        raise HTTPException(404, "Lançamento não encontrado.")
    l.data_pagamento = dados.data_pagamento or date.today()
    if dados.conta_id:
        l.conta_id = dados.conta_id
    if dados.juros is not None:
        l.juros = dados.juros
    if dados.multa is not None:
        l.multa = dados.multa
    db.commit(); db.refresh(l)
    _auto_recibo(l, db=db)
    return _out(l)


@router.post("/{lid}/estornar", response_model=schemas.LancamentoOut)
def estornar(lid: int, db: Session = Depends(get_db)):
    l = db.get(models.Lancamento, lid)
    if not l:
        raise HTTPException(404, "Lançamento não encontrado.")
    l.data_pagamento = None
    db.commit(); db.refresh(l)
    return _out(l)


@router.delete("/{lid}")
def excluir(lid: int, db: Session = Depends(get_db)):
    l = db.get(models.Lancamento, lid)
    if not l:
        raise HTTPException(404, "Lançamento não encontrado.")
    db.delete(l); db.commit()
    return {"ok": True}


def _ctx(l):
    return (l.categoria.nome if l.categoria else "",
            l.conta.nome if l.conta else "",
            l.contato.nome if l.contato else "")


def _auto_recibo(l: models.Lancamento, db: Session = None):
    """Dispara o recibo no WhatsApp automaticamente quando a conta fica paga."""
    from ..config import settings
    from ..cfg import get_bool
    if not (get_bool(db, 'RECIBO_WHATSAPP_AUTO', settings.RECIBO_WHATSAPP_AUTO) and get_bool(db, 'WHATSAPP_ATIVO', settings.WHATSAPP_ATIVO)):
        return
    if not l.data_pagamento:
        return
    try:
        from .. import service, whatsapp as wa
        cat, conta, contato = _ctx(l)
        wa.enviar(service.texto_recibo(l, categoria=cat, conta=conta, contato=contato))
    except Exception:  # nunca deixa o envio quebrar a baixa
        pass


@router.get("/{lid}/recibo.pdf")
def recibo_pdf(lid: int, estilo: str = "padrao", db: Session = Depends(get_db)):
    from fastapi import Response
    l = db.query(models.Lancamento).options(
        joinedload(models.Lancamento.categoria),
        joinedload(models.Lancamento.contato),
        joinedload(models.Lancamento.conta),
    ).filter(models.Lancamento.id == lid).first()
    if not l:
        raise HTTPException(404, "Lançamento não encontrado.")
    cat, conta, contato = _ctx(l)
    if estilo == "matricial":
        from .. import pdf_matricial as pdfgen
        data = pdfgen.recibo_matricial(l, categoria=cat, conta=conta, contato=contato)
    else:
        from .. import pdf as pdfgen
        data = pdfgen.recibo(l, categoria=cat, conta=conta, contato=contato)
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="recibo-{lid:04d}.pdf"'})


@router.post("/{lid}/recibo/whatsapp")
def recibo_whatsapp(lid: int, db: Session = Depends(get_db)):
    from .. import service, whatsapp as wa
    l = db.query(models.Lancamento).options(
        joinedload(models.Lancamento.categoria),
        joinedload(models.Lancamento.contato),
        joinedload(models.Lancamento.conta),
    ).filter(models.Lancamento.id == lid).first()
    if not l:
        raise HTTPException(404, "Lançamento não encontrado.")
    cat, conta, contato = _ctx(l)
    txt = service.texto_recibo(l, categoria=cat, conta=conta, contato=contato)
    ok = wa.enviar(txt)
    return {"enviado": bool(ok)}
