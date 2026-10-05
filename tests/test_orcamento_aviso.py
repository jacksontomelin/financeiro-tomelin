from datetime import date


def test_avisa_80_e_100_uma_vez_cada(api, db, monkeypatch):
    from app import orcamento_aviso, whatsapp
    monkeypatch.setattr(orcamento_aviso, "em_segundo_plano", lambda *a, **k: None)   # confere aqui, na mão
    enviados = []
    monkeypatch.setattr(whatsapp, "enviar", lambda texto, *a, **k: enviados.append(texto) or True)
    c = api.post("/api/categorias", json={"nome": "Lazer Aviso", "tipo": "despesa"}).json()
    api.put(f"/api/orcamento/{c['id']}", json={"limite": 1000})

    def lanca(v):
        api.post("/api/lancamentos", json={"descricao": "Passeio", "tipo": "despesa", "valor": v,
                                           "categoria_id": c["id"], "data_competencia": date.today().isoformat()})
        return orcamento_aviso.verificar(db, c["id"], date.today())

    assert lanca("500") is None and not enviados                 # 50%: nada
    assert "quase no limite" in (lanca("350") or "")             # 85%
    assert lanca("50") is None                                    # 90%: já avisou o 80
    assert "estourado" in (lanca("200") or "")                   # 110%
    assert lanca("10") is None
    assert len(enviados) == 2


def test_whatsapp_desligado_nao_marca(api, db, monkeypatch):
    from app import orcamento_aviso, whatsapp
    monkeypatch.setattr(orcamento_aviso, "em_segundo_plano", lambda *a, **k: None)
    monkeypatch.setattr(whatsapp, "enviar", lambda *a, **k: False)
    c = api.post("/api/categorias", json={"nome": "Roupas Aviso", "tipo": "despesa"}).json()
    api.put(f"/api/orcamento/{c['id']}", json={"limite": 100})
    api.post("/api/lancamentos", json={"descricao": "Camisa", "tipo": "despesa", "valor": "90", "categoria_id": c["id"]})
    assert orcamento_aviso.verificar(db, c["id"]) is not None
    assert orcamento_aviso.verificar(db, c["id"]) is not None     # ainda não marcou: tenta de novo


def test_comando_despesa_no_whatsapp_traz_o_aviso(api, db):
    from app import whatsapp
    c = api.post("/api/categorias", json={"nome": "Pizzaria", "tipo": "despesa"}).json()
    api.put(f"/api/orcamento/{c['id']}", json={"limite": 100})
    r = whatsapp.processar_comando("despesa 120 pizzaria", db)
    assert "Despesa lançada" in r and "estourado" in r


def test_marcacao_interna_aguenta_gravar_duas_vezes(db):
    from app import cfg
    cfg.set_interno(db, "_teste_upsert", "1")
    cfg.set_interno(db, "_teste_upsert", "2")
    assert cfg.get(db, "_teste_upsert") == "2"
