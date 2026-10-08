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


def _chave_sessao(engine):
    """Sem SECRET_KEY no ambiente, a chave das sessões fica guardada no banco.

    Antes era gerada a cada reinício e todo redeploy deslogava todo mundo.
    A chave fica numa configuração interna, que não aparece nem pode ser
    gravada pela tela de Configurações.
    """
    import os
    if os.environ.get("SECRET_KEY") and not os.environ["SECRET_KEY"].startswith("troque"):
        return
    try:
        from sqlalchemy.orm import Session
        from . import models
        from .config import settings
        with Session(engine) as db:
            row = db.get(models.Configuracao, "_chave_sessao")
            if row and row.valor and len(row.valor) >= 32:
                settings.SECRET_KEY = row.valor
            else:
                db.merge(models.Configuracao(chave="_chave_sessao", valor=settings.SECRET_KEY,
                                             descricao="interno: assinatura das sessões"))
                db.commit()
    except Exception as e:
        print("aviso: chave de sessão não persistida:", e)


def _senha_emergencia():
    """Ficou sem acesso e sem WhatsApp/e-mail configurados? Defina ADMIN_REDEFINIR_SENHA
    no ambiente (Coolify), reinicie, entre com ela e depois apague a variável.
    Vale para o usuário de ADMIN_EMAIL; se ele não existir, para o primeiro administrador."""
    import os
    nova = (os.environ.get("ADMIN_REDEFINIR_SENHA") or "").strip()
    if not nova:
        return
    if len(nova) < 6:
        log.error("ADMIN_REDEFINIR_SENHA precisa ter no mínimo 6 caracteres: senha não trocada.")
        return
    from .database import SessionLocal
    from . import models, security
    db = SessionLocal()
    try:
        u = db.query(models.Usuario).filter(models.Usuario.email == settings.ADMIN_EMAIL.lower().strip()).first()
        if not u:
            u = (db.query(models.Usuario).join(models.UsuarioAvatar, models.UsuarioAvatar.usuario_id == models.Usuario.id)
                 .filter(models.UsuarioAvatar.papel == "admin").order_by(models.Usuario.id).first())
        if not u:
            log.error("ADMIN_REDEFINIR_SENHA: nenhum administrador encontrado.")
            return
        if not security.confere_senha(nova, u.senha_hash):
            u.senha_hash = security.hash_senha(nova)
            u.ativo = True
            db.commit()
            log.warning("Senha do administrador %s redefinida por ADMIN_REDEFINIR_SENHA. Apague a variável depois de entrar.", u.email)
    except Exception as e:
        log.error("ADMIN_REDEFINIR_SENHA falhou: %s", e)
    finally:
        db.close()


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
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS recorrencia_id INTEGER",
        "CREATE INDEX IF NOT EXISTS ix_lancamentos_recorrencia_id ON lancamentos(recorrencia_id)",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS bandeira VARCHAR(20)",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS final_cartao VARCHAR(4)",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS limite NUMERIC(14,2)",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS dia_fechamento INTEGER",
        "ALTER TABLE contas ADD COLUMN IF NOT EXISTS dia_vencimento INTEGER",
        "CREATE INDEX IF NOT EXISTS ix_lancamentos_import_id ON lancamentos(import_id)",
        "ALTER TABLE contatos ALTER COLUMN telefone TYPE VARCHAR(120)",
        "ALTER TABLE contatos ALTER COLUMN numero TYPE VARCHAR(30)",
        "ALTER TABLE contatos ALTER COLUMN complemento TYPE VARCHAR(200)",
        "ALTER TABLE contatos ALTER COLUMN bairro TYPE VARCHAR(150)",
        "ALTER TABLE contatos ALTER COLUMN cidade TYPE VARCHAR(150)",
        "ALTER TABLE categorias ADD COLUMN IF NOT EXISTS ir_tipo VARCHAR(20)",
        "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS ix_lancamentos_responsavel_id ON lancamentos(responsavel_id)",
        "ALTER TABLE recorrencias ADD COLUMN IF NOT EXISTS responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL",
        "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(20)",
    ]
    # Cada comando na sua própria transação: no PostgreSQL, um erro aborta
    # a transação inteira e os comandos seguintes falhariam em silêncio.
    falhas = []
    for sql in migrações:
        try:
            with engine.begin() as conn:
                if engine.dialect.name == "postgresql":
                    conn.execute(text("SET LOCAL lock_timeout = '8s'"))   # não fica preso esperando o contêiner antigo
                conn.execute(text(sql))
        except Exception as e:
            if engine.dialect.name == "postgresql":
                falhas.append(sql)
                log.warning("Migração falhou (tento de novo em segundo plano): %s · %s", sql[:90], str(e).splitlines()[0][:160])
    _ajusta_membros(engine)
    if falhas:
        _migrar_depois(engine, falhas)
    log.info("Migrações aplicadas%s.", f" ({len(falhas)} pendente(s))" if falhas else "")


