from datetime import date


def test_historico_completo_do_lancamento(api, conta):
    l = api.post("/api/lancamentos", json={"descricao": "Água", "tipo": "despesa", "valor": "80",
                                           "data_vencimento": date.today().isoformat()}).json()
    api.put(f"/api/lancamentos/{l['id']}", json={"descricao": "Água", "tipo": "despesa", "valor": "95.50",
                                                 "data_vencimento": date.today().isoformat(), "conta_id": conta["id"]})
    api.put(f"/api/lancamentos/{l['id']}", json={"descricao": "Água", "tipo": "despesa", "valor": "95.50",
                                                 "data_vencimento": date.today().isoformat(), "conta_id": conta["id"]})   # sem mudança
    api.post(f"/api/lancamentos/{l['id']}/baixa", json={})
    api.post(f"/api/lancamentos/{l['id']}/estornar")
    h = api.get(f"/api/lancamentos/{l['id']}/historico").json()
    acoes = [x["acao"] for x in reversed(h)]
    assert acoes == ["criou", "editou", "baixa", "estorno"]
    ed = next(x for x in h if x["acao"] == "editou")
    campos = {m["campo"]: m for m in ed["mudancas"]}
    assert campos["Valor"]["de"] == "80.00" and campos["Valor"]["para"] == "95.50"
    assert campos["Conta"]["para"] == "Conta Teste"
    assert h[0]["autor"]


def test_excluir_fica_no_historico_e_na_atividade(api):
    l = api.post("/api/lancamentos", json={"descricao": "Apagar depois", "tipo": "despesa", "valor": "10"}).json()
    api.delete(f"/api/lancamentos/{l['id']}")
    h = api.get(f"/api/lancamentos/{l['id']}/historico").json()
    assert h[0]["acao"] == "excluiu" and h[0]["descricao"] == "Apagar depois"
    feed = api.get("/api/atividade?limite=5").json()
    assert feed[0]["lancamento_id"] == l["id"]


def test_whatsapp_registra_autor(api, db):
    from app import whatsapp, models
    whatsapp.processar_comando("despesa 12 cafe", db, remetente="5547999991234")
    l = db.query(models.Lancamento).order_by(models.Lancamento.id.desc()).first()
    h = api.get(f"/api/lancamentos/{l.id}/historico").json()
    assert h[0]["autor"] == "WhatsApp (…1234)"
