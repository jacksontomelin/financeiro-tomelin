"""Tomelin Gestão Financeira: aplicação principal FastAPI."""
import logging
from contextlib import asynccontextmanager
from sqlalchemy import text


def _ajusta_membros(engine):
    """Emojis antigos dos membros viram nomes de ícone e garante pelo menos
    um administrador ativo (sem isso ninguém conseguiria cadastrar membros)."""
    try:
        from sqlalchemy.orm import Session
        from . import models
        from .avatares import chave_avatar, cor_valida, COR_PADRAO
        with Session(engine) as db:
            for u in db.query(models.Usuario).all():
                if not db.get(models.UsuarioAvatar, u.id):
                    db.add(models.UsuarioAvatar(usuario_id=u.id, emoji="pessoa"))
            db.flush()
            for av in db.query(models.UsuarioAvatar).all():
                av.emoji = chave_avatar(av.emoji)
                if not cor_valida(av.cor):
                    av.cor = COR_PADRAO
            tem_admin = (db.query(models.UsuarioAvatar)
                         .join(models.Usuario, models.Usuario.id == models.UsuarioAvatar.usuario_id)
                         .filter(models.UsuarioAvatar.papel == "admin", models.Usuario.ativo.is_(True)).count())
            from .avatares import chave_meta
            for mt in db.query(models.Meta).all():
                mt.icone = chave_meta(mt.icone)
            if not tem_admin:
                primeiro = (db.query(models.Usuario).filter(models.Usuario.ativo.is_(True))
                            .order_by(models.Usuario.id).first())
                if primeiro:
                    db.get(models.UsuarioAvatar, primeiro.id).papel = "admin"
            db.commit()
    except Exception as e:  # nunca impede o sistema de subir
        print("aviso: ajuste dos membros não aplicado:", e)


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
        # endereço completo em contatos
        "ALTER TABLE contatos ADD COLUMN IF NOT EXISTS cep VARCHAR(10)",
        "ALTER TABLE contatos ADD COLUMN IF NOT EXISTS logradouro VARCHAR(200)",
        "ALTER TABLE contatos ADD COLUMN IF NOT EXISTS numero VARCHAR(20)",
        "ALTER TABLE contatos ADD COLUMN IF NOT EXISTS complemento VARCHAR(100)",
        "ALTER TABLE contatos ADD COLUMN IF NOT EXISTS bairro VARCHAR(100)",
        "ALTER TABLE contatos ADD COLUMN IF NOT EXISTS cidade VARCHAR(100)",
        "ALTER TABLE contatos ADD COLUMN IF NOT EXISTS estado VARCHAR(2)",
        # veiculos (tabela criada pelo create_all, mas garante colunas extras)
        "ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS extras JSONB",
        """CREATE TABLE IF NOT EXISTS usuario_avatares (usuario_id INTEGER PRIMARY KEY, emoji VARCHAR(8) DEFAULT 'pessoa', cor VARCHAR(9) DEFAULT '#305C74', papel VARCHAR(20) DEFAULT 'membro')""",
        """CREATE TABLE IF NOT EXISTS login_historico (id SERIAL PRIMARY KEY, usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE, data_hora TIMESTAMP DEFAULT NOW(), ip VARCHAR(60), dispositivo VARCHAR(200), sucesso BOOLEAN DEFAULT TRUE)""",
        "CREATE INDEX IF NOT EXISTS ix_login_hist_uid ON login_historico(usuario_id)",
        # cache de consultas externas (CNPJ / CEP)
        """CREATE TABLE IF NOT EXISTS cnpj_cache (
            cnpj VARCHAR(14) PRIMARY KEY, razao_social VARCHAR(250), nome_fantasia VARCHAR(250),
            situacao VARCHAR(60), telefone VARCHAR(40), email VARCHAR(160),
            logradouro VARCHAR(200), numero VARCHAR(20), complemento VARCHAR(100),
            bairro VARCHAR(100), cidade VARCHAR(100), estado VARCHAR(2), cep VARCHAR(8),
            fonte VARCHAR(40), consultado_em TIMESTAMP DEFAULT NOW())""",
        """CREATE TABLE IF NOT EXISTS cep_cache (
            cep VARCHAR(8) PRIMARY KEY, logradouro VARCHAR(200), bairro VARCHAR(100),
            cidade VARCHAR(100), estado VARCHAR(2), fonte VARCHAR(40),
            consultado_em TIMESTAMP DEFAULT NOW())""",
        # campos de contato maiores (telefone da Receita pode vir com 2 números)
        # remove travessões dos dados já gravados
        "UPDATE lancamentos SET descricao = REPLACE(REPLACE(REPLACE(descricao, ' \u2014 ', ' - '), '\u2014', '-'), '\u2013', '-') WHERE descricao LIKE '%\u2014%' OR descricao LIKE '%\u2013%'",
        "UPDATE lancamentos SET obs = REPLACE(REPLACE(REPLACE(obs, ' \u2014 ', ' - '), '\u2014', '-'), '\u2013', '-') WHERE obs LIKE '%\u2014%' OR obs LIKE '%\u2013%'",
        "UPDATE contatos SET nome = REPLACE(REPLACE(REPLACE(nome, ' \u2014 ', ' - '), '\u2014', '-'), '\u2013', '-') WHERE nome LIKE '%\u2014%' OR nome LIKE '%\u2013%'",
        "UPDATE contas SET nome = REPLACE(REPLACE(REPLACE(nome, ' \u2014 ', ' - '), '\u2014', '-'), '\u2013', '-') WHERE nome LIKE '%\u2014%' OR nome LIKE '%\u2013%'",
        "UPDATE categorias SET nome = REPLACE(REPLACE(REPLACE(nome, ' \u2014 ', ' - '), '\u2014', '-'), '\u2013', '-') WHERE nome LIKE '%\u2014%' OR nome LIKE '%\u2013%'",
        "UPDATE metas SET nome = REPLACE(REPLACE(REPLACE(nome, ' \u2014 ', ' - '), '\u2014', '-'), '\u2013', '-') WHERE nome LIKE '%\u2014%' OR nome LIKE '%\u2013%'",
        "UPDATE metas SET descricao = REPLACE(REPLACE(REPLACE(descricao, ' \u2014 ', ' - '), '\u2014', '-'), '\u2013', '-') WHERE descricao LIKE '%\u2014%' OR descricao LIKE '%\u2013%'",
        "UPDATE veiculos SET nome = REPLACE(REPLACE(REPLACE(nome, ' \u2014 ', ' - '), '\u2014', '-'), '\u2013', '-') WHERE nome LIKE '%\u2014%' OR nome LIKE '%\u2013%'",
        "UPDATE compras SET estabelecimento = REPLACE(REPLACE(REPLACE(estabelecimento, ' \u2014 ', ' - '), '\u2014', '-'), '\u2013', '-') WHERE estabelecimento LIKE '%\u2014%' OR estabelecimento LIKE '%\u2013%'",
        "ALTER TABLE categorias ADD COLUMN IF NOT EXISTS orcamento_mensal NUMERIC(14,2)",
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS import_id VARCHAR(80)",
        "CREATE INDEX IF NOT EXISTS ix_lancamentos_import_id ON lancamentos(import_id)",
        "ALTER TABLE contatos ALTER COLUMN telefone TYPE VARCHAR(120)",
        "ALTER TABLE contatos ALTER COLUMN numero TYPE VARCHAR(30)",
        "ALTER TABLE contatos ALTER COLUMN complemento TYPE VARCHAR(200)",
        "ALTER TABLE contatos ALTER COLUMN bairro TYPE VARCHAR(150)",
        "ALTER TABLE contatos ALTER COLUMN cidade TYPE VARCHAR(150)",
    ]
    # Cada comando na sua própria transação: no PostgreSQL, um erro aborta
    # a transação inteira e os comandos seguintes falhariam em silêncio.
    for sql in migrações:
        try:
            with engine.begin() as conn:
                conn.execute(text(sql))
        except Exception:
            pass  # coluna já existe / não suportado no SQLite: create_all cuida
    _ajusta_membros(engine)
    log.info("Migrações aplicadas.")
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
import logging as _logging
_logging.getLogger("apscheduler").setLevel(_logging.WARNING)
from apscheduler.triggers.cron import CronTrigger
import pytz

