"""
Integração WhatsApp — Tomelin Gestão Financeira.
Gateway: whatsapp.jackson (zap.unicontroller.com.br) via Baileys 6.7.
Payload de envio: POST {grupo, mensagem} com Authorization Bearer.

NOVOS COMANDOS v2:
  Consultas: saldo, vencer, resumo, pagar, receber, patrimonio, juros, metas, categorias, contas
  Cadastros: despesa, receita, baixa, lanc (modo livre)
  Nota fiscal: nf <url> ou nota <url> — consulta NF-e pelo QR code
  Ajuda: menu, ajuda
"""
import logging
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import httpx
from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal
from . import service, models

log = logging.getLogger("tomelin.whatsapp")

# ── Estado de sessão para cadastros multi-passo ──────────────────────────────
# chave = JID do remetente, valor = dict com o contexto do cadastro em andamento
_SESSOES: dict[str, dict] = {}

MENU = (
    "🏠 *Tomelin — Finanças da Família*\n"
    "Responda com o número ou o comando:\n\n"
    "*📊 Consultas:*\n"
    "1️⃣  `saldo` — saldo das contas\n"
    "2️⃣  `vencer` — contas a vencer\n"
    "3️⃣  `resumo` — resumo do mês\n"
    "4️⃣  `pagar` — contas a pagar\n"
    "5️⃣  `receber` — contas a receber\n"
    "6️⃣  `patrimonio` — patrimônio líquido\n"
    "7️⃣  `juros` — juros e multas\n"
    "8️⃣  `metas` — metas financeiras\n"
    "9️⃣  `categorias` — ver categorias\n"
    "🔟  `contas` — ver contas\n\n"
    "*✏️ Cadastros rápidos:*\n"
    "`despesa 150 mercado` — lança despesa\n"
    "`receita 2000 salario` — lança receita\n"
    "`baixa 42` — dá baixa no lançamento #42\n"
    "`buscar pagamento` — busca lançamentos\n\n"
    "*📄 Nota Fiscal:*\n"
    "`nf https://...` — lê QR code da NF-e\n\n"
    "Digite *menu* para ver isto novamente."
)


def enviar(mensagem: str, grupo: str | None = None) -> bool:
    """Envia mensagem ao grupo via gateway Baileys."""
    if not settings.WHATSAPP_ATIVO or not settings.WHATSAPP_API_URL:
        log.info("[whatsapp desativado] %s", mensagem.replace("\n", " | ")[:120])
        return False
    grupo = grupo or settings.WHATSAPP_GRUPO
    url = settings.WHATSAPP_API_URL.rstrip("/") + settings.WHATSAPP_ENDPOINT_ENVIAR
    headers = {}
    if settings.WHATSAPP_API_TOKEN:
        headers["Authorization"] = f"Bearer {settings.WHATSAPP_API_TOKEN}"
    payload = {
        "grupo": grupo, "group": grupo, "para": grupo, "to": grupo,
        "mensagem": mensagem, "message": mensagem, "texto": mensagem, "text": mensagem,
    }
    try:
        r = httpx.post(url, json=payload, headers=headers, timeout=20)
        ok = r.status_code < 300
        if not ok:
            log.warning("Gateway respondeu %s: %s", r.status_code, r.text[:200])
        return ok
    except Exception as e:
        log.error("Falha ao enviar WhatsApp: %s", e)
        return False


def _brl(v) -> str:
    try:
        v = float(v or 0)
    except (TypeError, ValueError):
        v = 0.0
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _parse_valor(s: str) -> Decimal | None:
    """
    Extrai valor numérico de strings como:
    '150', '150.50', '1500', '1.500', '1.500,00', '1500,50'
    """
    s = s.strip().replace("r$", "").replace("R$", "").strip()
    # Se tem vírgula, trata como brasileiro: '1.500,00' → '1500.00'
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    # Se tem ponto e o ponto é separador decimal (ex: '150.50', '1.5')
    # Distingue de separador de milhar (ex: '1.500')
    elif "." in s:
        partes = s.split(".")
        # Ponto é decimal se a parte após o ponto tem 1 ou 2 dígitos
        if len(partes[-1]) <= 2:
            pass  # mantém como decimal: '150.50' → 150.50
        else:
            # Ponto é separador de milhar: '1.500' → '1500'
            s = s.replace(".", "")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _sugerir_categoria(db: Session, descricao: str, tipo: str) -> models.Categoria | None:
    """Sugere categoria pelo texto da descrição."""
    desc = descricao.lower()
    palavras = {
        "mercado": ["mercado", "super", "atacado", "hiper", "feira", "hortifruti"],
        "combustível": ["gasolina", "combustivel", "posto", "etanol", "diesel"],
        "alimentação": ["restaurante", "lanche", "pizza", "ifood", "delivery", "padaria", "cafe"],
        "farmácia": ["farmacia", "drogaria", "remedio", "medicamento"],
        "educação": ["escola", "faculdade", "curso", "mensalidade", "material"],
        "saúde": ["medico", "consulta", "exame", "hospital", "plano de saude"],
        "transporte": ["uber", "99", "onibus", "metro", "estacionamento"],
        "moradia": ["aluguel", "condominio", "agua", "luz", "energia", "internet", "gas"],
        "lazer": ["cinema", "netflix", "spotify", "viagem", "hotel"],
        "vestuário": ["roupa", "calcado", "tenis", "havan", "renner"],
        "salário": ["salario", "honorario", "freelance", "pagamento"],
    }
    cats = db.query(models.Categoria).filter(models.Categoria.tipo == tipo).all()
    for cat in cats:
        nome_cat = cat.nome.lower()
        for chave, kws in palavras.items():
            if chave in nome_cat or any(kw in nome_cat for kw in kws):
                if any(kw in desc for kw in kws):
                    return cat
        if any(p in desc for p in nome_cat.split()):
            return cat
    return None


