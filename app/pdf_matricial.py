"""
PDFs estilo impressora matricial / cupom térmico.
Papel estreito (bobina 80mm), fonte monoespaçada, bordas tracejadas,
separadores pontilhados, texto tipo "===" e "---" — visual retrô de
impressora de ponto ou impressora térmica de caixa registradora.
"""
import io
import hashlib
import uuid
from datetime import date, datetime

from reportlab.lib.pagesizes import mm as MM_UNIT
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)
from reportlab.graphics.shapes import Drawing, Rect
from .config import settings

# Largura de bobina (80mm é o padrão de impressora térmica de balcão)
LARGURA_BOBINA = 80 * mm
MARGEM = 4 * mm

PRETO = colors.HexColor("#1A1A1A")
CINZA = colors.HexColor("#5A5A5A")
LINHA = colors.HexColor("#222222")

FONTE = "Courier"
FONTE_B = "Courier-Bold"


def brl(v) -> str:
    try:
        v = float(v or 0)
    except (TypeError, ValueError):
        v = 0.0
    sinal = "-" if v < 0 else " "
    v = abs(v)
    return sinal + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _hash(*args) -> str:
    seed = "|".join(str(a) for a in args) + "|" + uuid.uuid4().hex[:8]
    return hashlib.sha256(seed.encode()).hexdigest()[:16].upper()


# Largura útil em caracteres. Calculado para Courier 8.3pt em bobina 80mm
# com margem de segurança (evita quebra de linha indesejada do Paragraph).
COLS = 36


def _nbsp(txt: str) -> str:
    """Substitui espaços normais por espaços não-quebráveis (Paragraph colapsa espaços comuns)."""
    return txt.replace(" ", "&nbsp;")


def _linha_pontilhada(char="-"):
    return _nbsp(char * COLS)


def _centralizar(txt, largura=COLS):
    txt = txt[:largura]
    pad = largura - len(txt)
    esq = pad // 2
    return _nbsp(" " * esq) + txt + _nbsp(" " * (pad - esq))


def _linha_2col(esq, dir_, largura=COLS):
    """Alinha texto à esquerda e à direita, preenchendo com espaços não-quebráveis."""
    esq = str(esq)
    dir_ = str(dir_)
    espaco = largura - len(esq) - len(dir_)
    if espaco < 1:
        esq = esq[: largura - len(dir_) - 1]
        espaco = largura - len(esq) - len(dir_)
    return esq + _nbsp(" " * max(espaco, 1)) + dir_


def _quebrar_texto(txt, largura=COLS):
    """Quebra texto longo em múltiplas linhas de largura fixa (word wrap simples)."""
    palavras = txt.split()
    linhas, atual = [], ""
    for p in palavras:
        teste = (atual + " " + p).strip()
        if len(teste) > largura:
            if atual:
                linhas.append(atual)
            atual = p
        else:
            atual = teste
    if atual:
        linhas.append(atual)
    return linhas or [""]


def _styles_mono():
    base = ParagraphStyle("mono", fontName=FONTE, fontSize=8.3, leading=10.5,
                          textColor=PRETO, alignment=TA_LEFT)
    bold = ParagraphStyle("monoB", fontName=FONTE_B, fontSize=8.3, leading=10.5,
                          textColor=PRETO, alignment=TA_LEFT)
    center = ParagraphStyle("monoC", fontName=FONTE, fontSize=8.3, leading=10.5,
                            textColor=PRETO, alignment=TA_CENTER)
    center_b = ParagraphStyle("monoCB", fontName=FONTE_B, fontSize=9.5, leading=12,
                              textColor=PRETO, alignment=TA_CENTER)
    title = ParagraphStyle("monoT", fontName=FONTE_B, fontSize=11, leading=14,
                           textColor=PRETO, alignment=TA_CENTER)
    tiny = ParagraphStyle("monoTiny", fontName=FONTE, fontSize=6.6, leading=8.5,
                          textColor=CINZA, alignment=TA_CENTER)
    label = ParagraphStyle("monoLabel", fontName=FONTE, fontSize=6.8, leading=9,
                           textColor=CINZA, alignment=TA_LEFT)
    return base, bold, center, center_b, title, tiny, label


def _doc_bobina(title, altura_estim_mm=200):
    """Documento com largura de bobina térmica e altura variável (papel contínuo)."""
    buf = io.BytesIO()
    pagesize = (LARGURA_BOBINA, altura_estim_mm * mm)
    doc = SimpleDocTemplate(
        buf, pagesize=pagesize, title=title,
        leftMargin=MARGEM, rightMargin=MARGEM, topMargin=MARGEM, bottomMargin=MARGEM,
    )
    return buf, doc


