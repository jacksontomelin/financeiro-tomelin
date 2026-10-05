"""O sistema sobe, faz login e os cálculos principais batem."""
from decimal import Decimal

from conftest import hoje


def test_saude(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"]


def test_sem_token_bloqueia(client):
    assert client.get("/api/lancamentos").status_code == 401


def test_login_errado(client):
    r = client.post("/api/auth/login", json={"email": "ninguem@x.com", "senha": "errada123"})
    assert r.status_code == 401


def test_despesa_paga_baixa_o_saldo(api, conta, categoria):
    antes = Decimal(str(next(c for c in api.get("/api/contas").json() if c["id"] == conta["id"])["saldo_atual"]))
    r = api.post("/api/lancamentos", json={"descricao": "Compra teste", "tipo": "despesa", "valor": "150.00",
                                           "data_pagamento": hoje(), "conta_id": conta["id"], "categoria_id": categoria["id"]})
    assert r.status_code == 200, r.text
    l = r.json()
    assert l["status"] == "pago" and l["categoria_nome"] == "Mercado Teste" and l["conta_nome"] == "Conta Teste"
    depois = Decimal(str(next(c for c in api.get("/api/contas").json() if c["id"] == conta["id"])["saldo_atual"]))
    assert antes - depois == Decimal("150.00")
    # o GET de um lançamento volta com os nomes, igual à lista
    um = api.get(f"/api/lancamentos/{l['id']}").json()
    assert um["categoria_nome"] == "Mercado Teste"


def test_pendente_baixa_e_estorno(api, conta):
    l = api.post("/api/lancamentos", json={"descricao": "Luz teste", "tipo": "despesa", "valor": "200",
                                           "data_vencimento": hoje()}).json()
    assert l["status"] in ("pendente", "atrasado")
    b = api.post(f"/api/lancamentos/{l['id']}/baixa", json={"conta_id": conta["id"], "juros": "5.00"})
    assert b.status_code == 200 and b.json()["status"] == "pago"
    e = api.post(f"/api/lancamentos/{l['id']}/estornar")
    assert e.json()["data_pagamento"] is None


def test_painel(api):
    k = api.get("/api/dashboard/kpis").json()
    for campo in ("saldo", "receitas_mes", "despesas_mes", "a_pagar", "a_receber"):
        assert campo in k
    assert isinstance(api.get("/api/dashboard/fluxo?meses=6").json(), list)
    v = api.get("/api/dashboard/vencimentos").json()
    assert "atrasados" in v and "proximos" in v


def test_orcamento_estoura(api, categoria):
    r = api.put(f"/api/orcamento/{categoria['id']}", json={"limite": 100})
    assert r.status_code == 200, r.text
    o = api.get("/api/orcamento").json()
    item = next(i for i in o["itens"] if i["categoria_id"] == categoria["id"])
    assert item["status"] == "estourado"     # já gastou 150 nesta categoria


def test_recorrencia_cria_proximas(api):
    l = api.post("/api/lancamentos", json={"descricao": "Aluguel teste", "tipo": "despesa", "valor": "1000",
                                           "data_vencimento": hoje()}).json()
    r = api.post("/api/recorrencias", json={"lancamento_id": l["id"], "frequencia": "mensal"})
    assert r.status_code == 200, r.text
    assert r.json()["criadas"] >= 1


def test_cartao_e_fatura(api):
    c = api.post("/api/contas", json={"nome": "Cartão Teste", "tipo": "cartao", "limite": "3000",
                                      "dia_fechamento": 5, "dia_vencimento": 12, "bandeira": "visa", "final_cartao": "1234"})
    assert c.status_code == 200, c.text
    f = api.get(f"/api/contas/{c.json()['id']}/fatura")
    assert f.status_code == 200, f.text
    assert {"total", "em_aberto", "status", "itens"} <= set(f.json())


def test_relatorios_em_pdf(api):
    for url in ("/api/relatorios/balancete.pdf", "/api/relatorios/patrimonio.pdf"):
        r = api.get(url)
        assert r.status_code == 200, (url, r.text[:200])
        assert r.content[:4] == b"%PDF"
