from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import cfg, models
from ..security import usuario_atual

router = APIRouter(prefix="/api/configuracoes", tags=["configuracoes"],
                   dependencies=[Depends(usuario_atual)])

# chaves que dão acesso a serviços externos: só o administrador vê o valor
SECRETAS = {"WHATSAPP_API_TOKEN", "FIPE_API_TOKEN"}


def eh_admin(db: Session, u: models.Usuario) -> bool:
    av = db.get(models.UsuarioAvatar, u.id)
    return bool(av and av.papel == "admin")


def exigir_admin(db: Session, u: models.Usuario):
    if not eh_admin(db, u):
        raise HTTPException(403, "Só administradores podem alterar as configurações.")


@router.get("")
def listar(me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    itens = cfg.todas(db)
    if not eh_admin(db, me):
        for i in itens:
            if i["chave"] in SECRETAS and i["valor"]:
                i["valor"] = "••••••••"
    return itens


@router.post("")
def salvar(dados: dict, me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    exigir_admin(db, me)
    cfg.set_many(db, dados)
    if {"ALERTA_HORA", "FECHAMENTO_HORA", "BACKUP_HORA"} & set(dados):
        from ..main import reagendar
        reagendar()
    return {"ok": True}


@router.get("/whatsapp/testar")
def testar_whatsapp(db: Session = Depends(get_db)):
    from .. import whatsapp as wa
    ok = wa.enviar("✅ *Tomelin Financeiro*: teste de conexão OK!", db=db)
    return {"enviado": bool(ok)}
