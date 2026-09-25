from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from .. import service
from ..config import settings
from ..security import usuario_atual

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"],
                   dependencies=[Depends(usuario_atual)])


@router.get("/kpis")
def kpis(db: Session = Depends(get_db)):
    k = service.kpis(db)
    return {kk: (float(vv) if hasattr(vv, "__float__") else vv) for kk, vv in k.items()}


@router.get("/fluxo")
def fluxo(meses: int = 6, db: Session = Depends(get_db)):
    return service.fluxo_mensal(db, meses)


@router.get("/despesas-categoria")
def despesas_categoria(db: Session = Depends(get_db)):
    return service.despesas_por_categoria(db)


@router.get("/vencimentos")
def vencimentos(dias: int = None, db: Session = Depends(get_db)):
    dias = dias if dias is not None else settings.ALERTA_DIAS_ANTES
    v = service.vencimentos(db, dias_antes=dias)

    def fmt(l):
        return {
            "id": l.id, "descricao": l.descricao, "tipo": l.tipo.value,
            "valor": float(l.valor),
            "vencimento": l.data_vencimento.isoformat() if l.data_vencimento else None,
            "status": l.status,
            "categoria": l.categoria.nome if l.categoria else None,
        }
    return {
        "atrasados": [fmt(x) for x in v["atrasados"]],
        "proximos": [fmt(x) for x in v["proximos"]],
    }
