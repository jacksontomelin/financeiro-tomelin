"""Schemas Pydantic (entrada/saída da API)."""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict


# ---------- Auth ----------
class LoginIn(BaseModel):
    email: str
    senha: str


class TokenOut(BaseModel):
    token: str
    nome: str
    email: str
    ultimo_acesso: Optional[datetime] = None
    ultimo_acesso_ip: Optional[str] = None
    emoji: Optional[str] = None


# ---------- Conta ----------
class ContaIn(BaseModel):
    nome: str
    tipo: str = "banco"
    banco: Optional[str] = None
    saldo_inicial: Decimal = Decimal("0")
    cor: str = "#12395f"
    logo: Optional[str] = None
    ativo: bool = True


class ContaOut(ContaIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    saldo_atual: Optional[Decimal] = None


# ---------- Categoria ----------
class CategoriaIn(BaseModel):
    nome: str
    tipo: str  # receita | despesa
    cor: str = "#2f9e6f"
    icone: str = "tag"


class CategoriaOut(CategoriaIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Contato ----------
class ContatoIn(BaseModel):
    nome: str
    tipo: str = "cliente"
    documento: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    obs: Optional[str] = None
    logo: Optional[str] = None


class ContatoOut(ContatoIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Lançamento ----------
class LancamentoIn(BaseModel):
    descricao: str
    tipo: str  # receita | despesa
    valor: Decimal
    data_competencia: Optional[date] = None
    data_vencimento: Optional[date] = None
    data_pagamento: Optional[date] = None
    forma_pagamento: Optional[str] = None
    obs: Optional[str] = None
    juros: Decimal = Decimal("0")
    multa: Decimal = Decimal("0")
    recorrente: bool = False
    parcela: Optional[int] = None
    total_parcelas: Optional[int] = None
    categoria_id: Optional[int] = None
    contato_id: Optional[int] = None
    conta_id: Optional[int] = None


class LancamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    descricao: str
    tipo: str
    valor: Decimal
    data_competencia: Optional[date]
    data_vencimento: Optional[date]
    data_pagamento: Optional[date]
    forma_pagamento: Optional[str]
    obs: Optional[str]
    juros: Optional[Decimal] = None
    multa: Optional[Decimal] = None
    valor_total: Optional[Decimal] = None
    recorrente: bool
    parcela: Optional[int]
    total_parcelas: Optional[int]
    categoria_id: Optional[int]
    contato_id: Optional[int]
    conta_id: Optional[int]
    status: str
    categoria_nome: Optional[str] = None
    contato_nome: Optional[str] = None
    contato_logo: Optional[str] = None
    conta_nome: Optional[str] = None
    criado_em: Optional[datetime] = None


class BaixaIn(BaseModel):
    """Dar baixa (marcar como pago) num lançamento."""
    data_pagamento: Optional[date] = None
    conta_id: Optional[int] = None
    juros: Optional[Decimal] = None
    multa: Optional[Decimal] = None


# ---------- Veículo ----------
class VeiculoIn(BaseModel):
    nome: str
    marca: Optional[str] = None
    modelo: Optional[str] = None
    ano: Optional[str] = None
    placa: Optional[str] = None
    cor: Optional[str] = None
    km: Optional[int] = None
    tipo_valor: str = "fipe"           # fipe | fixo
    valor_fixo: Optional[Decimal] = None
    fipe_codigo: Optional[str] = None
    fipe_valor: Optional[Decimal] = None
    financiado: bool = False
    financiamento_banco: Optional[str] = None
    parcelas_total: Optional[int] = None
    parcelas_pagas: Optional[int] = None
    valor_parcela: Optional[Decimal] = None
    venc_dia: Optional[int] = None
    obs: Optional[str] = None
    extras: Optional[dict] = None
    cor_card: str = "#305C74"


class VeiculoOut(VeiculoIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    fipe_atualizado_em: Optional[date] = None
    valor_atual: Optional[Decimal] = None
    parcelas_restantes: Optional[int] = None
    saldo_financiamento: Optional[Decimal] = None
    patrimonio_liquido: Optional[Decimal] = None