def _migrar_depois(engine, falhas):
    """Tabela travada pelo contêiner antigo durante o deploy: tenta de novo por alguns minutos."""
    import threading, time

    def rodar():
        pendentes = list(falhas)
        for tentativa in range(30):
            time.sleep(10)
            for sql in list(pendentes):
                try:
                    with engine.begin() as conn:
                        conn.execute(text("SET LOCAL lock_timeout = '8s'"))
                        conn.execute(text(sql))
                    pendentes.remove(sql)
                    log.info("Migração aplicada na tentativa %d: %s", tentativa + 2, sql[:90])
                except Exception:
                    pass
            if not pendentes:
                return
        for sql in pendentes:
            log.error("Migração NÃO aplicada: %s", sql[:120])
    threading.Thread(target=rodar, daemon=True).start()
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
from .routers import auth, categorias, contas, contatos, lancamentos, dashboard, veiculos, relatorios, configuracoes, usuarios, nfe as nfe_router, compras, metas, transferencias, orcamento, anexos, importacao, recorrencias, backup, exemplos as exemplos_router, bandeiras
from .routers import whatsapp as whatsapp_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("tomelin")

STATIC = Path(__file__).parent / "static"
scheduler = BackgroundScheduler(timezone=pytz.timezone(settings.TIMEZONE))


@asynccontextmanager
async def lifespan(app: FastAPI):
    from . import exemplos as _ex  # registra a tabela registros_exemplo
    Base.metadata.create_all(bind=engine)
    _migrar(engine)
    seed.seed()
    _ajusta_membros(engine)   # depois do seed: banco novo também ganha o admin
    _chave_sessao(engine)     # redeploy não desloga mais ninguém
    _senha_emergencia()       # ADMIN_REDEFINIR_SENHA no ambiente: troca a senha do administrador
    try:
        from .database import SessionLocal as _SR
        from . import recorrencia as _rec
        _d = _SR(); _rec.gerar(_d); _d.close()
    except Exception as e:
        print("aviso: recorrências não geradas no boot:", e)
    # garante configurações padrão no banco
    from .database import SessionLocal as _SL
    from . import cfg as _cfg
    _db = _SL(); _cfg.seed_defaults(_db)
    try:   # uma vez: escuta do grupo desligada, para responder só pelo webhook como o Sentinela
        if not _cfg.get(_db, "_escuta_igual_sentinela", ""):
            _cfg.set_many(_db, {"WHATSAPP_ESCUTA": "false"})
            _cfg.set_interno(_db, "_escuta_igual_sentinela", "1")
    except Exception as e:
        print("aviso: escuta não ajustada:", e)
    _db.close()
    try:   # logos antigos salvos como link passam a ficar guardados no sistema
        from . import logo_url as _lg
        _lg.converter_antigos()
    except Exception as e:
        print("aviso: logos antigos não convertidos:", e)
    try:   # primeira vez: marca Saúde, Escola etc. como dedutíveis no IR
        from . import imposto_renda as _ir
        _db = _SL(); _ir.marcar_padrao(_db); _db.close()
    except Exception as e:
        print("aviso: categorias do IR não marcadas:", e)

    # alerta diário de vencimentos
    scheduler.add_job(whatsapp.job_alerta_vencimentos,
                      CronTrigger(hour=settings.ALERTA_HORA, minute=0),
                      id="alerta_vencimentos", replace_existing=True)
    # resumo semanal (segunda 8h)
    scheduler.add_job(whatsapp.job_resumo_semanal,
                      CronTrigger(day_of_week="mon", hour=settings.ALERTA_HORA, minute=5),
                      id="resumo_semanal", replace_existing=True)
    # fechamento do dia (contas pagas hoje)
    # lançamentos que se repetem: cria as próximas ocorrências todo dia de madrugada
    from . import recorrencia as _recm
    scheduler.add_job(_recm.job_diario, CronTrigger(hour=0, minute=15), id="recorrencias", replace_existing=True)
    # backup automático (hora vem de Configurações; reagendar() aplica)
    from . import backup_auto as _bk
    scheduler.add_job(_bk.job, CronTrigger(hour=3, minute=30), id="backup_auto", replace_existing=True)
    scheduler.add_job(whatsapp.job_fechamento_dia,
                      CronTrigger(hour=settings.FECHAMENTO_HORA, minute=0),
                      id="fechamento_dia", replace_existing=True)
    # escuta direta do grupo do WhatsApp (lê mensagens novas pela API v1)
    from apscheduler.triggers.interval import IntervalTrigger
    from .routers.whatsapp import job_escutar_grupo
    scheduler.add_job(job_escutar_grupo, IntervalTrigger(seconds=5), id="escuta_whatsapp",
                      replace_existing=True, max_instances=1, coalesce=True)
    scheduler.start()
    reagendar()   # horários vêm da tela de Configurações (banco > .env)
    yield
    scheduler.shutdown(wait=False)


