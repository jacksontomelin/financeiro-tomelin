from datetime import date


def test_compra_no_cartao_com_fornecedor(api):
    ml = api.post("/api/contatos", json={"nome": "Mercado Livre", "tipo": "fornecedor"}).json()
    cartao = api.post("/api/contas", json={"nome": "Cartão Compras", "tipo": "cartao", "limite": "5000",
                                           "dia_fechamento": 5, "dia_vencimento": 12}).json()
    l = api.post("/api/lancamentos", json={"descricao": "Compra Mercado Livre", "tipo": "despesa", "valor": "300",
                                           "contato_id": ml["id"], "data_competencia": date.today().isoformat()}).json()
    c = api.post("/api/compras", json={"lancamento_id": l["id"], "estabelecimento": "Mercado Livre",
                                       "parcelamento": {"cartao_id": cartao["id"], "total_parcelas": 3}})
    assert c.status_code == 200, c.text
    assert c.json()["contato_nome"] == "Mercado Livre" and c.json()["contato_id"] == ml["id"]
    lista = api.get("/api/compras").json()
    assert any(x["contato_nome"] == "Mercado Livre" for x in lista)
    meses = api.get(f"/api/contas/{cartao['id']}/fatura").json()["meses"]
    itens = [i for m in meses for i in api.get(f"/api/contas/{cartao['id']}/fatura?mes={m}").json()["itens"]]
    assert itens and all(i["contato_nome"] == "Mercado Livre" for i in itens)
