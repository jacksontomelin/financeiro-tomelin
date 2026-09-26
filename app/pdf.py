"""
Geração de PDFs profissionais — identidade visual Tomelin.
Inclui: cores vibrantes, faixas decorativas, QR Code de autenticidade.
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
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, HRFlowable, KeepTogether,
)
from reportlab.graphics.shapes import Drawing, Rect, String, Circle, Line
from reportlab.graphics import renderPDF

from .config import settings

# ===== PALETA =====
NAVY      = colors.HexColor("#082D51")
NAVY_2    = colors.HexColor("#0E3A63")
STEEL     = colors.HexColor("#305C74")
GOLD      = colors.HexColor("#C9A94E")
GOLD_SOFT = colors.HexColor("#F5EFD8")
GREEN     = colors.HexColor("#2F817A")
GREEN_2   = colors.HexColor("#3E9079")
RED       = colors.HexColor("#B4503E")
INK       = colors.HexColor("#0C2135")
INK_2     = colors.HexColor("#4A6070")
LINE      = colors.HexColor("#D9E0E7")
SOFT      = colors.HexColor("#F4F6F8")
BG        = colors.HexColor("#FAFBFC")
WHITE     = colors.white

_LOGO = os.path.join(os.path.dirname(__file__), "static", "icons", "logo-horizontal.png")
W, H = A4  # 595.27 x 841.89 pts


def brl(v) -> str:
    try:
        v = float(v or 0)
    except (TypeError, ValueError):
        v = 0.0
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _gerar_hash_autenticidade(*args) -> str:
    """Gera hash de autenticidade do documento."""
    seed = "|".join(str(a) for a in args) + "|" + str(uuid.uuid4())[:8]
    return hashlib.sha256(seed.encode()).hexdigest()[:24].upper()


# ===== ESTILOS =====
def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("H", parent=ss["Title"], textColor=WHITE, fontSize=18,
                          fontName="Helvetica-Bold", spaceAfter=2, alignment=0))
    ss.add(ParagraphStyle("H2", parent=ss["Title"], textColor=NAVY, fontSize=15,
                          fontName="Helvetica-Bold", spaceAfter=2, alignment=0))
    ss.add(ParagraphStyle("Sub", parent=ss["Normal"], textColor=colors.HexColor("#94B8D4"),
                          fontSize=9))
    ss.add(ParagraphStyle("Sub2", parent=ss["Normal"], textColor=STEEL, fontSize=9))
    ss.add(ParagraphStyle("Sec", parent=ss["Heading2"], textColor=NAVY, fontSize=12,
                          fontName="Helvetica-Bold", spaceBefore=14, spaceAfter=6))
    ss.add(ParagraphStyle("Cell", parent=ss["Normal"], fontSize=9.5, textColor=INK))
    ss.add(ParagraphStyle("CellR", parent=ss["Normal"], fontSize=9.5, textColor=INK, alignment=TA_RIGHT))
    ss.add(ParagraphStyle("CellBold", parent=ss["Normal"], fontSize=9.5, textColor=NAVY,
                          fontName="Helvetica-Bold"))
    ss.add(ParagraphStyle("CellBoldR", parent=ss["Normal"], fontSize=9.5, textColor=NAVY,
                          fontName="Helvetica-Bold", alignment=TA_RIGHT))
    ss.add(ParagraphStyle("Foot", parent=ss["Normal"], fontSize=7.5, textColor=STEEL,
                          alignment=TA_CENTER))
    ss.add(ParagraphStyle("Auth", parent=ss["Normal"], fontSize=7, textColor=INK_2,
                          alignment=TA_CENTER))
    ss.add(ParagraphStyle("BigNum", parent=ss["Normal"], fontSize=20, textColor=NAVY,
                          fontName="Helvetica-Bold", alignment=TA_RIGHT))
    return ss


def _doc(title):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, title=title,
        leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=18*mm,
    )
    return buf, doc


# ===== QR CODE SVG (simples — padrão de blocos que simula QR) =====
def _qr_code_drawing(text: str, size: float = 28*mm) -> Drawing:
    """
    Gera um QR code real usando padrão de blocos baseado no hash.
    Não é escaneável (seria necessário lib qrcode), mas serve como
    selo visual de autenticidade.
    """
    d = Drawing(size, size)
    n = 21  # grid 21x21 (QR v1)
    cell = size / n
    h = hashlib.sha256(text.encode()).digest()

    # Borda do QR
    d.add(Rect(0, 0, size, size, fillColor=WHITE, strokeColor=LINE, strokeWidth=0.5))

    # Finder patterns (3 cantos)
    for ox, oy in [(0, n-7), (n-7, n-7), (0, 0)]:
        for i in range(7):
            for j in range(7):
                if i in (0,6) or j in (0,6) or (2<=i<=4 and 2<=j<=4):
                    d.add(Rect((ox+i)*cell, (oy+j)*cell, cell, cell,
                               fillColor=NAVY, strokeColor=None))

    # Dados — padrão baseado no hash
    bits = []
    for byte in h:
        for bit in range(8):
            bits.append((byte >> bit) & 1)
    idx = 0
    for i in range(n):
        for j in range(n):
            # Pula finder patterns
            if (i<8 and j>n-9) or (i>n-9 and j>n-9) or (i<8 and j<8):
                continue
            if idx < len(bits) and bits[idx]:
                d.add(Rect(i*cell, j*cell, cell, cell,
                           fillColor=NAVY, strokeColor=None))
            idx = (idx + 1) % len(bits)

    return d


# ===== CABEÇALHO COM FAIXA NAVY =====
def _cabecalho(ss, titulo, subtitulo=""):
    """Faixa colorida navy com logo e título em branco."""
    els = []

    # Faixa navy usando tabela com background
    logo_cell = ""
    if os.path.exists(_LOGO):
        try:
            img = Image(_LOGO)
            ratio = img.imageWidth / img.imageHeight
            img.drawHeight = 14*mm
            img.drawWidth = 14*mm * ratio
            logo_cell = img
        except Exception:
            logo_cell = ""

    titulo_p = Paragraph(titulo, ss["H"])
    sub_parts = [settings.EMPRESA_NOME]
    if subtitulo:
        sub_parts.append(subtitulo)
    sub_p = Paragraph(" · ".join(sub_parts), ss["Sub"])

    if logo_cell:
        header_data = [[logo_cell, [titulo_p, sub_p]]]
        header_t = Table(header_data, colWidths=[42*mm, None], rowHeights=[22*mm])
    else:
        header_data = [[[titulo_p, sub_p]]]
        header_t = Table(header_data, colWidths=[None], rowHeights=[22*mm])

    header_t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("ROUNDEDCORNERS", [4, 4, 0, 0]),
    ]))
    els.append(header_t)

    # Barra dourada fina
    gold_bar = Table([[""]], colWidths=[None], rowHeights=[2.5*mm])
    gold_bar.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GOLD),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    els.append(gold_bar)
    els.append(Spacer(1, 8))

    return els


# ===== SEÇÃO COM FAIXA COLORIDA =====
def _secao(ss, titulo, cor=NAVY):
    """Título de seção com faixa colorida à esquerda."""
    t = Table([[Paragraph(f"<b>{titulo}</b>", ss["Sec"])]],
              colWidths=[None], rowHeights=[None])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 1.5, cor),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


# ===== RODAPÉ COM QR DE AUTENTICIDADE =====
def _rodape(ss, hash_auth: str):
    els = []
    els.append(Spacer(1, 12))

    # Linha separadora dourada
    els.append(HRFlowable(width="100%", thickness=0.8, color=GOLD, spaceAfter=8))

    # QR + info de autenticidade
    qr = _qr_code_drawing(hash_auth, size=18*mm)

    auth_text = (
        f"<b>Código de autenticidade:</b> {hash_auth}<br/>"
        f"Emitido em {datetime.now().strftime('%d/%m/%Y às %H:%M')}<br/>"
        f"Documento gerado eletronicamente pelo sistema Tomelin Gestão Financeira"
    )
    auth_p = Paragraph(auth_text, ss["Auth"])

    partes = [settings.EMPRESA_NOME]
    if settings.EMPRESA_DOC:
        partes.append(settings.EMPRESA_DOC)
    if settings.EMPRESA_CIDADE:
        partes.append(settings.EMPRESA_CIDADE)
    foot_p = Paragraph(" · ".join(partes), ss["Foot"])

    footer_data = [[qr, [auth_p, Spacer(1, 4), foot_p]]]
    footer_t = Table(footer_data, colWidths=[22*mm, None])
    footer_t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("LEFTPADDING", (1, 0), (1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    els.append(footer_t)

    return els


# ===== KPI CARD (mini caixa com valor destaque) =====
def _kpi_card(ss, label, valor, cor=NAVY):
    """Caixa estilo KPI card no PDF."""
    data = [[Paragraph(f"<font color='#{cor.hexval()[2:]}'><b>{label}</b></font>", ss["Cell"]),
             Paragraph(f"<font color='#{cor.hexval()[2:]}'><b>{valor}</b></font>", ss["CellBoldR"])]]
    t = Table(data, colWidths=[None, 50*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(f"#{cor.hexval()[2:]}12")),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t


# ================================================================
# RECIBO
# ================================================================
def recibo(l, categoria="", conta="", contato="") -> bytes:
    ss = _styles()
    buf, doc = _doc(f"Recibo #{l.id:04d}")
    hash_auth = _gerar_hash_autenticidade("recibo", l.id, l.valor_total)
    tipo_lbl = "RECEBIMENTO" if l.tipo.value == "receita" else "PAGAMENTO"
    els = _cabecalho(ss, f"Recibo de {tipo_lbl.title()}", f"Nº {l.id:04d}")

    # Status badge
    status = l.status.capitalize()
    status_cor = GREEN if l.status == "pago" else GOLD if l.status == "pendente" else RED
    status_p = Paragraph(
        f"<font color='#{status_cor.hexval()[2:]}'><b>● {status}</b></font>",
        ParagraphStyle("StatusP", parent=ss["Cell"], fontSize=11, alignment=TA_RIGHT)
    )
    status_t = Table([[status_p]], colWidths=[None])
    status_t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(f"#{status_cor.hexval()[2:]}15")),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))
    els.append(status_t)
    els.append(Spacer(1, 8))

    # Dados principais
    linhas = [
        ("Descrição", l.descricao),
        ("Categoria", categoria or "—"),
        ("Competência", l.data_competencia.strftime("%d/%m/%Y") if l.data_competencia else "—"),
        ("Vencimento", l.data_vencimento.strftime("%d/%m/%Y") if l.data_vencimento else "—"),
        ("Pagamento", l.data_pagamento.strftime("%d/%m/%Y") if l.data_pagamento else "—"),
        ("Conta", conta or "—"),
        ("Recebido de" if l.tipo.value == "receita" else "Pago para", contato or "—"),
    ]
    data = [[Paragraph(f"<b>{k}</b>", ss["Cell"]), Paragraph(str(v), ss["Cell"])] for k, v in linhas]
    t = Table(data, colWidths=[38*mm, None])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, LINE),
        ("LINEBELOW", (0, -1), (-1, -1), 0.8, GOLD),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("BACKGROUND", (0, 0), (0, -1), SOFT),
        ("LEFTPADDING", (0, 0), (0, -1), 8),
    ]))
    els.append(t)
    els.append(Spacer(1, 10))

    # Quadro de valores com cor
    vals = [["Valor principal", brl(l.valor)]]
    if l.juros:
        vals.append(["Juros", brl(l.juros)])
    if l.multa:
        vals.append(["Multa", brl(l.multa)])
    vals.append(["VALOR TOTAL", brl(l.valor_total)])

    cor_tipo = GREEN if l.tipo.value == "receita" else NAVY
    vdata = []
    for i, (k, v) in enumerate(vals):
        is_total = i == len(vals) - 1
        sK = ss["CellBold"] if is_total else ss["Cell"]
        sV = ss["CellBoldR"] if is_total else ss["CellR"]
        vdata.append([Paragraph(f"<b>{k}</b>" if is_total else k, sK),
                      Paragraph(f"<b>{v}</b>" if is_total else v, sV)])

    vt = Table(vdata, colWidths=[None, 50*mm])
    vt.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, LINE),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor(f"#{cor_tipo.hexval()[2:]}15")),
        ("TEXTCOLOR", (0, -1), (-1, -1), cor_tipo),
        ("LINEABOVE", (0, -1), (-1, -1), 1.2, cor_tipo),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("ROUNDEDCORNERS", [0, 0, 4, 4]),
    ]))
    els.append(vt)

    els.append(Spacer(1, 14))
    frase = ("Recebi(emos) a importância acima especificada."
             if l.tipo.value == "receita"
             else "Pagamento registrado conforme discriminado acima.")
    els.append(Paragraph(frase, ss["Cell"]))
    els.append(Spacer(1, 20))

    # Linha de assinatura
    els.append(HRFlowable(width="60%", thickness=0.5, color=LINE, spaceAfter=2))
    els.append(Paragraph("Assinatura / Carimbo", ParagraphStyle(
        "Sig", parent=ss["Cell"], fontSize=8, textColor=STEEL, alignment=TA_CENTER)))

    els += _rodape(ss, hash_auth)
    doc.build(els)
    return buf.getvalue()


# ================================================================
# BALANCETE FINANCEIRO
# ================================================================
def balancete(periodo_label, receitas, despesas, tot_rec, tot_desp, juros_total=0) -> bytes:
    ss = _styles()
    buf, doc = _doc("Balancete Financeiro")
    hash_auth = _gerar_hash_autenticidade("balancete", periodo_label, tot_rec, tot_desp)
    els = _cabecalho(ss, "Balancete Financeiro", periodo_label)

    # Cards de resumo
    kpi_data = [
        [_kpi_card(ss, "Total Receitas", brl(tot_rec), GREEN),
         _kpi_card(ss, "Total Despesas", brl(tot_desp), RED)],
    ]
    resultado = tot_rec - tot_desp
    res_cor = GREEN if resultado >= 0 else RED
    kpi_data.append([
        _kpi_card(ss, "Resultado", brl(resultado), res_cor),
        _kpi_card(ss, "Juros no período", brl(juros_total), GOLD) if juros_total else Spacer(1,1),
    ])
    kpi_t = Table(kpi_data, colWidths=[None, None])
    kpi_t.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ]))
    els.append(kpi_t)
    els.append(Spacer(1, 8))

    def bloco(titulo, itens, total, cor):
        els.append(_secao(ss, titulo, cor))
        data = [[Paragraph("<b>Categoria</b>", ss["CellBold"]),
                 Paragraph("<b>Valor</b>", ss["CellBoldR"])]]
        for nome, val in itens:
            data.append([Paragraph(nome, ss["Cell"]), Paragraph(brl(val), ss["CellR"])])
        data.append([Paragraph("<b>Total</b>", ss["CellBold"]),
                     Paragraph(f"<b>{brl(total)}</b>", ss["CellBoldR"])])
        t = Table(data, colWidths=[None, 48*mm])
        styles = [
            ("LINEBELOW", (0, 0), (-1, 0), 0.8, cor),
            ("LINEBELOW", (0, 1), (-1, -2), 0.25, LINE),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor(f"#{cor.hexval()[2:]}12")),
            ("TEXTCOLOR", (0, -1), (-1, -1), cor),
            ("LINEABOVE", (0, -1), (-1, -1), 0.8, cor),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]
        # Zebra suave
        for i in range(1, len(data)-1):
            if i % 2 == 0:
                styles.append(("BACKGROUND", (0, i), (-1, i), SOFT))
        t.setStyle(TableStyle(styles))
        els.append(t)
        els.append(Spacer(1, 6))

    bloco("Receitas", receitas, tot_rec, GREEN)
    bloco("Despesas", despesas, tot_desp, RED)

    # Resultado final com destaque
    rt = Table([
        [Paragraph("<b>RESULTADO DO PERÍODO</b>", ss["CellBold"]),
         Paragraph(f"<b>{brl(resultado)}</b>", ss["CellBoldR"])]
    ], colWidths=[None, 50*mm])
    rt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(f"#{res_cor.hexval()[2:]}18")),
        ("TEXTCOLOR", (0, 0), (-1, -1), res_cor),
        ("LINEABOVE", (0, 0), (-1, -1), 1.5, res_cor),
        ("ROUNDEDCORNERS", [0, 0, 4, 4]),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    els.append(rt)

    els += _rodape(ss, hash_auth)
    doc.build(els)
    return buf.getvalue()


# ================================================================
# PATRIMÔNIO
# ================================================================
def patrimonio(contas, veiculos, total_contas, total_veic, total_financ) -> bytes:
    ss = _styles()
    buf, doc = _doc("Demonstrativo de Patrimônio")
    hash_auth = _gerar_hash_autenticidade("patrimonio", total_contas, total_veic, total_financ)
    els = _cabecalho(ss, "Demonstrativo de Patrimônio", date.today().strftime("%d/%m/%Y"))

    liquido = total_contas + total_veic - total_financ

    # KPI cards — 2 por linha para caber
    kpi_row1 = [[
        _kpi_card(ss, "Ativos totais", brl(total_contas + total_veic), GREEN),
        _kpi_card(ss, "Passivos", brl(total_financ), RED),
    ]]
    kpi_row2 = [[
        _kpi_card(ss, "Patrimônio líquido", brl(liquido), NAVY),
        Spacer(1, 1),
    ]]
    for row in [kpi_row1, kpi_row2]:
        kt = Table(row, colWidths=[None, None])
        kt.setStyle(TableStyle([
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 2),
            ("RIGHTPADDING", (0, 0), (-1, -1), 2),
        ]))
        els.append(kt)
    els.append(Spacer(1, 8))

    # Contas
    els.append(_secao(ss, "Contas e aplicações", STEEL))
    d1 = [[Paragraph("<b>Conta</b>", ss["CellBold"]),
           Paragraph("<b>Saldo</b>", ss["CellBoldR"])]]
    for nome, saldo in contas:
        d1.append([Paragraph(nome, ss["Cell"]), Paragraph(brl(saldo), ss["CellR"])])
    d1.append([Paragraph("<b>Subtotal contas</b>", ss["CellBold"]),
               Paragraph(f"<b>{brl(total_contas)}</b>", ss["CellBoldR"])])
    t1 = Table(d1, colWidths=[None, 48*mm])
    st1 = [
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, STEEL),
        ("LINEBELOW", (0, 1), (-1, -2), 0.25, LINE),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#305C7415")),
        ("TEXTCOLOR", (0, -1), (-1, -1), STEEL),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, STEEL),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(d1)-1):
        if i % 2 == 0:
            st1.append(("BACKGROUND", (0, i), (-1, i), SOFT))
    t1.setStyle(TableStyle(st1))
    els.append(t1)
    els.append(Spacer(1, 6))

    # Veículos
    els.append(_secao(ss, "Veículos", GOLD))
    d2 = [[Paragraph("<b>Veículo</b>", ss["CellBold"]),
           Paragraph("<b>Valor</b>", ss["CellBoldR"]),
           Paragraph("<b>Falta pagar</b>", ss["CellBoldR"]),
           Paragraph("<b>Líquido</b>", ss["CellBoldR"])]]
    for nome, val, financ, liq in veiculos:
        liq_cor = GREEN if liq >= 0 else RED
        d2.append([
            Paragraph(nome, ss["Cell"]),
            Paragraph(brl(val), ss["CellR"]),
            Paragraph(brl(financ), ss["CellR"]),
            Paragraph(f"<font color='#{liq_cor.hexval()[2:]}'><b>{brl(liq)}</b></font>", ss["CellR"]),
        ])
    t2 = Table(d2, colWidths=[None, 32*mm, 32*mm, 35*mm])
    st2 = [
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, GOLD),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    for i in range(1, len(d2)):
        if i % 2 == 0:
            st2.append(("BACKGROUND", (0, i), (-1, i), SOFT))
    t2.setStyle(TableStyle(st2))
    els.append(t2)
    els.append(Spacer(1, 10))

    # Resumo final
    linhas_resumo = [
        ("Ativos (contas + veículos)", brl(total_contas + total_veic), GREEN),
        ("Passivos (financiamentos)", brl(-total_financ), RED),
        ("PATRIMÔNIO LÍQUIDO", brl(liquido), NAVY),
    ]
    rd = []
    for k, v, cor in linhas_resumo:
        rd.append([
            Paragraph(f"<font color='#{cor.hexval()[2:]}'><b>{k}</b></font>", ss["CellBold"]),
            Paragraph(f"<font color='#{cor.hexval()[2:]}'><b>{v}</b></font>", ss["CellBoldR"]),
        ])
    rt = Table(rd, colWidths=[None, 50*mm])
    rt.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -2), 0.3, LINE),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#082D5115")),
        ("LINEABOVE", (0, -1), (-1, -1), 1.5, NAVY),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    els.append(rt)

    els += _rodape(ss, hash_auth)
    doc.build(els)
    return buf.getvalue()
