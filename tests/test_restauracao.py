import gzip
import json


def test_restaurar_volta_ao_ponto_do_backup(client, api, token):
    h = {"Authorization": f"Bearer {token}"}
    antes = api.post("/api/lancamentos", json={"descricao": "Existe no backup", "tipo": "despesa", "valor": "11"}).json()
    arquivo = api.get("/api/backup").content
    depois = api.post("/api/lancamentos", json={"descricao": "Criado depois do backup", "tipo": "despesa", "valor": "22"}).json()
    api.delete(f"/api/lancamentos/{antes['id']}")

    p = client.post("/api/backup/restaurar/previa", headers=h, files={"arquivo": ("b.json", arquivo, "application/json")})
    assert p.status_code == 200 and p.json()["contagem"]["lancamentos"] >= 1

    sem = client.post("/api/backup/restaurar", headers=h, files={"arquivo": ("b.json", arquivo)}, data={"confirmar": "nao"})
    assert sem.status_code == 422                       # sem digitar RESTAURAR não faz nada

    r = client.post("/api/backup/restaurar", headers=h, files={"arquivo": ("b.json", arquivo)}, data={"confirmar": "RESTAURAR"})
    assert r.status_code == 200, r.text
    assert api.get(f"/api/lancamentos/{antes['id']}").status_code == 200        # voltou
    assert api.get(f"/api/lancamentos/{depois['id']}").status_code == 404      # sumiu
    # login continua funcionando e dá para criar coisas novas (ids seguem depois dos restaurados)
    novo = api.post("/api/lancamentos", json={"descricao": "Depois de restaurar", "tipo": "despesa", "valor": "1"})
    assert novo.status_code == 200
    # o backup de antes de restaurar ficou guardado
    itens = api.get("/api/backup/automaticos").json()["itens"]
    assert any(b["origem"] == "antes_restaurar" for b in itens)


def test_restaurar_do_backup_automatico_compactado(api):
    api.post("/api/backup/automaticos/agora")
    b = api.get("/api/backup/automaticos").json()["itens"][0]
    r = api.post(f"/api/backup/automaticos/{b['id']}/restaurar", json={"confirmar": "RESTAURAR"})
    assert r.status_code == 200, r.text


def test_arquivo_que_nao_e_backup(client, token):
    h = {"Authorization": f"Bearer {token}"}
    r = client.post("/api/backup/restaurar/previa", headers=h, files={"arquivo": ("x.json", json.dumps({"a": 1}).encode())})
    assert r.status_code == 422
    r = client.post("/api/backup/restaurar/previa", headers=h, files={"arquivo": ("x.gz", gzip.compress(b"lixo"))})
    assert r.status_code == 422
