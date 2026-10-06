"""Validação dos PDFs pelo QR code."""
from conftest import hoje


def _ultimo_codigo(db, tipo):
    from app import models
    d = db.query(models.DocumentoEmitido).filter_by(tipo=tipo).order_by(models.DocumentoEmitido.emitido_em.desc()).first()
    assert d, f"nenhum {tipo} registrado"
    return d


def test_recibo_valida_e_baixa_original(client, api, db):
    l = api.post("/api/lancamentos", json={"descricao": "Recibo teste", "tipo": "receita", "valor": "321.00",
                                           "data_pagamento": hoje()}).json()
    pdf = api.get(f"/api/lancamentos/{l['id']}/recibo.pdf")
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    d = _ultimo_codigo(db, "recibo")
    assert d.lancamento_id == l["id"]
    pag = client.get(f"/verificar/{d.codigo}")
    assert pag.status_code == 200 and "autêntico" in pag.text
    orig = client.get(f"/verificar/{d.codigo}/pdf?baixar=1")
    assert orig.status_code == 200 and orig.content == pdf.content
    assert "attachment" in orig.headers["content-disposition"]
    # gerar de novo não duplica
    api.get(f"/api/lancamentos/{l['id']}/recibo.pdf")
    from app import models
    assert db.query(models.DocumentoEmitido).filter_by(lancamento_id=l["id"], estilo="padrao").count() == 1


def test_cupom_tem_codigo_valido(client, api, db):
    l = api.post("/api/lancamentos", json={"descricao": "Cupom teste", "tipo": "despesa", "valor": "10", "data_pagamento": hoje()}).json()
    assert api.get(f"/api/lancamentos/{l['id']}/recibo.pdf?estilo=matricial").status_code == 200
    from app import models
    d = db.query(models.DocumentoEmitido).filter_by(lancamento_id=l["id"], estilo="cupom").one()
    assert len(d.codigo) == 20
    assert client.get(f"/verificar/{d.codigo}").status_code == 200


def test_codigo_desconhecido(client):
    r = client.get("/verificar/ABCDEF0123456789ABCD")
    assert r.status_code == 404 and "não encontrado" in r.text
    assert client.get("/verificar/xyz").status_code == 400


def test_lista_de_documentos_e_reenvio(api, monkeypatch):
    l = api.post("/api/lancamentos", json={"descricao": "Lista doc", "tipo": "despesa", "valor": "45", "data_pagamento": hoje()}).json()
    api.get(f"/api/lancamentos/{l['id']}/recibo.pdf")
    d = api.get("/api/documentos?busca=Lista doc").json()
    assert d["itens"] and "pdf" not in d["itens"][0] and d["itens"][0]["link"].endswith(d["itens"][0]["codigo"])
    assert api.get("/api/documentos?tipo=recibo").json()["itens"]
    from app import zapapi
    api.post("/api/configuracoes", json={"WHATSAPP_ATIVO": "true", "WHATSAPP_GRUPO": "120363000000000000@g.us"})
    enviados = []
    monkeypatch.setattr(zapapi, "enviar_arquivo", lambda *a, **k: enviados.append(a) or True)
    r = api.post(f"/api/documentos/{d['itens'][0]['codigo']}/whatsapp").json()
    assert r["enviado"] and enviados[0][0][:4] == b"%PDF"
    api.post("/api/configuracoes", json={"WHATSAPP_ATIVO": "false"})
