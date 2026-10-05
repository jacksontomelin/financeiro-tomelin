"""Dados de exemplo para testar o sistema antes de usar de verdade.

Tudo o que é criado aqui fica anotado na tabela registros_exemplo, então
"Apagar dados de exemplo" remove exatamente isso e nada do que a família
lançou. "Zerar" apaga os dados financeiros inteiros (para começar do zero).
"""
import random
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import Session

from .database import Base
from . import models, recorrencia
from .models import TipoMov


class RegistroExemplo(Base):
    __tablename__ = "registros_exemplo"
    id = Column(Integer, primary_key=True)
    tabela = Column(String(40), nullable=False, index=True)
    registro_id = Column(Integer, nullable=False)
    extra = Column(Text, nullable=True)        # valor anterior (ex.: limite do orçamento) para devolver


def _dia(a, m, d):
    return date(a, m, min(d, monthrange(a, m)[1]))


def _mes(base: date, k: int):
    m = base.month - 1 + k
    return base.year + m // 12, m % 12 + 1


def quantos(db: Session) -> int:
    return db.query(RegistroExemplo).count()


def carregar(db: Session, hoje: date | None = None) -> dict:
    if quantos(db):
        raise ValueError("Os dados de exemplo já estão carregados. Apague antes de carregar de novo.")
    hoje = hoje or date.today()
    rnd = random.Random(42)
    criados = {}

    def marca(obj, tabela, extra=None):
        db.flush()
        db.add(RegistroExemplo(tabela=tabela, registro_id=obj.id, extra=extra))
        criados[tabela] = criados.get(tabela, 0) + 1
        return obj

    def novo(obj, tabela):
        db.add(obj); return marca(obj, tabela)

    # categorias: usa as existentes pelo nome; cria só as que faltarem
    cats = {c.nome: c for c in db.query(models.Categoria).all()}
    def cat(nome, tipo, cor, icone):
        if nome not in cats:
            cats[nome] = novo(models.Categoria(nome=nome, tipo=tipo, cor=cor, icone=icone), "categorias")
        return cats[nome]
    C = {
        "salario": cat("Salário", TipoMov.receita, "#2F817A", "cash"),
        "extra": cat("Renda Extra", TipoMov.receita, "#3EA88A", "trendUp"),
        "moradia": cat("Moradia", TipoMov.despesa, "#38648A", "home"),
        "mercado": cat("Mercado", TipoMov.despesa, "#C9A94E", "cash"),
        "escola": cat("Escola", TipoMov.despesa, "#C9573F", "doc"),
        "casa": cat("Contas de Casa", TipoMov.despesa, "#2F817A", "bell"),
        "saude": cat("Saúde", TipoMov.despesa, "#3EA88A", "heart"),
        "transporte": cat("Transporte", TipoMov.despesa, "#B8923A", "car"),
        "lazer": cat("Lazer", TipoMov.despesa, "#305C74", "star"),
        "assin": cat("Assinaturas", TipoMov.despesa, "#7F3F98", "repeat"),
        "pets": cat("Pets", TipoMov.despesa, "#A0285F", "heart"),
    }

    # contas e cartões
    cc = novo(models.Conta(nome="Conta Corrente (exemplo)", tipo="banco", banco="Banco do Bairro", saldo_inicial=Decimal("3200"), cor="#305C74"), "contas")
    poup = novo(models.Conta(nome="Poupança (exemplo)", tipo="banco", banco="Banco do Bairro", saldo_inicial=Decimal("12500"), cor="#C9A94E"), "contas")
    cart = novo(models.Conta(nome="Carteira (exemplo)", tipo="carteira", saldo_inicial=Decimal("250"), cor="#3E9079"), "contas")
    cartao1 = novo(models.Conta(nome="Cartão Roxo (exemplo)", tipo="cartao", banco="Banco Digital", cor="#7F3F98", bandeira="master",
                                final_cartao="4417", limite=Decimal("6000"), dia_fechamento=3, dia_vencimento=10, saldo_inicial=0), "contas")
    cartao2 = novo(models.Conta(nome="Cartão Verde (exemplo)", tipo="cartao", banco="Cooperativa", cor="#1F6F5C", bandeira="visa",
                                final_cartao="0932", limite=Decimal("12000"), dia_fechamento=20, dia_vencimento=28, saldo_inicial=0), "contas")

    # contatos
    def contato(nome, tipo, tel=""):
        return novo(models.Contato(nome=nome, tipo=tipo, telefone=tel or None, obs="Contato de exemplo"), "contatos")
    K = {k: contato(*v) for k, v in {
        "empresa": ("Empresa Onde Trabalho (exemplo)", "empresa"), "imob": ("Imobiliária Vale Verde (exemplo)", "empresa", "(47) 3300-0000"),
        "escola": ("Escola Aprender (exemplo)", "empresa"), "luz": ("Companhia de Energia (exemplo)", "empresa"),
        "agua": ("Serviço de Água (exemplo)", "empresa"), "mercado": ("Supermercado do Centro (exemplo)", "empresa"),
        "farmacia": ("Farmácia Saúde (exemplo)", "empresa"), "posto": ("Posto da Esquina (exemplo)", "empresa"),
        "cliente": ("Cliente de Freelance (exemplo)", "pessoa", "(47) 99999-0000"),
    }.items()}

    def lanc(desc, tipo, valor, venc, pago=True, catk=None, conta=None, contato_k=None, juros=0, multa=0, rec=None, obs=None):
        l = models.Lancamento(descricao=desc, tipo=tipo, valor=Decimal(str(round(valor, 2))), data_competencia=venc, data_vencimento=venc,
                              data_pagamento=(venc if pago is True else (pago or None)), categoria_id=C[catk].id if catk else None,
                              conta_id=(conta or cc).id, contato_id=K[contato_k].id if contato_k else None,
                              juros=Decimal(str(juros)), multa=Decimal(str(multa)), recorrente=bool(rec),
                              recorrencia_id=rec.id if rec else None, obs=obs)
        return novo(l, "lancamentos")

    # repetições (salário, aluguel, escola, internet, streaming): 6 meses de histórico pagos + próximas geradas
    inicio = _dia(*_mes(hoje, -6), 1)
    regras = [("Salário", TipoMov.receita, 6200, 5, "salario", "empresa"), ("Aluguel", TipoMov.despesa, 1850, 10, "moradia", "imob"),
              ("Mensalidade escolar", TipoMov.despesa, 980, 8, "escola", "escola"), ("Internet fibra", TipoMov.despesa, 119.9, 15, "casa", None),
              ("Streaming de filmes", TipoMov.despesa, 55.9, 20, "assin", None)]
    for desc, tipo, val, dia, ck, ctk in regras:
        r = novo(models.Recorrencia(descricao=desc, tipo=tipo, valor=Decimal(str(val)), frequencia="mensal", dia=dia, inicio=_dia(inicio.year, inicio.month, dia),
                                    categoria_id=C[ck].id, conta_id=cc.id, contato_id=K[ctk].id if ctk else None), "recorrencias")
        ultima = None
        for k in range(-6, 1):
            v = _dia(*_mes(hoje, k), dia)
            if v > hoje + timedelta(days=62):
                break
            pago = v < hoje - timedelta(days=1) or (k < 0)
            lanc(desc, tipo, val, v, pago=True if pago else None, catk=ck, contato_k=ctk, rec=r)
            ultima = v
        r.ultima = ultima

    # gastos do dia a dia, variando mês a mês
    for k in range(-5, 1):
        a, m = _mes(hoje, k)
        for d in (4, 12, 19, 26):
            v = _dia(a, m, d)
            if v > hoje: continue
            lanc("Mercado da semana", TipoMov.despesa, rnd.uniform(260, 430), v, catk="mercado", contato_k="mercado")
        for d in (7, 22):
            v = _dia(a, m, d)
            if v > hoje: continue
            lanc("Combustível", TipoMov.despesa, rnd.uniform(180, 260), v, catk="transporte", contato_k="posto", conta=cart if d == 22 else cc)
        v = _dia(a, m, 14)
        if v <= hoje:
            lanc("Farmácia", TipoMov.despesa, rnd.uniform(60, 190), v, catk="saude", contato_k="farmacia")
            lanc("Ração e petshop", TipoMov.despesa, rnd.uniform(90, 160), v, catk="pets")
        v = _dia(a, m, 18)
        if v <= hoje:
            lanc(rnd.choice(["Cinema em família", "Pizza de sexta", "Passeio no parque", "Aniversário do amigo"]), TipoMov.despesa,
                 rnd.uniform(80, 220), v, catk="lazer", conta=cart)
        if k < 0:
            lanc("Conta de luz", TipoMov.despesa, rnd.uniform(210, 320), _dia(a, m, 12), catk="casa", contato_k="luz")
            lanc("Conta de água", TipoMov.despesa, rnd.uniform(70, 110), _dia(a, m, 16), catk="casa", contato_k="agua")
        if k in (-4, -2, 0):
            v = _dia(a, m, 25)
            if v <= hoje:
                lanc("Projeto de freelance", TipoMov.receita, rnd.choice([800, 1200, 1500]), v, catk="extra", contato_k="cliente")

    # pendências: atrasadas, de hoje e dos próximos dias
    lanc("Conta de luz", TipoMov.despesa, 298.4, hoje - timedelta(days=6), pago=None, catk="casa", contato_k="luz",
         obs="Exemplo de conta atrasada")
    lanc("IPVA parcela", TipoMov.despesa, 412.0, hoje - timedelta(days=3), pago=None, catk="transporte", multa=8.24, juros=4.10)
    lanc("Reembolso do plano de saúde", TipoMov.receita, 340.0, hoje - timedelta(days=2), pago=None, catk="extra")
    lanc("Conta de água", TipoMov.despesa, 89.9, hoje, pago=None, catk="casa", contato_k="agua")
    lanc("Dentista", TipoMov.despesa, 250.0, hoje + timedelta(days=2), pago=None, catk="saude")
    lanc("Venda no marketplace", TipoMov.receita, 450.0, hoje + timedelta(days=4), pago=None, catk="extra")
    lanc("Revisão do carro", TipoMov.despesa, 680.0, hoje + timedelta(days=9), pago=None, catk="transporte", contato_k="posto")
    lanc("Seguro residencial", TipoMov.despesa, 920.0, hoje + timedelta(days=20), pago=None, catk="moradia")

    # compras parceladas nos cartões
    def parcelada(desc, total, n, cartao, primeira, loja):
        l = lanc(desc, TipoMov.despesa, total, primeira, pago=True, catk="casa", conta=cartao)
        cp = novo(models.Compra(lancamento_id=l.id, estabelecimento=loja, data_emissao=primeira), "compras")
        pm = novo(models.Parcelamento(compra_id=cp.id, cartao_id=cartao.id, total_parcelas=n, valor_parcela=Decimal(str(round(total / n, 2))),
                                      primeira_parcela_data=primeira), "parcelamentos")
        for i in range(n):
            v = _dia(*_mes(primeira, i), primeira.day)
            novo(models.ParcelaCartao(parcelamento_id=pm.id, numero=i + 1, valor=Decimal(str(round(total / n, 2))), data_vencimento=v,
                                      paga=v < hoje, data_pagamento=v if v < hoje else None), "parcelas_cartao")
    parcelada("Geladeira nova", 3600, 10, cartao1, _dia(*_mes(hoje, -3), 10), "Loja de Eletro (exemplo)")
    parcelada("Notebook para estudos", 4800, 6, cartao2, _dia(*_mes(hoje, -1), 28), "Loja de Informática (exemplo)")
    parcelada("Tênis de corrida", 540, 3, cartao1, _dia(*_mes(hoje, 0), 10), "Loja de Esportes (exemplo)")

    # transferências para a poupança
    for k in (-3, -2, -1):
        a, m = _mes(hoje, k)
        novo(models.Transferencia(data=_dia(a, m, 6), valor=Decimal("500"), conta_origem_id=cc.id, conta_destino_id=poup.id,
                                  descricao="Reserva do mês"), "transferencias")

    # metas e veículos
    for nome, alvo, atual, cor, ic, meses in (("Viagem para a praia", 8000, 5200, "#2F817A", "praia", 5),
                                             ("Reserva de emergência", 20000, 9300, "#C9A94E", "reserva", 12),
                                             ("Bicicleta nova", 2500, 2500, "#A0285F", "bike", 0)):
        novo(models.Meta(nome=f"{nome} (exemplo)", valor_alvo=Decimal(alvo), valor_atual=Decimal(atual), cor=cor, icone=ic,
                         prazo=_dia(*_mes(hoje, meses), 28) if meses else None, concluida=atual >= alvo), "metas")
    novo(models.Veiculo(nome="Carro da família (exemplo)", marca="Exemplo", modelo="Sedã 2.0", ano="2021/2022", placa="EXE1A23", cor="Prata",
                        km=42000, tipo_valor="fixo", valor_fixo=Decimal("98000"), financiado=True, financiamento_banco="Banco do Bairro",
                        parcelas_total=48, parcelas_pagas=20, valor_parcela=Decimal("1650"), venc_dia=12, cor_card="#305C74"), "veiculos")
    novo(models.Veiculo(nome="Moto (exemplo)", marca="Exemplo", modelo="160 cc", ano="2023/2023", placa="EXE4B56", cor="Vermelha",
                        km=9000, tipo_valor="fixo", valor_fixo=Decimal("17500"), financiado=False, cor_card="#B4503E"), "veiculos")

    # orçamento: limites em algumas categorias (guarda o valor anterior para devolver depois)
    for ck, lim in (("mercado", 1300), ("lazer", 250), ("saude", 400), ("transporte", 900), ("pets", 200)):
        c = C[ck]
        marca(c, "orcamento", extra=str(c.orcamento_mensal) if c.orcamento_mensal is not None else "")
        c.orcamento_mensal = Decimal(lim)

    db.commit()
    criados["lancamentos_futuros"] = recorrencia.gerar(db, hoje)
    # as ocorrências futuras geradas pelas repetições de exemplo também são de exemplo
    ids_rec = [r.registro_id for r in db.query(RegistroExemplo).filter(RegistroExemplo.tabela == "recorrencias")]
    marcados = {r.registro_id for r in db.query(RegistroExemplo).filter(RegistroExemplo.tabela == "lancamentos")}
    for l in db.query(models.Lancamento).filter(models.Lancamento.recorrencia_id.in_(ids_rec)):
        if l.id not in marcados:
            db.add(RegistroExemplo(tabela="lancamentos", registro_id=l.id))
    db.commit()
    return criados


