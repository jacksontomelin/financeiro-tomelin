"""Backup completo dos dados em um arquivo JSON (só administradores)."""
import base64, json
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
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
TABELAS_FORA = {"login_historico"}


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


@router.get("")
def baixar(comprovantes: bool = False, me: models.Usuario = Depends(usuario_atual), db: Session = Depends(get_db)):
    av = db.get(models.UsuarioAvatar, me.id)
    if not av or av.papel != "admin":
        raise HTTPException(403, "Só administradores podem baixar o backup.")
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
    doc = {"sistema": "Tomelin Gestão Financeira", "formato": 1, "gerado_em": datetime.now().isoformat(timespec="seconds"),
           "gerado_por": me.email, "com_comprovantes": comprovantes, "contagem": contagem, "dados": dados}
    nome = f"backup-tomelin-{date.today().isoformat()}.json"
    return Response(json.dumps(doc, ensure_ascii=False, indent=1), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{nome}"', "Cache-Control": "no-store"})
