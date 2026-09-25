from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas, security

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _resumo_ua(ua: str) -> str:
    if not ua: return "Desconhecido"
    ua = ua[:200]
    if "iPhone" in ua or "iPad" in ua: return "📱 iOS"
    if "Android" in ua: return "📱 Android"
    if "Windows" in ua: return "💻 Windows"
    if "Macintosh" in ua or "Mac OS" in ua: return "💻 Mac"
    if "Linux" in ua: return "🐧 Linux"
    if any(x in ua.lower() for x in ["curl","python","testclient"]): return "⚙️ API"
    return "🌐 Navegador"


@router.post("/login", response_model=schemas.TokenOut)
def login(dados: schemas.LoginIn, request: Request, db: Session = Depends(get_db)):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "")
    ip = ip.split(",")[0].strip()
    ua = request.headers.get("user-agent", "")
    dispositivo = _resumo_ua(ua)

    u = db.query(models.Usuario).filter(models.Usuario.email == dados.email.lower().strip()).first()
    senha_ok = u and security.confere_senha(dados.senha, u.senha_hash)

    # registra tentativa no histórico
    if u:
        try:
            db.add(models.LoginHistorico(
                usuario_id=u.id, ip=ip, dispositivo=dispositivo, sucesso=bool(senha_ok)))
            db.commit()
        except Exception:
            db.rollback()

    if not senha_ok:
        raise HTTPException(401, "E-mail ou senha inválidos.")
    if not u.ativo:
        raise HTTPException(403, "Usuário desativado.")

    penultimo = u.ultimo_acesso
    penultimo_ip = u.ultimo_acesso_ip
    u.ultimo_acesso = datetime.utcnow()
    u.ultimo_acesso_ip = ip
    db.commit()

    try:
        av = db.get(models.UsuarioAvatar, u.id)
    except Exception:
        av = None

    return schemas.TokenOut(
        token=security.cria_token(u), id=u.id,
        nome=u.nome, email=u.email,
        ultimo_acesso=penultimo, ultimo_acesso_ip=penultimo_ip,
        emoji=av.emoji if av else "👤",
    )


@router.get("/eu")
def eu(u: models.Usuario = Depends(security.usuario_atual), db: Session = Depends(get_db)):
    try:
        av = db.get(models.UsuarioAvatar, u.id)
    except Exception:
        av = None
    return {
        "id": u.id, "nome": u.nome, "email": u.email,
        "emoji": av.emoji if av else "👤",
        "cor": av.cor if av else "#305C74",
        "papel": av.papel if av else "membro",
        "ultimo_acesso": u.ultimo_acesso.isoformat() if u.ultimo_acesso else None,
        "ultimo_acesso_ip": u.ultimo_acesso_ip,
    }


@router.get("/historico")
def historico_proprio(limite: int = 20,
                      u: models.Usuario = Depends(security.usuario_atual),
                      db: Session = Depends(get_db)):
    rows = (db.query(models.LoginHistorico)
            .filter(models.LoginHistorico.usuario_id == u.id)
            .order_by(models.LoginHistorico.data_hora.desc())
            .limit(limite).all())
    return [{"id": r.id, "data_hora": r.data_hora.isoformat(),
             "ip": r.ip, "dispositivo": r.dispositivo, "sucesso": r.sucesso} for r in rows]


@router.get("/historico/{uid}")
def historico_usuario(uid: int, limite: int = 20,
                      me: models.Usuario = Depends(security.usuario_atual),
                      db: Session = Depends(get_db)):
    av_me = db.get(models.UsuarioAvatar, me.id)
    if me.id != uid and (not av_me or av_me.papel != "admin"):
        raise HTTPException(403, "Sem permissão.")
    rows = (db.query(models.LoginHistorico)
            .filter(models.LoginHistorico.usuario_id == uid)
            .order_by(models.LoginHistorico.data_hora.desc())
            .limit(limite).all())
    return [{"id": r.id, "data_hora": r.data_hora.isoformat(),
             "ip": r.ip, "dispositivo": r.dispositivo, "sucesso": r.sucesso} for r in rows]


@router.get("/status")
def status_publico(db: Session = Depends(get_db)):
    """Info pública da tela de login — sem autenticação."""
    from sqlalchemy import func
    total_usuarios = db.query(models.Usuario).filter(models.Usuario.ativo.is_(True)).count()
    total_lanc = db.query(func.count(models.Lancamento.id)).scalar() or 0
    return {
        "sistema": "Tomelin Gestão Financeira",
        "versao": "1.0",
        "usuarios_ativos": total_usuarios,
        "total_lancamentos": total_lanc,
        "online": True,
    }