# ordem de remoção (filhos antes dos pais)
_ORDEM = [("parcelas_cartao", models.ParcelaCartao), ("parcelamentos", models.Parcelamento), ("compras", models.Compra),
          ("transferencias", models.Transferencia), ("lancamentos", models.Lancamento), ("recorrencias", models.Recorrencia),
          ("metas", models.Meta), ("veiculos", models.Veiculo), ("contatos", models.Contato), ("contas", models.Conta),
          ("categorias", models.Categoria)]


def apagar(db: Session) -> int:
    regs = db.query(RegistroExemplo).all()
    por = {}
    for r in regs:
        por.setdefault(r.tabela, []).append(r)
    total = 0
    for r in por.get("orcamento", []):                    # devolve os limites que existiam antes
        c = db.get(models.Categoria, r.registro_id)
        if c:
            c.orcamento_mensal = Decimal(r.extra) if r.extra else None
    db.flush()                                          # grava os limites devolvidos antes das remoções em lote
    for tabela, modelo in _ORDEM:
        ids = [r.registro_id for r in por.get(tabela, [])]
        if not ids:
            continue
        if tabela == "lancamentos":
            db.query(models.Anexo).filter(models.Anexo.lancamento_id.in_(ids)).delete(synchronize_session=False)
            db.query(models.ItemCompra).filter(models.ItemCompra.compra_id.in_(
                db.query(models.Compra.id).filter(models.Compra.lancamento_id.in_(ids)))).delete(synchronize_session=False)
        if tabela == "compras":
            db.query(models.ItemCompra).filter(models.ItemCompra.compra_id.in_(ids)).delete(synchronize_session=False)
        if tabela == "categorias":                          # só apaga se nada mais usa
            usados = {i for (i,) in db.query(models.Lancamento.categoria_id).filter(models.Lancamento.categoria_id.in_(ids)).distinct()}
            ids = [i for i in ids if i not in usados]
        total += db.query(modelo).filter(modelo.id.in_(ids)).delete(synchronize_session=False)
    db.query(RegistroExemplo).delete()
    db.commit()
    return total


def zerar(db: Session) -> dict:
    """Apaga os dados financeiros (para começar de verdade). Mantém usuários, categorias e configurações."""
    cont = {}
    for nome, modelo in [("comprovantes", models.Anexo), ("itens de compra", models.ItemCompra), ("parcelas", models.ParcelaCartao),
                         ("parcelamentos", models.Parcelamento), ("compras", models.Compra), ("transferências", models.Transferencia),
                         ("lançamentos", models.Lancamento), ("repetições", models.Recorrencia), ("metas", models.Meta),
                         ("veículos", models.Veiculo), ("contatos", models.Contato), ("contas", models.Conta)]:
        cont[nome] = db.query(modelo).delete(synchronize_session=False)
    for c in db.query(models.Categoria).all():
        c.orcamento_mensal = None
    db.query(RegistroExemplo).delete()
    db.commit()
    return cont