from .config import settings
try:
    from .version import VERSION, BUILD, BUILD_DATE
except Exception:
    VERSION, BUILD, BUILD_DATE = '2.0.0', 'dev', ''
from .database import Base, engine
from . import seed, whatsapp
from .routers import auth, categorias, contas, contatos, lancamentos, dashboard, veiculos, relatorios, configuracoes, usuarios, nfe as nfe_router, compras, metas, transferencias, orcamento, anexos, importacao
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
    _ajusta_membros(engine)   # depois do seed: banco novo também ganha o admin
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
    # escuta direta do grupo do WhatsApp (lê mensagens novas pela API v1)
    from apscheduler.triggers.interval import IntervalTrigger
    from .routers.whatsapp import job_escutar_grupo
    scheduler.add_job(job_escutar_grupo, IntervalTrigger(seconds=4), id="escuta_whatsapp",
                      replace_existing=True, max_instances=1, coalesce=True)
    scheduler.start()
    log.info("Scheduler iniciado (alerta %02d:00, tz %s)", settings.ALERTA_HORA, settings.TIMEZONE)
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title=settings.APP_NOME, lifespan=lifespan)

from . import erros
erros.registrar(app)  # mensagens reais: qual campo, qual regra
# CORS: a API é consumida pelo próprio front (mesma origem).
# allow_credentials fica False de propósito: a auth é via Bearer, não cookie.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