def _altura_necessaria(els, largura_util=LARGURA_BOBINA - 2*MARGEM):
    """Soma a altura real que os flowables vão ocupar, para dimensionar a bobina sem sobra."""
    total = 0
    for el in els:
        try:
            _, h = el.wrap(largura_util, 10000 * mm)
            total += h
        except Exception:
            total += 10  # fallback de segurança
    return total


def _build_bobina(els, title):
    """Mede a altura real do conteúdo e gera o PDF numa única página com esse tamanho exato
    (mais margens de topo/rodapé), evitando página extra em branco."""
    altura_pt = _altura_necessaria(els) + 2 * MARGEM + 6 * mm
    altura_mm = max(altura_pt / mm, 60)  # nunca menor que 60mm
    buf, doc = _doc_bobina(title, altura_estim_mm=altura_mm)
    doc.build(els)
    return buf.getvalue()


def _serrilha(largura=COLS):
    """Simula uma linha serrilhada de destaque (estilo picote de bobina)."""
    return "".join("^" if i % 2 == 0 else "v" for i in range(largura))


def _qr_mini(text: str, size=16*mm):
    d = Drawing(size, size)
    n = 21
    cell = size / n
    h = hashlib.sha256(text.encode()).digest()
    d.add(Rect(0, 0, size, size, fillColor=colors.white, strokeColor=None))
    for ox, oy in [(0, n-7), (n-7, n-7), (0, 0)]:
        for i in range(7):
            for j in range(7):
                if i in (0,6) or j in (0,6) or (2<=i<=4 and 2<=j<=4):
                    d.add(Rect((ox+i)*cell, (oy+j)*cell, cell, cell, fillColor=PRETO, strokeColor=None))
    bits = []
    for b in h:
        for bit in range(8):
            bits.append((b >> bit) & 1)
    idx = 0
    for i in range(n):
        for j in range(n):
            if (i<8 and j>n-9) or (i>n-9 and j>n-9) or (i<8 and j<8):
                continue
            if idx < len(bits) and bits[idx]:
                d.add(Rect(i*cell, j*cell, cell, cell, fillColor=PRETO, strokeColor=None))
            idx = (idx + 1) % len(bits)
    return d


def _cabecalho_bobina(mono, bold, center, center_b, title, tiny, titulo, subtitulo=""):
    els = []
    els.append(Paragraph(_centralizar("=" * COLS), mono))
    els.append(Paragraph(settings.EMPRESA_NOME.upper(), title))
    if settings.EMPRESA_DOC:
        els.append(Paragraph(_centralizar(settings.EMPRESA_DOC), tiny))
    if settings.EMPRESA_CIDADE:
        els.append(Paragraph(_centralizar(settings.EMPRESA_CIDADE), tiny))
    els.append(Paragraph(_centralizar("=" * COLS), mono))
    els.append(Spacer(1, 4))
    els.append(Paragraph(titulo.upper(), center_b))
    if subtitulo:
        els.append(Paragraph(subtitulo, center))
    els.append(Paragraph(_linha_pontilhada("-"), mono))
    return els


def _rodape_bobina(mono, bold, center, tiny, auth):
    els = []
    els.append(Paragraph(_linha_pontilhada("-"), mono))
    els.append(Paragraph(_centralizar("DOCUMENTO GERADO POR"), tiny))
    els.append(Paragraph(_centralizar("TOMELIN GESTAO FINANCEIRA"), tiny))
    els.append(Spacer(1, 6))
    qr = _qr_mini(auth, size=18*mm)
    qr_t = Table([[qr]], colWidths=[LARGURA_BOBINA - 2*MARGEM])
    qr_t.setStyle(TableStyle([("ALIGN", (0,0), (-1,-1), "CENTER")]))
    els.append(qr_t)
    els.append(Spacer(1, 4))
    els.append(Paragraph(_centralizar("AUTENTICIDADE"), tiny))
    els.append(Paragraph(_centralizar(auth), tiny))
    els.append(Paragraph(_centralizar(datetime.now().strftime("%d/%m/%Y %H:%M")), tiny))
    els.append(Spacer(1, 6))
    els.append(Paragraph(_centralizar("*" * COLS), mono))
    els.append(Paragraph(_centralizar("OBRIGADO"), center))
    els.append(Paragraph(_centralizar("*" * COLS), mono))
    return els


