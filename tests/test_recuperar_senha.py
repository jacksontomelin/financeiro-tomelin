"""Esqueci a senha: código por e-mail (ou WhatsApp), uso único, com erros claros."""
import re


def _membro(api, email="esqueci@teste.com", senha="antiga123"):
    r = api.post("/api/usuarios", json={"nome": "Maria Esquecida", "email": email, "senha": senha,
                                        "whatsapp": "(47) 99999-0000"})
    assert r.status_code == 200, r.text
    assert r.json()["whatsapp"] == "5547999990000"
    return r.json()


def test_fluxo_completo_por_email(client, api, monkeypatch):
    from app import email_envio
    _membro(api)
    api.post("/api/configuracoes", json={"SMTP_HOST": "smtp.teste.com", "SMTP_USUARIO": "sistema@teste.com"})
    enviados = []
    monkeypatch.setattr(email_envio, "enviar", lambda db, para, assunto, texto, html=None: enviados.append((para, texto)))

    o = client.post("/api/auth/recuperar/opcoes", json={"email": "esqueci@teste.com"}).json()
    assert o["nome"] == "Maria" and {"canal": "email", "destino": "e•••i@teste.com"} in o["canais"]

    r = client.post("/api/auth/recuperar/enviar", json={"email": "esqueci@teste.com", "canal": "email"})
    assert r.status_code == 200 and r.json()["enviado"], r.text
    para, texto = enviados[-1]
    codigo = re.search(r"\b(\d{6})\b", texto).group(1)
    assert para == "esqueci@teste.com"

    errado = "000000" if codigo != "000000" else "111111"
    r = client.post("/api/auth/recuperar/confirmar", json={"email": "esqueci@teste.com", "codigo": errado, "nova_senha": "novinha123"})
    assert r.status_code == 400 and r.json()["campo"] == "codigo" and "Restam 4" in r.json()["detail"]

    r = client.post("/api/auth/recuperar/confirmar", json={"email": "esqueci@teste.com", "codigo": codigo, "nova_senha": "123"})
    assert r.status_code == 400 and r.json()["campo"] == "nova_senha"

    r = client.post("/api/auth/recuperar/confirmar", json={"email": "esqueci@teste.com", "codigo": codigo, "nova_senha": "novinha123"})
    assert r.status_code == 200 and r.json()["token"], r.text

    # código não serve de novo; senha nova entra, antiga não
    r = client.post("/api/auth/recuperar/confirmar", json={"email": "esqueci@teste.com", "codigo": codigo, "nova_senha": "outra1234"})
    assert r.status_code == 400 and "vencido ou já usado" in r.json()["detail"]
    assert client.post("/api/auth/login", json={"email": "esqueci@teste.com", "senha": "novinha123"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "esqueci@teste.com", "senha": "antiga123"}).status_code == 401


def test_email_desconhecido_e_sem_canal(client, api):
    r = client.post("/api/auth/recuperar/opcoes", json={"email": "nao-existe@teste.com"})
    assert r.status_code == 404 and r.json()["campo"] == "email"
    api.post("/api/configuracoes", json={"SMTP_HOST": ""})
    _membro(api, "semcanal@teste.com")
    o = client.post("/api/auth/recuperar/opcoes", json={"email": "semcanal@teste.com"}).json()
    assert o["canais"] == [] and "administrador" in o["aviso"]


def test_falha_no_envio_explica_e_nao_deixa_codigo(client, api, monkeypatch):
    from app import email_envio, models
    _membro(api, "falha@teste.com")
    api.post("/api/configuracoes", json={"SMTP_HOST": "smtp.teste.com", "SMTP_USUARIO": "sistema@teste.com"})

    def falha(*a, **k):
        raise email_envio.ErroEmail("O servidor de e-mail recusou o usuário ou a senha.")
    monkeypatch.setattr(email_envio, "enviar", falha)
    r = client.post("/api/auth/recuperar/enviar", json={"email": "falha@teste.com", "canal": "email"})
    assert r.status_code == 400 and "recusou o usuário" in r.json()["detail"]


def test_login_errado_avisa_tentativas(client, api):
    _membro(api, "tenta@teste.com")
    msgs = [client.post("/api/auth/login", json={"email": "tenta@teste.com", "senha": "x" * 8}).json()["detail"] for _ in range(4)]
    assert msgs[0] == "Senha incorreta."
    assert "Mais 1 tentativa" in msgs[3]
    assert "Não achei esse e-mail" in client.post("/api/auth/login", json={"email": "zz@zz.com", "senha": "x" * 8}).json()["detail"]


def test_whatsapp_invalido_no_cadastro(api):
    r = api.post("/api/usuarios", json={"nome": "Zé", "email": "ze@teste.com", "senha": "senha123", "whatsapp": "123"})
    assert r.status_code == 422 and r.json()["campo"] == "whatsapp"


def test_senha_de_emergencia_do_admin(client, api, monkeypatch):
    from app import main
    from app.config import settings
    monkeypatch.setenv("ADMIN_REDEFINIR_SENHA", "Emergencia123")
    main._senha_emergencia()
    r = client.post("/api/auth/login", json={"email": settings.ADMIN_EMAIL, "senha": "Emergencia123"})
    assert r.status_code == 200, r.text
    monkeypatch.setenv("ADMIN_REDEFINIR_SENHA", settings.ADMIN_SENHA)   # devolve a senha dos outros testes
    main._senha_emergencia()
    assert client.post("/api/auth/login", json={"email": settings.ADMIN_EMAIL, "senha": settings.ADMIN_SENHA}).status_code == 200
