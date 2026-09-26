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
                    f"📅 {l.data_vencimento.strftime('%d/%m/%Y')}\n"
                    f"Status: {l.status}")

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
