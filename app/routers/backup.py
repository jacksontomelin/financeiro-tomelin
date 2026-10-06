"""Backup completo dos dados em um arquivo JSON (só administradores)."""
import base64, json
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db, Base
from .. import models
from ..security import usuario_atual

router = APIRouter(prefix="/api/backup", tags=["backup"])

# nunca saem no arquivo
COLUNAS_FORA = {("usuarios", "senha_hash")}
LINHAS_FORA = {("configuracoes", "_chave_sessao")}
TABELAS_FORA = {"login_historico", "backups_auto"}


def _json(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, bytes):
        return base64.b64encode(v).decode()
    if hasattr(v, "value"):          # enums
        return v.value
    return v


def gerar(db: Session, gerado_por: str, comprovantes: bool = False) -> dict:
    """Monta o backup completo (usado no botão e no backup automático)."""
    dados, contagem = {}, {}
    for t in Base.metadata.sorted_tables:
        if t.name in TABELAS_FORA:
            continue
        cols = [c for c in t.columns if (t.name, c.name) not in COLUNAS_FORA
                and not (t.name == "anexos" and c.name == "dados" and not comprovantes)
                and not (t.name == "documentos_emitidos" and c.name == "pdf" and not comprovantes)]
        linhas = []
        for row in db.execute(select(*cols)).mappings():
            if t.name == "configuracoes" and (t.name, row.get("chave")) in LINHAS_FORA:
                continue
            linhas.append({k: _json(v) for k, v in row.items()})
        dados[t.name] = linhas
        contagem[t.name] = len(linhas)
    return {"sistema": "Tomelin Gestão Financeira", "formato": 1, "gerado_em": datetime.now().isoformat(timespec="seconds"),
            "gerado_por": gerado_por, "com_comprovantes": comprovantes, "contagem": contagem, "dados": dados}


def _exigir_admin(db, me):
    av = db.get(models.UsuarioAvatar, me.id)
    if not av or av.papel != "admin":
        raise HTTPException(403, "Só administradores podem mexer nos backups.")


@router.get("")
def baixar(comprovantes: bool = False, me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _exigir_admin(db, me)
    doc = gerar(db, me.email, comprovantes)
    nome = f"backup-tomelin-{date.today().isoformat()}.json"
    return Response(json.dumps(doc, ensure_ascii=False, indent=1), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{nome}"', "Cache-Control": "no-store"})


@router.get("/automaticos")
def listar_automaticos(me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _exigir_admin(db, me)
    from .. import backup_auto, cfg
    itens = (db.query(models.BackupAuto.id, models.BackupAuto.criado_em, models.BackupAuto.origem, models.BackupAuto.tamanho,
                      models.BackupAuto.contagem, models.BackupAuto.com_comprovantes, models.BackupAuto.enviado_whatsapp)
             .order_by(models.BackupAuto.criado_em.desc()).all())
    return {"config": backup_auto.config(db), "ultimo_erro": cfg.get(db, "_backup_erro", "") or None,
            "itens": [{"id": b.id, "criado_em": b.criado_em.isoformat() + "Z", "origem": b.origem, "tamanho": b.tamanho,
                       "lancamentos": (b.contagem or {}).get("lancamentos", 0), "com_comprovantes": b.com_comprovantes,
                       "enviado_whatsapp": b.enviado_whatsapp} for b in itens]}


@router.post("/automaticos/agora")
def backup_agora(me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _exigir_admin(db, me)
    from .. import backup_auto
    b = backup_auto.fazer(db, origem="manual", gerado_por=me.email)
    return {"ok": True, "id": b.id, "tamanho": b.tamanho, "enviado_whatsapp": b.enviado_whatsapp}


@router.get("/automaticos/{bid}")
def baixar_automatico(bid: int, me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _exigir_admin(db, me)
    b = db.get(models.BackupAuto, bid)
    if not b:
        raise HTTPException(404, "Backup não encontrado (pode ter sido apagado por ser antigo).")
    nome = f"backup-tomelin-{b.criado_em.strftime('%Y-%m-%d-%H%M')}.json.gz"
    return Response(b.arquivo, media_type="application/gzip",
                    headers={"Content-Disposition": f'attachment; filename="{nome}"', "Cache-Control": "no-store"})


MAX_ARQUIVO = 200 * 1024 * 1024


def _restaurar(db, me, bruto: bytes, confirmar: str) -> dict:
    from .. import restauracao, backup_auto
    if (confirmar or "").strip().upper() != "RESTAURAR":
        raise HTTPException(422, 'Para restaurar, digite RESTAURAR na confirmação.')
    try:
        doc = restauracao.ler(bruto)
    except restauracao.ErroRestauracao as e:
        raise HTTPException(422, str(e))
    antes = backup_auto.fazer(db, origem="antes_restaurar", gerado_por=me.email)   # dá para desfazer
    r = restauracao.restaurar(db, doc)
    return {"ok": True, **r, "backup_anterior_id": antes.id, "gerado_em": doc.get("gerado_em")}


@router.post("/restaurar/previa")
async def restaurar_previa(arquivo: UploadFile = File(...), me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _exigir_admin(db, me)
    from .. import restauracao
    bruto = await arquivo.read(MAX_ARQUIVO + 1)
    if len(bruto) > MAX_ARQUIVO:
        raise HTTPException(413, "Arquivo grande demais (máximo 200 MB).")
    try:
        return restauracao.previa(restauracao.ler(bruto))
    except restauracao.ErroRestauracao as e:
        raise HTTPException(422, str(e))


@router.post("/restaurar")
async def restaurar_arquivo(arquivo: UploadFile = File(...), confirmar: str = Form(""),
                            me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _exigir_admin(db, me)
    bruto = await arquivo.read(MAX_ARQUIVO + 1)
    if len(bruto) > MAX_ARQUIVO:
        raise HTTPException(413, "Arquivo grande demais (máximo 200 MB).")
    return _restaurar(db, me, bruto, confirmar)


@router.post("/automaticos/{bid}/restaurar")
def restaurar_automatico(bid: int, dados: dict, me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    _exigir_admin(db, me)
    b = db.get(models.BackupAuto, bid)
    if not b:
        raise HTTPException(404, "Backup não encontrado.")
    return _restaurar(db, me, b.arquivo, dados.get("confirmar", ""))
