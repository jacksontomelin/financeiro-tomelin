from datetime import date


def test_categoria_dedutivel_e_relatorio(api):
    ano = date.today().year
    c = api.post("/api/categorias", json={"nome": "Médico IR", "tipo": "despesa", "ir_tipo": "saude"}).json()
    assert c["ir_tipo"] == "saude"
    # editar sem mandar ir_tipo não apaga a marcação
    c2 = api.put(f"/api/categorias/{c['id']}", json={"nome": "Médico IR", "tipo": "despesa"}).json()
    assert c2["ir_tipo"] == "saude"
    sem_doc = api.post("/api/contatos", json={"nome": "Dr. Sem Documento", "tipo": "fornecedor"}).json()
    com_doc = api.post("/api/contatos", json={"nome": "Clínica Com CNPJ", "tipo": "fornecedor", "documento": "11.222.333/0001-81"}).json()
    for contato, valor in ((sem_doc, "300"), (com_doc, "500"), (com_doc, "200")):
        r = api.post("/api/lancamentos", json={"descricao": "Consulta", "tipo": "despesa", "valor": valor, "categoria_id": c["id"],
                                               "contato_id": contato["id"], "data_pagamento": date.today().isoformat()})
        assert r.status_code == 200, r.text
    # pendente não entra
    api.post("/api/lancamentos", json={"descricao": "Consulta futura", "tipo": "despesa", "valor": "999", "categoria_id": c["id"],
                                       "data_vencimento": date.today().isoformat()})
    d = api.get(f"/api/relatorios/imposto-renda?ano={ano}").json()
    saude = next(g for g in d["grupos"] if g["tipo"] == "saude")
    assert saude["total"] >= 1000 and "Dr. Sem Documento" in d["sem_documento"]
    assert "Clínica Com CNPJ" not in d["sem_documento"]
    clinica = next(p for p in saude["prestadores"] if p["nome"] == "Clínica Com CNPJ")
    assert clinica["total"] == 700 and len(clinica["lancamentos"]) == 2
    pdf = api.get(f"/api/relatorios/imposto-renda.pdf?ano={ano}")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_receita_nao_pode_ser_dedutivel(api):
    r = api.post("/api/categorias", json={"nome": "Salário IR", "tipo": "receita", "ir_tipo": "saude"})
    assert r.status_code == 422


def test_tipo_invalido(api):
    r = api.post("/api/categorias", json={"nome": "X", "tipo": "despesa", "ir_tipo": "carro"})
    assert r.status_code == 422


def test_sugestao_pelo_nome():
    from app.imposto_renda import sugerir_tipo
    assert sugerir_tipo("Saúde") == "saude" and sugerir_tipo("Escola das crianças") == "educacao"
    assert sugerir_tipo("Mercado") is None and sugerir_tipo("Farmácia") is None
