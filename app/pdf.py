"""
Geração de PDFs profissionais — identidade visual Tomelin.
Paleta navy/gold/steel, ícones SVG desenhados, QR Code de autenticidade.
"""
import io
import os
import hashlib
import uuid
from datetime import date, datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, HRFlowable, KeepTogether, Flowable,
)
from reportlab.graphics.shapes import Drawing, Rect, String, Circle, Line, Group, Polygon
from reportlab.graphics import renderPDF

from .config import settings

# ── Paleta (navy + gold + steel — sem verde vibrante) ──
NAVY      = colors.HexColor("#082D51")
NAVY_LIGHT= colors.HexColor("#0E3A63")
STEEL     = colors.HexColor("#305C74")
GOLD      = colors.HexColor("#C9A94E")
GOLD_SOFT = colors.HexColor("#FBF5E4")
TEAL      = colors.HexColor("#2F817A")
RED       = colors.HexColor("#B4503E")
INK       = colors.HexColor("#0C2135")
INK_2     = colors.HexColor("#4A6070")
LINE      = colors.HexColor("#D9E0E7")
SOFT      = colors.HexColor("#F4F6F8")
WHITE     = colors.white

_LOGO = os.path.join(os.path.dirname(__file__), "static", "icons", "logo-horizontal.png")
W, H = A4


def brl(v) -> str:
    try: v = float(v or 0)
    except (TypeError, ValueError): v = 0.0
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _hash(*args) -> str:
    seed = "|".join(str(a) for a in args) + "|" + uuid.uuid4().hex[:8]
    return hashlib.sha256(seed.encode()).hexdigest()[:24].upper()


# ── Estilos ──
def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=17, textColor=WHITE, spaceAfter=2))
    ss.add(ParagraphStyle("H2", fontName="Helvetica-Bold", fontSize=13, textColor=NAVY, spaceBefore=12, spaceAfter=4))
    ss.add(ParagraphStyle("Sub", fontSize=9, textColor=colors.HexColor("#8EAEC4")))
    ss.add(ParagraphStyle("Cell", fontSize=9.5, textColor=INK, leading=13))
    ss.add(ParagraphStyle("CellR", fontSize=9.5, textColor=INK, alignment=TA_RIGHT, leading=13))
    ss.add(ParagraphStyle("CellB", fontName="Helvetica-Bold", fontSize=9.5, textColor=NAVY, leading=13))
    ss.add(ParagraphStyle("CellBR", fontName="Helvetica-Bold", fontSize=9.5, textColor=NAVY, alignment=TA_RIGHT, leading=13))
    ss.add(ParagraphStyle("Small", fontSize=7.5, textColor=STEEL))
    ss.add(ParagraphStyle("SmallC", fontSize=7.5, textColor=STEEL, alignment=TA_CENTER))
    ss.add(ParagraphStyle("Footer", fontSize=7, textColor=INK_2, alignment=TA_CENTER))
    return ss


def _doc(title):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title=title,
        leftMargin=18*mm, rightMargin=18*mm, topMargin=14*mm, bottomMargin=16*mm)
    return buf, doc


# ── SVG Ícones (Drawing objects) ──
def _icon_wallet(size=8*mm):
    d = Drawing(size, size)
    s = size
    d.add(Rect(s*.12, s*.25, s*.76, s*.5, rx=s*.08, fillColor=None, strokeColor=WHITE, strokeWidth=1.2))
    d.add(Circle(s*.7, s*.5, s*.06, fillColor=WHITE, strokeColor=None))
    return d

def _icon_chart(size=8*mm):
    d = Drawing(size, size)
    s = size
    d.add(Rect(s*.1, s*.15, s*.18, s*.7, fillColor=colors.HexColor("#C9A94E99"), strokeColor=None))
    d.add(Rect(s*.35, s*.35, s*.18, s*.5, fillColor=colors.HexColor("#C9A94ECC"), strokeColor=None))
    d.add(Rect(s*.6, s*.05, s*.18, s*.8, fillColor=GOLD, strokeColor=None))
    return d

