"""Modelos ORM do sistema financeiro Tomelin."""
from datetime import datetime, date

from sqlalchemy import (
    Column, Integer, String, Numeric, Date, DateTime, Boolean,
    ForeignKey, Text, Enum, JSON,
)
from sqlalchemy.orm import relationship
import enum

from .database import Base


class TipoMov(str, enum.Enum):
    receita = "receita"
    despesa = "despesa"


class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(Integer, primary_key=True)
    nome = Column(String(120), nullable=False)
    email = Column(String(160), unique=True, nullable=False, index=True)
    senha_hash = Column(String(255), nullable=False)
    ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime, default=datetime.utcnow)
    ultimo_acesso = Column(DateTime, nullable=True)       # gravado a cada login
    ultimo_acesso_ip = Column(String(60), nullable=True)  # IP do último acesso


class Conta(Base):
    """Carteira / conta bancária — controla saldo."""
    __tablename__ = "contas"
    id = Column(Integer, primary_key=True)
    nome = Column(String(120), nullable=False)
    tipo = Column(String(40), default="banco")  # banco, dinheiro, cartao, aplicacao
    banco = Column(String(80), nullable=True)
    saldo_inicial = Column(Numeric(14, 2), default=0)
    cor = Column(String(9), default="#12395f")
    logo = Column(Text, nullable=True)  # data URI ou URL do logo do banco/cartão
    ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime, default=datetime.utcnow)

    lancamentos = relationship("Lancamento", back_populates="conta")


class Categoria(Base):
    __tablename__ = "categorias"
    id = Column(Integer, primary_key=True)
    nome = Column(String(120), nullable=False)
    tipo = Column(Enum(TipoMov), nullable=False)
    cor = Column(String(9), default="#2f9e6f")
    icone = Column(String(40), default="tag")
    criado_em = Column(DateTime, default=datetime.utcnow)

    lancamentos = relationship("Lancamento", back_populates="categoria")


class Contato(Base):
    """Cliente / fornecedor."""
    __tablename__ = "contatos"
    id = Column(Integer, primary_key=True)
    nome = Column(String(160), nullable=False)
    tipo = Column(String(20), default="cliente")  # cliente, fornecedor, ambos
    documento = Column(String(30), nullable=True)  # CPF/CNPJ
    telefone = Column(String(30), nullable=True)
    email = Column(String(160), nullable=True)
    obs = Column(Text, nullable=True)
    logo = Column(Text, nullable=True)  # data URI ou URL do logo da empresa
    criado_em = Column(DateTime, default=datetime.utcnow)

    lancamentos = relationship("Lancamento", back_populates="contato")


class Lancamento(Base):
    """
    Núcleo do sistema. Um único modelo cobre:
      - Receitas e despesas realizadas (com data_pagamento)
      - Contas a pagar / a receber (pendentes, com data_vencimento)
      - Vencimentos (usados nos alertas e no popup)
    """
    __tablename__ = "lancamentos"
    id = Column(Integer, primary_key=True)
    descricao = Column(String(200), nullable=False)
    tipo = Column(Enum(TipoMov), nullable=False)
    valor = Column(Numeric(14, 2), nullable=False)

    data_competencia = Column(Date, default=date.today)
    data_vencimento = Column(Date, nullable=True, index=True)
    data_pagamento = Column(Date, nullable=True)

    forma_pagamento = Column(String(40), nullable=True)  # pix, boleto, cartao, dinheiro...
    obs = Column(Text, nullable=True)

    # juros / multa (controle de custo financeiro)
    juros = Column(Numeric(14, 2), default=0)
    multa = Column(Numeric(14, 2), default=0)

    # recorrência / parcelamento (informativo)
    recorrente = Column(Boolean, default=False)
    parcela = Column(Integer, nullable=True)
    total_parcelas = Column(Integer, nullable=True)

    categoria_id = Column(Integer, ForeignKey("categorias.id"), nullable=True)
    contato_id = Column(Integer, ForeignKey("contatos.id"), nullable=True)
    conta_id = Column(Integer, ForeignKey("contas.id"), nullable=True)

    criado_em = Column(DateTime, default=datetime.utcnow)

    categoria = relationship("Categoria", back_populates="lancamentos")
    contato = relationship("Contato", back_populates="lancamentos")
    conta = relationship("Conta", back_populates="lancamentos")

    @property
    def status(self) -> str:
        if self.data_pagamento:
            return "pago"
        if self.data_vencimento and self.data_vencimento < date.today():
            return "atrasado"
        return "pendente"

    @property
    def valor_total(self):
        """Valor + juros + multa (usado em recibos)."""
        return (self.valor or 0) + (self.juros or 0) + (self.multa or 0)


