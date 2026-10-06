from datetime import date
from calendar import monthrange
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas, service
from ..security import usuario_atual
from ..erros import ErroCampo, bloquear_se_em_uso

router = APIRouter(prefix="/api/contas", tags=["contas"],
                   dependencies=[Depends(usuario_atual)])


@router.get("", response_model=list[schemas.ContaOut])
def listar(db: Session = Depends(get_db)):
    saida = []
    for c in db.query(models.Conta).order_by(models.Conta.nome).all():
        out = schemas.ContaOut.model_validate(c)
        out.saldo_atual = service.saldo_conta(db, c)
        saida.append(out)
    return saida


BANDEIRAS = {"visa": "Visa", "master": "Mastercard", "maestro": "Maestro", "alelo": "Alelo", "elo": "Elo", "amex": "American Express",
             "hiper": "Hipercard", "diners": "Diners Club", "outra": "Outra"}


def _valida_cartao(dados: schemas.ContaIn):
    """Campos de cartão só valem para tipo cartão; o número completo nunca é guardado."""
    if dados.tipo != "cartao":
        dados.bandeira = dados.final_cartao = dados.limite = dados.dia_fechamento = dados.dia_vencimento = None
        return
    if dados.bandeira and dados.bandeira not in BANDEIRAS:
        raise ErroCampo("bandeira", "Bandeira: escolha uma da lista.")
    f = (dados.final_cartao or "").strip()
    if f and not (len(f) == 4 and f.isdigit()):
        raise ErroCampo("final_cartao", "Final do cartão: informe só os 4 últimos dígitos.")
    dados.final_cartao = f or None
    for campo, nome in (("dia_fechamento", "Dia de fechamento"), ("dia_vencimento", "Dia de vencimento")):
        v = getattr(dados, campo)
        if v is not None and not (1 <= v <= 31):
            raise ErroCampo(campo, f"{nome}: entre 1 e 31.")
    if dados.limite is not None and dados.limite < 0:
        raise ErroCampo("limite", "Limite: não pode ser negativo.")


def _proximo_dia(hoje: date, dia: int) -> date:
    """Próxima data (hoje ou depois) com esse dia do mês; meses curtos usam o último dia."""
    for k in range(0, 3):
        a, m = hoje.year + (hoje.month - 1 + k) // 12, (hoje.month - 1 + k) % 12 + 1
        d = date(a, m, min(dia, monthrange(a, m)[1]))
        if d >= hoje:
            return d
    return hoje


@router.get("/cartoes")
def cartoes(db: Session = Depends(get_db)):
    """Resumo de cada cartão de crédito: limite usado, disponível, fatura atual e vencimento."""
    hoje = date.today()
    out = []
    for c in db.query(models.Conta).filter(models.Conta.tipo == "cartao").order_by(models.Conta.nome):
        itens = _itens_fatura(db, c)                       # mesma regra da tela da fatura
        abertos = [x for x in itens if not x["pago"]]
        em_aberto = Decimal(str(round(sum(x["valor"] for x in abertos), 2)))
        aberta = _venc_da_fatura(c, hoje).strftime("%Y-%m")
        pend = sorted({x["mes"] for x in abertos})
        atual = pend[0] if pend and pend[0] < aberta else aberta
        a, m = int(atual[:4]), int(atual[5:7])
        venc = date(a, m, min(c.dia_vencimento or monthrange(a, m)[1], monthrange(a, m)[1]))
        fatura = Decimal(str(round(sum(x["valor"] for x in abertos if x["mes"] == atual), 2)))
        abertas = abertos
        limite = Decimal(c.limite) if c.limite is not None else None
        out.append({
            "id": c.id, "nome": c.nome, "banco": c.banco, "cor": c.cor, "logo": c.logo, "ativo": c.ativo,
            "bandeira": c.bandeira, "bandeira_nome": BANDEIRAS.get(c.bandeira or "", None),
            "final_cartao": c.final_cartao, "dia_fechamento": c.dia_fechamento, "dia_vencimento": c.dia_vencimento,
            "limite": float(limite) if limite is not None else None,
            "em_aberto": float(em_aberto), "fatura_atual": float(fatura),
            "disponivel": float(limite - em_aberto) if limite is not None else None,
            "uso_pct": round(float(em_aberto / limite * 100), 1) if limite else None,
            "proximo_vencimento": venc.isoformat() if venc else None,
            "parcelas_abertas": len(abertas),
        })
    return out


