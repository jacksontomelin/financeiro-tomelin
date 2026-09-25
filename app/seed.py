"""Cria admin, categorias, contas e dados de exemplo (contexto familiar) no primeiro boot."""
import logging
from datetime import date, timedelta
from decimal import Decimal
from dateutil.relativedelta import relativedelta

from .database import SessionLocal
from .config import settings
from . import models
from .models import TipoMov
from .security import hash_senha

log = logging.getLogger("tomelin.seed")

# cores derivadas da paleta da logo (navy / aço / dourado / teal / sálvia / terracota)
CATEGORIAS = [
    ("Salário", TipoMov.receita, "#3E9079", "wallet"),
    ("Renda Extra", TipoMov.receita, "#2F817A", "trendUp"),
    ("13º / Férias", TipoMov.receita, "#5E9B86", "calendar"),
    ("Rendimentos", TipoMov.receita, "#256B64", "refresh"),
    ("Mercado", TipoMov.despesa, "#C9A94E", "cash"),
    ("Moradia", TipoMov.despesa, "#38648A", "bank"),
    ("Contas de Casa", TipoMov.despesa, "#2F817A", "bell"),
    ("Escola", TipoMov.despesa, "#B4503E", "doc"),
    ("Saúde", TipoMov.despesa, "#5E9B86", "alert"),
    ("Transporte", TipoMov.despesa, "#B8963B", "send"),
    ("Lazer", TipoMov.despesa, "#305C74", "eye"),
    ("Cartão de Crédito", TipoMov.despesa, "#7E8CA0", "tag"),
]

def _logo(txt, bg, fg="#ffffff"):
    """Gera um logo simples (SVG data URI) para os contatos de exemplo."""
    import base64
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">'
           f'<rect width="120" height="120" rx="26" fill="{bg}"/>'
           f'<text x="50%" y="50%" dy=".35em" text-anchor="middle" '
           f'font-family="Arial,Helvetica,sans-serif" font-size="58" font-weight="700" '
           f'fill="{fg}">{txt}</text></svg>')
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


CONTATOS = [
    ("Empresa (Salário)", "cliente", "Fonte de renda principal", _logo("E", "#082D51")),
    ("Supermercado Angeloni", "fornecedor", "", _logo("A", "#C0392B")),
    ("Escola das crianças", "fornecedor", "", _logo("E", "#2F817A")),
    ("Celesc / Águas", "fornecedor", "Luz e água", _logo("C", "#2E6DA4")),
    ("Plano de saúde", "fornecedor", "", _logo("+", "#3E9079")),
]


def seed():
    db = SessionLocal()
    try:
        if db.query(models.Usuario).count() == 0:
            db.add(models.Usuario(
                nome=settings.ADMIN_NOME, email=settings.ADMIN_EMAIL,
                senha_hash=hash_senha(settings.ADMIN_SENHA),
            ))
            log.info("Admin criado: %s", settings.ADMIN_EMAIL)

        if db.query(models.Categoria).count() == 0:
            for nome, tipo, cor, ico in CATEGORIAS:
                db.add(models.Categoria(nome=nome, tipo=tipo, cor=cor, icone=ico))
            log.info("Categorias padrão criadas")

        if db.query(models.Conta).count() == 0:
            db.add_all([
                models.Conta(nome="Conta Corrente", tipo="banco", banco="Banco",
                             saldo_inicial=Decimal("4200.00"), cor="#305C74"),
                models.Conta(nome="Poupança", tipo="banco", banco="Banco",
                             saldo_inicial=Decimal("15800.00"), cor="#C9A94E"),
                models.Conta(nome="Carteira", tipo="carteira",
                             saldo_inicial=Decimal("320.00"), cor="#3E9079"),
            ])
            log.info("Contas padrão criadas")

        if db.query(models.Contato).count() == 0:
            for nome, tipo, obs, logo in CONTATOS:
                db.add(models.Contato(nome=nome, tipo=tipo, obs=obs or None, logo=logo))
            log.info("Contatos de exemplo criados")

        if db.query(models.Veiculo).count() == 0:
            db.add_all([
                models.Veiculo(
                    nome="Corolla da família", marca="Toyota", modelo="Corolla XEI",
                    ano="2021/2022", placa="ABC1D23", cor="Prata", km=42000,
                    tipo_valor="fipe", fipe_codigo="038003-2", fipe_valor=Decimal("124800.00"),
                    fipe_atualizado_em=date.today(),
                    financiado=True, financiamento_banco="Banco", parcelas_total=48,
                    parcelas_pagas=19, valor_parcela=Decimal("1850.00"), venc_dia=10,
                    cor_card="#305C74",
                    extras={"Seguro": "Porto Seguro", "Renavam": "0123456789"},
                ),
                models.Veiculo(
                    nome="Moto do trabalho", marca="Honda", modelo="CG 160",
                    ano="2023/2023", placa="XYZ4E56", cor="Vermelha", km=8000,
                    tipo_valor="fixo", valor_fixo=Decimal("18500.00"),
                    financiado=False, cor_card="#B4503E",
                    extras={"Uso": "Deslocamento diário"},
                ),
            ])
            log.info("Veículos de exemplo criados")

        db.commit()

        if db.query(models.Lancamento).count() == 0:
            _demo(db)
            db.commit()
            log.info("Lançamentos de exemplo criados")
    finally:
        db.close()


