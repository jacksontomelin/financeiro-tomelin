"""Logo colado como link é baixado e guardado no banco."""
import base64
import http.server
import io
import threading

import pytest


def _png(lado=600):
    from PIL import Image
    b = io.BytesIO(); Image.new("RGBA", (lado, lado), (255, 230, 0, 255)).save(b, "PNG"); return b.getvalue()


@pytest.fixture(scope="module")
def servidor():
    arquivos = {"/logo.png": (_png(), "image/png"), "/pagina.html": (b"<html>oi</html>", "text/html")}

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            corpo, tipo = arquivos.get(self.path, (b"", "text/plain"))
            self.send_response(200 if corpo else 404); self.send_header("Content-Type", tipo); self.end_headers(); self.wfile.write(corpo)
        def log_message(self, *a): pass
    srv = http.server.HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


def test_link_vira_imagem_guardada(api, servidor, monkeypatch):
    from app import logo_url
    monkeypatch.setattr(logo_url, "_host_publico", lambda url: None)   # o servidor do teste é local
    r = api.post("/api/contatos", json={"nome": "Loja Link", "tipo": "fornecedor", "logo": f"{servidor}/logo.png"})
    assert r.status_code == 200, r.text
    logo = r.json()["logo"]
    assert logo.startswith("data:image/png;base64,")
    from PIL import Image
    im = Image.open(io.BytesIO(base64.b64decode(logo.split(",", 1)[1])))
    assert max(im.size) <= 256                       # imagem grande foi reduzida
    # editar com link também guarda; conta (cartão) também
    c = api.post("/api/contas", json={"nome": "Banco Link", "tipo": "banco", "logo": f"{servidor}/logo.png"}).json()
    assert c["logo"].startswith("data:image/")


def test_link_que_nao_e_imagem(api, servidor, monkeypatch):
    from app import logo_url
    monkeypatch.setattr(logo_url, "_host_publico", lambda url: None)
    r = api.post("/api/contatos", json={"nome": "Loja Ruim", "tipo": "fornecedor", "logo": f"{servidor}/pagina.html"})
    assert r.status_code == 422 and "não é de uma imagem" in r.json()["detail"]


def test_rede_interna_bloqueada(api, servidor):
    r = api.post("/api/contatos", json={"nome": "Loja Interna", "tipo": "fornecedor", "logo": f"{servidor}/logo.png"})
    assert r.status_code == 422 and "rede interna" in r.json()["detail"]


def test_logo_em_arquivo_continua_igual(api):
    png = "data:image/png;base64," + base64.b64encode(_png(20)).decode()
    r = api.post("/api/contatos", json={"nome": "Loja Arquivo", "tipo": "fornecedor", "logo": png})
    assert r.json()["logo"] == png
