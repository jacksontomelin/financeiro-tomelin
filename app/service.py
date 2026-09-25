"""Regras financeiras: saldos, KPIs, vencimentos e resumos.
Usado tanto pela API (dashboard) quanto pela integração de WhatsApp."""
from datetime import date, timedelta
from decimal import Decimal
from calendar import monthrange

from sqlalchemy import func
from sqlalchemy.orm import Session
from dateutil.relativedelta import relativedelta

from . import models
from .models import TipoMov

D0 = Decimal("0")


def brl(v) -> str:
    v = Decimal(v or 0)
    s = f"{v:,.2f}"
    s = s.replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def saldo_conta(db: Session, conta: models.Conta) -> Decimal:
    q = (
        db.query(models.Lancamento.tipo, func.coalesce(func.sum(models.Lancamento.valor), 0))
        .filter(models.Lancamento.conta_id == conta.id,
                models.Lancamento.data_pagamento.isnot(None))
        .group_by(models.Lancamento.tipo)
    )
    saldo = Decimal(conta.saldo_inicial or 0)
    for tipo, total in q:
        if tipo == TipoMov.receita:
            saldo += Decimal(total)
        else:
            saldo -= Decimal(total)
    return saldo


def saldo_total(db: Session) -> Decimal:
    total = D0
    for c in db.query(models.Conta).filter(models.Conta.ativo.is_(True)).all():
        total += saldo_conta(db, c)
    # lançamentos pagos sem conta associada
    sem_conta = (
        db.query(models.Lancamento.tipo, func.coalesce(func.sum(models.Lancamento.valor), 0))
        .filter(models.Lancamento.conta_id.is_(None),
                models.Lancamento.data_pagamento.isnot(None))
        .group_by(models.Lancamento.tipo)
    )
    for tipo, val in sem_conta:
        total += Decimal(val) if tipo == TipoMov.receita else -Decimal(val)
    return total


def _range_mes(ref: date):
    ini = ref.replace(day=1)
    fim = ref.replace(day=monthrange(ref.year, ref.month)[1])
    return ini, fim


def kpis(db: Session, ref: date | None = None) -> dict:
    ref = ref or date.today()
    ini, fim = _range_mes(ref)
    hoje = date.today()

    def soma(tipo, **flt):
        q = db.query(func.coalesce(func.sum(models.Lancamento.valor), 0)).filter(
            models.Lancamento.tipo == tipo
        )
        if flt.get("pago") is True:
            q = q.filter(models.Lancamento.data_pagamento.isnot(None))
        if flt.get("pendente") is True:
            q = q.filter(models.Lancamento.data_pagamento.is_(None))
        if flt.get("mes"):
            q = q.filter(models.Lancamento.data_competencia >= ini,
                         models.Lancamento.data_competencia <= fim)
        if flt.get("vencido"):
            q = q.filter(models.Lancamento.data_pagamento.is_(None),
                         models.Lancamento.data_vencimento < hoje)
        return Decimal(q.scalar() or 0)

    return {
        "saldo": saldo_total(db),
        "receitas_mes": soma(TipoMov.receita, mes=True),
        "despesas_mes": soma(TipoMov.despesa, mes=True),
        "a_receber": soma(TipoMov.receita, pendente=True),
        "a_pagar": soma(TipoMov.despesa, pendente=True),
        "receber_vencido": soma(TipoMov.receita, vencido=True),
        "pagar_vencido": soma(TipoMov.despesa, vencido=True),
        "ref": ref.isoformat(),
    }


def fluxo_mensal(db: Session, meses: int = 6) -> list[dict]:
    hoje = date.today()
    linhas = []
    for i in range(meses - 1, -1, -1):
        alvo = hoje - relativedelta(months=i)
        ini, fim = _range_mes(alvo)
        rec = db.query(func.coalesce(func.sum(models.Lancamento.valor), 0)).filter(
            models.Lancamento.tipo == TipoMov.receita,
            models.Lancamento.data_competencia >= ini,
            models.Lancamento.data_competencia <= fim,
        ).scalar()
        des = db.query(func.coalesce(func.sum(models.Lancamento.valor), 0)).filter(
            models.Lancamento.tipo == TipoMov.despesa,
            models.Lancamento.data_competencia >= ini,
            models.Lancamento.data_competencia <= fim,
        ).scalar()
        nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
                 "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
        linhas.append({
            "label": f"{nomes[alvo.month - 1]}/{str(alvo.year)[2:]}",
            "receitas": float(rec or 0),
            "despesas": float(des or 0),
        })
    return linhas


