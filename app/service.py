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
    # transferências entre contas: entram no destino, saem da origem
    T = models.Transferencia
    entrou = db.query(func.coalesce(func.sum(T.valor), 0)).filter(T.conta_destino_id == conta.id).scalar()
    saiu = db.query(func.coalesce(func.sum(T.valor), 0)).filter(T.conta_origem_id == conta.id).scalar()
    return saldo + Decimal(entrou or 0) - Decimal(saiu or 0)


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
        db.query(models.Categoria.id, models.Categoria.nome, models.Categoria.cor,
                 func.coalesce(func.sum(models.Lancamento.valor), 0))
        .join(models.Lancamento, models.Lancamento.categoria_id == models.Categoria.id)
        .filter(models.Lancamento.tipo == TipoMov.despesa,
                models.Lancamento.data_competencia >= ini,
                models.Lancamento.data_competencia <= fim)
        .group_by(models.Categoria.id, models.Categoria.nome, models.Categoria.cor)
        .order_by(func.sum(models.Lancamento.valor).desc())
    )
    return [{"id": i, "nome": n, "cor": c, "valor": float(v or 0)} for i, n, c, v in q if v]


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


def _quem(l) -> str:
    """ · 👤 Jackson, quando a conta tem responsável."""
    return f" · 👤 {l.responsavel.nome.split()[0]}" if getattr(l, "responsavel", None) else ""


def por_responsavel(db: Session, de: date, ate: date) -> list[dict]:
    """Quanto cada pessoa pagou, recebeu e tem a pagar no período (competência)."""
    rows = (db.query(models.Lancamento.responsavel_id, models.Lancamento.tipo,
                     models.Lancamento.data_pagamento.isnot(None), func.coalesce(func.sum(models.Lancamento.valor), 0),
                     func.count())
            .filter(models.Lancamento.data_competencia >= de, models.Lancamento.data_competencia <= ate)
            .group_by(models.Lancamento.responsavel_id, models.Lancamento.tipo, models.Lancamento.data_pagamento.isnot(None))
            .all())
    nomes = {u.id: u.nome for u in db.query(models.Usuario).all()}
    out = {}
    for uid, tipo, pago, total, qtd in rows:
        p = out.setdefault(uid, {"responsavel_id": uid, "nome": nomes.get(uid, "Sem responsável") if uid else "Sem responsável",
                                 "pago": 0.0, "a_pagar": 0.0, "recebido": 0.0, "a_receber": 0.0, "qtd": 0})
        chave = ("pago" if pago else "a_pagar") if tipo == TipoMov.despesa else ("recebido" if pago else "a_receber")
        p[chave] += float(total); p["qtd"] += qtd
    return sorted(out.values(), key=lambda p: (p["responsavel_id"] is None, -(p["pago"] + p["a_pagar"])))