def _hora_valida(v, padrao):
    return v if 0 <= v <= 23 else padrao


def reagendar():
    """Aplica nos alertas os horários salvos na tela de Configurações.

    Chamado no boot e sempre que as configurações são salvas: antes os
    horários vinham só do .env e mudar na tela não tinha efeito.
    """
    from .database import SessionLocal
    from . import cfg
    db = SessionLocal()
    try:
        h_alerta = _hora_valida(cfg.get_int(db, "ALERTA_HORA", settings.ALERTA_HORA), 8)
        h_fech = _hora_valida(cfg.get_int(db, "FECHAMENTO_HORA", settings.FECHAMENTO_HORA), 20)
        h_bk = _hora_valida(cfg.get_int(db, "BACKUP_HORA", 3), 3)
    finally:
        db.close()
    tz = scheduler.timezone
    try:
        scheduler.reschedule_job("alerta_vencimentos", trigger=CronTrigger(hour=h_alerta, minute=0, timezone=tz))
        scheduler.reschedule_job("resumo_semanal", trigger=CronTrigger(day_of_week="mon", hour=h_alerta, minute=5, timezone=tz))
        scheduler.reschedule_job("fechamento_dia", trigger=CronTrigger(hour=h_fech, minute=0, timezone=tz))
        scheduler.reschedule_job("backup_auto", trigger=CronTrigger(hour=h_bk, minute=30, timezone=tz))
    except Exception as e:   # scheduler ainda não iniciado (testes) ou job ausente
        log.warning("Reagendamento não aplicado: %s", e)
        return
    log.info("Alertas às %02d:00, fechamento às %02d:00 (tz %s)", h_alerta, h_fech, settings.TIMEZONE)


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
          relatorios.router, configuracoes.router, usuarios.router, nfe_router.router, compras.router, metas.router, transferencias.router, orcamento.router, anexos.router, importacao.router, recorrencias.router, backup.router, exemplos_router.router, bandeiras.router, whatsapp_router.router):
    app.include_router(r)


from .verificacao import router as _verificacao   # validação pública pelo QR code dos PDFs
from .routers import documentos as _documentos
app.include_router(_documentos.router)
from .routers import atividade as _atividade
app.include_router(_atividade.router)
app.include_router(_verificacao)


@app.get("/api/health")
def health():
    return {"ok": True, "app": settings.APP_NOME, "version": VERSION, "build": BUILD, "build_date": BUILD_DATE}


@app.get("/api/config")
def config_publica():
    from .database import SessionLocal
    from . import cfg
    db = SessionLocal()
    try:
        dias = cfg.get_int(db, "ALERTA_DIAS_ANTES", settings.ALERTA_DIAS_ANTES)
    finally:
        db.close()
    return {"app": settings.APP_NOME, "alerta_dias_antes": dias}


# ---- Frontend (SPA + PWA) ----
@app.middleware("http")
async def _sem_cache_no_shell(request, call_next):
    """Força o navegador (principalmente Safari/iOS) a revalidar o app a cada
    acesso: sem isso ele reaproveita scripts antigos depois do deploy."""
    if request.url.path.startswith("/api/"):
        from .urls import aprender
        aprender(request)   # guarda o domínio real para os QR codes dos PDFs
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


@app.get("/.well-known/assetlinks.json")
def assetlinks():
    """Prova para o Android que o APK (TWA) é deste site: abre em tela cheia, sem barra.

    Configure no servidor: ANDROID_PACKAGE (ex.: br.com.tomelin.financeiro) e
    ANDROID_SHA256 (impressão digital SHA-256 da chave que assina o APK; se
    houver mais de uma, separe por vírgula). Sem elas, a rota responde 404.
    """
    import os
    pacote = os.environ.get("ANDROID_PACKAGE", "").strip()
    digitais = [d.strip().upper() for d in os.environ.get("ANDROID_SHA256", "").split(",") if d.strip()]
    if not pacote or not digitais:
        return JSONResponse({"erro": "APK ainda não configurado (ANDROID_PACKAGE e ANDROID_SHA256)."}, status_code=404)
    return JSONResponse([{
        "relation": ["delegate_permission/common.handle_all_urls"],
        "target": {"namespace": "android_app", "package_name": pacote, "sha256_cert_fingerprints": digitais},
    }])


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