def despesas_por_categoria(db: Session, ref: date | None = None) -> list[dict]:
    ref = ref or date.today()
    ini, fim = _range_mes(ref)
    q = (
        db.query(models.Categoria.nome, models.Categoria.cor,
                 func.coalesce(func.sum(models.Lancamento.valor), 0))
        .join(models.Lancamento, models.Lancamento.categoria_id == models.Categoria.id)
        .filter(models.Lancamento.tipo == TipoMov.despesa,
                models.Lancamento.data_competencia >= ini,
                models.Lancamento.data_competencia <= fim)
        .group_by(models.Categoria.nome, models.Categoria.cor)
        .order_by(func.sum(models.Lancamento.valor).desc())
    )
    return [{"nome": n, "cor": c, "valor": float(v or 0)} for n, c, v in q if v]


def vencimentos(db: Session, dias_antes: int = 3, incluir_atrasados: bool = True) -> dict:
    hoje = date.today()
    limite = hoje + timedelta(days=dias_antes)
    base = db.query(models.Lancamento).filter(
        models.Lancamento.data_pagamento.is_(None),
        models.Lancamento.data_vencimento.isnot(None),
    )
    atrasados = base.filter(models.Lancamento.data_vencimento < hoje) \
        .order_by(models.Lancamento.data_vencimento).all() if incluir_atrasados else []
    proximos = base.filter(models.Lancamento.data_vencimento >= hoje,
                           models.Lancamento.data_vencimento <= limite) \
        .order_by(models.Lancamento.data_vencimento).all()
    return {"atrasados": atrasados, "proximos": proximos, "hoje": hoje}


# ---------- Textos prontos para o WhatsApp ----------
def texto_saldo(db: Session) -> str:
    linhas = ["💰 *Saldo da família*", ""]
    for c in db.query(models.Conta).filter(models.Conta.ativo.is_(True)).all():
        linhas.append(f"• {c.nome}: {brl(saldo_conta(db, c))}")
    linhas.append("")
    linhas.append(f"*Total geral: {brl(saldo_total(db))}*")
    return "\n".join(linhas)


def texto_vencimentos(db: Session, dias_antes: int = 7) -> str:
    v = vencimentos(db, dias_antes=dias_antes)
    hoje = v["hoje"]
    linhas = ["📅 *Contas a vencer*", ""]
    if v["atrasados"]:
        linhas.append("⚠️ *Atrasados:*")
        for l in v["atrasados"]:
            dias = (hoje - l.data_vencimento).days
            ico = "🔴" if l.tipo == TipoMov.despesa else "🟠"
            linhas.append(f"{ico} {l.descricao} — {brl(l.valor)} (há {dias}d, venc. {l.data_vencimento.strftime('%d/%m')})")
        linhas.append("")
    if v["proximos"]:
        linhas.append(f"🔔 *Próximos {dias_antes} dias:*")
        for l in v["proximos"]:
            dias = (l.data_vencimento - hoje).days
            quando = "hoje" if dias == 0 else ("amanhã" if dias == 1 else f"em {dias}d")
            ico = "💸" if l.tipo == TipoMov.despesa else "💵"
            linhas.append(f"{ico} {l.descricao} — {brl(l.valor)} ({quando}, {l.data_vencimento.strftime('%d/%m')})")
    if not v["atrasados"] and not v["proximos"]:
        linhas.append("✅ Nenhum vencimento no período. Tudo em dia!")
    return "\n".join(linhas)