def _texto_metas(db: Session) -> str:
    metas = db.query(models.Meta).order_by(models.Meta.concluida, models.Meta.prazo.asc().nullslast()).all()
    if not metas:
        return "📭 Nenhuma meta cadastrada ainda.\nCadastre em: Finanças → Metas"
    linhas = ["🎯 *Metas financeiras*", ""]
    for m in metas:
        pct = m.progresso_pct
        barra = "█" * int(pct / 10) + "░" * (10 - int(pct / 10))
        status = "✅" if m.concluida else "🟡" if pct >= 50 else "🔴"
        prazo = f" · prazo {m.prazo.strftime('%d/%m/%y')}" if m.prazo else ""
        linhas.append(f"{status} *{m.nome}*")
        linhas.append(f"  {barra} {pct:.0f}%")
        linhas.append(f"  {_brl(m.valor_atual)} de {_brl(m.valor_alvo)} (falta {_brl(m.falta)}){prazo}")
        linhas.append("")
    return "\n".join(linhas).rstrip()


def _texto_categorias(db: Session) -> str:
    cats = db.query(models.Categoria).order_by(models.Categoria.tipo, models.Categoria.nome).all()
    rec = [c for c in cats if c.tipo == "receita"]
    desp = [c for c in cats if c.tipo == "despesa"]
    linhas = ["🗂️ *Categorias*", ""]
    if rec:
        linhas.append("📈 *Receitas:*")
        linhas += [f"  {c.icone or '•'} {c.nome}" for c in rec]
        linhas.append("")
    if desp:
        linhas.append("📉 *Despesas:*")
        linhas += [f"  {c.icone or '•'} {c.nome}" for c in desp]
    return "\n".join(linhas)


def _texto_contas(db: Session) -> str:
    contas = db.query(models.Conta).filter(models.Conta.ativo.is_(True)).all()
    linhas = ["🏦 *Contas*", ""]
    for ct in contas:
        saldo = service.saldo_conta(db, ct)
        sinal = "🟢" if saldo >= 0 else "🔴"
        linhas.append(f"{sinal} {ct.nome}: {_brl(saldo)}")
    linhas.append(f"\n💰 *Total: {_brl(service.saldo_total(db))}*")
    return "\n".join(linhas)


def _lancar(db: Session, tipo: str, texto: str) -> str:
    """
    Lança despesa ou receita a partir de texto livre.
    Exemplos: 'despesa 150 mercado', 'receita 3000 salario janeiro'
    """
    partes = texto.strip().split(None, 2)  # máx 3 partes: tipo valor desc
    if len(partes) < 2:
        return (f"❌ Formato: *{tipo} VALOR DESCRIÇÃO*\n"
                f"Exemplo: `{tipo} 150 mercado`\n"
                f"         `{tipo} 1.500,00 aluguel`")

    valor = _parse_valor(partes[1])
    if not valor or valor <= 0:
        return f"❌ Valor inválido: *{partes[1]}*\nUse apenas números: `{tipo} 150 descricao`"

    descricao = partes[2].strip().title() if len(partes) > 2 else tipo.title()

    cat = _sugerir_categoria(db, descricao, tipo)
    hoje = date.today()

    l = models.Lancamento(
        descricao=descricao,
        tipo=models.TipoMov(tipo),
        valor=valor,
        data_vencimento=hoje,
        data_competencia=hoje,
        categoria_id=cat.id if cat else None,
    )
    db.add(l); db.commit(); db.refresh(l)

    emoji = "💵" if tipo == "receita" else "💸"
    cat_str = f" · {cat.nome}" if cat else ""
    return (
        f"{emoji} *{tipo.title()} lançada!*\n\n"
        f"📌 #{l.id} — {l.descricao}\n"
        f"💰 {_brl(valor)}{cat_str}\n"
        f"📅 {hoje.strftime('%d/%m/%Y')}\n\n"
        f"Status: *pendente* · Dê baixa com `baixa {l.id}`"
    )


def _buscar_lancamentos(db: Session, termo: str) -> str:
    rows = (db.query(models.Lancamento)
            .filter(models.Lancamento.descricao.ilike(f"%{termo}%"))
            .order_by(models.Lancamento.data_vencimento.desc())
            .limit(8).all())
    if not rows:
        return f"🔍 Nenhum lançamento encontrado para *{termo}*."
    linhas = [f"🔍 *Busca: \"{termo}\"*", ""]
    for l in rows:
        st = {"pago": "✅", "pendente": "🟡", "atrasado": "🔴"}.get(l.status, "•")
        linhas.append(f"{st} #{l.id} — {l.descricao}")
        linhas.append(f"   {_brl(l.valor)} · {l.data_vencimento.strftime('%d/%m/%Y') if l.data_vencimento else 'sem data'}")
    return "\n".join(linhas)


def _dar_baixa(db: Session, lid_str: str) -> str:
    try:
        lid = int(lid_str.strip().lstrip("#"))
    except ValueError:
        return "❌ Informe o número do lançamento: `baixa 42`"
    l = db.get(models.Lancamento, lid)
    if not l:
        return f"❌ Lançamento #{lid} não encontrado."
    if l.status == "pago":
        return f"⚠️ Lançamento #{lid} já está *pago*."
    l.data_pagamento = date.today()
    db.commit()
    tipo_str = "Recebimento" if l.tipo == models.TipoMov.receita else "Pagamento"
    return (
        f"✅ *Baixa registrada!*\n\n"
        f"#{lid} — {l.descricao}\n"
        f"💰 {_brl(l.valor)}\n"
        f"📅 Pago em {l.data_pagamento.strftime('%d/%m/%Y')}\n"
        f"Tipo: {tipo_str}"
    )


