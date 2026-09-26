"""
Gestão de compras: itens da nota fiscal + controle de parcelamento no cartão.
Uma Compra está sempre ligada a um Lancamento (1:1). Se o pagamento foi
parcelado no cartão, gera um Parcelamento com N ParcelaCartao.
"""
from datetime import date
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import Optional

from ..database import get_db
from .. import models
from ..security import usuario_atual

router = APIRouter(prefix="/api/compras", tags=["compras"],
                   dependencies=[Depends(usuario_atual)])


# ───────────────────────── Schemas ─────────────────────────
class ItemIn(BaseModel):
    descricao: str
    quantidade: float = 1
    valor_unitario: Optional[float] = None
    valor_total: float
    categoria_id: Optional[int] = None


class ParcelamentoIn(BaseModel):
    cartao_id: int
    total_parcelas: int
    valor_parcela: Optional[float] = None  # se omitido, calcula valor_total / total_parcelas
    primeira_parcela_data: Optional[str] = None  # ISO date; default = hoje + 30 dias


class CompraIn(BaseModel):
    lancamento_id: int
    estabelecimento: Optional[str] = None
    cnpj_emitente: Optional[str] = None
    numero_nota: Optional[str] = None
    chave_acesso: Optional[str] = None
    data_emissao: Optional[str] = None
    uf: Optional[str] = None
    itens: list[ItemIn] = []
    parcelamento: Optional[ParcelamentoIn] = None


# ───────────────────────── Helpers de saída ─────────────────────────
def _item_out(i: models.ItemCompra):
    return {
        "id": i.id, "descricao": i.descricao,
        "quantidade": float(i.quantidade or 1),
        "valor_unitario": float(i.valor_unitario) if i.valor_unitario else None,
        "valor_total": float(i.valor_total),
        "categoria_id": i.categoria_id,
        "categoria_nome": i.categoria.nome if i.categoria else None,
    }


def _parcela_out(p: models.ParcelaCartao):
    return {
        "id": p.id, "numero": p.numero, "valor": float(p.valor),
        "data_vencimento": p.data_vencimento.isoformat(),
        "paga": p.paga, "status": p.status,
        "data_pagamento": p.data_pagamento.isoformat() if p.data_pagamento else None,
    }


def _parcelamento_out(pm: models.Parcelamento):
    return {
        "id": pm.id, "cartao_id": pm.cartao_id,
        "cartao_nome": pm.cartao.nome if pm.cartao else None,
        "total_parcelas": pm.total_parcelas,
        "valor_parcela": float(pm.valor_parcela),
        "parcelas_pagas": pm.parcelas_pagas,
        "parcelas_restantes": pm.parcelas_restantes,
        "valor_pago": float(pm.valor_pago),
        "valor_restante": float(pm.valor_restante),
        "parcelas": [_parcela_out(p) for p in pm.parcelas],
    }


def _compra_out(c: models.Compra):
    return {
        "id": c.id, "lancamento_id": c.lancamento_id,
        "estabelecimento": c.estabelecimento, "cnpj_emitente": c.cnpj_emitente,
        "numero_nota": c.numero_nota, "chave_acesso": c.chave_acesso,
        "data_emissao": c.data_emissao.isoformat() if c.data_emissao else None,
        "uf": c.uf,
        "itens": [_item_out(i) for i in c.itens],
        "total_itens": len(c.itens),
        "valor_itens": float(sum((i.valor_total for i in c.itens), 0)),
        "parcelamento": _parcelamento_out(c.parcelamento) if c.parcelamento else None,
    }


def _query_base(db: Session):
    return db.query(models.Compra).options(
        joinedload(models.Compra.itens).joinedload(models.ItemCompra.categoria),
        joinedload(models.Compra.parcelamento).joinedload(models.Parcelamento.cartao),
        joinedload(models.Compra.parcelamento).joinedload(models.Parcelamento.parcelas),
    )


# ───────────────────────── Rotas ─────────────────────────
@router.get("")
def listar(db: Session = Depends(get_db)):
    compras = _query_base(db).order_by(models.Compra.data_emissao.desc().nullslast(),
                                       models.Compra.id.desc()).all()
    return [_compra_out(c) for c in compras]


@router.get("/{cid}")
def obter(cid: int, db: Session = Depends(get_db)):
    c = _query_base(db).filter(models.Compra.id == cid).first()
    if not c:
        raise HTTPException(404, "Compra não encontrada.")
    return _compra_out(c)


@router.get("/por-lancamento/{lid}")
def obter_por_lancamento(lid: int, db: Session = Depends(get_db)):
    c = _query_base(db).filter(models.Compra.lancamento_id == lid).first()
    if not c:
        return None
    return _compra_out(c)


@router.post("")
def criar(dados: CompraIn, db: Session = Depends(get_db)):
    lanc = db.get(models.Lancamento, dados.lancamento_id)
    if not lanc:
        raise HTTPException(404, "Lançamento não encontrado.")
    existente = db.query(models.Compra).filter(
        models.Compra.lancamento_id == dados.lancamento_id).first()
    if existente:
        raise HTTPException(400, "Este lançamento já possui uma compra detalhada vinculada.")

    data_em = None
    if dados.data_emissao:
        try:
            data_em = date.fromisoformat(dados.data_emissao[:10])
        except ValueError:
            data_em = None

    compra = models.Compra(
        lancamento_id=dados.lancamento_id,
        estabelecimento=dados.estabelecimento,
        cnpj_emitente=dados.cnpj_emitente,
        numero_nota=dados.numero_nota,
        chave_acesso=dados.chave_acesso,
        data_emissao=data_em,
        uf=dados.uf,
    )
    db.add(compra)
    db.flush()

    for it in dados.itens:
        db.add(models.ItemCompra(
            compra_id=compra.id, descricao=it.descricao[:200],
            quantidade=it.quantidade, valor_unitario=it.valor_unitario,
            valor_total=it.valor_total, categoria_id=it.categoria_id,
        ))

    if dados.parcelamento:
        _criar_parcelamento(db, compra, dados.parcelamento, float(lanc.valor_total))

    db.commit()
    return _compra_out(_query_base(db).filter(models.Compra.id == compra.id).first())