def texto_resumo_mes(db: Session) -> str:
    k = kpis(db)
    return "\n".join([
        "📊 *Resumo do mês*", "",
        f"📈 Receitas: {brl(k['receitas_mes'])}",
        f"📉 Despesas: {brl(k['despesas_mes'])}",
        f"💰 Saldo atual: {brl(k['saldo'])}", "",
        f"💵 A receber: {brl(k['a_receber'])}",
        f"💸 A pagar: {brl(k['a_pagar'])}",
        f"⚠️ Vencidos a pagar: {brl(k['pagar_vencido'])}",
    ])


def texto_a_pagar(db: Session) -> str:
    itens = db.query(models.Lancamento).filter(
        models.Lancamento.tipo == TipoMov.despesa,
        models.Lancamento.data_pagamento.is_(None),
    ).order_by(models.Lancamento.data_vencimento).limit(20).all()
    if not itens:
        return "✅ Não há contas a pagar pendentes."
    linhas = ["💸 *Contas a pagar*", ""]
    total = D0
    for l in itens:
        total += Decimal(l.valor)
        venc = l.data_vencimento.strftime("%d/%m") if l.data_vencimento else "s/ venc."
        linhas.append(f"• {l.descricao} — {brl(l.valor)} (venc. {venc})")
    linhas.append("")
    linhas.append(f"*Total: {brl(total)}*")
    return "\n".join(linhas)


def texto_a_receber(db: Session) -> str:
    itens = db.query(models.Lancamento).filter(
        models.Lancamento.tipo == TipoMov.receita,
        models.Lancamento.data_pagamento.is_(None),
    ).order_by(models.Lancamento.data_vencimento).limit(20).all()
    if not itens:
        return "✅ Não há contas a receber pendentes."
    linhas = ["💵 *Contas a receber*", ""]
    total = D0
    for l in itens:
        total += Decimal(l.valor)
        venc = l.data_vencimento.strftime("%d/%m") if l.data_vencimento else "s/ venc."
        linhas.append(f"• {l.descricao} — {brl(l.valor)} (venc. {venc})")
    linhas.append("")
    linhas.append(f"*Total: {brl(total)}*")
    return "\n".join(linhas)


# ==========================================================================
#  Juros, balancete, patrimônio e projeções
# ==========================================================================
def juros_resumo(db: Session, ref: date | None = None) -> dict:
    ref = ref or date.today()
    ini, fim = _range_mes(ref)
    ini_ano = ref.replace(month=1, day=1)

    def soma_juros(**flt):
        q = db.query(func.coalesce(func.sum(models.Lancamento.juros), 0))
        if flt.get("mes"):
            q = q.filter(models.Lancamento.data_competencia >= ini,
                         models.Lancamento.data_competencia <= fim)
        if flt.get("ano"):
            q = q.filter(models.Lancamento.data_competencia >= ini_ano)
        if flt.get("pago"):
            q = q.filter(models.Lancamento.data_pagamento.isnot(None))
        if flt.get("pendente"):
            q = q.filter(models.Lancamento.data_pagamento.is_(None))
        return Decimal(q.scalar() or 0)

    return {
        "juros_mes": soma_juros(mes=True),
        "juros_ano": soma_juros(ano=True),
        "juros_pago_ano": soma_juros(ano=True, pago=True),
        "juros_a_pagar": soma_juros(pendente=True),
        "multa_ano": Decimal(
            db.query(func.coalesce(func.sum(models.Lancamento.multa), 0))
            .filter(models.Lancamento.data_competencia >= ini_ano).scalar() or 0),
    }


