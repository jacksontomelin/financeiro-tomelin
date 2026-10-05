import gzip
import json


def test_backup_manual_e_automatico(api):
    r = api.get("/api/backup")
    assert r.status_code == 200 and "dados" in r.json()
    assert "senha_hash" not in r.text
    f = api.post("/api/backup/automaticos/agora")
    assert f.status_code == 200, f.text
    lista = api.get("/api/backup/automaticos").json()
    assert lista["itens"] and lista["config"]["ativo"] is True
    arq = api.get(f"/api/backup/automaticos/{lista['itens'][0]['id']}")
    doc = json.loads(gzip.decompress(arq.content))
    assert doc["contagem"]["lancamentos"] >= 1 and "backups_auto" not in doc["dados"]


def test_guarda_so_os_mais_novos(api):
    api.post("/api/configuracoes", json={"BACKUP_MANTER": "2"})
    for _ in range(3):
        api.post("/api/backup/automaticos/agora")
    assert len(api.get("/api/backup/automaticos").json()["itens"]) == 2
    api.post("/api/configuracoes", json={"BACKUP_MANTER": "7"})


def test_job_respeita_desligado(api, db):
    from app import backup_auto, models
    api.post("/api/configuracoes", json={"BACKUP_AUTO": "false"})
    antes = db.query(models.BackupAuto).count()
    backup_auto.job()
    assert db.query(models.BackupAuto).count() == antes
    api.post("/api/configuracoes", json={"BACKUP_AUTO": "true"})
    backup_auto.job()
    db.expire_all()
    assert db.query(models.BackupAuto).count() >= 1