def _icon_shield(size=8*mm):
    d = Drawing(size, size)
    s = size
    pts = [s*.5, s*.05, s*.9, s*.25, s*.9, s*.55, s*.5, s*.95, s*.1, s*.55, s*.1, s*.25]
    d.add(Polygon(pts, fillColor=None, strokeColor=WHITE, strokeWidth=1.2))
    d.add(Line(s*.35, s*.5, s*.47, s*.63, strokeColor=WHITE, strokeWidth=1.5))
    d.add(Line(s*.47, s*.63, s*.7, s*.35, strokeColor=WHITE, strokeWidth=1.5))
    return d


# ── QR Code visual ──
def _qr_drawing(text: str, size=18*mm):
    d = Drawing(size, size)
    n = 21
    cell = size / n
    h = hashlib.sha256(text.encode()).digest()
    d.add(Rect(0, 0, size, size, fillColor=WHITE, strokeColor=LINE, strokeWidth=.4))
    for ox, oy in [(0, n-7), (n-7, n-7), (0, 0)]:
        for i in range(7):
            for j in range(7):
                if i in (0,6) or j in (0,6) or (2<=i<=4 and 2<=j<=4):
                    d.add(Rect((ox+i)*cell, (oy+j)*cell, cell, cell, fillColor=NAVY, strokeColor=None))
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
                d.add(Rect(i*cell, j*cell, cell, cell, fillColor=NAVY, strokeColor=None))
            idx = (idx + 1) % len(bits)
    return d


# ── Cabeçalho (faixa navy + barra gold) ──
def _cabecalho(ss, titulo, subtitulo=""):
    els = []
    # Logo
    logo_cell = ""
    if os.path.exists(_LOGO):
        try:
            img = Image(_LOGO)
            r = img.imageWidth / img.imageHeight
            img.drawHeight = 12*mm; img.drawWidth = 12*mm * r
            logo_cell = img
        except Exception: pass

    tp = Paragraph(titulo, ss["H1"])
    parts = [settings.EMPRESA_NOME]
    if subtitulo: parts.append(subtitulo)
    sp = Paragraph(" · ".join(parts), ss["Sub"])

    if logo_cell:
        data = [[logo_cell, [tp, sp]]]
        ht = Table(data, colWidths=[38*mm, None], rowHeights=[20*mm])
    else:
        data = [[[tp, sp]]]
        ht = Table(data, colWidths=[None], rowHeights=[20*mm])
    ht.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), NAVY),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 14),
        ("RIGHTPADDING", (0,0), (-1,-1), 14),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    els.append(ht)

    # Barra gold fina
    gt = Table([[""]], colWidths=[None], rowHeights=[2*mm])
    gt.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), GOLD)]))
    els.append(gt)
    els.append(Spacer(1, 10))
    return els


# ── Título de seção com sublinhado gold ──
def _secao(ss, titulo):
    return Paragraph(f'<font color="#{NAVY.hexval()[2:]}"><b>{titulo}</b></font>', ss["H2"])


# ── Rodapé com QR + autenticidade ──
def _rodape(ss, auth):
    els = [Spacer(1, 14)]
    els.append(HRFlowable(width="100%", thickness=.6, color=GOLD, spaceAfter=8))
    qr = _qr_drawing(auth, size=16*mm)
    info = Paragraph(
        f'<font size="7"><b>Autenticidade:</b> {auth}</font><br/>'
        f'<font size="6.5">Emitido em {datetime.now().strftime("%d/%m/%Y %H:%M")} · '
        f'Documento gerado pelo Tomelin Gestao Financeira</font>', ss["Footer"])
    parts = [p for p in [settings.EMPRESA_NOME, settings.EMPRESA_DOC, settings.EMPRESA_CIDADE] if p]
    foot = Paragraph('<font size="6.5">' + " · ".join(parts) + '</font>', ss["Footer"])
    ft = Table([[qr, [info, Spacer(1,3), foot]]], colWidths=[20*mm, None])
    ft.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (1,0), (1,0), 8),
        ("TOPPADDING", (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
    ]))
    els.append(ft)
    return els


