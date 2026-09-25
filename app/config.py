"""Configuração central — tudo vem de variáveis de ambiente (Coolify)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Aplicação
    APP_NOME: str = "Tomelin Gestão Financeira"
    SECRET_KEY: str = "troque-esta-chave-em-producao-tomelin"
    TOKEN_HORAS: int = 24 * 7  # sessão dura 7 dias

    # Banco de dados
    DATABASE_URL: str = "postgresql+psycopg2://tomelin:tomelin@db:5432/tomelin"

    # Admin inicial (criado no primeiro boot se a tabela estiver vazia)
    ADMIN_NOME: str = "Jackson Tomelin"
    ADMIN_EMAIL: str = "admin@tomelin.com.br"
    ADMIN_SENHA: str = "tomelin123"

    # ---- Integração WhatsApp (padrão whatsapp.jackson / Sentinela) ----
    # Gateway Baileys do whatsapp.jackson (ex.: https://zap.unicontroller.com.br)
    WHATSAPP_API_URL: str = ""
    WHATSAPP_API_TOKEN: str = ""
    # Grupo de controle financeiro (id "...@g.us" OU nome exato do grupo)
    WHATSAPP_GRUPO: str = ""
    # Envia recibo automático no WhatsApp sempre que uma conta é marcada como paga
    RECIBO_WHATSAPP_AUTO: bool = True
    # Caminho do endpoint de envio no gateway. {msg} e {grupo} são preenchidos no payload.
    WHATSAPP_ENDPOINT_ENVIAR: str = "/api/enviar"
    WHATSAPP_ATIVO: bool = False

    # ---- Alertas automáticos de vencimento ----
    ALERTA_HORA: int = 8          # hora do alerta diário (0-23)
    ALERTA_DIAS_ANTES: int = 3    # avisa vencimentos até X dias à frente
    RESUMO_SEMANAL: bool = True   # resumo toda segunda-feira
    FECHAMENTO_DIARIO: bool = True  # resumo do dia (contas pagas) no WhatsApp
    FECHAMENTO_HORA: int = 20       # hora do fechamento do dia (0-23)
    TIMEZONE: str = "America/Sao_Paulo"

    # ---- FIPEConsulta (tecnologia própria) — valor automático dos veículos ----
    FIPE_ATIVO: bool = False
    FIPE_API_URL: str = ""                       # ex.: https://fipe.unicontroller.com.br
    FIPE_API_TOKEN: str = ""                     # Bearer, se exigido
    # Template do caminho de consulta. {codigo} é substituído pelo código FIPE do veículo.
    FIPE_ENDPOINT: str = "/api/fipe/{codigo}"

    # ---- Dados p/ recibos e balancetes em PDF ----
    EMPRESA_NOME: str = "Tomelin — Gestão Financeira da Família"
    EMPRESA_DOC: str = ""                        # CPF/CNPJ opcional no rodapé do PDF
    EMPRESA_CIDADE: str = "Blumenau/SC"


settings = Settings()
