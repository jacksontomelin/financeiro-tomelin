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


def test_midia_aninhada_e_buffer(client, api):
    """Formatos alternativos do gateway: dentro de "mensagem", e Buffer do Node."""
    l = api.post("/api/lancamentos", json={"descricao": "Formatos", "tipo": "despesa", "valor": "5"}).json()
    _hook(client, mensagem={"imagem": {"base64": PNG, "caption": f"anexo {l['id']}"}})
    bruto = list(b"%PDF-1.4 buffer")
    _hook(client, texto=f"anexo {l['id']}", arquivo={"data": {"type": "Buffer", "data": bruto}, "fileName": "nota.pdf"})
    nomes = sorted(a["nome"] for a in _anexos(api, l["id"]))
    assert len(nomes) == 2 and "nota.pdf" in nomes


def test_diagnostico_mostra_formato_e_motivo(client, api):
    l = api.post("/api/lancamentos", json={"descricao": "Diag", "tipo": "despesa", "valor": "5"}).json()
    r = _hook(client, texto=f"anexo {l['id']}", midia={"url": "https://mmg.whatsapp.net/v/t62/abc.enc?x=1", "mimetype": "image/jpeg"})
    assert r.get("ok") is True
    d = api.get("/api/whatsapp/debug").json()
    m = d["ultimas_midias"][0]
    assert m["resultado"] == "falhou" and "criptografado" in m["motivo"]
    assert m["formato"]["url"].startswith("link (mmg.whatsapp.net")
    assert m["formato"]["mimetype"] == "image/jpeg"


def test_foto_grande_cabe_e_debug_resume_base64(client, api):
    l = api.post("/api/lancamentos", json={"descricao": "Grande", "tipo": "despesa", "valor": "5"}).json()
    grande = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 400_000).decode()   # ~530 KB em base64
    _hook(client, texto=f"anexo {l['id']}", midia={"base64": grande})
    assert len(_anexos(api, l["id"])) == 1
    p = api.get("/api/whatsapp/debug").json()["ultimos_payloads"][0]["payload"]
    assert "caracteres" in p["midia"]["base64"] and len(p["midia"]["base64"]) < 200


def test_comando_de_texto_com_campos_extras_responde(client):
    """Payload de texto com campos vazios/brutos do gateway nunca vira 'arquivo'."""
    r = _hook(client, texto="menu", midia=None, media="", tipo="texto",
              message={"conversation": "menu", "messageContextInfo": {"deviceListMetadata": {}}},
              data={"tipo": "texto", "file": None})
    assert r == {"ok": True}, r


def test_midia_sem_conteudo_com_texto_segue_como_comando(client):
    r = _hook(client, texto="menu", midia={"mimetype": "image/jpeg"})
    assert r == {"ok": True}, r


def test_anexo_sem_foto_explica(client):
    r = _hook(client, texto="Anexo 42")
    assert r == {"ok": True}, r