# ── Tabela elegante ──
def _tabela(data, col_widths, cor_header=NAVY):
    """Tabela com header navy, zebra suave, linhas finas."""
    t = Table(data, colWidths=col_widths, repeatRows=1)
    styles = [
        ("BACKGROUND", (0,0), (-1,0), cor_header),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,0), 9),
        ("FONTSIZE", (0,1), (-1,-1), 9.5),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("LINEBELOW", (0,0), (-1,-1), .3, LINE),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]
    # Zebra
    for i in range(1, len(data)):
        if i % 2 == 0:
            styles.append(("BACKGROUND", (0,i), (-1,i), SOFT))
    t.setStyle(TableStyle(styles))
    return t


# ── KPI inline (label: valor) ──
def _kpi_row(items):
    """items: list of (label, valor, cor_hex)"""
    cells = []
    for lab, val, cor in items:
        p = Paragraph(f'<font size="8" color="#{cor}">{lab}</font><br/>'
                      f'<font size="12" color="#{cor}"><b>{val}</b></font>',
                      ParagraphStyle("kpi", alignment=TA_CENTER, leading=16, spaceAfter=0))
        cells.append(p)
    t = Table([cells], colWidths=[None]*len(cells))
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), SOFT),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("LINEBELOW", (0,0), (-1,-1), 1, GOLD),
    ]))
    return t


# ================================================================
#  RECIBO
# ================================================================
def recibo(l, categoria="", conta="", contato="") -> bytes:
    ss = _styles()
    buf, doc = _doc(f"Recibo #{l.id:04d}")
    auth = _hash("recibo", l.id, l.valor_total)
    tipo_lbl = "Recebimento" if l.tipo.value == "receita" else "Pagamento"
    els = _cabecalho(ss, f"Recibo de {tipo_lbl}", f"No {l.id:04d}")

    # Status
    st = l.status.capitalize()
    st_cor = TEAL if l.status == "pago" else GOLD if l.status == "pendente" else RED
    st_t = Table([[Paragraph(f'<font color="#{st_cor.hexval()[2:]}"><b>{st}</b></font>', ss["CellR"])]],
                 colWidths=[None])
    st_t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor(f"#{st_cor.hexval()[2:]}12")),
        ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 12), ("LEFTPADDING", (0,0), (-1,-1), 12),
    ]))
    els.append(st_t)
    els.append(Spacer(1, 8))

    # Dados
    rows = [
        ("Descricao", l.descricao),
        ("Categoria", categoria or "—"),
        ("Competencia", l.data_competencia.strftime("%d/%m/%Y") if l.data_competencia else "—"),
        ("Vencimento", l.data_vencimento.strftime("%d/%m/%Y") if l.data_vencimento else "—"),
        ("Pagamento", l.data_pagamento.strftime("%d/%m/%Y") if l.data_pagamento else "—"),
        ("Conta", conta or "—"),
        ("Recebido de" if l.tipo.value == "receita" else "Pago para", contato or "—"),
    ]
    data = [[Paragraph(f"<b>{k}</b>", ss["Cell"]), Paragraph(str(v), ss["Cell"])] for k,v in rows]
    t = Table(data, colWidths=[36*mm, None])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0,0), (-1,-1), .3, LINE),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("BACKGROUND", (0,0), (0,-1), SOFT),
        ("LEFTPADDING", (0,0), (0,-1), 8),
    ]))
    els.append(t)
    els.append(Spacer(1, 10))

    # Valores
    vrows = [["Valor principal", brl(l.valor)]]
    if l.juros: vrows.append(["Juros", brl(l.juros)])
    if l.multa: vrows.append(["Multa", brl(l.multa)])
    vrows.append(["VALOR TOTAL", brl(l.valor_total)])

    vdata = []
    for i, (k,v) in enumerate(vrows):
        final = i == len(vrows)-1
        sk = ss["CellB"] if final else ss["Cell"]
        sv = ss["CellBR"] if final else ss["CellR"]
        vdata.append([Paragraph(k, sk), Paragraph(v, sv)])
    vt = Table(vdata, colWidths=[None, 50*mm])
    vt.setStyle(TableStyle([
        ("LINEBELOW", (0,0), (-1,-2), .3, LINE),
        ("BACKGROUND", (0,-1), (-1,-1), GOLD_SOFT),
        ("TEXTCOLOR", (0,-1), (-1,-1), NAVY),
        ("LINEABOVE", (0,-1), (-1,-1), 1, GOLD),
        ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ]))
    els.append(vt)
    els.append(Spacer(1, 16))

    frase = ("Recebi(emos) a importancia acima especificada."
             if l.tipo.value == "receita"
             else "Pagamento registrado conforme discriminado acima.")
    els.append(Paragraph(frase, ss["Cell"]))
    els.append(Spacer(1, 24))
    els.append(HRFlowable(width="55%", thickness=.5, color=LINE, spaceAfter=2))
    els.append(Paragraph("Assinatura / Carimbo",
        ParagraphStyle("sig", fontSize=8, textColor=STEEL, alignment=TA_CENTER)))

    els += _rodape(ss, auth)
    doc.build(els)
    return buf.getvalue()


