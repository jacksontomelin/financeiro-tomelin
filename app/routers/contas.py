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


BANDEIRAS = {"visa": "Visa", "master": "Mastercard", "elo": "Elo", "amex": "American Express",
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
        abertas = (db.query(models.ParcelaCartao)
                   .join(models.Parcelamento, models.Parcelamento.id == models.ParcelaCartao.parcelamento_id)
                   .filter(models.Parcelamento.cartao_id == c.id, models.ParcelaCartao.paga.is_(False))
                   .order_by(models.ParcelaCartao.data_vencimento).all())
        em_aberto = sum((Decimal(p.valor) for p in abertas), Decimal(0))
        if c.dia_vencimento:
            venc = _proximo_dia(hoje, c.dia_vencimento)
        else:
            venc = abertas[0].data_vencimento if abertas else None
        fatura = sum((Decimal(p.valor) for p in abertas if venc and p.data_vencimento <= venc), Decimal(0))
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
