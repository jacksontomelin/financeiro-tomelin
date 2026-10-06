import uuid


def test_lancamento_sem_internet_nao_duplica(api):
    """O celular reenvia o mesmo lançamento quando a internet volta: só entra uma vez."""
    chave = f"off:{uuid.uuid4().hex}"
    corpo = {"descricao": "Padaria offline", "tipo": "despesa", "valor": "12.50", "import_id": chave}
    a = api.post("/api/lancamentos", json=corpo)
    b = api.post("/api/lancamentos", json=corpo)
    assert a.status_code == 200 and b.status_code == 200, (a.text, b.text)
    assert a.json()["id"] == b.json()["id"]
    lista = api.get("/api/lancamentos?busca=Padaria offline").json()
    assert len([l for l in lista if l["descricao"] == "Padaria offline"]) == 1


def test_sem_chave_continua_criando_normal(api):
    corpo = {"descricao": "Sem chave", "tipo": "despesa", "valor": "1"}
    a = api.post("/api/lancamentos", json=corpo).json()
    b = api.post("/api/lancamentos", json=corpo).json()
    assert a["id"] != b["id"]