# ================================================================
#  RECIBO — estilo cupom
# ================================================================
def recibo_matricial(l, categoria="", conta="", contato="") -> bytes:
    mono, bold, center, center_b, title, tiny, label = _styles_mono()
    auth = _hash("recibo-mtx", l.id, l.valor_total)
    tipo_lbl = "RECEBIMENTO" if l.tipo.value == "receita" else "PAGAMENTO"

    # (buf/doc criados no final via _build_bobina, após montar todos os elementos)
    els = _cabecalho_bobina(mono, bold, center, center_b, title, tiny,
                            f"RECIBO DE {tipo_lbl}", f"Nº {l.id:04d}")
    els.append(Spacer(1, 4))

    els.append(Paragraph(_linha_2col("STATUS:", l.status.upper()), bold))
    els.append(Paragraph(_linha_pontilhada("."), mono))
    els.append(Spacer(1, 3))

    for linha in _quebrar_texto(l.descricao or "-"):
        els.append(Paragraph(linha, mono))
    els.append(Spacer(1, 3))

    campos = [
        ("Categoria", categoria or "-"),
        ("Competencia", l.data_competencia.strftime("%d/%m/%Y") if l.data_competencia else "-"),
        ("Vencimento", l.data_vencimento.strftime("%d/%m/%Y") if l.data_vencimento else "-"),
        ("Pagamento", l.data_pagamento.strftime("%d/%m/%Y") if l.data_pagamento else "-"),
        ("Conta", conta or "-"),
        (("Recebido de" if l.tipo.value == "receita" else "Pago para"), contato or "-"),
    ]
    for k, v in campos:
        linha_unica = f"{k}: {v}"
        if len(linha_unica) <= COLS:
            els.append(Paragraph(linha_unica, mono))
        else:
            els.append(Paragraph(f"{k}:", label))
            for linha in _quebrar_texto(v):
                els.append(Paragraph(linha, mono))
    els.append(Spacer(1, 3))
    els.append(Paragraph(_linha_pontilhada("-"), mono))

    els.append(Paragraph(_linha_2col("Valor", "R$ " + brl(l.valor).strip()), mono))
    if l.juros:
        els.append(Paragraph(_linha_2col("Juros", "R$ " + brl(l.juros).strip()), mono))
    if l.multa:
        els.append(Paragraph(_linha_2col("Multa", "R$ " + brl(l.multa).strip()), mono))
    els.append(Paragraph(_linha_pontilhada("="), mono))
    els.append(Paragraph(_linha_2col("TOTAL", "R$ " + brl(l.valor_total).strip()), bold))
    els.append(Paragraph(_linha_pontilhada("="), mono))
    els.append(Spacer(1, 8))

    frase = ("RECEBI(EMOS) A IMPORTANCIA" if l.tipo.value == "receita"
             else "PAGAMENTO REGISTRADO")
    els.append(Paragraph(_centralizar(frase), center))
    els.append(Paragraph(_centralizar("CONFORME DISCRIMINADO ACIMA"), center))
    els.append(Spacer(1, 14))
    els.append(Paragraph(_centralizar("x" * 26), mono))
    els.append(Paragraph(_centralizar("ASSINATURA / CARIMBO"), tiny))
    els.append(Spacer(1, 8))

    els += _rodape_bobina(mono, bold, center, tiny, auth)
    return _build_bobina(els, f"Recibo-{l.id:04d}")


# ================================================================
#  BALANCETE — estilo cupom
# ================================================================
def balancete_matricial(periodo_label, receitas, despesas, tot_rec, tot_desp, juros_total=0) -> bytes:
    mono, bold, center, center_b, title, tiny, label = _styles_mono()
    auth = _hash("balancete-mtx", periodo_label, tot_rec, tot_desp)
    resultado = tot_rec - tot_desp

    # (buf/doc criados no final via _build_bobina, após montar todos os elementos)
    els = _cabecalho_bobina(mono, bold, center, center_b, title, tiny,
                            "BALANCETE FINANCEIRO", periodo_label)
    els.append(Spacer(1, 4))

    els.append(Paragraph(_centralizar("* RECEITAS *"), bold))
    els.append(Paragraph(_linha_pontilhada("."), mono))
    for nome, val in receitas:
        for i, linha in enumerate(_quebrar_texto(nome, COLS - 12)):
            if i == 0:
                els.append(Paragraph(_linha_2col(linha, "R$ " + brl(val).strip()), mono))
            else:
                els.append(Paragraph(linha, mono))
    els.append(Paragraph(_linha_pontilhada("-"), mono))
    els.append(Paragraph(_linha_2col("TOTAL RECEITAS", "R$ " + brl(tot_rec).strip()), bold))
    els.append(Spacer(1, 6))

    els.append(Paragraph(_centralizar("* DESPESAS *"), bold))
    els.append(Paragraph(_linha_pontilhada("."), mono))
    for nome, val in despesas:
        for i, linha in enumerate(_quebrar_texto(nome, COLS - 12)):
            if i == 0:
                els.append(Paragraph(_linha_2col(linha, "R$ " + brl(val).strip()), mono))
            else:
                els.append(Paragraph(linha, mono))
    els.append(Paragraph(_linha_pontilhada("-"), mono))
    els.append(Paragraph(_linha_2col("TOTAL DESPESAS", "R$ " + brl(tot_desp).strip()), bold))
    els.append(Spacer(1, 6))

    els.append(Paragraph(_linha_pontilhada("="), mono))
    els.append(Paragraph(_linha_2col("RESULTADO", "R$ " + brl(resultado).strip()), bold))
    els.append(Paragraph(_linha_pontilhada("="), mono))

    if juros_total:
        els.append(Spacer(1, 4))
        els.append(Paragraph(_linha_2col("Juros/multas", "R$ " + brl(juros_total).strip()), mono))

    if despesas:
        maior = max(despesas, key=lambda x: x[1])
        if tot_desp and maior[1] / tot_desp > 0.3:
            els.append(Spacer(1, 6))
            els.append(Paragraph(_linha_pontilhada("."), mono))
            pctx = f"{(maior[1]/tot_desp*100):.0f}%"
            els.append(Paragraph(_centralizar("OBSERVACAO"), tiny))
            for linha in _quebrar_texto(f"{maior[0]} concentra {pctx} das despesas"):
                els.append(Paragraph(linha, mono))

    els += _rodape_bobina(mono, bold, center, tiny, auth)
    return _build_bobina(els, "Balancete")


