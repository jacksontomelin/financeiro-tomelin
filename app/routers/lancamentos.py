from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from .. import models, schemas
from ..security import usuario_atual
from .. import historico

FORMAS = {"pix", "dinheiro", "debito", "credito", "boleto", "transferencia"}

router = APIRouter(prefix="/api/lancamentos", tags=["lancamentos"],
                   dependencies=[Depends(usuario_atual)])


def _out(l: models.Lancamento) -> schemas.LancamentoOut:
    o = schemas.LancamentoOut.model_validate(l)
    o.categoria_nome = l.categoria.nome if l.categoria else None
    o.contato_nome = l.contato.nome if l.contato else None
    o.contato_logo = l.contato.logo if l.contato else None
    o.conta_nome = l.conta.nome if l.conta else None
    o.responsavel_nome = l.responsavel.nome if l.responsavel else None
    return o


@router.get("", response_model=list[schemas.LancamentoOut])
def listar(
    tipo: str | None = None,
    status: str | None = Query(None, description="pago | pendente | atrasado"),
    categoria_id: int | None = None,
    contato_id: int | None = None,
    responsavel_id: int | None = None,
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
    if responsavel_id:
        q = q.filter(models.Lancamento.responsavel_id == responsavel_id)
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


@router.get("/{lid}", response_model=schemas.LancamentoOut)
def obter(lid: int, db: Session = Depends(get_db)):
    l = db.get(models.Lancamento, lid)
    if not l:
        raise HTTPException(404, "Lançamento não encontrado.")
    return _out(l)   # com nomes de categoria, contato e conta, igual à lista


@router.post("", response_model=schemas.LancamentoOut)
def criar(dados: schemas.LancamentoIn, db: Session = Depends(get_db), me: models.Usuario = Depends(usuario_atual)):
    payload = dados.model_dump()
    if payload.get("import_id"):   # reenvio do que foi lançado sem internet: devolve o que já entrou
        ja = db.query(models.Lancamento).filter_by(import_id=payload["import_id"]).first()
        if ja:
            return _out(ja)
    if not payload.get("data_competencia"):
        payload["data_competencia"] = date.today()
    l = models.Lancamento(**payload)
    db.add(l); db.commit(); db.refresh(l)
    historico.registrar(db, l, "criou", me)
    if l.data_pagamento:
        _auto_recibo(l, db=db)
    _aviso_orcamento(l)
    return _out(l)


@router.put("/{lid}", response_model=schemas.LancamentoOut)
def editar(lid: int, dados: schemas.LancamentoIn, db: Session = Depends(get_db), me: models.Usuario = Depends(usuario_atual)):
    l = db.get(models.Lancamento, lid)
    if not l:
        raise HTTPException(404, "Lançamento não encontrado.")
    era_pago = l.data_pagamento is not None
    antes = historico.foto(l)
    for k, v in dados.model_dump(exclude_unset=True).items():   # campo não enviado fica como está
        setattr(l, k, v)
    db.commit(); db.refresh(l)
    mud = historico.diferencas(db, antes, historico.foto(l))
    if mud:
        historico.registrar(db, l, "editou", me, mudancas=mud)
    if l.data_pagamento and not era_pago:
        _auto_recibo(l, db=db)
    _aviso_orcamento(l)
    return _out(l)


@router.post("/{lid}/baixa", response_model=schemas.LancamentoOut)
def dar_baixa(lid: int, dados: schemas.BaixaIn, db: Session = Depends(get_db), me: models.Usuario = Depends(usuario_atual)):
    l = db.get(models.Lancamento, lid)
    if not l:
        raise HTTPException(404, "Lançamento não encontrado.")
    l.data_pagamento = dados.data_pagamento or date.today()
    if dados.conta_id:
        l.conta_id = dados.conta_id
    if dados.forma_pagamento:
        if dados.forma_pagamento not in FORMAS:
            raise HTTPException(400, "Forma de pagamento: escolha uma da lista.")
        l.forma_pagamento = dados.forma_pagamento
    if dados.juros is not None:
        l.juros = dados.juros
    if dados.multa is not None:
        l.multa = dados.multa
    db.commit(); db.refresh(l)
    historico.registrar(db, l, "baixa", me, mudancas=[{"campo": "Pagamento", "de": None, "para": l.data_pagamento.strftime("%d/%m/%Y")}])
    _auto_recibo(l, db=db)
    return _out(l)


@router.post("/{lid}/estornar", response_model=schemas.LancamentoOut)
def estornar(lid: int, db: Session = Depends(get_db), me: models.Usuario = Depends(usuario_atual)):
    l = db.get(models.Lancamento, lid)
    if not l:
        raise HTTPException(404, "Lançamento não encontrado.")
    era = l.data_pagamento
    l.data_pagamento = None
    db.commit(); db.refresh(l)
    historico.registrar(db, l, "estorno", me, mudancas=[{"campo": "Pagamento", "de": era.strftime("%d/%m/%Y") if era else None, "para": None}])
    return _out(l)


@router.delete("/{lid}")
def excluir(lid: int, db: Session = Depends(get_db), me: models.Usuario = Depends(usuario_atual)):
    l = db.get(models.Lancamento, lid)
    if not l:
        raise HTTPException(404, "Lançamento não encontrado.")
    historico.registrar(db, l, "excluiu", me, mudancas=[{"campo": "Valor", "de": f"{l.valor:.2f}", "para": None}])
    db.query(models.Anexo).filter(models.Anexo.lancamento_id == lid).delete()   # comprovantes vão junto
    db.delete(l); db.commit()
    return {"ok": True}


@router.get("/{lid}/historico")
def ver_historico(lid: int, db: Session = Depends(get_db)):
    return [_hist(h) for h in db.query(models.HistoricoLancamento).filter_by(lancamento_id=lid)
            .order_by(models.HistoricoLancamento.quando.desc()).all()]


def _hist(h: models.HistoricoLancamento) -> dict:
    return {"id": h.id, "lancamento_id": h.lancamento_id, "descricao": h.descricao, "acao": h.acao, "autor": h.autor,
            "usuario_id": h.usuario_id, "mudancas": h.mudancas or [], "quando": h.quando.isoformat() + "Z"}


def _aviso_orcamento(l: models.Lancamento):
    if l.tipo == models.TipoMov.despesa and l.categoria_id:
        from ..orcamento_aviso import em_segundo_plano
        em_segundo_plano(l.categoria_id, l.data_competencia)


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
    try:   # em segundo plano: a baixa responde na hora, sem esperar o WhatsApp
        from .. import service, whatsapp as wa, zap_fila
        cat, conta, contato = _ctx(l)
        txt = service.texto_recibo(l, categoria=cat, conta=conta, contato=contato)
        zap_fila.disparar(f"Recibo #{l.id}", lambda sdb: wa.enviar(txt, db=sdb))
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
    from .. import zapapi, zap_fila
    c = zapapi.config(db)
    if not c["ativo"] or not c["grupo"]:
        return {"enviado": False, "motivo": "WhatsApp desligado ou sem grupo: configure na tela do WhatsApp."}
    cat, conta, contato = _ctx(l)
    txt = service.texto_recibo(l, categoria=cat, conta=conta, contato=contato)
    eid = zap_fila.disparar(f"Recibo #{l.id}", lambda sdb: wa.enviar(txt, db=sdb))
    return {"enviado": True, "na_fila": True, "id": eid, "nome": f"Recibo #{l.id}"}