def balancete(db: Session, de: date, ate: date) -> dict:
    def por_cat(tipo):
        q = (db.query(models.Categoria.nome,
                      func.coalesce(func.sum(models.Lancamento.valor), 0))
             .join(models.Lancamento, models.Lancamento.categoria_id == models.Categoria.id)
             .filter(models.Lancamento.tipo == tipo,
                     models.Lancamento.data_competencia >= de,
                     models.Lancamento.data_competencia <= ate)
             .group_by(models.Categoria.nome)
             .order_by(func.sum(models.Lancamento.valor).desc()))
        itens = [(n, float(v or 0)) for n, v in q if v]
        # sem categoria
        semcat = db.query(func.coalesce(func.sum(models.Lancamento.valor), 0)).filter(
            models.Lancamento.tipo == tipo,
            models.Lancamento.categoria_id.is_(None),
            models.Lancamento.data_competencia >= de,
            models.Lancamento.data_competencia <= ate).scalar()
        if semcat:
            itens.append(("Sem categoria", float(semcat)))
        return itens

    receitas = por_cat(TipoMov.receita)
    despesas = por_cat(TipoMov.despesa)
    tot_rec = sum(v for _, v in receitas)
    tot_desp = sum(v for _, v in despesas)
    juros = float(db.query(func.coalesce(func.sum(models.Lancamento.juros), 0)).filter(
        models.Lancamento.data_competencia >= de,
        models.Lancamento.data_competencia <= ate).scalar() or 0)
    return {"receitas": receitas, "despesas": despesas,
            "total_receitas": tot_rec, "total_despesas": tot_desp,
            "resultado": tot_rec - tot_desp, "juros": juros}


def patrimonio(db: Session) -> dict:
    contas = []
    total_contas = D0
    for c in db.query(models.Conta).filter(models.Conta.ativo.is_(True)).all():
        s = saldo_conta(db, c)
        contas.append({"nome": c.nome, "saldo": float(s), "cor": c.cor})
        total_contas += s
    veiculos = []
    total_veic = D0
    total_financ = D0
    for v in db.query(models.Veiculo).filter(models.Veiculo.ativo.is_(True)).all():
        val = Decimal(v.valor_atual or 0)
        fin = Decimal(v.saldo_financiamento or 0)
        veiculos.append({
            "id": v.id, "nome": v.nome, "valor": float(val),
            "financiamento": float(fin), "liquido": float(val - fin),
            "parcelas_restantes": v.parcelas_restantes,
            "parcelas_total": v.parcelas_total, "cor": v.cor_card,
            "tipo_valor": v.tipo_valor,
        })
        total_veic += val
        total_financ += fin
    ativos = total_contas + total_veic
    return {
        "contas": contas, "veiculos": veiculos,
        "total_contas": float(total_contas), "total_veiculos": float(total_veic),
        "total_financiamentos": float(total_financ),
        "ativos": float(ativos), "passivos": float(total_financ),
        "patrimonio_liquido": float(ativos - total_financ),
    }


def projecao(db: Session, meses: int = 6) -> list[dict]:
    hist = fluxo_mensal(db, 3)
    media_rec = sum(h["receitas"] for h in hist) / max(1, len(hist))
    media_desp = sum(h["despesas"] for h in hist) / max(1, len(hist))
    saldo = float(saldo_total(db))
    hoje = date.today()
    nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
             "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    linhas = []
    for i in range(1, meses + 1):
        alvo = hoje + relativedelta(months=i)
        ini, fim = _range_mes(alvo)
        # pendentes já agendados para o mês entram no lugar da média
        pend_rec = float(db.query(func.coalesce(func.sum(models.Lancamento.valor), 0)).filter(
            models.Lancamento.tipo == TipoMov.receita,
            models.Lancamento.data_pagamento.is_(None),
            models.Lancamento.data_vencimento >= ini,
            models.Lancamento.data_vencimento <= fim).scalar() or 0)
        pend_desp = float(db.query(func.coalesce(func.sum(models.Lancamento.valor), 0)).filter(
            models.Lancamento.tipo == TipoMov.despesa,
            models.Lancamento.data_pagamento.is_(None),
            models.Lancamento.data_vencimento >= ini,
            models.Lancamento.data_vencimento <= fim).scalar() or 0)
        rec = max(pend_rec, media_rec)
        desp = max(pend_desp, media_desp)
        saldo += rec - desp
        linhas.append({"label": f"{nomes[alvo.month - 1]}/{str(alvo.year)[2:]}",
                       "receitas": rec, "despesas": desp, "saldo": saldo})
    return linhas


