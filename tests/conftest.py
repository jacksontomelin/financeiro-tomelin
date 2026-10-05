"""Sobe o sistema inteiro (com o Postgres do CI) e entrega um cliente logado."""
import os
from datetime import date

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://tomelin:tomelin@localhost:5432/tomelin_teste")
os.environ.setdefault("SECRET_KEY", "chave-de-teste-com-mais-de-trinta-e-dois-caracteres")

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:      # roda o lifespan: tabelas, migrações, seed
        yield c


@pytest.fixture(scope="session")
def token(client):
    r = client.post("/api/auth/login", json={"email": settings.ADMIN_EMAIL, "senha": settings.ADMIN_SENHA})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def api(client, token):
    """Cliente com o token do administrador em toda chamada."""
    class Api:
        h = {"Authorization": f"Bearer {token}"}
        def get(self, url, **k): return client.get(url, headers=self.h, **k)
        def post(self, url, **k): return client.post(url, headers=self.h, **k)
        def put(self, url, **k): return client.put(url, headers=self.h, **k)
        def delete(self, url, **k): return client.delete(url, headers=self.h, **k)
    return Api()


@pytest.fixture
def db():
    from app.database import SessionLocal
    s = SessionLocal()
    yield s
    s.close()


@pytest.fixture(scope="session")
def conta(api):
    r = api.post("/api/contas", json={"nome": "Conta Teste", "tipo": "banco", "saldo_inicial": "1000.00"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def categoria(api):
    r = api.post("/api/categorias", json={"nome": "Mercado Teste", "tipo": "despesa"})
    assert r.status_code == 200, r.text
    return r.json()


def hoje():
    return date.today().isoformat()