def _venc_da_fatura(c, d: date) -> date:
    """Vencimento da fatura em que cai uma compra feita no dia d (regra do fechamento)."""
    fech, venc = c.dia_fechamento, c.dia_vencimento
    if not venc:
        return date(d.year, d.month, monthrange(d.year, d.month)[1])
    if not fech:
        fech = max(1, venc - 7)
    a, m = d.year, d.month
    fecha = date(a, m, min(fech, monthrange(a, m)[1]))
    if d > fecha:                                   # passou do fechamento: próximo ciclo
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    if venc <= fech:                                # vence no mês seguinte ao fechamento
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    return date(a, m, min(venc, monthrange(a, m)[1]))


def _itens_fatura(db, c):
    """Todas as parcelas e compras do cartão, cada uma com o mês da fatura (AAAA-MM)."""
    itens = []
    parc = (db.query(models.ParcelaCartao, models.Parcelamento, models.Compra, models.Lancamento)
            .join(models.Parcelamento, models.Parcelamento.id == models.ParcelaCartao.parcelamento_id)
            .join(models.Compra, models.Compra.id == models.Parcelamento.compra_id)
            .outerjoin(models.Lancamento, models.Lancamento.id == models.Compra.lancamento_id)
            .filter(models.Parcelamento.cartao_id == c.id).all())
    com_parcelas = set()
    for p, pm, cp, l in parc:
        if l:
            com_parcelas.add(l.id)
        itens.append({"chave": f"p{p.id}", "tipo": "parcela", "id": p.id, "lancamento_id": l.id if l else None,
                      "descricao": (l.descricao if l else None) or cp.estabelecimento or "Compra parcelada",
                      "local": cp.estabelecimento, "parcela": f"{p.numero}/{pm.total_parcelas}",
                      "data": (cp.data_emissao or pm.primeira_parcela_data).isoformat() if (cp.data_emissao or pm.primeira_parcela_data) else None,
                      "valor": float(p.valor), "pago": bool(p.paga), "mes": p.data_vencimento.strftime("%Y-%m"),
                      "categoria_id": l.categoria_id if l else None,
                      "contato_nome": l.contato.nome if l and l.contato else None,
                      "contato_logo": l.contato.logo if l and l.contato else None})
    for l in db.query(models.Lancamento).filter(models.Lancamento.conta_id == c.id, models.Lancamento.tipo == models.TipoMov.despesa).all():
        if l.id in com_parcelas:
            continue
        d = l.data_competencia or l.data_vencimento or date.today()
        itens.append({"chave": f"l{l.id}", "tipo": "compra", "id": l.id, "lancamento_id": l.id, "descricao": l.descricao, "local": None,
                      "parcela": None, "data": d.isoformat(), "valor": float(l.valor_total), "pago": bool(l.data_pagamento),
                      "mes": _venc_da_fatura(c, d).strftime("%Y-%m"), "categoria_id": l.categoria_id,
                      "contato_nome": l.contato.nome if l.contato else None, "contato_logo": l.contato.logo if l.contato else None})
    return itens


@router.get("/{cid}/fatura")
def fatura(cid: int, mes: str | None = None, db: Session = Depends(get_db)):
    c = db.get(models.Conta, cid)
    if not c or c.tipo != "cartao":
        raise HTTPException(404, "Cartão não encontrado.")
    hoje = date.today()
    todos = _itens_fatura(db, c)
    aberta = _venc_da_fatura(c, hoje)
    # a fatura atual é a mais antiga ainda com algo a pagar; se não houver, a do ciclo de hoje
    pend = sorted({i["mes"] for i in todos if not i["pago"]})
    atual = pend[0] if pend and pend[0] < aberta.strftime("%Y-%m") else aberta.strftime("%Y-%m")
    mes = mes or atual
    a, m = int(mes[:4]), int(mes[5:7])
    venc = date(a, m, min(c.dia_vencimento or monthrange(a, m)[1], monthrange(a, m)[1]))
    fech_dia = c.dia_fechamento or max(1, (c.dia_vencimento or 10) - 7)
    fa, fm = (a, m) if fech_dia < (c.dia_vencimento or 31) else ((a - 1, 12) if m == 1 else (a, m - 1))
    fecha = date(fa, fm, min(fech_dia, monthrange(fa, fm)[1]))
    itens = sorted([i for i in todos if i["mes"] == mes], key=lambda i: (i["data"] or "", i["chave"]), reverse=True)
    total = round(sum(i["valor"] for i in itens), 2)
    em_aberto = round(sum(i["valor"] for i in itens if not i["pago"]), 2)
    if itens and not em_aberto:
        status = "paga"
    elif mes > aberta.strftime("%Y-%m"):
        status = "futura"
    elif hoje > fecha:
        status = "atrasada" if hoje > venc and em_aberto else "fechada"
    else:
        status = "aberta"
    meses = sorted({i["mes"] for i in todos} | {atual})
    return {"cartao": {"id": c.id, "nome": c.nome, "banco": c.banco, "cor": c.cor, "logo": c.logo, "bandeira": c.bandeira,
                       "final_cartao": c.final_cartao, "limite": float(c.limite) if c.limite is not None else None},
            "mes": mes, "atual": atual, "meses": meses, "vencimento": venc.isoformat(), "fechamento": fecha.isoformat(),
            "status": status, "total": total, "em_aberto": em_aberto, "itens": itens,
            "historico": [{"mes": mm, "total": round(sum(i["valor"] for i in todos if i["mes"] == mm), 2),
                           "em_aberto": round(sum(i["valor"] for i in todos if i["mes"] == mm and not i["pago"]), 2)} for mm in meses]}