class Veiculo(Base):
    """Veículo como patrimônio — valor FIPE (automático) ou fixo, e financiamento."""
    __tablename__ = "veiculos"
    id = Column(Integer, primary_key=True)
    nome = Column(String(120), nullable=False)          # apelido: "Corolla da família"
    marca = Column(String(80), nullable=True)
    modelo = Column(String(120), nullable=True)
    ano = Column(String(16), nullable=True)             # ano/modelo, ex: 2021/2022
    placa = Column(String(16), nullable=True)
    cor = Column(String(40), nullable=True)
    km = Column(Integer, nullable=True)

    # valor: automático pela FIPE (FIPEConsulta) ou fixo definido pelo usuário
    tipo_valor = Column(String(10), default="fipe")     # "fipe" | "fixo"
    valor_fixo = Column(Numeric(14, 2), nullable=True)
    fipe_codigo = Column(String(60), nullable=True)     # código/param p/ consulta na FIPEConsulta
    fipe_valor = Column(Numeric(14, 2), nullable=True)  # último valor consultado (cache)
    fipe_atualizado_em = Column(Date, nullable=True)

    # financiamento
    financiado = Column(Boolean, default=False)
    financiamento_banco = Column(String(80), nullable=True)
    parcelas_total = Column(Integer, nullable=True)
    parcelas_pagas = Column(Integer, nullable=True)
    valor_parcela = Column(Numeric(14, 2), nullable=True)
    venc_dia = Column(Integer, nullable=True)           # dia do mês do vencimento da parcela

    obs = Column(Text, nullable=True)
    extras = Column(JSON, default=dict)                 # campos personalizados escolhidos pelo usuário
    cor_card = Column(String(9), default="#305C74")
    ativo = Column(Boolean, default=True)
    criado_em = Column(DateTime, default=datetime.utcnow)

    @property
    def valor_atual(self):
        if self.tipo_valor == "fixo":
            return self.valor_fixo or 0
        return self.fipe_valor or 0

    @property
    def parcelas_restantes(self):
        if not self.financiado or not self.parcelas_total:
            return 0
        return max(0, self.parcelas_total - (self.parcelas_pagas or 0))

    @property
    def saldo_financiamento(self):
        return self.parcelas_restantes * (self.valor_parcela or 0)

    @property
    def patrimonio_liquido(self):
        """Valor do bem menos o que ainda falta pagar."""
        return (self.valor_atual or 0) - self.saldo_financiamento


class Configuracao(Base):
    """Chave-valor para configurações do sistema editáveis pela interface."""
    __tablename__ = "configuracoes"
    chave = Column(String(80), primary_key=True)
    valor = Column(Text, nullable=True)
    descricao = Column(String(255), nullable=True)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)



class UsuarioAvatar(Base):
    """Avatar/cor personalizada por usuário (perfil visual)."""
    __tablename__ = "usuario_avatares"
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), primary_key=True)
    emoji = Column(String(8), default="👤")
    cor = Column(String(9), default="#305C74")
    papel = Column(String(20), default="membro")  # admin | membro