def texto_por_responsavel(db: Session) -> str:
    ini, fim = _range_mes(date.today())
    pessoas = por_responsavel(db, ini, fim)
    if not pessoas:
        return "📭 Nenhum lançamento neste mês."
    linhas = ["👥 *Quem paga o quê: este mês*", ""]
    for p in pessoas:
        linhas.append(f"👤 *{p['nome']}*")
        linhas.append(f"   Pagou {brl(p['pago'])} · falta pagar {brl(p['a_pagar'])}")
        if p["recebido"] or p["a_receber"]:
            linhas.append(f"   Recebeu {brl(p['recebido'])} · a receber {brl(p['a_receber'])}")
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
            linhas.append(f"{ico} {l.descricao}: {brl(l.valor)} (há {dias}d, venc. {l.data_vencimento.strftime('%d/%m')}){_quem(l)}")
        linhas.append("")
    if v["proximos"]:
        linhas.append(f"🔔 *Próximos {dias_antes} dias:*")
        for l in v["proximos"]:
            dias = (l.data_vencimento - hoje).days
            quando = "hoje" if dias == 0 else ("amanhã" if dias == 1 else f"em {dias}d")
            ico = "💸" if l.tipo == TipoMov.despesa else "💵"
            linhas.append(f"{ico} {l.descricao}: {brl(l.valor)} ({quando}, {l.data_vencimento.strftime('%d/%m')}){_quem(l)}")
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
        linhas.append(f"• {l.descricao}: {brl(l.valor)} (venc. {venc})")
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
        linhas.append(f"• {l.descricao}: {brl(l.valor)} (venc. {venc})")
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
    linhas = [f"🧾 *Recibo de {tipo}*, nº {l.id:04d}", "",
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
            linhas.append(f"✅ {l.descricao}: {brl(l.valor_total)}{extra}")
        linhas.append(f"   _Total pago: {brl(tot_desp)}_")
        linhas.append("")
    tot_rec = D0
    if receitas:
        linhas.append("💵 *Recebimentos:*")
        for l in receitas:
            tot_rec += Decimal(l.valor_total)
            linhas.append(f"✅ {l.descricao}: {brl(l.valor_total)}")
        linhas.append(f"   _Total recebido: {brl(tot_rec)}_")
        linhas.append("")
    linhas.append(f"💰 Saldo atual: {brl(saldo_total(db))}")
    if tot_juros:
        linhas.append(f"📈 Juros pagos hoje: {brl(tot_juros)}")
    return "\n".join(linhas)


# ───────────────────────── Orçamento por categoria ─────────────────────────
def _gasto_por_categoria(db: Session, ini: date, fim: date) -> dict:
    """Despesas por categoria no período, pela competência (pagas e pendentes),
    mesmo critério do painel."""
    rows = (db.query(models.Lancamento.categoria_id, func.coalesce(func.sum(models.Lancamento.valor), 0))
            .filter(models.Lancamento.tipo == TipoMov.despesa,
                    models.Lancamento.data_competencia >= ini,
                    models.Lancamento.data_competencia <= fim)
            .group_by(models.Lancamento.categoria_id).all())
    return {cid: Decimal(v or 0) for cid, v in rows}


def _resto_do_mes_historico(db: Session, ini_atual: date, dia: int, meses: int = 3) -> dict:
    """Quanto cada categoria costuma gastar DEPOIS do dia `dia`, na média dos últimos meses.

    Conta fixa paga no começo do mês (escola, aluguel) dá ~0; gasto espalhado
    (mercado) dá o que normalmente ainda vem. Melhor que projetar em linha reta.
    """
    soma = {}
    for k in range(1, meses + 1):
        mi = ini_atual - relativedelta(months=k)
        mf = mi.replace(day=monthrange(mi.year, mi.month)[1])
        if dia >= mf.day:
            continue
        for cid, v in _gasto_por_categoria(db, mi.replace(day=dia + 1), mf).items():
            soma[cid] = soma.get(cid, D0) + v
    return {cid: v / meses for cid, v in soma.items()}


def orcamento(db: Session, ref: date | None = None, hoje: date | None = None) -> dict:
    ref = ref or date.today()
    hoje = hoje or date.today()
    ini, fim = _range_mes(ref)
    gastos = _gasto_por_categoria(db, ini, fim)
    dias_mes = fim.day
    # ritmo: só faz sentido no mês corrente
    corrente = ini <= hoje <= fim
    dia = hoje.day if corrente else dias_mes

    # Previsão de fechamento: o maior entre (a) o que já está lançado para o mês,
    # inclusive pendentes, e (b) o gasto até hoje + o que costuma vir depois deste dia.
    # Sem o "maior", uma conta já lançada seria contada de novo pelo histórico.
    resto = _resto_do_mes_historico(db, ini, dia) if corrente else {}
    ate_hoje = _gasto_por_categoria(db, ini, hoje) if corrente else {}

    itens = []
    for c in db.query(models.Categoria).filter(models.Categoria.tipo == TipoMov.despesa).order_by(models.Categoria.nome):
        limite = Decimal(c.orcamento_mensal) if c.orcamento_mensal else None
        gasto = gastos.get(c.id, D0)
        previsto = max(gasto, ate_hoje.get(c.id, D0) + resto.get(c.id, D0)).quantize(Decimal("0.01"))
        pct = float(gasto / limite * 100) if limite else None
        if limite is None:
            status = "sem_limite"
        elif gasto > limite:
            status = "estourado"
        elif pct >= 80:
            status = "atencao"
        else:
            status = "ok"
        itens.append({
            "categoria_id": c.id, "nome": c.nome, "cor": c.cor, "icone": c.icone,
            "limite": float(limite) if limite is not None else None,
            "gasto": float(gasto), "pct": round(pct, 1) if pct is not None else None,
            "restante": float(limite - gasto) if limite is not None else None,
            "previsto_fim_mes": float(previsto),
            "vai_estourar": bool(limite is not None and corrente and gasto <= limite and previsto > limite),
            "status": status,
        })
    ordem = {"estourado": 0, "atencao": 1, "ok": 2, "sem_limite": 3}
    itens.sort(key=lambda i: (ordem[i["status"]], -(i["pct"] or 0), -i["gasto"]))
    com = [i for i in itens if i["limite"] is not None]
    limite_total = sum(i["limite"] for i in com)
    gasto_orcado = sum(i["gasto"] for i in com)
    return {
        "mes": ini.strftime("%Y-%m"), "corrente": corrente, "dia": dia, "dias_mes": dias_mes,
        "limite_total": limite_total, "gasto_orcado": gasto_orcado,
        "disponivel": limite_total - gasto_orcado,
        "gasto_total": float(sum(gastos.values(), D0)),
        "sem_categoria": float(gastos.get(None, D0)),
        "estourados": sum(1 for i in itens if i["status"] == "estourado"),
        "em_atencao": sum(1 for i in itens if i["status"] == "atencao"),
        "itens": itens,
    }


def sugestao_orcamento(db: Session, ref: date | None = None, meses: int = 3) -> dict:
    """Média de gasto por categoria nos últimos N meses fechados, arredondada para cima (de 10 em 10)."""
    ref = ref or date.today()
    ini_atual, _ = _range_mes(ref)
    fim = ini_atual - timedelta(days=1)
    y, m = ini_atual.year, ini_atual.month - meses
    while m <= 0:
        m += 12; y -= 1
    ini = date(y, m, 1)
    gastos = _gasto_por_categoria(db, ini, fim)
    out = {}
    for cid, total in gastos.items():
        if cid is None or total <= 0:
            continue
        media = total / meses
        out[cid] = float((media / 10).to_integral_value(rounding="ROUND_CEILING") * 10)
    return {"de": ini.isoformat(), "ate": fim.isoformat(), "meses": meses, "sugestao": out}


# ───────────────────────── Previsão de saldo dia a dia ─────────────────────────
def _total_competencia(db: Session, tipo, ini: date, fim: date) -> Decimal:
    return Decimal(db.query(func.coalesce(func.sum(models.Lancamento.valor), 0)).filter(
        models.Lancamento.tipo == tipo,
        models.Lancamento.data_competencia >= ini,
        models.Lancamento.data_competencia <= fim).scalar() or 0)


def previsao_saldo(db: Session, dias: int = 90, hoje: date | None = None) -> dict:
    """Saldo previsto para cada dia dos próximos `dias`.

    Duas curvas:
    - "lançado": só o que já está no sistema (contas pendentes e parcelas de cartão);
    - "estimado": lançado + o que costuma entrar/sair e ainda não foi lançado
      (média dos últimos 3 meses, mesmo critério da projeção mensal).
    Atrasados entram hoje (ainda precisam ser pagos). Compra parcelada pendente sai
    nas datas das parcelas, não pelo valor total, para não contar duas vezes.
    """
    hoje = hoje or date.today()
    fim_janela = hoje + timedelta(days=dias)
    saldo0 = saldo_total(db)

    # lançamentos pendentes que viraram parcelamento: o dinheiro sai pelas parcelas
    parcelados = {lid for (lid,) in db.query(models.Compra.lancamento_id)
                  .join(models.Parcelamento, models.Parcelamento.compra_id == models.Compra.id).all()}

    eventos = []
    pend = (db.query(models.Lancamento)
            .filter(models.Lancamento.data_pagamento.is_(None)).all())
    for l in pend:
        quando = l.data_vencimento or l.data_competencia or hoje
        if quando > fim_janela or l.id in parcelados:
            continue
        atrasado = quando < hoje
        sinal = 1 if l.tipo == TipoMov.receita else -1
        eventos.append({"data": max(quando, hoje), "valor": sinal * Decimal(l.valor_total),
                        "descricao": l.descricao, "tipo": l.tipo.value, "atrasado": atrasado, "origem": "lancamento"})

    # parcelas de cartão em aberto, só de compras cujo lançamento ainda não foi pago
    q = (db.query(models.ParcelaCartao, models.Lancamento)
         .join(models.Parcelamento, models.Parcelamento.id == models.ParcelaCartao.parcelamento_id)
         .join(models.Compra, models.Compra.id == models.Parcelamento.compra_id)
         .join(models.Lancamento, models.Lancamento.id == models.Compra.lancamento_id)
         .filter(models.ParcelaCartao.paga.is_(False),
                 models.Lancamento.data_pagamento.is_(None),
                 models.ParcelaCartao.data_vencimento <= fim_janela))
    for p, l in q.all():
        eventos.append({"data": max(p.data_vencimento, hoje), "valor": -Decimal(p.valor),
                        "descricao": f"{l.descricao} (parcela {p.numero}/{p.parcelamento.total_parcelas})",
                        "tipo": "despesa", "atrasado": p.data_vencimento < hoje, "origem": "parcela"})

    # média mensal dos últimos 3 meses fechados
    ini_atual, _ = _range_mes(hoje)
    ini_hist = ini_atual - relativedelta(months=3)
    fim_hist = ini_atual - timedelta(days=1)
    media_rec = _total_competencia(db, TipoMov.receita, ini_hist, fim_hist) / 3
    media_desp = _total_competencia(db, TipoMov.despesa, ini_hist, fim_hist) / 3

    # estimativa diária do que ainda não foi lançado, mês a mês
    estimativa = {}   # data -> valor (+/-)
    m_ini = ini_atual
    while m_ini <= fim_janela:
        m_fim = m_ini.replace(day=monthrange(m_ini.year, m_ini.month)[1])
        lanc_rec = _total_competencia(db, TipoMov.receita, m_ini, m_fim)
        lanc_desp = _total_competencia(db, TipoMov.despesa, m_ini, m_fim)
        # parcelas de cartão que caem neste mês já são saída agendada
        lanc_desp += -sum((e["valor"] for e in eventos
                           if e["origem"] == "parcela" and m_ini <= e["data"] <= m_fim), D0)
        falta = (max(D0, media_rec - lanc_rec)) - (max(D0, media_desp - lanc_desp))
        # espalha nos dias do mês que ainda vêm e cabem na janela
        d_ini = max(m_ini, hoje + timedelta(days=1))
        d_fim = min(m_fim, fim_janela)
        restantes_mes = (m_fim - max(m_ini, hoje + timedelta(days=1))).days + 1
        if d_ini <= d_fim and restantes_mes > 0 and falta:
            por_dia = falta / restantes_mes
            d = d_ini
            while d <= d_fim:
                estimativa[d] = estimativa.get(d, D0) + por_dia
                d += timedelta(days=1)
        m_ini = m_fim + timedelta(days=1)

    por_dia_lanc = {}
    for e in eventos:
        por_dia_lanc[e["data"]] = por_dia_lanc.get(e["data"], D0) + e["valor"]

    serie = []
    s_l = s_e = Decimal(saldo0)
    for i in range(dias + 1):
        d = hoje + timedelta(days=i)
        s_l += por_dia_lanc.get(d, D0)
        s_e += por_dia_lanc.get(d, D0) + estimativa.get(d, D0)
        serie.append({"data": d.isoformat(), "lancado": float(round(s_l, 2)), "estimado": float(round(s_e, 2))})

    def minimo(chave):
        p = min(serie, key=lambda x: x[chave]); return {"valor": p[chave], "data": p["data"]}

    def negativo(chave):
        p = next((x for x in serie if x[chave] < 0), None); return p["data"] if p else None

    marcos = {str(n): {"lancado": serie[n]["lancado"], "estimado": serie[n]["estimado"], "data": serie[n]["data"]}
              for n in (30, 60, 90) if n <= dias}
    eventos.sort(key=lambda e: (e["data"], e["valor"]))
    return {
        "hoje": hoje.isoformat(), "dias": dias, "saldo_hoje": float(saldo0),
        "media_mensal": {"receitas": float(round(media_rec, 2)), "despesas": float(round(media_desp, 2))},
        "serie": serie, "marcos": marcos,
        "minimo": {"lancado": minimo("lancado"), "estimado": minimo("estimado")},
        "primeiro_negativo": {"lancado": negativo("lancado"), "estimado": negativo("estimado")},
        "atrasados": float(-sum((e["valor"] for e in eventos if e["atrasado"]), D0)),
        "eventos": [{**e, "data": e["data"].isoformat(), "valor": float(e["valor"])} for e in eventos[:60]],
    }


def comparativo(db: Session, ano: int, hoje: date | None = None) -> dict:
    """Este ano x ano anterior, mês a mês e por categoria (pela competência).

    No ano corrente, os totais por categoria comparam o mesmo período nos dois
    anos (janeiro até o mês atual), para a comparação ser justa.
    """
    hoje = hoje or date.today()
    ate_mes = hoje.month if ano == hoje.year else 12

    def por_mes(a):
        rows = (db.query(func.extract("month", models.Lancamento.data_competencia).label("m"), models.Lancamento.tipo,
                         func.coalesce(func.sum(models.Lancamento.valor), 0))
                .filter(models.Lancamento.data_competencia >= date(a, 1, 1), models.Lancamento.data_competencia <= date(a, 12, 31))
                .group_by("m", models.Lancamento.tipo).all())
        out = {m: {"receitas": 0.0, "despesas": 0.0} for m in range(1, 13)}
        for m, tipo, v in rows:
            out[int(m)]["receitas" if tipo == TipoMov.receita else "despesas"] += float(v)
        return out

    def por_cat(a):
        fim = date(a, ate_mes, monthrange(a, ate_mes)[1])
        rows = (db.query(models.Lancamento.categoria_id, func.coalesce(func.sum(models.Lancamento.valor), 0))
                .filter(models.Lancamento.tipo == TipoMov.despesa,
                        models.Lancamento.data_competencia >= date(a, 1, 1), models.Lancamento.data_competencia <= fim)
                .group_by(models.Lancamento.categoria_id).all())
        return {cid: float(v) for cid, v in rows}

    atual, anterior = por_mes(ano), por_mes(ano - 1)
    nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    meses = [{"mes": m, "rotulo": nomes[m - 1], "receitas": atual[m]["receitas"], "despesas": atual[m]["despesas"],
              "receitas_ant": anterior[m]["receitas"], "despesas_ant": anterior[m]["despesas"], "futuro": m > ate_mes}
             for m in range(1, 13)]
    ca, cb = por_cat(ano), por_cat(ano - 1)
    cats = {c.id: c for c in db.query(models.Categoria).all()}
    categorias = []
    for cid in set(ca) | set(cb):
        a, b = ca.get(cid, 0.0), cb.get(cid, 0.0)
        c = cats.get(cid)
        categorias.append({"categoria_id": cid, "nome": c.nome if c else "Sem categoria", "cor": c.cor if c else "#7E8C9A",
                           "atual": a, "anterior": b, "diferenca": a - b,
                           "variacao_pct": round((a - b) / b * 100, 1) if b else None})
    categorias.sort(key=lambda x: -abs(x["diferenca"]))
    soma = lambda d, k, ate: sum(d[m][k] for m in range(1, ate + 1))
    tot = {"despesas": soma(atual, "despesas", ate_mes), "despesas_ant": soma(anterior, "despesas", ate_mes),
           "receitas": soma(atual, "receitas", ate_mes), "receitas_ant": soma(anterior, "receitas", ate_mes)}
    return {"ano": ano, "ano_anterior": ano - 1, "ate_mes": ate_mes, "periodo": f"jan a {nomes[ate_mes - 1].lower()}",
            "meses": meses, "categorias": categorias, "totais": tot}