# ================================================================
#  BALANCETE
# ================================================================
def balancete(periodo_label, receitas, despesas, tot_rec, tot_desp, juros_total=0) -> bytes:
    ss = _styles()
    buf, doc = _doc("Balancete Financeiro")
    auth = _hash("balancete", periodo_label, tot_rec, tot_desp)
    els = _cabecalho(ss, "Balancete Financeiro", periodo_label)
    resultado = tot_rec - tot_desp

    # KPIs
    res_hex = TEAL.hexval()[2:] if resultado >= 0 else RED.hexval()[2:]
    els.append(_kpi_row([
        ("Receitas", brl(tot_rec), TEAL.hexval()[2:]),
        ("Despesas", brl(tot_desp), RED.hexval()[2:]),
        ("Resultado", brl(resultado), res_hex),
    ]))
    els.append(Spacer(1, 10))

    # Receitas
    els.append(_secao(ss, "Receitas"))
    rdata = [["Categoria", "Valor"]]
    for nome, val in receitas:
        rdata.append([nome, brl(val)])
    rdata.append(["Total receitas", brl(tot_rec)])
    rt = _tabela(rdata, [None, 48*mm], TEAL)
    # Total row
    rt_style = []
    rt_style.append(("BACKGROUND", (0, len(rdata)-1), (-1, len(rdata)-1), GOLD_SOFT))
    rt_style.append(("TEXTCOLOR", (0, len(rdata)-1), (-1, len(rdata)-1), NAVY))
    rt_style.append(("FONTNAME", (0, len(rdata)-1), (-1, len(rdata)-1), "Helvetica-Bold"))
    rt.setStyle(TableStyle(rt_style))
    els.append(rt)
    els.append(Spacer(1, 8))

    # Despesas
    els.append(_secao(ss, "Despesas"))
    ddata = [["Categoria", "Valor"]]
    for nome, val in despesas:
        ddata.append([nome, brl(val)])
    ddata.append(["Total despesas", brl(tot_desp)])
    dt = _tabela(ddata, [None, 48*mm], STEEL)
    dt_style = []
    dt_style.append(("BACKGROUND", (0, len(ddata)-1), (-1, len(ddata)-1), GOLD_SOFT))
    dt_style.append(("TEXTCOLOR", (0, len(ddata)-1), (-1, len(ddata)-1), NAVY))
    dt_style.append(("FONTNAME", (0, len(ddata)-1), (-1, len(ddata)-1), "Helvetica-Bold"))
    dt.setStyle(TableStyle(dt_style))
    els.append(dt)
    els.append(Spacer(1, 8))

    if juros_total:
        els.append(Paragraph(f'Juros pagos no periodo: <b>{brl(juros_total)}</b>', ss["Cell"]))
        els.append(Spacer(1, 6))

    # Resultado
    res_cor = TEAL if resultado >= 0 else RED
    rest = Table([[Paragraph("<b>RESULTADO DO PERIODO</b>", ss["CellB"]),
                   Paragraph(f"<b>{brl(resultado)}</b>", ss["CellBR"])]],
                 colWidths=[None, 50*mm])
    rest.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), GOLD_SOFT),
        ("TEXTCOLOR", (0,0), (-1,-1), res_cor),
        ("LINEABOVE", (0,0), (-1,-1), 1.5, GOLD),
        ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING", (0,0), (-1,-1), 12), ("RIGHTPADDING", (0,0), (-1,-1), 12),
    ]))
    els.append(rest)

    els += _rodape(ss, auth)
    doc.build(els)
    return buf.getvalue()