def _consultar_nfe_zap(db: Session, url: str) -> str:
    """Consulta uma NF-e pelo QR code URL e devolve resumo."""
    try:
        from . import nfe as nfe_svc
        dados = nfe_svc.consultar_qrcode(url.strip())
    except ValueError as e:
        return f"❌ Erro ao consultar NF-e:\n{e}"
    except Exception as e:
        return f"❌ Falha inesperada ao consultar NF-e:\n{str(e)[:200]}"

    linhas = ["🧾 *Nota Fiscal consultada!*", ""]
    if dados.get("emitente"):
        linhas.append(f"🏪 *{dados['emitente']}*")
    if dados.get("cnpj_emitente"):
        linhas.append(f"CNPJ: {dados['cnpj_emitente']}")
    if dados.get("data_emissao"):
        linhas.append(f"📅 Emissão: {datetime.fromisoformat(dados['data_emissao']).strftime('%d/%m/%Y')}")
    if dados.get("numero_nota"):
        linhas.append(f"NF: {dados['numero_nota']} · UF: {dados.get('uf', '?')}")
    linhas.append("")

    val = dados.get("valor_total")
    if val:
        linhas.append(f"💰 *Total: {_brl(val)}*")
    itens = dados.get("itens", [])
    if itens:
        linhas.append(f"\n📦 *{len(itens)} iten(s):*")
        for it in itens[:6]:
            linhas.append(f"  • {it['descricao'][:35]} — {_brl(it['valor'])}")
        if len(itens) > 6:
            linhas.append(f"  ... e mais {len(itens)-6} itens")

    if val:
        linhas.append(f"\n📲 Para lançar esta despesa, acesse o sistema:\n"
                      f"Lançamentos → Ler Nota Fiscal")

    return "\n".join(linhas)