def _criar_parcelamento(db: Session, compra: models.Compra, p: ParcelamentoIn, valor_total_lanc: float):
    cartao = db.get(models.Conta, p.cartao_id)
    if not cartao:
        raise HTTPException(404, "Cartão (conta) não encontrado.")
    n = max(1, p.total_parcelas)
    valor_parcela = p.valor_parcela if p.valor_parcela else round(valor_total_lanc / n, 2)

    primeira = date.today() + relativedelta(months=1)
    if p.primeira_parcela_data:
        try:
            primeira = date.fromisoformat(p.primeira_parcela_data[:10])
        except ValueError:
            pass

    pm = models.Parcelamento(
        compra_id=compra.id, cartao_id=cartao.id,
        total_parcelas=n, valor_parcela=valor_parcela,
        primeira_parcela_data=primeira,
    )
    db.add(pm)
    db.flush()

    # ajusta a última parcela para bater exatamente com o total (arredondamento)
    soma_parcial = round(valor_parcela * (n - 1), 2)
    ultima = round(valor_total_lanc - soma_parcial, 2) if n > 1 else valor_total_lanc

    for i in range(1, n + 1):
        venc = primeira + relativedelta(months=i - 1)
        valor = ultima if i == n else valor_parcela
        db.add(models.ParcelaCartao(
            parcelamento_id=pm.id, numero=i, valor=valor, data_vencimento=venc,
        ))
    return pm


@router.post("/{cid}/parcelamento")
def definir_parcelamento(cid: int, p: ParcelamentoIn, db: Session = Depends(get_db)):
    compra = db.query(models.Compra).options(
        joinedload(models.Compra.lancamento)).filter(models.Compra.id == cid).first()
    if not compra:
        raise HTTPException(404, "Compra não encontrada.")
    if compra.parcelamento:
        db.delete(compra.parcelamento)
        db.flush()
    _criar_parcelamento(db, compra, p, float(compra.lancamento.valor_total))
    db.commit()
    return _compra_out(_query_base(db).filter(models.Compra.id == cid).first())


@router.post("/parcelas/{pid}/pagar")
def marcar_parcela_paga(pid: int, db: Session = Depends(get_db)):
    parcela = db.get(models.ParcelaCartao, pid)
    if not parcela:
        raise HTTPException(404, "Parcela não encontrada.")
    parcela.paga = True
    parcela.data_pagamento = date.today()
    db.commit()
    return {"ok": True}


@router.post("/parcelas/{pid}/estornar")
def estornar_parcela(pid: int, db: Session = Depends(get_db)):
    parcela = db.get(models.ParcelaCartao, pid)
    if not parcela:
        raise HTTPException(404, "Parcela não encontrada.")
    parcela.paga = False
    parcela.data_pagamento = None
    db.commit()
    return {"ok": True}


@router.delete("/{cid}")
def excluir(cid: int, db: Session = Depends(get_db)):
    compra = db.get(models.Compra, cid)
    if not compra:
        raise HTTPException(404, "Compra não encontrada.")
    db.delete(compra)
    db.commit()
    return {"ok": True}


@router.get("/resumo/produtos")
def resumo_produtos(limite: int = 50, db: Session = Depends(get_db)):
    """Ranking dos produtos/itens mais comprados (agregado por descrição)."""
    from sqlalchemy import func
    rows = (db.query(
                models.ItemCompra.descricao,
                func.count(models.ItemCompra.id).label("qtd_compras"),
                func.sum(models.ItemCompra.valor_total).label("total_gasto"),
            )
            .group_by(models.ItemCompra.descricao)
            .order_by(func.sum(models.ItemCompra.valor_total).desc())
            .limit(limite).all())
    return [{"descricao": r[0], "qtd_compras": r[1], "total_gasto": float(r[2] or 0)} for r in rows]


@router.get("/resumo/parcelas-pendentes")
def parcelas_pendentes(db: Session = Depends(get_db)):
    """Todas as parcelas de cartão ainda não pagas, ordenadas por vencimento."""
    rows = (db.query(models.ParcelaCartao)
            .options(
                joinedload(models.ParcelaCartao.parcelamento).joinedload(models.Parcelamento.cartao),
                joinedload(models.ParcelaCartao.parcelamento).joinedload(models.Parcelamento.compra),
            )
            .filter(models.ParcelaCartao.paga.is_(False))
            .order_by(models.ParcelaCartao.data_vencimento.asc())
            .all())
    out = []
    for p in rows:
        pm = p.parcelamento
        out.append({
            "id": p.id, "numero": p.numero, "total_parcelas": pm.total_parcelas,
            "valor": float(p.valor), "data_vencimento": p.data_vencimento.isoformat(),
            "status": p.status,
            "cartao_nome": pm.cartao.nome if pm.cartao else None,
            "estabelecimento": pm.compra.estabelecimento if pm.compra else None,
            "compra_id": pm.compra_id,
        })
    return out