# ================================================================
#  PATRIMONIO
# ================================================================
def patrimonio(contas, veiculos, total_contas, total_veic, total_financ) -> bytes:
    ss = _styles()
    buf, doc = _doc("Demonstrativo de Patrimonio")
    auth = _hash("patrimonio", total_contas, total_veic, total_financ)
    liquido = total_contas + total_veic - total_financ
    els = _cabecalho(ss, "Demonstrativo de Patrimonio", date.today().strftime("%d/%m/%Y"))

    # KPIs
    liq_hex = NAVY.hexval()[2:] if liquido >= 0 else RED.hexval()[2:]
    els.append(_kpi_row([
        ("Ativos", brl(total_contas + total_veic), TEAL.hexval()[2:]),
        ("Passivos", brl(total_financ), RED.hexval()[2:]),
        ("Patrimonio Liquido", brl(liquido), liq_hex),
    ]))
    els.append(Spacer(1, 10))

    # Contas
    els.append(_secao(ss, "Contas e aplicacoes"))
    d1 = [["Conta", "Saldo"]]
    for nome, saldo in contas:
        d1.append([nome, brl(saldo)])
    d1.append(["Subtotal contas", brl(total_contas)])
    t1 = _tabela(d1, [None, 48*mm], STEEL)
    t1_s = []
    t1_s.append(("BACKGROUND", (0, len(d1)-1), (-1, len(d1)-1), GOLD_SOFT))
    t1_s.append(("TEXTCOLOR", (0, len(d1)-1), (-1, len(d1)-1), NAVY))
    t1_s.append(("FONTNAME", (0, len(d1)-1), (-1, len(d1)-1), "Helvetica-Bold"))
    t1.setStyle(TableStyle(t1_s))
    els.append(t1)
    els.append(Spacer(1, 8))

    # Veículos
    els.append(_secao(ss, "Veiculos"))
    d2 = [["Veiculo", "Valor", "Devendo", "Liquido"]]
    for nome, val, fin, liq in veiculos:
        liq_c = TEAL.hexval()[2:] if liq >= 0 else RED.hexval()[2:]
        d2.append([nome, brl(val), brl(fin),
                   Paragraph(f'<font color="#{liq_c}"><b>{brl(liq)}</b></font>', ss["CellR"])])
    t2 = _tabela(d2, [None, 32*mm, 32*mm, 35*mm], NAVY)
    els.append(t2)
    els.append(Spacer(1, 10))

    # Resumo
    rd = [
        [Paragraph("<b>Ativos (contas + veiculos)</b>", ss["CellB"]),
         Paragraph(f"<b>{brl(total_contas + total_veic)}</b>", ss["CellBR"])],
        [Paragraph(f'<font color="#{RED.hexval()[2:]}"><b>Passivos (financiamentos)</b></font>', ss["Cell"]),
         Paragraph(f'<font color="#{RED.hexval()[2:]}"><b>{brl(-total_financ)}</b></font>', ss["CellR"])],
        [Paragraph("<b>PATRIMONIO LIQUIDO</b>", ss["CellB"]),
         Paragraph(f"<b>{brl(liquido)}</b>", ss["CellBR"])],
    ]
    rt = Table(rd, colWidths=[None, 50*mm])
    rt.setStyle(TableStyle([
        ("LINEBELOW", (0,0), (-1,-2), .3, LINE),
        ("BACKGROUND", (0,-1), (-1,-1), GOLD_SOFT),
        ("LINEABOVE", (0,-1), (-1,-1), 1.5, GOLD),
        ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("LEFTPADDING", (0,0), (-1,-1), 12), ("RIGHTPADDING", (0,0), (-1,-1), 12),
    ]))
    els.append(rt)

    els += _rodape(ss, auth)
    doc.build(els)
    return buf.getvalue()