def processar_comando(texto: str, db: Session | None = None,
                      remetente: str | None = None) -> str | None:
    """Interpreta comando do grupo e devolve resposta (ou None = ignora)."""
    if not texto:
        return None
    t = texto.strip()
    t_low = t.lower()

    fechar = False
    if db is None:
        db = SessionLocal(); fechar = True

    try:
        # ── Menu / ajuda ──────────────────────────────────────────────────────
        if t_low in ("menu", "ajuda", "help", "0", "oi", "ola", "olá", "inicio", "início"):
            return MENU

        # ── Consultas numéricas ───────────────────────────────────────────────
        if t_low in ("1", "saldo"):
            return _texto_contas(db)
        if t_low in ("2", "vencimentos", "vencimento", "vencer", "vence"):
            return service.texto_vencimentos(db, dias_antes=7)
        if t_low in ("3", "resumo", "mes", "mês", "resumo mes", "resumo mês"):
            return service.texto_resumo_mes(db)
        if t_low in ("4", "apagar", "a pagar", "pagar", "contas a pagar"):
            return service.texto_a_pagar(db)
        if t_low in ("5", "areceber", "a receber", "receber", "contas a receber"):
            return service.texto_a_receber(db)
        if t_low in ("6", "patrimonio", "patrimônio", "veiculos", "veículos", "carros"):
            return service.texto_patrimonio(db)
        if t_low in ("7", "juros", "multa", "multas"):
            return service.texto_juros(db)
        if t_low in ("8", "metas", "meta", "objetivos"):
            return _texto_metas(db)
        if t_low in ("9", "categorias", "categoria"):
            return _texto_categorias(db)
        if t_low in ("10", "contas", "conta", "saldos"):
            return _texto_contas(db)

        # ── Cadastro rápido: despesa ──────────────────────────────────────────
        if t_low.startswith("despesa ") or t_low.startswith("gasto ") or t_low.startswith("d "):
            partes = t.split(None, 1)
            return _lancar(db, "despesa", partes[0] + " " + partes[1] if len(partes) > 1 else "despesa")

        # ── Cadastro rápido: receita ──────────────────────────────────────────
        if t_low.startswith("receita ") or t_low.startswith("recebimento ") or t_low.startswith("r "):
            partes = t.split(None, 1)
            return _lancar(db, "receita", partes[0] + " " + partes[1] if len(partes) > 1 else "receita")

        # ── Dar baixa em lançamento ───────────────────────────────────────────
        if t_low.startswith("baixa ") or t_low.startswith("paguei ") or t_low.startswith("pago "):
            partes = t.split(None, 1)
            return _dar_baixa(db, partes[1] if len(partes) > 1 else "")

        # ── Buscar lançamentos ────────────────────────────────────────────────
        if t_low.startswith("buscar ") or t_low.startswith("busca ") or t_low.startswith("ver "):
            partes = t.split(None, 1)
            return _buscar_lancamentos(db, partes[1] if len(partes) > 1 else "")

        # ── Nota Fiscal / NF-e pelo QR code ──────────────────────────────────
        if t_low.startswith("nf ") or t_low.startswith("nota ") or t_low.startswith("nfe "):
            partes = t.split(None, 1)
            url = partes[1].strip() if len(partes) > 1 else ""
            if not url.startswith("http"):
                return ("📄 *Consulta NF-e*\n\nEnvie a URL do QR code da nota:\n"
                        "`nf https://sat.sef.sc.gov.br/nfce/consulta?p=...`\n\n"
                        "Escaneie o QR code da nota com a câmera, copie o link e envie aqui.")
            return _consultar_nfe_zap(db, url)

        # ── Aporte em meta ────────────────────────────────────────────────────
        if t_low.startswith("aporte ") or t_low.startswith("guardar ") or t_low.startswith("guardei "):
            # aporte VALOR [NOME_META]
            partes = t.split(None, 2)
            if len(partes) < 2:
                return "❌ Formato: `aporte 500 reserva emergencia`"
            valor = _parse_valor(partes[1])
            if not valor or valor <= 0:
                return f"❌ Valor inválido: *{partes[1]}*"
            nome_busca = partes[2].lower() if len(partes) > 2 else ""
            metas = db.query(models.Meta).filter(models.Meta.concluida.is_(False)).all()
            if not metas:
                return "❌ Nenhuma meta ativa. Crie uma em: Finanças → Metas"
            meta = None
            if nome_busca:
                for m in metas:
                    if nome_busca in m.nome.lower():
                        meta = m; break
            if not meta:
                if len(metas) == 1:
                    meta = metas[0]
                else:
                    lista = "\n".join(f"  • {m.nome} ({m.progresso_pct:.0f}%)" for m in metas)
                    return (f"📋 *Escolha a meta:*\n{lista}\n\n"
                            f"Use: `aporte {_brl(valor).replace('R$ ','')} NOME_DA_META`")
            meta.valor_atual = float(meta.valor_atual) + float(valor)
            if meta.valor_atual >= float(meta.valor_alvo):
                meta.concluida = True
            db.commit(); db.refresh(meta)
            pct = meta.progresso_pct
            barra = "█" * int(pct / 10) + "░" * (10 - int(pct / 10))
            concl = "\n\n🎉 *META CONCLUÍDA!* Parabéns!" if meta.concluida else ""
            return (f"✅ *Aporte registrado!*\n\n"
                    f"🎯 {meta.nome}\n"
                    f"{barra} {pct:.0f}%\n"
                    f"{_brl(meta.valor_atual)} de {_brl(meta.valor_alvo)}{concl}")

        # ── Último lançamento ─────────────────────────────────────────────────
        if t_low in ("ultimo", "último", "last", "ultimo lancamento", "último lançamento"):
            l = (db.query(models.Lancamento)
                 .order_by(models.Lancamento.id.desc()).first())
            if not l:
                return "📭 Nenhum lançamento cadastrado ainda."
            st = {"pago": "✅", "pendente": "🟡", "atrasado": "🔴"}.get(l.status, "•")
            return (f"{st} *Último lançamento*\n\n"
                    f"#{l.id} — {l.descricao}\n"
                    f"💰 {_brl(l.valor)}\n"
                    f"📅 {l.data_vencimento.strftime('%d/%m/%Y') if l.data_vencimento else '—'}\n"
                    f"Status: {l.status}")

        # ── Fluxo mensal (gráfico ASCII) ─────────────────────────────────────
        if t_low in ("fluxo", "grafico", "gráfico", "historico", "histórico"):
            return _texto_fluxo(db)

        # ── Top gastos por categoria ──────────────────────────────────────────
        if t_low in ("gastos", "top", "categorias gastos", "maiores gastos"):
            return _texto_gastos(db)

        # ── Resumo do dia ─────────────────────────────────────────────────────
        if t_low in ("hoje", "dia", "resumo hoje", "resumo do dia"):
            return _texto_hoje(db)

        # ── Resumo da semana ──────────────────────────────────────────────────
        if t_low in ("semana", "essa semana", "esta semana", "resumo semana"):
            return _texto_semana(db)

        # ── Projeção ──────────────────────────────────────────────────────────
        if t_low in ("projecao", "projeção", "previsao", "previsão", "futuro"):
            return _texto_projecao(db)

        # ── Parcelas de cartão ────────────────────────────────────────────────
        if t_low in ("parcelas", "cartao", "cartões", "cartoes", "parcelamentos"):
            return _texto_parcelas_zap(db)

        # ── Veículos ──────────────────────────────────────────────────────────
        if t_low in ("carros", "carro", "veiculo", "veículo", "veiculos", "veículos", "frota"):
            return _texto_carros(db)

        # ── Dica financeira ───────────────────────────────────────────────────
        if t_low in ("dica", "dica financeira", "conselho", "sugestao", "sugestão"):
            return _texto_dica(db)

        # ── Nova conta ────────────────────────────────────────────────────────
        if t_low.startswith("nova conta ") or t_low.startswith("criar conta "):
            return _nova_conta(db, t_low)

        # ── Nova categoria ────────────────────────────────────────────────────
        if (t_low.startswith("nova cat ") or t_low.startswith("nova categoria ")
                or t_low.startswith("criar categoria ")):
            return _nova_categoria(db, t_low)

        # ── Menu extra ────────────────────────────────────────────────────────
        if t_low in ("mais", "mais comandos", "extra", "avancado", "avançado"):
            return MENU + MENU_EXTRA

        # ── Ajuda de comando específico ───────────────────────────────────────
        if t_low.startswith("ajuda ") or t_low.startswith("help ") or t_low.startswith("como usar "):
            partes = t.split(None, 1)
            return _ajuda_comando(partes[1] if len(partes) > 1 else "")

        # ── Próximo mês ───────────────────────────────────────────────────────
        if t_low in ("proximo mes", "próximo mês", "mes que vem", "mês que vem", "lembretes"):
            txt = _texto_lembrete_mes_seguinte(db)
            return txt or "📭 Nenhum lançamento previsto para o próximo mês."

        return None  # não é comando → ignora

    finally:
        if fechar:
            db.close()


# ── Jobs agendados ────────────────────────────────────────────────────────────
def job_alerta_vencimentos():
    db = SessionLocal()
    try:
        v = service.vencimentos(db, dias_antes=settings.ALERTA_DIAS_ANTES)
        if not v["atrasados"] and not v["proximos"]:
            return
        enviar("🔔 *Contas da casa a vencer*\n\n" +
               service.texto_vencimentos(db, dias_antes=settings.ALERTA_DIAS_ANTES))
    finally:
        db.close()


def job_resumo_semanal():
    if not settings.RESUMO_SEMANAL:
        return
    db = SessionLocal()
    try:
        enviar("🗓️ *Resumo da semana — Finanças da família*\n\n" + service.texto_resumo_mes(db))
    finally:
        db.close()


def job_fechamento_dia():
    if not settings.FECHAMENTO_DIARIO:
        return
    db = SessionLocal()
    try:
        txt = service.texto_fechamento_dia(db)
        if txt:
            enviar(txt)
    finally:
        db.close()


