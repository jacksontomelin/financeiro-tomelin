"""Foto/PDF mandado no grupo vira comprovante."""
import base64

GRUPO = "120363000000000000@g.us"
PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 64).decode()
PDF = base64.b64encode(b"%PDF-1.4 comprovante").decode()


def _hook(client, **corpo):
    return client.post("/api/whatsapp/webhook", json={"jid": GRUPO, "deMim": True, **corpo}).json()


def _anexos(api, lid):
    return api.get(f"/api/lancamentos/{lid}/anexos").json()


def test_preparar(api):
    api.post("/api/configuracoes", json={"WHATSAPP_GRUPO": GRUPO, "WHATSAPP_MEU_NUMERO": ""})


def test_legenda_anexo_numero(client, api):
    l = api.post("/api/lancamentos", json={"descricao": "Conta com foto", "tipo": "despesa", "valor": "80"}).json()
    r = _hook(client, texto=f"anexo {l['id']}", midia={"base64": PNG, "mimetype": "image/png", "fileName": "luz.png"})
    assert "ignorado" not in r
    a = _anexos(api, l["id"])
    assert len(a) == 1 and a[0]["mime"] == "image/png" and a[0]["nome"] == "luz.png"


def test_foto_com_legenda_de_despesa_lanca_e_anexa(client, api, db):
    from app import models
    antes = db.query(models.Lancamento).count()
    _hook(client, texto="despesa 89 farmacia", midia=PDF)
    db.expire_all()
    l = db.query(models.Lancamento).order_by(models.Lancamento.id.desc()).first()
    assert db.query(models.Lancamento).count() == antes + 1 and float(l.valor) == 89
    assert _anexos(api, l.id)[0]["mime"] == "application/pdf"


def test_foto_sem_legenda_logo_depois_de_lancar(client, api, db):
    from app import models
    _hook(client, texto="despesa 30 padaria")
    db.expire_all()
    l = db.query(models.Lancamento).order_by(models.Lancamento.id.desc()).first()
    _hook(client, midia={"data": PNG})
    assert len(_anexos(api, l.id)) == 1
    # remover pelo WhatsApp
    _hook(client, texto=f"remover anexo {l.id}")
    assert _anexos(api, l.id) == []


def test_foto_qualquer_e_ignorada(client):
    from app import zap_midia
    zap_midia._ULTIMO.clear()
    r = _hook(client, midia={"base64": PNG})
    assert r.get("ignorado") == "arquivo sem pedido de anexo"


def test_arquivo_que_nao_e_foto_nem_pdf(client, api):
    l = api.post("/api/lancamentos", json={"descricao": "Sem audio", "tipo": "despesa", "valor": "1"}).json()
    _hook(client, texto=f"anexo {l['id']}", midia={"base64": base64.b64encode(b"OggS audio").decode()})
    assert _anexos(api, l["id"]) == []
