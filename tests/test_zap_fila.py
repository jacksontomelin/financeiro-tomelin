"""Enviar no WhatsApp responde na hora e o envio segue em segundo plano."""
import time


def _espera(api, eid):
    for _ in range(80):
        st = api.get(f"/api/whatsapp/envio/{eid}").json()
        if st["status"] != "enviando":
            return st
        time.sleep(.1)
    return st


def test_responde_na_hora_e_confirma_depois(api, monkeypatch):
    from app import zapapi
    api.post("/api/configuracoes", json={"WHATSAPP_ATIVO": "true", "WHATSAPP_GRUPO": "120363000000000000@g.us"})
    def lento(texto, *a, **k):
        time.sleep(2); return True          # gateway demorando
    monkeypatch.setattr(zapapi, "enviar_texto", lento)
    t0 = time.time()
    r = api.post("/api/whatsapp/enviar/vencer").json()
    assert time.time() - t0 < 1.5 and r["enviado"] and r["id"]
    assert api.get(f"/api/whatsapp/envio/{r['id']}").json()["status"] == "enviando"
    assert _espera(api, r["id"])["status"] == "ok"


def test_falha_aparece_com_motivo(api, monkeypatch):
    from app import zapapi
    monkeypatch.setattr(zapapi, "enviar_texto", lambda *a, **k: False)
    r = api.post("/api/whatsapp/enviar/saldo").json()
    st = _espera(api, r["id"])
    assert st["status"] == "erro" and st["motivo"]


def test_desligado_avisa_na_hora(api):
    api.post("/api/configuracoes", json={"WHATSAPP_ATIVO": "false"})
    r = api.post("/api/whatsapp/enviar/resumo").json()
    assert r["enviado"] is False and "desligado" in r["motivo"]


def test_baixa_nao_espera_o_recibo(api, monkeypatch):
    from app import whatsapp
    api.post("/api/configuracoes", json={"WHATSAPP_ATIVO": "true", "RECIBO_WHATSAPP_AUTO": "true"})
    monkeypatch.setattr(whatsapp, "enviar", lambda *a, **k: time.sleep(2) or True)
    l = api.post("/api/lancamentos", json={"descricao": "Recibo lento", "tipo": "despesa", "valor": "5"}).json()
    t0 = time.time()
    assert api.post(f"/api/lancamentos/{l['id']}/baixa", json={}).status_code == 200
    assert time.time() - t0 < 1.5
    api.post("/api/configuracoes", json={"WHATSAPP_ATIVO": "false"})