def _demo(db):
    cats = {c.nome: c for c in db.query(models.Categoria).all()}
    contas = db.query(models.Conta).all()
    cc, poup, cart = contas[0], contas[1], contas[2]
    hoje = date.today()

    def add(desc, tipo, valor, cat, comp, venc=None, pago=None, conta=None, juros=0, multa=0):
        db.add(models.Lancamento(
            descricao=desc, tipo=tipo, valor=Decimal(str(valor)),
            categoria_id=cats[cat].id if cat in cats else None,
            data_competencia=comp, data_vencimento=venc, data_pagamento=pago,
            conta_id=(conta.id if conta else None),
            juros=Decimal(str(juros)), multa=Decimal(str(multa)),
        ))

    # histórico dos últimos 5 meses (já pagos)
    for i in range(5, 0, -1):
        m = hoje - relativedelta(months=i)
        r = m.strftime('%m/%Y')
        add(f"Salário — {r}", TipoMov.receita, 5800, "Salário", m, m, m, cc)
        add(f"Salário cônjuge — {r}", TipoMov.receita, 3200, "Salário", m, m, m, cc)
        add(f"Rendimento poupança — {r}", TipoMov.receita, 120 + i * 8, "Rendimentos", m, m, m, poup)
        add(f"Mercado do mês — {r}", TipoMov.despesa, 1450, "Mercado", m, m, m, cc)
        add(f"Prestação da casa — {r}", TipoMov.despesa, 1850, "Moradia", m, m, m, cc, juros=430)
        add(f"Luz, água e internet — {r}", TipoMov.despesa, 540, "Contas de Casa", m, m, m, cc)
        add(f"Mensalidade escolar — {r}", TipoMov.despesa, 980, "Escola", m, m, m, cc)
        add(f"Plano de saúde — {r}", TipoMov.despesa, 720, "Saúde", m, m, m, cc)
        add(f"Combustível / transporte — {r}", TipoMov.despesa, 600, "Transporte", m, m, m, cc)

    # mês corrente — já recebido/pago
    add("Salário — mês corrente", TipoMov.receita, 5800, "Salário", hoje, None, hoje, cc)
    add("Mercado (1ª quinzena)", TipoMov.despesa, 780, "Mercado", hoje, None, hoje, cc)
    add("Combustível", TipoMov.despesa, 320, "Transporte", hoje, None, hoje, cart)
    add("Cinema em família", TipoMov.despesa, 180, "Lazer", hoje, None, hoje, cart)

    # A RECEBER (pendentes) — alimentam o popup e os alertas
    add("Reembolso do convênio médico", TipoMov.receita, 340,
        "Rendimentos", hoje, hoje - timedelta(days=2))          # atrasado
    add("Vale / adiantamento", TipoMov.receita, 800,
        "Renda Extra", hoje, hoje + timedelta(days=1))           # vence amanhã
    add("Restituição do Imposto de Renda", TipoMov.receita, 1250,
        "Rendimentos", hoje, hoje + timedelta(days=5))

    # A PAGAR (pendentes)
    add("Conta de luz (Celesc)", TipoMov.despesa, 280,
        "Contas de Casa", hoje, hoje)                            # vence hoje
    add("Mensalidade escolar", TipoMov.despesa, 980,
        "Escola", hoje, hoje - timedelta(days=1), juros=12, multa=39)   # atrasado
    add("Prestação da casa (financiamento)", TipoMov.despesa, 1850,
        "Moradia", hoje, hoje + timedelta(days=2))
    add("Fatura do cartão", TipoMov.despesa, 2300,
        "Cartão de Crédito", hoje, hoje + timedelta(days=4), juros=180)
    add("Plano de saúde", TipoMov.despesa, 720,
        "Saúde", hoje, hoje + timedelta(days=6))
    add("Internet e telefone", TipoMov.despesa, 160,
        "Contas de Casa", hoje, hoje + timedelta(days=7))
