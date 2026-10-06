from datetime import date


def test_comparativo_ano_a_ano(api):
    hoje = date.today()
    cat = api.post("/api/categorias", json={"nome": "Comparar", "tipo": "despesa"}).json()
    for ano, valor in ((hoje.year, "300"), (hoje.year - 1, "200")):
        api.post("/api/lancamentos", json={"descricao": "Comp", "tipo": "despesa", "valor": valor, "categoria_id": cat["id"],
                                           "data_competencia": date(ano, hoje.month, 1).isoformat()})
    d = api.get(f"/api/relatorios/comparativo?ano={hoje.year}").json()
    assert d["ano_anterior"] == hoje.year - 1 and d["ate_mes"] == hoje.month and len(d["meses"]) == 12
    c = next(x for x in d["categorias"] if x["categoria_id"] == cat["id"])
    assert c["atual"] == 300 and c["anterior"] == 200 and c["variacao_pct"] == 50
    assert d["meses"][hoje.month - 1]["despesas"] >= 300
    assert all(m["futuro"] for m in d["meses"][hoje.month:])
