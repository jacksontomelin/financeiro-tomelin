from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from .. import cfg
from ..security import usuario_atual

router = APIRouter(prefix="/api/configuracoes", tags=["configuracoes"],
                   dependencies=[Depends(usuario_atual)])


@router.get("")
def listar(db: Session = Depends(get_db)):
    return cfg.todas(db)


@router.post("")
def salvar(dados: dict, db: Session = Depends(get_db)):
    cfg.set_many(db, dados)
    return {"ok": True}


@router.get("/whatsapp/testar")
def testar_whatsapp(db: Session = Depends(get_db)):
    from .. import whatsapp as wa
    ok = wa.enviar("✅ *Tomelin Financeiro* — teste de conexão OK!", db=db)
    return {"enviado": bool(ok)}