for r in (auth.router, categorias.router, contas.router, contatos.router,
          lancamentos.router, dashboard.router, veiculos.router,
          relatorios.router, configuracoes.router, usuarios.router, nfe_router.router, compras.router, metas.router, transferencias.router, orcamento.router, anexos.router, importacao.router, whatsapp_router.router):
    app.include_router(r)


@app.get("/verificar/{code}")
def verificar_autenticidade(code: str):
    """Página pública de verificação de autenticidade de documentos."""
    from fastapi.responses import HTMLResponse
    import re as _re
    # o código é sempre 20 hex maiúsculos: qualquer outra coisa é rejeitada
    if not _re.fullmatch(r"[A-F0-9]{20}", code or ""):
        return HTMLResponse("<h1>Código inválido</h1>", status_code=400)
    html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verificação de Autenticidade</title>
<style>
  body{{font-family:system-ui,sans-serif;background:#F1F5F9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box}}
  .card{{background:#fff;border-radius:20px;padding:32px;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(8,45,81,.12);text-align:center}}
  .logo{{width:64px;height:64px;background:#082D51;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px}}
  h1{{font-size:20px;font-weight:800;color:#082D51;margin:0 0 6px}}
  .sub{{font-size:13px;color:#94A3B8;margin-bottom:24px}}
  .code{{font-family:monospace;font-size:16px;font-weight:700;color:#082D51;background:#F1F5F9;padding:12px 16px;border-radius:10px;letter-spacing:.08em;margin-bottom:20px}}
  .badge{{display:inline-flex;align-items:center;gap:8px;background:#DCFCE7;color:#15803D;padding:10px 20px;border-radius:99px;font-size:14px;font-weight:700}}
  .badge svg{{width:20px;height:20px}}
  .footer{{margin-top:24px;font-size:12px;color:#CBD5E1}}
</style>
</head>
<body>
<div class="card">
  <div class="logo">T</div>
  <h1>Documento Verificado</h1>
  <div class="sub">Tomelin Gestão Financeira</div>
  <div class="code">{code}</div>
  <div class="badge">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
    Autenticidade confirmada
  </div>
  <div class="footer">Este documento foi emitido pelo sistema Tomelin Gestão Financeira.<br>Blumenau/SC · tomelin.com.br</div>
</div>
</body>
</html>"""
    return HTMLResponse(html)


@app.get("/api/health")
def health():
    return {"ok": True, "app": settings.APP_NOME, "version": VERSION, "build": BUILD, "build_date": BUILD_DATE}


@app.get("/api/config")
def config_publica():
    return {"app": settings.APP_NOME, "alerta_dias_antes": settings.ALERTA_DIAS_ANTES}


# ---- Frontend (SPA + PWA) ----
@app.middleware("http")
async def _sem_cache_no_shell(request, call_next):
    """Força o navegador (principalmente Safari/iOS) a revalidar o app a cada
    acesso: sem isso ele reaproveita um app.js antigo depois do deploy."""
    resp = await call_next(request)
    p = request.url.path
    if (p == "/" or p == "/sw.js" or p.endswith(".html")
            or (p.startswith("/static/") and p.endswith((".js", ".css")))
            or not p.startswith(("/api", "/static", "/verificar"))):
        resp.headers["Cache-Control"] = "no-cache, must-revalidate"
    return resp


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