# ════════════════════════════════════════════════════════════════════════════
#  NOVOS COMANDOS — adicionados na expansão v3
# ════════════════════════════════════════════════════════════════════════════

MENU_EXTRA = (
    "\n*🆕 Mais comandos:*\n"
    "`fluxo` — gráfico dos últimos 6 meses\n"
    "`gastos` — top categorias do mês\n"
    "`hoje` — resumo do dia\n"
    "`semana` — movimentos da semana\n"
    "`projecao` — projeção 3 meses\n"
    "`parcelas` — cartão: parcelas pendentes\n"
    "`carros` — veículos e financiamentos\n"
    "`dica` — dica financeira do dia\n"
    "`nova conta NOME` — cadastra conta\n"
    "`nova cat NOME` — cadastra categoria\n"
    "`ajuda COMANDO` — detalhes de um comando"
)

AJUDAS = {
    "despesa": (
        "💸 *Comando: despesa*\n\n"
        "Lança uma despesa diretamente pelo WhatsApp.\n\n"
        "*Formato:* `despesa VALOR DESCRIÇÃO`\n\n"
        "*Exemplos:*\n"
        "• `despesa 150 mercado`\n"
        "• `despesa 1.500 aluguel`\n"
        "• `despesa 89,90 farmacia`\n\n"
        "O sistema sugere a categoria automaticamente!\n"
        "Status inicial: *pendente*. Use `baixa ID` para marcar como pago."
    ),
    "receita": (
        "💵 *Comando: receita*\n\n"
        "Lança um recebimento diretamente pelo WhatsApp.\n\n"
        "*Formato:* `receita VALOR DESCRIÇÃO`\n\n"
        "*Exemplos:*\n"
        "• `receita 3000 salario`\n"
        "• `receita 1.500,00 honorarios`\n"
        "• `receita 250 freela site`\n\n"
        "Use `baixa ID` para confirmar o recebimento."
    ),
    "baixa": (
        "✅ *Comando: baixa*\n\n"
        "Confirma o pagamento ou recebimento de um lançamento.\n\n"
        "*Formato:* `baixa NUMERO`\n\n"
        "*Exemplos:*\n"
        "• `baixa 42` (lançamento #42)\n"
        "• `paguei 15`\n"
        "• `pago 7`\n\n"
        "Use `buscar TEXTO` ou `ultimo` para encontrar o número do lançamento."
    ),
    "nf": (
        "🧾 *Comando: nf*\n\n"
        "Consulta uma Nota Fiscal pelo QR code.\n\n"
        "*Como usar:*\n"
        "1. Abra a câmera no celular\n"
        "2. Aponte para o QR code da nota\n"
        "3. Copie o link que aparecer\n"
        "4. Envie no grupo: `nf https://...`\n\n"
        "*Funciona em todos os estados!*\n"
        "O sistema acessa a SEFAZ e exibe:\n"
        "• Nome e CNPJ do estabelecimento\n"
        "• Data e número da nota\n"
        "• Valor total\n"
        "• Lista de itens comprados"
    ),
    "fluxo": (
        "📈 *Comando: fluxo*\n\n"
        "Exibe um gráfico ASCII de receitas x despesas\n"
        "dos últimos 6 meses.\n\n"
        "Cada barra representa o total do mês:\n"
        "█ = R$500 | Uma linha = um mês"
    ),
    "gastos": (
        "📊 *Comando: gastos* (ou `top`)\n\n"
        "Mostra as categorias com mais gastos no mês atual.\n\n"
        "Útil para identificar onde o dinheiro está indo!"
    ),
    "aporte": (
        "🎯 *Comando: aporte*\n\n"
        "Registra dinheiro guardado em uma meta financeira.\n\n"
        "*Formato:* `aporte VALOR [NOME_DA_META]`\n\n"
        "*Exemplos:*\n"
        "• `aporte 500` (se tiver só 1 meta ativa)\n"
        "• `aporte 1000 reserva`\n"
        "• `aporte 250 viagem europa`\n\n"
        "Se não informar o nome, o sistema lista as metas para você escolher."
    ),
}


def _barra_ascii(val: float, maximo: float, largura: int = 10) -> str:
    if maximo <= 0:
        return "░" * largura
    blocos = round((val / maximo) * largura)
    return "█" * blocos + "░" * (largura - blocos)


def _texto_fluxo(db: Session) -> str:
    """Gráfico ASCII de receitas x despesas dos últimos 6 meses."""
    meses = service.fluxo_mensal(db, 6)
    if not meses:
        return "📭 Sem dados de fluxo mensal ainda."
    maximo = max(max(m["receitas"], m["despesas"]) for m in meses) or 1
    linhas = ["📈 *Fluxo mensal — últimos 6 meses*", ""]
    for m in meses:
        r = m["receitas"]; d = m["despesas"]
        sinal = "📈" if r >= d else "📉"
        linhas.append(f"*{m['label']}* {sinal}")
        linhas.append(f"  + {_barra_ascii(r, maximo)} {_brl(r)}")
        linhas.append(f"  - {_barra_ascii(d, maximo)} {_brl(d)}")
        linhas.append("")
    return "\n".join(linhas).rstrip()


def _texto_gastos(db: Session) -> str:
    """Top categorias de despesa do mês atual."""
    cats = service.despesas_por_categoria(db)
    if not cats:
        return "📭 Nenhuma despesa categorizada este mês."
    total = sum(c["valor"] for c in cats)
    maximo = cats[0]["valor"] if cats else 1
    linhas = ["📊 *Top gastos do mês*", f"Total: {_brl(total)}", ""]
    for i, c in enumerate(cats[:8], 1):
        pct = (c["valor"] / total * 100) if total else 0
        barra = _barra_ascii(c["valor"], maximo, 8)
        linhas.append(f"{i}. *{c['nome']}*")
        linhas.append(f"   {barra} {_brl(c['valor'])} ({pct:.0f}%)")
    return "\n".join(linhas)