class LoginHistorico(Base):
    """Histórico completo de logins por usuário."""
    __tablename__ = "login_historico"
    id = Column(Integer, primary_key=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    data_hora = Column(DateTime, default=datetime.utcnow, nullable=False)
    ip = Column(String(60), nullable=True)
    dispositivo = Column(String(200), nullable=True)  # user-agent resumido
    sucesso = Column(Boolean, default=True)           # False = senha errada


# ═══════════════════════════════════════════════════════════════
#  COMPRAS — itens de nota fiscal + controle de parcelamento no cartão
# ═══════════════════════════════════════════════════════════════

class Compra(Base):
    """
    Cabeçalho de uma compra (geralmente originada da leitura de uma NF-e).
    Liga o lançamento financeiro aos itens comprados e, se parcelado no
    cartão, ao controle de parcelas.
    """
    __tablename__ = "compras"
    id = Column(Integer, primary_key=True)
    lancamento_id = Column(Integer, ForeignKey("lancamentos.id", ondelete="CASCADE"),
                           nullable=False, unique=True, index=True)

    # dados do estabelecimento (vindos da NF-e ou preenchidos manualmente)
    estabelecimento = Column(String(160), nullable=True)
    cnpj_emitente = Column(String(20), nullable=True)
    numero_nota = Column(String(30), nullable=True)
    chave_acesso = Column(String(50), nullable=True)
    data_emissao = Column(Date, nullable=True)
    uf = Column(String(2), nullable=True)

    criado_em = Column(DateTime, default=datetime.utcnow)

    lancamento = relationship("Lancamento", backref="compra", uselist=False)
    itens = relationship("ItemCompra", back_populates="compra",
                         cascade="all, delete-orphan", order_by="ItemCompra.id")
    parcelamento = relationship("Parcelamento", back_populates="compra",
                                uselist=False, cascade="all, delete-orphan")


class ItemCompra(Base):
    """Um produto/item dentro de uma compra (linha da NF-e)."""
    __tablename__ = "itens_compra"
    id = Column(Integer, primary_key=True)
    compra_id = Column(Integer, ForeignKey("compras.id", ondelete="CASCADE"),
                       nullable=False, index=True)
    descricao = Column(String(200), nullable=False)
    quantidade = Column(Numeric(12, 3), default=1)
    valor_unitario = Column(Numeric(14, 2), nullable=True)
    valor_total = Column(Numeric(14, 2), nullable=False)
    categoria_id = Column(Integer, ForeignKey("categorias.id"), nullable=True)

    compra = relationship("Compra", back_populates="itens")
    categoria = relationship("Categoria")


class Parcelamento(Base):
    """
    Controle de parcelamento no cartão de crédito para uma compra.
    Guarda o cartão usado e o total de parcelas; as parcelas individuais
    ficam em ParcelaCartao.
    """
    __tablename__ = "parcelamentos"
    id = Column(Integer, primary_key=True)
    compra_id = Column(Integer, ForeignKey("compras.id", ondelete="CASCADE"),
                       nullable=False, unique=True, index=True)
    cartao_id = Column(Integer, ForeignKey("contas.id"), nullable=False)
    total_parcelas = Column(Integer, nullable=False)
    valor_parcela = Column(Numeric(14, 2), nullable=False)
    primeira_parcela_data = Column(Date, nullable=False)
    criado_em = Column(DateTime, default=datetime.utcnow)

    compra = relationship("Compra", back_populates="parcelamento")
    cartao = relationship("Conta")
    parcelas = relationship("ParcelaCartao", back_populates="parcelamento",
                            cascade="all, delete-orphan", order_by="ParcelaCartao.numero")

    @property
    def parcelas_pagas(self) -> int:
        return sum(1 for p in self.parcelas if p.paga)

    @property
    def parcelas_restantes(self) -> int:
        return self.total_parcelas - self.parcelas_pagas

    @property
    def valor_pago(self):
        return sum((p.valor for p in self.parcelas if p.paga), 0)

    @property
    def valor_restante(self):
        return sum((p.valor for p in self.parcelas if not p.paga), 0)


class ParcelaCartao(Base):
    """Uma parcela individual de um parcelamento no cartão."""
    __tablename__ = "parcelas_cartao"
    id = Column(Integer, primary_key=True)
    parcelamento_id = Column(Integer, ForeignKey("parcelamentos.id", ondelete="CASCADE"),
                             nullable=False, index=True)
    numero = Column(Integer, nullable=False)  # 1, 2, 3...
    valor = Column(Numeric(14, 2), nullable=False)
    data_vencimento = Column(Date, nullable=False, index=True)
    paga = Column(Boolean, default=False)
    data_pagamento = Column(Date, nullable=True)

    parcelamento = relationship("Parcelamento", back_populates="parcelas")

    @property
    def status(self) -> str:
        if self.paga:
            return "paga"
        if self.data_vencimento < date.today():
            return "atrasada"
        return "pendente"
