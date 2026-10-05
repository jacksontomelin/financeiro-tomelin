"""Backup automático: todo dia de madrugada, guarda os últimos N no banco e,
se ligado, manda o arquivo no grupo do WhatsApp. Falhou, avisa no grupo."""
import gzip
import json
import logging
from datetime import datetime

from . import cfg, models

log = logging.getLogger("tomelin.backup")


def config(db) -> dict:
    return {
        "ativo": cfg.get_bool(db, "BACKUP_AUTO", True),
        "hora": cfg.get_int(db, "BACKUP_HORA", 3),
        "manter": max(1, min(60, cfg.get_int(db, "BACKUP_MANTER", 7))),
        "whatsapp": cfg.get_bool(db, "BACKUP_WHATSAPP", False),
        "comprovantes": cfg.get_bool(db, "BACKUP_COMPROVANTES", False),
    }


def fazer(db, origem: str = "automatico", gerado_por: str = "backup automático") -> models.BackupAuto:
    from .routers.backup import gerar
    c = config(db)
    doc = gerar(db, gerado_por, c["comprovantes"])
    bruto = gzip.compress(json.dumps(doc, ensure_ascii=False).encode(), compresslevel=6)
    b = models.BackupAuto(origem=origem, tamanho=len(bruto), contagem=doc["contagem"],
                          com_comprovantes=c["comprovantes"], arquivo=bruto)
    db.add(b); db.commit(); db.refresh(b)
    # mantém só os mais novos
    velhos = (db.query(models.BackupAuto.id).order_by(models.BackupAuto.criado_em.desc()).offset(c["manter"]).all())
    if velhos:
        db.query(models.BackupAuto).filter(models.BackupAuto.id.in_([v.id for v in velhos])).delete(synchronize_session=False)
        db.commit()
    if c["whatsapp"]:
        from . import zapapi
        nome = f"backup-tomelin-{datetime.now().strftime('%Y-%m-%d')}.json.gz"
        n = doc["contagem"].get("lancamentos", 0)
        if zapapi.enviar_arquivo(bruto, nome, "application/gzip",
                                 f"🛡️ Backup do sistema: {n} lançamentos · guarde este arquivo", db=db):
            b.enviado_whatsapp = True; db.commit()
    cfg.set_interno(db, "_backup_erro", "")
    log.info("Backup %s feito: %d bytes", origem, b.tamanho)
    return b


def job():
    from .database import SessionLocal
    db = SessionLocal()
    try:
        if not config(db)["ativo"]:
            return
        fazer(db)
    except Exception as e:
        db.rollback()
        log.exception("Backup automático falhou")
        try:
            cfg.set_interno(db, "_backup_erro", f"{datetime.now().strftime('%d/%m %H:%M')}: {e}"[:300])
            from . import whatsapp
            whatsapp.enviar(f"⚠️ *Backup automático falhou*\n\n{str(e)[:300]}\n\nAbra Configurações → Backup e tente 'Fazer backup agora'.", db=db)
        except Exception:
            pass
    finally:
        db.close()