def _texto_hoje(db: Session) -> str:
    """Resumo do dia: vence hoje + foi pago hoje."""
    hoje = date.today()
    # lançamentos que vencem hoje
    vence = (db.query(models.Lancamento)
             .filter(models.Lancamento.data_vencimento == hoje,
                     models.Lancamento.data_pagamento.is_(None))
             .order_by(models.Lancamento.tipo).all())
    # lançamentos pagos hoje
    pagos = (db.query(models.Lancamento)
             .filter(models.Lancamento.data_pagamento == hoje)
             .all())

    linhas = [f"📅 *Resumo de hoje — {hoje.strftime('%d/%m/%Y')}*", ""]

    if vence:
        linhas.append("⏰ *Vence hoje:*")
        for l in vence:
            ico = "💸" if l.tipo == models.TipoMov.despesa else "💵"
            linhas.append(f"  {ico} #{l.id} — {l.descricao}: {_brl(l.valor)}")
        linhas.append("")
    else:
        linhas.append("✅ Nada vence hoje!\n")

    if pagos:
        tot_pago = sum(float(l.valor) for l in pagos if l.tipo == models.TipoMov.despesa)
        tot_rec = sum(float(l.valor) for l in pagos if l.tipo == models.TipoMov.receita)
        linhas.append("💳 *Registrados hoje:*")
        for l in pagos[:5]:
            ico = "💸" if l.tipo == models.TipoMov.despesa else "💵"
            linhas.append(f"  {ico} {l.descricao}: {_brl(l.valor)}")
        if len(pagos) > 5:
            linhas.append(f"  ... e mais {len(pagos)-5}")
        linhas.append("")
        if tot_pago:
            linhas.append(f"Total pago: {_brl(tot_pago)}")
        if tot_rec:
            linhas.append(f"Total recebido: {_brl(tot_rec)}")
    else:
        linhas.append("📭 Nenhum movimento registrado hoje.")

    return "\n".join(linhas)


def _texto_semana(db: Session) -> str:
    """Movimentos da semana atual."""
    from datetime import timedelta
    hoje = date.today()
    seg = hoje - timedelta(days=hoje.weekday())
    dom = seg + timedelta(days=6)

    lancs = (db.query(models.Lancamento)
             .filter(models.Lancamento.data_competencia >= seg,
                     models.Lancamento.data_competencia <= dom)
             .order_by(models.Lancamento.data_competencia.desc())
             .all())

    total_rec = sum(float(l.valor) for l in lancs if l.tipo == models.TipoMov.receita)
    total_desp = sum(float(l.valor) for l in lancs if l.tipo == models.TipoMov.despesa)

    linhas = [
        f"📅 *Semana de {seg.strftime('%d/%m')} a {dom.strftime('%d/%m')}*",
        f"📈 Receitas: {_brl(total_rec)}",
        f"📉 Despesas: {_brl(total_desp)}",
        f"💰 Saldo: {_brl(total_rec - total_desp)}",
        "",
    ]

    if not lancs:
        linhas.append("📭 Nenhum lançamento nesta semana.")
        return "\n".join(linhas)

    linhas.append("*Lançamentos:*")
    for l in lancs[:10]:
        st = {"pago": "✅", "pendente": "🟡", "atrasado": "🔴"}.get(l.status, "•")
        ico = "💸" if l.tipo == models.TipoMov.despesa else "💵"
        linhas.append(f"{st}{ico} {l.descricao}: {_brl(l.valor)}")
    if len(lancs) > 10:
        linhas.append(f"... e mais {len(lancs)-10} lançamentos")

    return "\n".join(linhas)


def _texto_projecao(db: Session) -> str:
    """Projeção de saldo dos próximos 3 meses."""
    proj = service.projecao(db, meses=3)
    saldo_atual = float(service.saldo_total(db))
    linhas = [
        "🔮 *Projeção financeira*",
        f"Saldo atual: {_brl(saldo_atual)}", "",
    ]
    for m in proj:
        tendencia = "📈" if m["saldo"] >= saldo_atual else "📉"
        linhas.append(f"*{m['label']}* {tendencia}")
        linhas.append(f"  Receitas: {_brl(m['receitas'])}")
        linhas.append(f"  Despesas: {_brl(m['despesas'])}")
        linhas.append(f"  Saldo proj.: {_brl(m['saldo'])}")
        linhas.append("")
    linhas.append("_* Projeção baseada na média dos últimos 3 meses_")
    return "\n".join(linhas).rstrip()


def _texto_parcelas_zap(db: Session) -> str:
    """Parcelas de cartão pendentes."""
    from sqlalchemy.orm import joinedload
    parcelas = (db.query(models.ParcelaCartao)
                .options(
                    joinedload(models.ParcelaCartao.parcelamento)
                    .joinedload(models.Parcelamento.cartao),
                    joinedload(models.ParcelaCartao.parcelamento)
                    .joinedload(models.Parcelamento.compra),
                )
                .filter(models.ParcelaCartao.paga.is_(False))
                .order_by(models.ParcelaCartao.data_vencimento.asc())
                .limit(12).all())

    if not parcelas:
        return "✅ Nenhuma parcela de cartão pendente!"

    total = sum(float(p.valor) for p in parcelas)
    atrasadas = [p for p in parcelas if p.status == "atrasada"]
    linhas = [
        "💳 *Parcelas de cartão pendentes*",
        f"Total: {_brl(total)} ({len(parcelas)} parcelas)",
    ]
    if atrasadas:
        linhas.append(f"⚠️ {len(atrasadas)} atrasadas!")
    linhas.append("")
    for p in parcelas:
        pm = p.parcelamento
        estab = (pm.compra.estabelecimento if pm and pm.compra else None) or "Compra"
        cartao = pm.cartao.nome if pm and pm.cartao else "Cartão"
        st = "🔴" if p.status == "atrasada" else "🟡"
        venc = p.data_vencimento.strftime("%d/%m")
        linhas.append(f"{st} {estab} — parcela {p.numero}/{pm.total_parcelas}")
        linhas.append(f"   {cartao} · {_brl(p.valor)} · vence {venc}")
    linhas.append(f"\nDê baixa em parcela: `baixa parc ID`")
    return "\n".join(linhas)


