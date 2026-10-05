"""Regras de acesso: configurações só do admin e webhook só do grupo certo."""
import pytest

GRUPO = "120363000000000000@g.us"


@pytest.fixture(scope="module")
def membro(client, api):
    r = api.post("/api/usuarios", json={"nome": "Membro Teste", "email": "membro@teste.com", "senha": "senha123", "papel": "membro"})
    assert r.status_code == 200, r.text
    t = client.post("/api/auth/login", json={"email": "membro@teste.com", "senha": "senha123"}).json()["token"]
    return {"Authorization": f"Bearer {t}"}


def test_membro_nao_salva_configuracoes(client, membro):
    r = client.post("/api/configuracoes", headers=membro, json={"ALERTA_HORA": "9"})
    assert r.status_code == 403


def test_membro_ve_chave_mascarada(client, api, membro):
    api.post("/api/configuracoes", json={"WHATSAPP_API_TOKEN": "segredo-123"})
    itens = {i["chave"]: i["valor"] for i in client.get("/api/configuracoes", headers=membro).json()}
    assert itens["WHATSAPP_API_TOKEN"] != "segredo-123"
    itens_admin = {i["chave"]: i["valor"] for i in api.get("/api/configuracoes").json()}
    assert itens_admin["WHATSAPP_API_TOKEN"] == "segredo-123"


def test_admin_muda_horario_e_reagenda(api):
    assert api.post("/api/configuracoes", json={"ALERTA_HORA": "9", "FECHAMENTO_HORA": "21"}).status_code == 200
    from app.main import scheduler
    job = scheduler.get_job("alerta_vencimentos")
    assert "hour='9'" in str(job.trigger)


def test_webhook_sem_grupo_nao_executa(client, api):
    api.post("/api/configuracoes", json={"WHATSAPP_GRUPO": ""})
    r = client.post("/api/whatsapp/webhook", json={"jid": "5547999999999@s.whatsapp.net", "texto": "despesa 50 teste", "deMim": True})
    assert r.json().get("ignorado") == "grupo não configurado"


def test_webhook_outro_grupo_ignorado(client, api):
    api.post("/api/configuracoes", json={"WHATSAPP_GRUPO": GRUPO, "WHATSAPP_MEU_NUMERO": ""})
    r = client.post("/api/whatsapp/webhook", json={"jid": "999@g.us", "texto": "saldo", "deMim": True})
    assert r.json().get("ignorado") == "outro grupo"


def test_webhook_grupo_certo_responde(client, api):
    api.post("/api/configuracoes", json={"WHATSAPP_GRUPO": GRUPO})
    r = client.post("/api/whatsapp/webhook", json={"jid": GRUPO, "texto": "saldo", "deMim": True})
    assert r.status_code == 200 and "ignorado" not in r.json()


def test_webhook_json_invalido(client):
    r = client.post("/api/whatsapp/webhook", content=b"{nao e json", headers={"Content-Type": "application/json"})
    assert r.status_code == 200 and r.json()["ok"] is False
