from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas, fipe
from ..security import usuario_atual

router = APIRouter(prefix="/api/veiculos", tags=["veiculos"],
                   dependencies=[Depends(usuario_atual)])


def _out(v: models.Veiculo) -> schemas.VeiculoOut:
    o = schemas.VeiculoOut.model_validate(v)
    o.valor_atual = Decimal(str(v.valor_atual or 0))
    o.parcelas_restantes = v.parcelas_restantes
    o.saldo_financiamento = Decimal(str(v.saldo_financiamento or 0))
    o.patrimonio_liquido = Decimal(str(v.patrimonio_liquido or 0))
    return o


@router.get("", response_model=list[schemas.VeiculoOut])
def listar(db: Session = Depends(get_db)):
    itens = db.query(models.Veiculo).filter(models.Veiculo.ativo.is_(True)) \
        .order_by(models.Veiculo.nome).all()
    return [_out(v) for v in itens]


@router.post("", response_model=schemas.VeiculoOut)
def criar(dados: schemas.VeiculoIn, db: Session = Depends(get_db)):
    v = models.Veiculo(**dados.model_dump())
    db.add(v); db.commit(); db.refresh(v)
    return _out(v)


@router.put("/{vid}", response_model=schemas.VeiculoOut)
def editar(vid: int, dados: schemas.VeiculoIn, db: Session = Depends(get_db)):
    v = db.get(models.Veiculo, vid)
    if not v:
        raise HTTPException(404, "Veículo não encontrado.")
    for k, val in dados.model_dump().items():
        setattr(v, k, val)
    db.commit(); db.refresh(v)
    return _out(v)


@router.delete("/{vid}")
def excluir(vid: int, db: Session = Depends(get_db)):
    v = db.get(models.Veiculo, vid)
    if not v:
        raise HTTPException(404, "Veículo não encontrado.")
    db.delete(v); db.commit()
    return {"ok": True}


@router.post("/{vid}/fipe", response_model=schemas.VeiculoOut)
def atualizar_fipe(vid: int, db: Session = Depends(get_db)):
    """Consulta a FIPEConsulta e atualiza o valor do veículo (só para tipo_valor='fipe')."""
    v = db.get(models.Veiculo, vid)
    if not v:
        raise HTTPException(404, "Veículo não encontrado.")
    valor, erro = fipe.consultar(v.fipe_codigo)
    if erro:
        raise HTTPException(400, erro)
    v.fipe_valor = Decimal(str(valor))
    v.fipe_atualizado_em = date.today()
    db.commit(); db.refresh(v)
    return _out(v)


@router.get("/fipe/status")
def fipe_status():
    from ..config import settings
    return {
        "ativo": settings.FIPE_ATIVO,
        "url": settings.FIPE_API_URL or None,
        "endpoint": settings.FIPE_ENDPOINT,
    }