def _texto_carros(db: Session) -> str:
    """Resumo de veículos e financiamentos."""
    veics = db.query(models.Veiculo).filter(models.Veiculo.ativo.is_(True)).all()
    if not veics:
        return "📭 Nenhum veículo cadastrado."

    linhas = ["🚗 *Veículos da família*", ""]
    total_pat = 0
    total_fin = 0
    for v in veics:
        val = float(v.valor_atual or 0)
        fin = float(v.saldo_financiamento or 0)
        liq = val - fin
        total_pat += val
        total_fin += fin
        linhas.append(f"🚗 *{v.nome}*")
        linhas.append(f"  Valor: {_brl(val)}")
        if v.financiado and fin > 0:
            pct = (1 - fin/val)*100 if val else 0
            rest = v.parcelas_restantes or 0
            linhas.append(f"  Financiamento: {_brl(fin)}")
            linhas.append(f"  Parcelas rest.: {rest}x de {_brl(v.valor_parcela or 0)}")
            linhas.append(f"  Quitado: {pct:.0f}%")
            linhas.append(f"  Líquido: {_brl(liq)}")
        linhas.append("")

    if len(veics) > 1:
        linhas.append(f"*Total veículos: {_brl(total_pat)}*")
        if total_fin:
            linhas.append(f"*Total financiado: {_brl(total_fin)}*")
            linhas.append(f"*Patrimônio líquido: {_brl(total_pat - total_fin)}*")

    return "\n".join(linhas).rstrip()


def _texto_dica(db: Session) -> str:
    """Sugere uma dica financeira personalizada baseada nos dados reais."""
    from datetime import timedelta
    k = service.kpis(db)
    hoje = date.today()

    # Escolhe a dica mais relevante pra situação atual
    dicas = []

    # Dica 1: saldo negativo ou baixo
    saldo = float(k.get("saldo", 0))
    if saldo < 0:
        dicas.append(
            "⚠️ *Atenção ao saldo!*\n\n"
            f"O saldo consolidado está negativo: {_brl(saldo)}.\n"
            "Revise as despesas pendentes e priorize o pagamento\n"
            "das contas com juros maiores primeiro."
        )

    # Dica 2: a pagar > a receber
    a_pagar = float(k.get("a_pagar", 0))
    a_receber = float(k.get("a_receber", 0))
    if a_pagar > a_receber and a_pagar > 0:
        dicas.append(
            "💡 *Equilibre o fluxo*\n\n"
            f"Este mês você tem {_brl(a_pagar)} a pagar\n"
            f"mas apenas {_brl(a_receber)} a receber.\n"
            "Verifique se há alguma receita pendente de\n"
            "lançamento ou negocie prazos se necessário."
        )

    # Dica 3: contas atrasadas
    atras = float(k.get("pagar_vencido", 0))
    if atras > 0:
        dicas.append(
            "🔴 *Contas vencidas!*\n\n"
            f"Há {_brl(atras)} em contas vencidas a pagar.\n"
            "Juros e multas aumentam a cada dia.\n"
            "Priorize o pagamento para evitar mais custos.\n"
            "Use `pagar` para ver a lista completa."
        )

    # Dica 4: meta sem aporte recente
    metas = db.query(models.Meta).filter(models.Meta.concluida.is_(False)).all()
    if metas:
        meta_mais_longe = min(metas, key=lambda m: m.progresso_pct)
        if meta_mais_longe.progresso_pct < 10:
            dicas.append(
                f"🎯 *Meta '{meta_mais_longe.nome}' precisa de atenção!*\n\n"
                f"Progresso atual: {meta_mais_longe.progresso_pct:.0f}%\n"
                f"Faltam {_brl(meta_mais_longe.falta)} para atingir o objetivo.\n"
                f"Que tal um pequeno aporte hoje?\n"
                f"`aporte 100 {meta_mais_longe.nome[:20]}`"
            )

    # Dica 5: fim do mês se aproximando
    fim_mes = hoje.replace(day=1) + __import__('dateutil.relativedelta', fromlist=['relativedelta']).relativedelta(months=1) - __import__('datetime').timedelta(days=1)
    dias_fim = (fim_mes - hoje).days
    if dias_fim <= 5 and a_pagar > 0:
        dicas.append(
            f"⏰ *Fim do mês chegando!*\n\n"
            f"Faltam {dias_fim} dias para acabar o mês.\n"
            f"Você tem {_brl(a_pagar)} ainda a pagar.\n"
            "Verifique se todas as contas estão em dia antes do fechamento."
        )

    # Dica 6: genérica se nada específico
    import random
    DICAS_GERAIS = [
        (
            "💰 *Regra dos 50-30-20*\n\n"
            "Uma distribuição saudável da renda:\n"
            "• 50% para necessidades essenciais\n"
            "• 30% para desejos e lazer\n"
            "• 20% para poupança e investimentos\n\n"
            "Use `gastos` para ver como estão os seus percentuais."
        ),
        (
            "📱 *Dica: Ler QR Code da nota*\n\n"
            "Toda nota fiscal tem um QR code!\n"
            "Escaneie com a câmera, copie o link e envie:\n"
            "`nf https://sat.sef.sc.gov.br/...`\n\n"
            "O sistema registra todos os itens da compra automaticamente."
        ),
        (
            "🎯 *Metas financeiras*\n\n"
            "Guardar dinheiro fica mais fácil com um objetivo claro.\n"
            "Crie uma meta no sistema e acompanhe pelo WhatsApp:\n"
            "`aporte 200 reserva`\n\n"
            f"{'Você já tem ' + str(len(metas)) + ' meta(s) ativa(s)!' if metas else 'Crie sua primeira meta em Finanças → Metas.'}"
        ),
        (
            "📊 *Acompanhe o fluxo mensal*\n\n"
            "Envie `fluxo` para ver o gráfico de receitas\n"
            "e despesas dos últimos 6 meses.\n\n"
            "Identificar padrões é o primeiro passo\n"
            "para melhorar as finanças da família!"
        ),
        (
            "⚡ *Comandos rápidos*\n\n"
            "Registre gastos na hora que acontecem:\n"
            "`despesa 45 lanche`\n"
            "`despesa 200 farmacia`\n\n"
            "Assim o controle fica sempre atualizado\n"
            "e nenhum gasto passa despercebido!"
        ),
    ]

    if dicas:
        return dicas[0]  # prioriza dica personalizada
    return random.choice(DICAS_GERAIS)


