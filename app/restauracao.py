"""Restaurar um backup (arquivo .json ou .json.gz gerado pelo próprio sistema).

Volta os dados ao ponto do backup, numa transação só (deu erro, nada muda).
Fica como está, porque o backup não traz senhas: usuários, perfis, histórico
de login, os backups automáticos e as configurações internas. Antes de
restaurar, o sistema faz um backup do estado atual, para dar para desfazer.
"""
import base64
import gzip
import json
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, Integer, LargeBinary, Numeric, delete, insert, text
from sqlalchemy.orm import Session

from .database import Base
from . import models

PRESERVAR = {"usuarios", "usuario_avatares", "login_historico", "backups_auto", "configuracoes"}
SISTEMA = "Tomelin Gestão Financeira"


class ErroRestauracao(Exception):
    pass


def ler(bruto: bytes) -> dict:
    if bruto[:2] == b"\x1f\x8b":
        try:
            bruto = gzip.decompress(bruto)
        except OSError:
            raise ErroRestauracao("O arquivo .gz está corrompido.")
    try:
        doc = json.loads(bruto.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ErroRestauracao("Não é um arquivo de backup: envie o .json ou .json.gz baixado do sistema.")
    if not isinstance(doc, dict) or doc.get("sistema") != SISTEMA or not isinstance(doc.get("dados"), dict):
        raise ErroRestauracao("Este arquivo não é um backup do Tomelin Gestão Financeira.")
    if doc.get("formato") != 1:
        raise ErroRestauracao(f"Formato de backup {doc.get('formato')} não suportado por esta versão.")
    return doc


def previa(doc: dict) -> dict:
    d = doc["dados"]
    sem_arquivo = sum(1 for a in d.get("anexos", []) if not a.get("dados"))
    avisos = []
    if sem_arquivo:
        avisos.append(f"{sem_arquivo} comprovante(s) não vêm no arquivo (backup sem comprovantes): os lançamentos voltam, as fotos não.")
    return {"gerado_em": doc.get("gerado_em"), "gerado_por": doc.get("gerado_por"),
            "com_comprovantes": bool(doc.get("com_comprovantes")),
            "contagem": {k: len(v) for k, v in d.items() if isinstance(v, list)}, "avisos": avisos}


def _valor(col, v):
    if v is None:
        return None
    t = col.type
    if isinstance(t, DateTime):
        return datetime.fromisoformat(str(v).replace("Z", "")) if isinstance(v, str) else v
    if isinstance(t, Date):
        return date.fromisoformat(str(v)[:10]) if isinstance(v, str) else v
    if isinstance(t, Numeric):
        return Decimal(str(v))
    if isinstance(t, LargeBinary):
        return base64.b64decode(v) if isinstance(v, str) else v
    if isinstance(t, Enum) and t.enum_class and isinstance(v, str):
        return t.enum_class(v)
    return v


def restaurar(db: Session, doc: dict) -> dict:
    dados = doc["dados"]
    tabelas = [t for t in Base.metadata.sorted_tables if t.name not in PRESERVAR]
    usuarios = {u for (u,) in db.query(models.Usuario.id).all()}
    contagem, pulados = {}, {}
    try:
        for t in reversed(tabelas):                 # filhos antes dos pais
            db.execute(delete(t))
        for t in tabelas:                           # pais antes dos filhos
            linhas = []
            for r in dados.get(t.name, []):
                if not isinstance(r, dict):
                    continue
                row = {c.name: _valor(c, r.get(c.name)) for c in t.columns if c.name in r}
                faltando = [c.name for c in t.columns if not c.nullable and not c.primary_key and c.default is None
                            and c.server_default is None and row.get(c.name) is None]
                if faltando:                        # ex.: comprovante sem o arquivo
                    pulados[t.name] = pulados.get(t.name, 0) + 1
                    continue
                if "responsavel_id" in row and row["responsavel_id"] not in usuarios:
                    row["responsavel_id"] = None
                linhas.append(row)
            if linhas:
                db.execute(insert(t), linhas)
            contagem[t.name] = len(linhas)
        # configurações da tela (não as internas): sobrescreve com as do backup
        from .cfg import DEFS
        conhecidas = {k for k, _, _ in DEFS}
        for r in dados.get("configuracoes", []):
            if r.get("chave") in conhecidas:
                db.merge(models.Configuracao(chave=r["chave"], valor=r.get("valor"), descricao=r.get("descricao")))
        db.flush()
        if db.bind.dialect.name == "postgresql":    # o próximo id continua depois do maior restaurado
            for t in tabelas:
                pk = list(t.primary_key.columns)
                if len(pk) == 1 and isinstance(pk[0].type, Integer):
                    db.execute(text(f"SELECT setval(pg_get_serial_sequence('{t.name}', '{pk[0].name}'), "
                                    f"COALESCE((SELECT MAX({pk[0].name}) FROM {t.name}), 0) + 1, false)"))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"restaurados": contagem, "pulados": pulados}