# ================================================================
#  PATRIMÔNIO — estilo cupom
# ================================================================
def patrimonio_matricial(contas, veiculos, total_contas, total_veic, total_financ) -> bytes:
    mono, bold, center, center_b, title, tiny, label = _styles_mono()
    auth = _hash("patrimonio-mtx", total_contas, total_veic, total_financ)
    total_ativos = total_contas + total_veic
    liquido = total_ativos - total_financ

    # (buf/doc criados no final via _build_bobina, após montar todos os elementos)
    els = _cabecalho_bobina(mono, bold, center, center_b, title, tiny,
                            "DEMONSTRATIVO DE PATRIMONIO", date.today().strftime("%d/%m/%Y"))
    els.append(Spacer(1, 4))

    els.append(Paragraph(_centralizar("* CONTAS *"), bold))
    els.append(Paragraph(_linha_pontilhada("."), mono))
    for nome, saldo in contas:
        for i, linha in enumerate(_quebrar_texto(nome, COLS - 12)):
            if i == 0:
                els.append(Paragraph(_linha_2col(linha, "R$ " + brl(saldo).strip()), mono))
            else:
                els.append(Paragraph(linha, mono))
    els.append(Paragraph(_linha_pontilhada("-"), mono))
    els.append(Paragraph(_linha_2col("SUBTOTAL", "R$ " + brl(total_contas).strip()), bold))
    els.append(Spacer(1, 6))

    els.append(Paragraph(_centralizar("* VEICULOS *"), bold))
    els.append(Paragraph(_linha_pontilhada("."), mono))
    for nome, val, financ, liq in veiculos:
        for linha in _quebrar_texto(nome):
            els.append(Paragraph(linha, bold))
        els.append(Paragraph(_linha_2col("  Valor", "R$ " + brl(val).strip()), mono))
        els.append(Paragraph(_linha_2col("  Falta pagar", "R$ " + brl(financ).strip()), mono))
        els.append(Paragraph(_linha_2col("  Liquido", "R$ " + brl(liq).strip()), mono))
        els.append(Paragraph(_linha_pontilhada("."), mono))
    els.append(Spacer(1, 4))

    els.append(Paragraph(_linha_pontilhada("="), mono))
    els.append(Paragraph(_linha_2col("Ativos", "R$ " + brl(total_ativos).strip()), mono))
    els.append(Paragraph(_linha_2col("Passivos", "-R$ " + brl(total_financ).strip()), mono))
    els.append(Paragraph(_linha_pontilhada("-"), mono))
    els.append(Paragraph(_linha_2col("PATRIMONIO LIQ.", "R$ " + brl(liquido).strip()), bold))
    els.append(Paragraph(_linha_pontilhada("="), mono))

    if total_ativos:
        alav = total_financ / total_ativos * 100
        els.append(Spacer(1, 6))
        els.append(Paragraph(_centralizar("OBSERVACAO"), tiny))
        for linha in _quebrar_texto(f"Financiamentos = {alav:.0f}% dos ativos"):
            els.append(Paragraph(linha, mono))

    els += _rodape_bobina(mono, bold, center, tiny, auth)
    return _build_bobina(els, "Patrimonio")
