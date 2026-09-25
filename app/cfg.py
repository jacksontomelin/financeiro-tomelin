"""Configurações dinâmicas — salvas no banco, editáveis pela interface.

Hierarquia: banco de dados > variável de ambiente > valor padrão.
Assim quem ainda usa .env continua funcionando, mas o painel sobrescreve.
"""
from sqlalchemy.orm import Session
from . import models
from .config import settings

# Definição de todas as configurações com chave, descrição e valor padrão
DEFS = [
    # ---- WhatsApp ----
    ("WHATSAPP_ATIVO",           "Ativar envio de mensagens pelo WhatsApp",                          "false"),
    ("WHATSAPP_API_URL",         "URL do gateway WhatsApp (ex.: https://zap.unicontroller.com.br)",  ""),
    ("WHATSAPP_API_TOKEN",       "Token Bearer do gateway",                                           ""),
    ("WHATSAPP_GRUPO",           "ID ou nome do grupo de controle financeiro",                        ""),
    ("WHATSAPP_ENDPOINT_ENVIAR", "Endpoint de envio (padrão /api/enviar)",                           "/api/enviar"),
    ("RECIBO_WHATSAPP_AUTO",     "Enviar recibo automático ao dar baixa",                             "true"),
    # ---- Alertas ----
    ("ALERTA_HORA",              "Hora do alerta diário de vencimentos (0-23)",                       "8"),
    ("ALERTA_DIAS_ANTES",        "Avisar vencimentos com quantos dias de antecedência",               "3"),
    ("RESUMO_SEMANAL",           "Enviar resumo semanal (segunda-feira)",                             "true"),
    ("FECHAMENTO_DIARIO",        "Enviar fechamento do dia com contas pagas",                         "true"),
    ("FECHAMENTO_HORA",          "Hora do fechamento do dia (0-23)",                                  "20"),
    # ---- FIPE ----
    ("FIPE_ATIVO",               "Ativar consulta automática de FIPE",                                "false"),
    ("FIPE_API_URL",             "URL da sua API FIPEConsulta",                                       ""),
    ("FIPE_API_TOKEN",           "Token Bearer do FIPEConsulta",                                      ""),
    ("FIPE_ENDPOINT",            "Endpoint de consulta ({codigo} = código do veículo)",               "/api/fipe/{codigo}"),
    # ---- PDFs / Empresa ----
    ("EMPRESA_NOME",             "Nome que aparece nos PDFs e recibos",                               "Tomelin Gestão Financeira"),
    ("EMPRESA_DOC",              "CPF/CNPJ (opcional, aparece no rodapé dos PDFs)",                   ""),
    ("EMPRESA_CIDADE",           "Cidade/UF (rodapé dos PDFs)",                                       "Blumenau/SC"),
]

_ENV_MAP = {
    "WHATSAPP_ATIVO":           lambda: str(settings.WHATSAPP_ATIVO).lower(),
    "WHATSAPP_API_URL":         lambda: settings.WHATSAPP_API_URL,
    "WHATSAPP_API_TOKEN":       lambda: settings.WHATSAPP_API_TOKEN,
    "WHATSAPP_GRUPO":           lambda: settings.WHATSAPP_GRUPO,
    "WHATSAPP_ENDPOINT_ENVIAR": lambda: settings.WHATSAPP_ENDPOINT_ENVIAR,
    "RECIBO_WHATSAPP_AUTO":     lambda: str(settings.RECIBO_WHATSAPP_AUTO).lower(),
    "ALERTA_HORA":              lambda: str(settings.ALERTA_HORA),
    "ALERTA_DIAS_ANTES":        lambda: str(settings.ALERTA_DIAS_ANTES),
    "RESUMO_SEMANAL":           lambda: str(settings.RESUMO_SEMANAL).lower(),
    "FECHAMENTO_DIARIO":        lambda: str(settings.FECHAMENTO_DIARIO).lower(),
    "FECHAMENTO_HORA":          lambda: str(settings.FECHAMENTO_HORA),
    "FIPE_ATIVO":               lambda: str(settings.FIPE_ATIVO).lower(),
    "FIPE_API_URL":             lambda: settings.FIPE_API_URL,
    "FIPE_API_TOKEN":           lambda: settings.FIPE_API_TOKEN,
    "FIPE_ENDPOINT":            lambda: settings.FIPE_ENDPOINT,
    "EMPRESA_NOME":             lambda: settings.EMPRESA_NOME,
    "EMPRESA_DOC":              lambda: settings.EMPRESA_DOC,
    "EMPRESA_CIDADE":           lambda: settings.EMPRESA_CIDADE,
}


def get(db: Session, chave: str, padrao: str = "") -> str:
    """Lê do banco; se não tiver, usa env; se não tiver, usa padrão."""
    row = db.get(models.Configuracao, chave)
    if row is not None and row.valor is not None:
        return row.valor
    env_fn = _ENV_MAP.get(chave)
    if env_fn:
        try:
            v = env_fn()
            if v:
                return v
        except Exception:
            pass
    return padrao


def get_bool(db: Session, chave: str, padrao: bool = False) -> bool:
    return get(db, chave, str(padrao).lower()).lower() in ("1", "true", "yes", "sim")


def get_int(db: Session, chave: str, padrao: int = 0) -> int:
    try:
        return int(get(db, chave, str(padrao)))
    except ValueError:
        return padrao


def set_many(db: Session, dados: dict):
    """Salva várias chaves de uma vez."""
    for chave, valor in dados.items():
        row = db.get(models.Configuracao, chave)
        if row:
            row.valor = valor
        else:
            desc = next((d for k, d, _ in DEFS if k == chave), "")
            db.add(models.Configuracao(chave=chave, valor=valor, descricao=desc))
    db.commit()


def todas(db: Session) -> list[dict]:
    """Retorna lista completa com valor atual (banco > env > padrão)."""
    rows = {r.chave: r.valor for r in db.query(models.Configuracao).all()}
    result = []
    for chave, desc, pad in DEFS:
        val = rows.get(chave)
        if val is None:
            env_fn = _ENV_MAP.get(chave)
            try:
                val = env_fn() if env_fn else pad
            except Exception:
                val = pad
        result.append({"chave": chave, "valor": val or "", "descricao": desc})
    return result


def seed_defaults(db: Session):
    """Garante que as chaves existam no banco (sem sobrescrever o que já foi salvo)."""
    for chave, desc, pad in DEFS:
        if not db.get(models.Configuracao, chave):
            env_fn = _ENV_MAP.get(chave)
            try:
                val = env_fn() if env_fn else pad
            except Exception:
                val = pad
            db.add(models.Configuracao(chave=chave, valor=val or pad, descricao=desc))
    db.commit()
