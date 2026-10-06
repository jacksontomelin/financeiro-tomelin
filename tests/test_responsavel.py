from datetime import date


def test_responsavel_no_lancamento_filtro_e_resumo(api, db):
    us = api.get("/api/usuarios").json()
    assert {"id", "nome", "emoji", "cor"} <= set(us[0])
    eu = us[0]["id"]
    l = api.post("/api/lancamentos", json={"descricao": "Internet", "tipo": "despesa", "valor": "120",
                                           "responsavel_id": eu, "data_vencimento": date.today().isoformat()}).json()
    assert l["responsavel_id"] == eu and l["responsavel_nome"]
    # editar sem mandar o responsável não apaga
    e = api.put(f"/api/lancamentos/{l['id']}", json={"descricao": "Internet fibra", "tipo": "despesa", "valor": "130"}).json()
    assert e["responsavel_id"] == eu
    lista = api.get(f"/api/lancamentos?responsavel_id={eu}").json()
    assert lista and all(x["responsavel_id"] == eu for x in lista)
    pessoas = api.get("/api/relatorios/por-pessoa").json()
    minha = next(p for p in pessoas if p["responsavel_id"] == eu)
    assert minha["a_pagar"] >= 130
    from app import service
    assert service.texto_por_responsavel(db).startswith("👥")
    # aparece no alerta de vencimentos
    nome = l["responsavel_nome"].split()[0]
    assert f"👤 {nome}" in service.texto_vencimentos(db, 3)


def test_recorrencia_herda_responsavel(api, db):
    eu = api.get("/api/usuarios").json()[0]["id"]
    l = api.post("/api/lancamentos", json={"descricao": "Academia", "tipo": "despesa", "valor": "99",
                                           "responsavel_id": eu, "data_vencimento": date.today().isoformat()}).json()
    r = api.post("/api/recorrencias", json={"lancamento_id": l["id"], "frequencia": "mensal"}).json()
    from app import models
    filhos = db.query(models.Lancamento).filter_by(recorrencia_id=r["id"]).all()
    assert len(filhos) >= 2 and all(f.responsavel_id == eu for f in filhos)