class PagarFaturaIn(schemas.BaseModel):
    mes: str
    conta_id: int
    data: date | None = None


@router.post("/{cid}/fatura/pagar")
def pagar_fatura(cid: int, dados: PagarFaturaIn, db: Session = Depends(get_db)):
    c = db.get(models.Conta, cid)
    if not c or c.tipo != "cartao":
        raise HTTPException(404, "Cartão não encontrado.")
    origem = db.get(models.Conta, dados.conta_id)
    if not origem or origem.id == c.id or origem.tipo == "cartao":
        raise ErroCampo("conta_id", "Pagar com: escolha uma conta (não um cartão).")
    quando = dados.data or date.today()
    total = Decimal(0)
    for i in _itens_fatura(db, c):
        if i["mes"] != dados.mes or i["pago"]:
            continue
        if i["tipo"] == "parcela":
            p = db.get(models.ParcelaCartao, i["id"]); p.paga = True; p.data_pagamento = quando
        else:
            l = db.get(models.Lancamento, i["id"]); l.data_pagamento = quando
        total += Decimal(str(i["valor"]))
    if not total:
        raise HTTPException(400, "Esta fatura não tem nada em aberto.")
    a, m = dados.mes[:4], dados.mes[5:7]
    db.add(models.Transferencia(data=quando, valor=total, conta_origem_id=origem.id, conta_destino_id=c.id,
                                descricao=f"Pagamento da fatura {m}/{a} do {c.nome}"))
    db.commit()
    return {"ok": True, "pago": float(total)}


@router.post("", response_model=schemas.ContaOut)
def criar(dados: schemas.ContaIn, db: Session = Depends(get_db)):
    _valida_cartao(dados)
    c = models.Conta(**dados.model_dump())
    db.add(c); db.commit(); db.refresh(c)
    out = schemas.ContaOut.model_validate(c)
    out.saldo_atual = service.saldo_conta(db, c)
    return out


@router.get("/{cid}", response_model=schemas.ContaOut)
def obter(cid: int, db: Session = Depends(get_db)):
    o = db.get(models.Conta, cid)
    if not o:
        raise HTTPException(404, "Conta não encontrada.")
    return o

@router.put("/{cid}", response_model=schemas.ContaOut)
def editar(cid: int, dados: schemas.ContaIn, db: Session = Depends(get_db)):
    _valida_cartao(dados)
    c = db.get(models.Conta, cid)
    if not c:
        raise HTTPException(404, "Conta não encontrada.")
    for k, v in dados.model_dump().items():
        setattr(c, k, v)
    db.commit(); db.refresh(c)
    out = schemas.ContaOut.model_validate(c)
    out.saldo_atual = service.saldo_conta(db, c)
    return out


@router.delete("/{cid}")
def excluir(cid: int, db: Session = Depends(get_db)):
    c = db.get(models.Conta, cid)
    if not c:
        raise HTTPException(404, "Conta não encontrada.")
    bloquear_se_em_uso(db, "a conta", c.nome, [
        (models.Lancamento, "conta_id", cid, "lançamento|lançamentos"),
        (models.Parcelamento, "cartao_id", cid, "compra parcelada|compras parceladas"),
        (models.Transferencia, "conta_origem_id", cid, "transferência enviada|transferências enviadas"),
        (models.Transferencia, "conta_destino_id", cid, "transferência recebida|transferências recebidas"),
    ])
    db.delete(c); db.commit()
    return {"ok": True}