# ---------- Textos WhatsApp adicionais ----------
def texto_patrimonio(db: Session) -> str:
    p = patrimonio(db)
    linhas = ["🏠 *Patrimônio da família*", ""]
    linhas.append(f"💰 Contas: {brl(p['total_contas'])}")
    if p["veiculos"]:
        linhas.append(f"🚗 Veículos: {brl(p['total_veiculos'])}")
        for v in p["veiculos"]:
            extra = ""
            if v["parcelas_total"]:
                extra = f" ({v['parcelas_restantes']}/{v['parcelas_total']} parc.)"
            linhas.append(f"   • {v['nome']}: {brl(v['valor'])}{extra}")
    if p["total_financiamentos"]:
        linhas.append(f"📉 Falta pagar (financ.): {brl(p['total_financiamentos'])}")
    linhas.append("")
    linhas.append(f"*Patrimônio líquido: {brl(p['patrimonio_liquido'])}*")
    return "\n".join(linhas)


def texto_juros(db: Session) -> str:
    j = juros_resumo(db)
    return "\n".join([
        "📈 *Juros e multas*", "",
        f"Juros pagos no ano: {brl(j['juros_pago_ano'])}",
        f"Juros no mês: {brl(j['juros_mes'])}",
        f"Juros ainda a pagar: {brl(j['juros_a_pagar'])}",
        f"Multas no ano: {brl(j['multa_ano'])}",
    ])


def texto_recibo(l, categoria="", conta="", contato="") -> str:
    tipo = "Recebimento" if l.tipo == TipoMov.receita else "Pagamento"
    linhas = [f"🧾 *Recibo de {tipo}* — nº {l.id:04d}", "",
              f"*{l.descricao}*"]
    if categoria:
        linhas.append(f"Categoria: {categoria}")
    if l.data_pagamento:
        linhas.append(f"Pago em: {l.data_pagamento.strftime('%d/%m/%Y')}")
    elif l.data_vencimento:
        linhas.append(f"Vence em: {l.data_vencimento.strftime('%d/%m/%Y')}")
    if conta:
        linhas.append(f"Conta: {conta}")
    if contato:
        linhas.append(("Recebido de: " if l.tipo == TipoMov.receita else "Pago para: ") + contato)
    linhas.append("")
    linhas.append(f"Valor: {brl(l.valor)}")
    if l.juros:
        linhas.append(f"Juros: {brl(l.juros)}")
    if l.multa:
        linhas.append(f"Multa: {brl(l.multa)}")
    linhas.append(f"*Total: {brl(l.valor_total)}*")
    return "\n".join(linhas)


def texto_fechamento_dia(db: Session, ref: date | None = None) -> str | None:
    """Resumo dos lançamentos pagos/recebidos no dia. Retorna None se não houve nada."""
    ref = ref or date.today()
    pagos = db.query(models.Lancamento).filter(
        models.Lancamento.data_pagamento == ref
    ).order_by(models.Lancamento.tipo).all()
    if not pagos:
        return None
    despesas = [l for l in pagos if l.tipo == TipoMov.despesa]
    receitas = [l for l in pagos if l.tipo == TipoMov.receita]
    linhas = [f"📒 *Fechamento do dia {ref.strftime('%d/%m/%Y')}*", ""]
    tot_desp = D0
    tot_juros = D0
    if despesas:
        linhas.append("💸 *Contas pagas:*")
        for l in despesas:
            tot_desp += Decimal(l.valor_total)
            tot_juros += Decimal(l.juros or 0)
            extra = f" (+{brl(l.juros)} juros)" if l.juros else ""
            linhas.append(f"✅ {l.descricao} — {brl(l.valor_total)}{extra}")
        linhas.append(f"   _Total pago: {brl(tot_desp)}_")
        linhas.append("")
    tot_rec = D0
    if receitas:
        linhas.append("💵 *Recebimentos:*")
        for l in receitas:
            tot_rec += Decimal(l.valor_total)
            linhas.append(f"✅ {l.descricao} — {brl(l.valor_total)}")
        linhas.append(f"   _Total recebido: {brl(tot_rec)}_")
        linhas.append("")
    linhas.append(f"💰 Saldo atual: {brl(saldo_total(db))}")
    if tot_juros:
        linhas.append(f"📈 Juros pagos hoje: {brl(tot_juros)}")
    return "\n".join(linhas)
