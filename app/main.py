"""Tomelin Gestão Financeira — aplicação principal FastAPI."""
import logging
from contextlib import asynccontextmanager
from sqlalchemy import text


def _migrar(engine):
    """Adiciona colunas novas em tabelas existentes sem quebrar o banco."""
    migrações = [
        # ultimo_acesso e ultimo_acesso_ip na tabela usuarios
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMP",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acesso_ip VARCHAR(60)",
        # juros e multa em lancamentos
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS juros NUMERIC(14,2) DEFAULT 0",
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS multa NUMERIC(14,2) DEFAULT 0",
        # logo em contas e contatos
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS logo TEXT",
        "ALTER TABLE contatos ADD COLUMN IF NOT EXISTS logo TEXT",
        # veiculos (tabela criada pelo create_all, mas garante colunas extras)
        "ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS extras JSONB",
        """CREATE TABLE IF NOT EXISTS usuario_avatares (usuario_id INTEGER PRIMARY KEY, emoji VARCHAR(8) DEFAULT '👤', cor VARCHAR(9) DEFAULT '#305C74', papel VARCHAR(20) DEFAULT 'membro')""",
        """CREATE TABLE IF NOT EXISTS login_historico (id SERIAL PRIMARY KEY, usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE, data_hora TIMESTAMP DEFAULT NOW(), ip VARCHAR(60), dispositivo VARCHAR(200), sucesso BOOLEAN DEFAULT TRUE)""",
        "CREATE INDEX IF NOT EXISTS ix_login_hist_uid ON login_historico(usuario_id)",

    ]
    with engine.connect() as conn:
        for sql in migrações:
            try:
                conn.execute(text(sql))
            except Exception:
                pass  # coluna já existe ou tabela ainda não existe — create_all cuida
        conn.commit()
    log.info("Migrações aplicadas.")
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import pytz

from .config import settings
from .database import Base, engine
from . import seed, whatsapp
from .routers import auth, categorias, contas, contatos, lancamentos, dashboard, veiculos, relatorios, configuracoes, usuarios, nfe as nfe_router, compras
from .routers import whatsapp as whatsapp_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("tomelin")

STATIC = Path(__file__).parent / "static"
scheduler = BackgroundScheduler(timezone=pytz.timezone(settings.TIMEZONE))


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrar(engine)
    seed.seed()
    # garante configurações padrão no banco
    from .database import SessionLocal as _SL
    from . import cfg as _cfg
    _db = _SL(); _cfg.seed_defaults(_db); _db.close()

    # alerta diário de vencimentos
    scheduler.add_job(whatsapp.job_alerta_vencimentos,
                      CronTrigger(hour=settings.ALERTA_HORA, minute=0),
                      id="alerta_vencimentos", replace_existing=True)
    # resumo semanal (segunda 8h)
    scheduler.add_job(whatsapp.job_resumo_semanal,
                      CronTrigger(day_of_week="mon", hour=settings.ALERTA_HORA, minute=5),
                      id="resumo_semanal", replace_existing=True)
    # fechamento do dia (contas pagas hoje)
    scheduler.add_job(whatsapp.job_fechamento_dia,
                      CronTrigger(hour=settings.FECHAMENTO_HORA, minute=0),
                      id="fechamento_dia", replace_existing=True)
    scheduler.start()
    log.info("Scheduler iniciado (alerta %02d:00, tz %s)", settings.ALERTA_HORA, settings.TIMEZONE)
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title=settings.APP_NOME, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, categorias.router, contas.router, contatos.router,
          lancamentos.router, dashboard.router, veiculos.router,
          relatorios.router, configuracoes.router, usuarios.router, nfe_router.router, compras.router, whatsapp_router.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"ok": True, "app": settings.APP_NOME}


@app.get("/api/config")
def config_publica():
    return {"app": settings.APP_NOME, "alerta_dias_antes": settings.ALERTA_DIAS_ANTES}


# ---- Frontend (SPA + PWA) ----
app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")


@app.get("/manifest.json")
def manifest():
    return FileResponse(str(STATIC / "manifest.json"), media_type="application/manifest+json")


@app.get("/sw.js")
def service_worker():
    return FileResponse(str(STATIC / "sw.js"), media_type="application/javascript")


@app.get("/")
@app.get("/{path:path}")
def spa(path: str = ""):
    # deixa a API responder normalmente; qualquer outra rota devolve o SPA
    if path.startswith("api/"):
        return {"erro": "rota não encontrada"}
    arquivo = STATIC / path
    if path and arquivo.is_file():
        return FileResponse(str(arquivo))
    return FileResponse(str(STATIC / "index.html"))