def _nova_conta(db: Session, texto: str) -> str:
    """Cadastra uma conta bancária rapidamente."""
    partes = texto.strip().split(None, 1)
    if len(partes) < 2:
        return (
            "🏦 *Nova conta*\n\n"
            "Formato: `nova conta NOME`\n\n"
            "Exemplos:\n"
            "• `nova conta Nubank`\n"
            "• `nova conta Sicoob CC`\n"
            "• `nova conta Caixa Poupança`"
        )
    nome = partes[1].strip().title()
    # Detecta tipo pelo nome
    tipo = "banco"
    nome_low = nome.lower()
    if any(k in nome_low for k in ["cartão", "cartao", "card", "visa", "master", "nubank", "inter"]):
        tipo = "cartao"
    elif any(k in nome_low for k in ["carteira", "dinheiro", "especie", "espécie", "cash"]):
        tipo = "carteira"

    ct = models.Conta(nome=nome, tipo=tipo, saldo_inicial=0)
    db.add(ct); db.commit(); db.refresh(ct)
    return (
        f"✅ *Conta criada!*\n\n"
        f"🏦 {ct.nome}\n"
        f"Tipo: {ct.tipo}\n"
        f"Saldo inicial: R$ 0,00\n\n"
        f"Para ajustar o saldo, acesse o sistema: Contas → Editar."
    )


def _nova_categoria(db: Session, texto: str) -> str:
    """Cadastra uma categoria rapidamente."""
    partes = texto.strip().split(None, 1)
    if len(partes) < 2:
        return (
            "🗂️ *Nova categoria*\n\n"
            "Formato: `nova cat NOME`\n\n"
            "Exemplos:\n"
            "• `nova cat Mercado`\n"
            "• `nova cat Freelance`"
        )
    nome = partes[1].strip().title()
    # Detecta tipo pela palavra
    tipo = "despesa"
    nome_low = nome.lower()
    if any(k in nome_low for k in ["salario", "receita", "renda", "freelance", "honorario", "venda"]):
        tipo = "receita"

    cat = models.Categoria(nome=nome, tipo=tipo, cor="#082D51")
    db.add(cat); db.commit(); db.refresh(cat)
    return (
        f"✅ *Categoria criada!*\n\n"
        f"{'📈' if tipo == 'receita' else '📉'} {cat.nome}\n"
        f"Tipo: {tipo}\n\n"
        f"Já pode usar: `{'receita' if tipo == 'receita' else 'despesa'} 100 {nome.lower()}`"
    )


def _ajuda_comando(cmd: str) -> str:
    """Exibe ajuda detalhada de um comando específico."""
    cmd = cmd.strip().lower()
    if cmd in AJUDAS:
        return AJUDAS[cmd]
    # sugere comandos parecidos
    todos = list(AJUDAS.keys()) + ["saldo", "vencer", "resumo", "metas", "fluxo", "gastos", "hoje", "semana", "projecao", "parcelas", "carros", "dica"]
    sugest = [c for c in todos if cmd in c or c in cmd]
    if sugest:
        return f"ℹ️ Comando `{cmd}` não reconhecido.\nVocê quis dizer: `{sugest[0]}`?\n\nEnvie `menu` para ver todos os comandos."
    return f"ℹ️ Comando `{cmd}` não encontrado.\nEnvie `menu` para ver todos os comandos disponíveis."


def _texto_lembrete_mes_seguinte(db: Session) -> str:
    """Contas fixas que vencem no próximo mês (para alertas automáticos)."""
    from dateutil.relativedelta import relativedelta
    prox = date.today() + relativedelta(months=1)
    ini = prox.replace(day=1)
    from calendar import monthrange
    fim = prox.replace(day=monthrange(prox.year, prox.month)[1])

    prox_mes = (db.query(models.Lancamento)
                .filter(models.Lancamento.data_vencimento >= ini,
                        models.Lancamento.data_vencimento <= fim)
                .order_by(models.Lancamento.tipo, models.Lancamento.data_vencimento)
                .all())

    if not prox_mes:
        return None

    total_desp = sum(float(l.valor) for l in prox_mes if l.tipo == models.TipoMov.despesa)
    linhas = [
        f"📋 *Contas do próximo mês ({ini.strftime('%B/%Y').title()})*",
        f"Total previsto: {_brl(total_desp)}", "",
    ]
    for l in prox_mes[:10]:
        ico = "💸" if l.tipo == models.TipoMov.despesa else "💵"
        d = l.data_vencimento.strftime("%d/%m") if l.data_vencimento else ""
        linhas.append(f"{ico} {l.descricao} — {_brl(l.valor)}{' (dia '+d+')' if d else ''}")
    if len(prox_mes) > 10:
        linhas.append(f"... e mais {len(prox_mes)-10}")
    return "\n".join(linhas)
