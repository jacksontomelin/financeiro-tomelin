"""
Geração de PDFs ricos — Tomelin Gestão Financeira.
Paleta vibrante multi-cor, gráficos desenhados (pizza/barras), análise
automática com sugestões, QR Code de autenticidade.
"""
import io
import os
import math
import hashlib
import uuid
from datetime import date, datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, HRFlowable, PageBreak,
)
from reportlab.graphics.shapes import Drawing, Rect, String, Circle, Line, Wedge, Polygon, Group
from reportlab.graphics import renderPDF

from .config import settings

# ══════════════════════════════════════════════════════════════
#  PALETA RICA — multi-cor vibrante, alto contraste
# ══════════════════════════════════════════════════════════════
NAVY       = colors.HexColor("#0B2E52")   # header principal
NAVY_DEEP  = colors.HexColor("#061B33")
BLUE       = colors.HexColor("#1E5FA8")   # azul vibrante (receitas)
PURPLE     = colors.HexColor("#6B3FA0")   # roxo (patrimônio)
ORANGE     = colors.HexColor("#D9772E")   # laranja (despesas)
GOLD       = colors.HexColor("#C9A94E")   # dourado marca
GOLD_DEEP  = colors.HexColor("#9C7B22")
CORAL      = colors.HexColor("#C74B4B")   # vermelho coral (alertas/passivos)
TEAL_DEEP  = colors.HexColor("#1A6B63")   # teal escuro (bom contraste com branco)
INK        = colors.HexColor("#101820")
INK_2      = colors.HexColor("#516170")
LINE       = colors.HexColor("#DCE2E8")
PANEL      = colors.HexColor("#F6F7F9")
WHITE      = colors.white

# Cores de categoria (para gráfico pizza — paleta ampla e distinta)
PALETA_CAT = [
    colors.HexColor("#1E5FA8"), colors.HexColor("#D9772E"), colors.HexColor("#6B3FA0"),
    colors.HexColor("#C9A94E"), colors.HexColor("#1A6B63"), colors.HexColor("#C74B4B"),
    colors.HexColor("#3C7FB1"), colors.HexColor("#B85C9E"), colors.HexColor("#5B8C3A"),
    colors.HexColor("#B08968"),
]

_LOGO = os.path.join(os.path.dirname(__file__), "static", "icons", "logo-horizontal.png")
W, H = A4


def brl(v) -> str:
    try: v = float(v or 0)
    except (TypeError, ValueError): v = 0.0
    sign = "-" if v < 0 else ""
    v = abs(v)
    return sign + "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def pct(part, total) -> str:
    if not total:
        return "0%"
    return f"{(part/total*100):.1f}%"


def _hash(*args) -> str:
    seed = "|".join(str(a) for a in args) + "|" + uuid.uuid4().hex[:8]
    return hashlib.sha256(seed.encode()).hexdigest()[:24].upper()


def _hx(c) -> str:
    return c.hexval()[2:]


# ══════════════════════════════════════════════════════════════
#  ESTILOS
# ══════════════════════════════════════════════════════════════
def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("H1", fontName="Helvetica-Bold", fontSize=18, textColor=WHITE, leading=21))
    ss.add(ParagraphStyle("Sub", fontSize=9.5, textColor=colors.HexColor("#A8C3DC"), leading=12))
    ss.add(ParagraphStyle("SecTitle", fontName="Helvetica-Bold", fontSize=13, textColor=NAVY, spaceBefore=4, spaceAfter=2))
    ss.add(ParagraphStyle("SecSub", fontSize=8.5, textColor=INK_2, spaceAfter=6))
    ss.add(ParagraphStyle("Cell", fontSize=9.3, textColor=INK, leading=12.5))
    ss.add(ParagraphStyle("CellR", fontSize=9.3, textColor=INK, alignment=TA_RIGHT, leading=12.5))
    ss.add(ParagraphStyle("CellC", fontSize=9.3, textColor=INK, alignment=TA_CENTER, leading=12.5))
    ss.add(ParagraphStyle("CellB", fontName="Helvetica-Bold", fontSize=9.3, textColor=NAVY, leading=12.5))
    ss.add(ParagraphStyle("CellBR", fontName="Helvetica-Bold", fontSize=9.3, textColor=NAVY, alignment=TA_RIGHT, leading=12.5))
    ss.add(ParagraphStyle("Justif", fontSize=9.3, textColor=INK, leading=14, alignment=TA_JUSTIFY))
    ss.add(ParagraphStyle("TipTitle", fontName="Helvetica-Bold", fontSize=9.5, textColor=NAVY, leading=13))
    ss.add(ParagraphStyle("TipBody", fontSize=8.8, textColor=INK, leading=12.5, alignment=TA_JUSTIFY))
    ss.add(ParagraphStyle("Foot", fontSize=6.8, textColor=INK_2, leading=9.5))
    ss.add(ParagraphStyle("LegLab", fontSize=8, textColor=INK, leading=11))
    return ss


def _doc(title):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title=title,
        leftMargin=16*mm, rightMargin=16*mm, topMargin=13*mm, bottomMargin=15*mm)
    return buf, doc


# ══════════════════════════════════════════════════════════════
#  CABEÇALHO — faixa navy + barra gold, brasão simplificado
# ══════════════════════════════════════════════════════════════
def _cabecalho(ss, titulo, subtitulo="", tag=""):
    els = []
    logo_cell = ""
    if os.path.exists(_LOGO):
        try:
            img = Image(_LOGO)
            r = img.imageWidth / img.imageHeight
            img.drawHeight = 12*mm; img.drawWidth = 12*mm * r
            logo_cell = img
        except Exception:
            pass

    tp = Paragraph(titulo, ss["H1"])
    parts = [settings.EMPRESA_NOME]
    if subtitulo:
        parts.append(subtitulo)
    sp = Paragraph(" &nbsp;·&nbsp; ".join(parts), ss["Sub"])

    tag_cell = ""
    if tag:
        tag_p = Paragraph(f'<font color="#{_hx(NAVY_DEEP)}"><b>{tag}</b></font>',
                          ParagraphStyle("tag", fontSize=8, alignment=TA_CENTER))
        tag_t = Table([[tag_p]], colWidths=[32*mm], rowHeights=[7*mm])
        tag_t.setStyle(TableStyle([
            ("BACKGROUND", (0,0),(-1,-1), GOLD),
            ("VALIGN", (0,0),(-1,-1), "MIDDLE"),
        ]))
        tag_cell = tag_t

    if logo_cell and tag_cell:
        data = [[logo_cell, [tp, sp], tag_cell]]
        colw = [34*mm, None, 34*mm]
    elif logo_cell:
        data = [[logo_cell, [tp, sp]]]
        colw = [34*mm, None]
    else:
        data = [[[tp, sp]]]
        colw = [None]

    ht = Table(data, colWidths=colw, rowHeights=[20*mm])
    ht.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), NAVY),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("ALIGN", (-1,0), (-1,-1), "CENTER"),
        ("LEFTPADDING", (0,0), (-1,-1), 12),
        ("RIGHTPADDING", (0,0), (-1,-1), 12),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    els.append(ht)

    # tripla barra colorida (gold / azul / laranja) — assinatura visual rica
    bar = Table([["", "", ""]], colWidths=[None, None, None], rowHeights=[2.2*mm])
    bar.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,0), GOLD),
        ("BACKGROUND", (1,0), (1,0), BLUE),
        ("BACKGROUND", (2,0), (2,0), ORANGE),
    ]))
    els.append(bar)
    els.append(Spacer(1, 10))
    return els


def _secao(ss, titulo, sub=""):
    els = [Paragraph(titulo, ss["SecTitle"])]
    if sub:
        els.append(Paragraph(sub, ss["SecSub"]))
    return els


# ══════════════════════════════════════════════════════════════
#  GRÁFICOS DESENHADOS
# ══════════════════════════════════════════════════════════════
def _grafico_pizza(itens, size=42*mm):
    """itens: [(nome, valor), ...] — desenha pizza colorida com % """
    total = sum(v for _, v in itens) or 1
    d = Drawing(size, size)
    cx, cy, r = size/2, size/2, size/2 - 2
    ang = 90.0
    for i, (nome, val) in enumerate(itens):
        frac = val / total
        sweep = frac * 360
        cor = PALETA_CAT[i % len(PALETA_CAT)]
        d.add(Wedge(cx, cy, r, ang - sweep, ang, fillColor=cor, strokeColor=WHITE, strokeWidth=1.2))
        ang -= sweep
    # buraco central (donut)
    d.add(Circle(cx, cy, r*0.52, fillColor=WHITE, strokeColor=None))
    return d


def _grafico_barras(itens, w=170*mm, h=48*mm, cor=BLUE):
    """itens: [(label, valor), ...] — barras verticais com valores"""
    d = Drawing(w, h)
    if not itens:
        return d
    vmax = max(v for _, v in itens) or 1
    n = len(itens)
    gap = 4
    bw = (w - gap*(n+1)) / n
    base_y = 12
    max_bar_h = h - 24
    for i, (lab, val) in enumerate(itens):
        bh = (val / vmax) * max_bar_h if vmax else 0
        x = gap + i*(bw+gap)
        c = PALETA_CAT[i % len(PALETA_CAT)]
        d.add(Rect(x, base_y, bw, max(bh, 1), fillColor=c, strokeColor=None, rx=2, ry=2))
        # valor acima da barra
        d.add(String(x + bw/2, base_y + bh + 4, brl(val).replace("R$ ", ""),
                     fontSize=6.5, fillColor=INK, textAnchor="middle"))
        # label abaixo
        lab_short = (lab[:10] + "…") if len(lab) > 11 else lab
        d.add(String(x + bw/2, base_y - 9, lab_short, fontSize=6.3, fillColor=INK_2, textAnchor="middle"))
    # linha base
    d.add(Line(0, base_y - 1, w, base_y - 1, strokeColor=LINE, strokeWidth=.6))
    return d


def _grafico_linha(pontos, w=170*mm, h=42*mm, cor=NAVY):
    """pontos: [(label, valor), ...] — linha de tendência (projeção/evolução)"""
    d = Drawing(w, h)
    if len(pontos) < 2:
        return d
    vals = [v for _, v in pontos]
    vmin, vmax = min(vals), max(vals)
    if vmin == vmax:
        vmin -= 1; vmax += 1
    pad_x, pad_y = 8, 14
    plot_w = w - pad_x*2
    plot_h = h - pad_y*2
    n = len(pontos)
    coords = []
    for i, (lab, val) in enumerate(pontos):
        x = pad_x + (i/(n-1)) * plot_w
        y = pad_y + ((val - vmin)/(vmax - vmin)) * plot_h
        coords.append((x, y, lab, val))
    # linha de zero se aplicável
    for i in range(len(coords)-1):
        x1,y1,_,_ = coords[i]; x2,y2,_,_ = coords[i+1]
        d.add(Line(x1, y1, x2, y2, strokeColor=cor, strokeWidth=2))
    for x,y,lab,val in coords:
        d.add(Circle(x, y, 2.6, fillColor=cor, strokeColor=WHITE, strokeWidth=.8))
        d.add(String(x, y + 6, brl(val).replace("R$ ","").replace(",00",""),
                     fontSize=6, fillColor=INK, textAnchor="middle"))
        d.add(String(x, pad_y - 10, lab, fontSize=6.3, fillColor=INK_2, textAnchor="middle"))
    return d


def _qr_drawing(text: str, size=17*mm):
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


def _rodape(ss, auth):
    els = [Spacer(1, 12)]
    els.append(HRFlowable(width="100%", thickness=.7, color=GOLD, spaceAfter=7))
    qr = _qr_drawing(auth, size=16*mm)
    info = Paragraph(
        f'<b>Codigo de autenticidade:</b> {auth}<br/>'
        f'Emitido em {datetime.now().strftime("%d/%m/%Y as %H:%M")} · '
        f'Documento gerado eletronicamente pelo Tomelin Gestao Financeira', ss["Foot"])
    parts = [p for p in [settings.EMPRESA_NOME, settings.EMPRESA_DOC, settings.EMPRESA_CIDADE] if p]
    foot = Paragraph(" · ".join(parts), ss["Foot"])
    ft = Table([[qr, [info, Spacer(1,3), foot]]], colWidths=[19*mm, None])
    ft.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (1,0), (1,0), 8),
        ("TOPPADDING", (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
    ]))
    els.append(ft)
    return els


# ══════════════════════════════════════════════════════════════
#  TABELA RICA — header colorido customizável, zebra, totais
# ══════════════════════════════════════════════════════════════
def _tabela(data, col_widths, cor_header, align_cols=None, total_row=False):
    t = Table(data, colWidths=col_widths, repeatRows=1)
    styles = [
        ("BACKGROUND", (0,0), (-1,0), cor_header),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,0), 8.8),
        ("FONTSIZE", (0,1), (-1,-1), 9.2),
        ("TOPPADDING", (0,0), (-1,-1), 5.5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5.5),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("LINEBELOW", (0,0), (-1,-2 if total_row else -1), .35, LINE),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]
    n = len(data)
    for i in range(1, n - (1 if total_row else 0)):
        if i % 2 == 0:
            styles.append(("BACKGROUND", (0,i), (-1,i), PANEL))
    if total_row:
        styles += [
            ("BACKGROUND", (0,n-1), (-1,n-1), colors.HexColor("#FBF3DC")),
            ("TEXTCOLOR", (0,n-1), (-1,n-1), NAVY),
            ("FONTNAME", (0,n-1), (-1,n-1), "Helvetica-Bold"),
            ("LINEABOVE", (0,n-1), (-1,n-1), 1.1, GOLD),
        ]
    t.setStyle(TableStyle(styles))
    return t


def _kpi_cards(items):
    """items: [(label, valor, cor), ...] — cartões coloridos lado a lado"""
    cells = []
    for lab, val, cor in items:
        p = Paragraph(
            f'<font size="7.8" color="#{_hx(WHITE)}">{lab}</font><br/>'
            f'<font size="13" color="#{_hx(WHITE)}"><b>{val}</b></font>',
            ParagraphStyle("kpi", alignment=TA_CENTER, leading=16))
        cells.append(p)
    t = Table([cells], colWidths=[None]*len(cells))
    styles = [
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 9),
        ("BOTTOMPADDING", (0,0), (-1,-1), 9),
        ("LEFTPADDING", (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
    ]
    for i, (_,_,cor) in enumerate(items):
        styles.append(("BACKGROUND", (i,0), (i,0), cor))
    t.setStyle(TableStyle(styles))
    return t


def _clarear(cor, fator=0.90):
    """Mistura a cor com branco para gerar um tom claro (fundo de caixa)."""
    r = int(cor.red * 255); g = int(cor.green * 255); b = int(cor.blue * 255)
    r = int(r + (255 - r) * fator)
    g = int(g + (255 - g) * fator)
    b = int(b + (255 - b) * fator)
    return colors.Color(r/255, g/255, b/255)


def _caixa_dica(ss, titulo, texto, cor=NAVY):
    """Caixa de sugestão/análise com faixa colorida lateral e fundo claro."""
    fundo = _clarear(cor, 0.90)
    icon_t = Table([[""]], colWidths=[3*mm], rowHeights=[None])
    icon_t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), cor)]))
    conteudo = [Paragraph(titulo, ss["TipTitle"]), Spacer(1,2), Paragraph(texto, ss["TipBody"])]
    t = Table([[icon_t, conteudo]], colWidths=[4*mm, None])
    t.setStyle(TableStyle([
        ("BACKGROUND", (1,0), (1,0), fundo),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING", (1,0), (1,0), 10),
        ("RIGHTPADDING", (1,0), (1,0), 10),
        ("LEFTPADDING", (0,0), (0,0), 0),
        ("RIGHTPADDING", (0,0), (0,0), 0),
    ]))
    return t


# ══════════════════════════════════════════════════════════════
#  MOTOR DE SUGESTÕES — análise automática dos números
# ══════════════════════════════════════════════════════════════
def _sugestoes_balancete(receitas, despesas, tot_rec, tot_desp, juros_total):
    """Gera de 2 a 4 sugestões com base nos números do balancete."""
    dicas = []
    resultado = tot_rec - tot_desp
    margem = (resultado / tot_rec * 100) if tot_rec else 0

    if resultado < 0:
        dicas.append(("Atencao: resultado negativo", CORAL,
            f"As despesas superaram as receitas em {brl(abs(resultado))} neste periodo "
            f"(margem de {margem:.1f}%). Revise os itens de maior peso na lista de despesas "
            f"e avalie cortes ou renegociacao de valores fixos."))
    elif margem < 10:
        dicas.append(("Margem apertada", ORANGE,
            f"O resultado positivo de {brl(resultado)} representa apenas {margem:.1f}% das "
            f"receitas. Uma reserva de emergencia equivalente a 3-6 meses de despesas ajuda "
            f"a absorver imprevistos sem comprometer o orcamento."))
    else:
        dicas.append(("Resultado saudavel", TEAL_DEEP,
            f"O periodo fechou com saldo positivo de {brl(resultado)}, margem de {margem:.1f}% "
            f"sobre as receitas. Considere direcionar parte desse excedente para investimentos "
            f"ou quitacao antecipada de dividas com juros."))

    if despesas:
        maior_desp = max(despesas, key=lambda x: x[1])
        part_maior = pct(maior_desp[1], tot_desp)
        if maior_desp[1] / tot_desp > 0.35:
            dicas.append((f"Concentracao em {maior_desp[0]}", PURPLE,
                f"A categoria '{maior_desp[0]}' responde por {part_maior} do total de despesas "
                f"({brl(maior_desp[1])}). Vale revisar contratos, buscar alternativas mais "
                f"economicas ou renegociar condicoes nessa categoria especifica."))

    if juros_total and juros_total > 0:
        dicas.append(("Custo com juros", CORAL,
            f"Foram pagos {brl(juros_total)} em juros/multas neste periodo. Priorizar o "
            f"pagamento de contas antes do vencimento reduz esse custo financeiro ao longo "
            f"do ano — o equivalente anualizado seria de aproximadamente {brl(juros_total*12)}."))

    if len(receitas) == 1:
        dicas.append(("Fonte unica de receita", BLUE,
            f"Toda a receita do periodo vem de uma unica fonte ('{receitas[0][0]}'). "
            f"Diversificar as fontes de renda reduz o risco financeiro em caso de "
            f"interrupcao dessa fonte principal."))

    return dicas[:4]


def _sugestoes_patrimonio(contas, veiculos, total_contas, total_veic, total_financ, liquido):
    dicas = []
    total_ativos = total_contas + total_veic
    alavancagem = (total_financ / total_ativos * 100) if total_ativos else 0

    if alavancagem > 40:
        dicas.append(("Alavancagem elevada", CORAL,
            f"As dividas representam {alavancagem:.1f}% do total de ativos ({brl(total_financ)} "
            f"de {brl(total_ativos)}). Priorizar a quitacao dos financiamentos com maior taxa "
            f"de juros melhora a saude patrimonial no medio prazo."))
    elif alavancagem > 0:
        dicas.append(("Alavancagem controlada", TEAL_DEEP,
            f"As dividas representam {alavancagem:.1f}% do total de ativos, um nivel "
            f"administravel. Manter os pagamentos em dia evita custos adicionais com juros "
            f"e multas."))
    else:
        dicas.append(("Sem financiamentos ativos", TEAL_DEEP,
            "Nao ha financiamentos em aberto no momento — o patrimonio esta livre de "
            "dividas vinculadas a bens. Bom momento para avaliar novos investimentos."))

    if total_contas > 0 and total_veic > 0:
        part_contas = pct(total_contas, total_ativos)
        part_veic = pct(total_veic, total_ativos)
        dicas.append(("Composicao do patrimonio", BLUE,
            f"Os ativos estao distribuidos entre {part_contas} em contas/aplicacoes e "
            f"{part_veic} em veiculos. Uma reserva liquida (em conta) equivalente a pelo "
            f"menos 6 meses de despesas fixas e recomendada antes de novos investimentos "
            f"em bens de menor liquidez."))

    if veiculos:
        maior_div = max(veiculos, key=lambda v: v[2])  # financ
        if maior_div[2] > 0:
            dicas.append((f"Maior financiamento: {maior_div[0]}", ORANGE,
                f"O veiculo '{maior_div[0]}' ainda tem {brl(maior_div[2])} em financiamento "
                f"pendente. Simular a quitacao antecipada pode revelar economia relevante "
                f"em juros dependendo do contrato."))

    if liquido > 0 and total_contas < (total_financ * 0.3) and total_financ > 0:
        dicas.append(("Reserva de emergencia baixa", CORAL,
            f"O saldo em contas ({brl(total_contas)}) e baixo frente ao total financiado "
            f"({brl(total_financ)}). Uma reserva mais robusta protege contra imprevistos "
            f"sem precisar recorrer a credito."))

    return dicas[:4]


# ================================================================
#  RECIBO
# ================================================================
def recibo(l, categoria="", conta="", contato="") -> bytes:
    ss = _styles()
    buf, doc = _doc(f"Recibo #{l.id:04d}")
    auth = _hash("recibo", l.id, l.valor_total)
    tipo_lbl = "Recebimento" if l.tipo.value == "receita" else "Pagamento"
    els = _cabecalho(ss, f"Recibo de {tipo_lbl}", f"No {l.id:04d}", tag=tipo_lbl.upper())

    st = l.status.capitalize()
    st_cor = TEAL_DEEP if l.status == "pago" else GOLD_DEEP if l.status == "pendente" else CORAL
    st_t = Table([[Paragraph(f'<font color="#{_hx(WHITE)}"><b>&#9679; {st}</b></font>', ss["CellC"])]], colWidths=[40*mm])
    st_t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), st_cor),
        ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    els.append(st_t)
    els.append(Spacer(1, 10))

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
        ("TOPPADDING", (0,0), (-1,-1), 5.5), ("BOTTOMPADDING", (0,0), (-1,-1), 5.5),
        ("BACKGROUND", (0,0), (0,-1), PANEL),
        ("LEFTPADDING", (0,0), (0,-1), 8),
    ]))
    els.append(t)
    els.append(Spacer(1, 10))

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
        ("BACKGROUND", (0,-1), (-1,-1), colors.HexColor("#FBF3DC")),
        ("TEXTCOLOR", (0,-1), (-1,-1), NAVY),
        ("LINEABOVE", (0,-1), (-1,-1), 1.2, GOLD),
        ("TOPPADDING", (0,0), (-1,-1), 6.5), ("BOTTOMPADDING", (0,0), (-1,-1), 6.5),
        ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
    ]))
    els.append(vt)
    els.append(Spacer(1, 16))

    frase = ("Recebi(emos) a importancia acima especificada."
             if l.tipo.value == "receita"
             else "Pagamento registrado conforme discriminado acima.")
    els.append(Paragraph(frase, ss["Cell"]))
    els.append(Spacer(1, 26))
    els.append(HRFlowable(width="55%", thickness=.5, color=LINE, spaceAfter=2))
    els.append(Paragraph("Assinatura / Carimbo",
        ParagraphStyle("sig", fontSize=8, textColor=INK_2, alignment=TA_CENTER)))

    els += _rodape(ss, auth)
    doc.build(els)
    return buf.getvalue()


# ================================================================
#  BALANCETE — rico, com gráficos e sugestões
# ================================================================
def balancete(periodo_label, receitas, despesas, tot_rec, tot_desp, juros_total=0) -> bytes:
    ss = _styles()
    buf, doc = _doc("Balancete Financeiro")
    auth = _hash("balancete", periodo_label, tot_rec, tot_desp)
    els = _cabecalho(ss, "Balancete Financeiro", periodo_label, tag="RELATORIO")
    resultado = tot_rec - tot_desp

    # KPIs coloridos
    res_cor = TEAL_DEEP if resultado >= 0 else CORAL
    els.append(_kpi_cards([
        ("RECEITAS", brl(tot_rec), BLUE),
        ("DESPESAS", brl(tot_desp), ORANGE),
        ("RESULTADO", brl(resultado), res_cor),
        ("JUROS/MULTAS", brl(juros_total), PURPLE),
    ]))
    els.append(Spacer(1, 12))

    # Gráfico de pizza despesas + legenda lado a lado
    if despesas:
        els += _secao(ss, "Distribuicao das despesas por categoria")
        pizza = _grafico_pizza(despesas, size=40*mm)
        tot_d = sum(v for _,v in despesas) or 1
        leg_rows = []
        for i, (nome, val) in enumerate(despesas[:10]):
            cor = PALETA_CAT[i % len(PALETA_CAT)]
            sq = Table([[""]], colWidths=[3*mm], rowHeights=[3*mm])
            sq.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), cor)]))
            leg_rows.append([sq, Paragraph(f"{nome}", ss["LegLab"]),
                             Paragraph(f"{brl(val)} ({pct(val, tot_d)})", ss["CellR"])])
        leg_t = Table(leg_rows, colWidths=[6*mm, 55*mm, 40*mm])
        leg_t.setStyle(TableStyle([
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("TOPPADDING", (0,0), (-1,-1), 2), ("BOTTOMPADDING", (0,0), (-1,-1), 2),
        ]))
        combo = Table([[pizza, leg_t]], colWidths=[46*mm, None])
        combo.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "MIDDLE")]))
        els.append(combo)
        els.append(Spacer(1, 12))

    # Gráfico de barras comparativo receitas x despesas por categoria (top 6)
    todas_cats = sorted(receitas + despesas, key=lambda x: -x[1])[:6]
    if todas_cats:
        els += _secao(ss, "Maiores categorias do periodo")
        els.append(_grafico_barras(todas_cats, w=163*mm, h=46*mm))
        els.append(Spacer(1, 10))

    # Tabela Receitas
    els += _secao(ss, "Receitas detalhadas")
    rdata = [["Categoria", "Valor", "% do total"]]
    for nome, val in receitas:
        rdata.append([nome, brl(val), pct(val, tot_rec)])
    rdata.append(["Total de receitas", brl(tot_rec), "100%"])
    els.append(_tabela(rdata, [None, 42*mm, 28*mm], BLUE, total_row=True))
    els.append(Spacer(1, 10))

    # Tabela Despesas
    els += _secao(ss, "Despesas detalhadas")
    ddata = [["Categoria", "Valor", "% do total"]]
    for nome, val in despesas:
        ddata.append([nome, brl(val), pct(val, tot_desp)])
    ddata.append(["Total de despesas", brl(tot_desp), "100%"])
    els.append(_tabela(ddata, [None, 42*mm, 28*mm], ORANGE, total_row=True))
    els.append(Spacer(1, 12))

    # Resultado final
    rest = Table([[Paragraph("<b>RESULTADO DO PERIODO</b>", ss["CellB"]),
                   Paragraph(f"<b>{brl(resultado)}</b>", ss["CellBR"])]], colWidths=[None, 50*mm])
    rest.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), res_cor),
        ("TEXTCOLOR", (0,0), (-1,-1), WHITE),
        ("TOPPADDING", (0,0), (-1,-1), 9), ("BOTTOMPADDING", (0,0), (-1,-1), 9),
        ("LEFTPADDING", (0,0), (-1,-1), 12), ("RIGHTPADDING", (0,0), (-1,-1), 12),
    ]))
    els.append(rest)
    els.append(Spacer(1, 14))

    # Sugestões automáticas
    dicas = _sugestoes_balancete(receitas, despesas, tot_rec, tot_desp, juros_total)
    if dicas:
        els += _secao(ss, "Analise e sugestoes", "Observacoes automaticas com base nos numeros deste periodo")
        for titulo, cor, texto in dicas:
            els.append(_caixa_dica(ss, titulo, texto, cor))
            els.append(Spacer(1, 6))

    els += _rodape(ss, auth)
    doc.build(els)
    return buf.getvalue()


# ================================================================
#  PATRIMÔNIO — rico, com gráficos e sugestões
# ================================================================
def patrimonio(contas, veiculos, total_contas, total_veic, total_financ) -> bytes:
    ss = _styles()
    buf, doc = _doc("Demonstrativo de Patrimonio")
    auth = _hash("patrimonio", total_contas, total_veic, total_financ)
    liquido = total_contas + total_veic - total_financ
    els = _cabecalho(ss, "Demonstrativo de Patrimonio", date.today().strftime("%d/%m/%Y"), tag="PATRIMONIO")

    els.append(_kpi_cards([
        ("CONTAS", brl(total_contas), BLUE),
        ("VEICULOS", brl(total_veic), PURPLE),
        ("FINANCIAMENTOS", brl(total_financ), ORANGE),
        ("LIQUIDO", brl(liquido), TEAL_DEEP if liquido >= 0 else CORAL),
    ]))
    els.append(Spacer(1, 12))

    # Pizza: composição do patrimônio
    total_ativos = total_contas + total_veic
    if total_ativos > 0:
        els += _secao(ss, "Composicao dos ativos")
        composicao = [("Contas e aplicacoes", total_contas), ("Veiculos", total_veic)]
        composicao = [c for c in composicao if c[1] > 0]
        pizza = _grafico_pizza(composicao, size=38*mm)
        leg_rows = []
        for i, (nome, val) in enumerate(composicao):
            cor = PALETA_CAT[i % len(PALETA_CAT)]
            sq = Table([[""]], colWidths=[3*mm], rowHeights=[3*mm])
            sq.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), cor)]))
            leg_rows.append([sq, Paragraph(nome, ss["LegLab"]),
                             Paragraph(f"{brl(val)} ({pct(val, total_ativos)})", ss["CellR"])])
        leg_t = Table(leg_rows, colWidths=[6*mm, 55*mm, 45*mm])
        leg_t.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE"),
                                    ("TOPPADDING",(0,0),(-1,-1),3), ("BOTTOMPADDING",(0,0),(-1,-1),3)]))
        combo = Table([[pizza, leg_t]], colWidths=[44*mm, None])
        combo.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE")]))
        els.append(combo)
        els.append(Spacer(1, 12))

    # Contas
    els += _secao(ss, "Contas e aplicacoes")
    d1 = [["Conta", "Saldo", "% dos ativos"]]
    for nome, saldo in contas:
        d1.append([nome, brl(saldo), pct(saldo, total_ativos)])
    d1.append(["Subtotal contas", brl(total_contas), pct(total_contas, total_ativos)])
    els.append(_tabela(d1, [None, 42*mm, 28*mm], BLUE, total_row=True))
    els.append(Spacer(1, 10))

    # Veículos com barra de progresso visual do financiamento
    els += _secao(ss, "Veiculos e financiamentos")
    d2 = [["Veiculo", "Valor atual", "Falta pagar", "Liquido"]]
    for nome, val, fin, liq in veiculos:
        liq_c = TEAL_DEEP if liq >= 0 else CORAL
        d2.append([nome, brl(val), brl(fin),
                   Paragraph(f'<font color="#{_hx(liq_c)}"><b>{brl(liq)}</b></font>', ss["CellR"])])
    els.append(_tabela(d2, [None, 34*mm, 32*mm, 34*mm], PURPLE))
    els.append(Spacer(1, 12))

    # Resumo final destacado
    rd = [
        [Paragraph("Ativos totais (contas + veiculos)", ss["Cell"]),
         Paragraph(f"<b>{brl(total_ativos)}</b>", ss["CellBR"])],
        [Paragraph(f'<font color="#{_hx(CORAL)}">Passivos (financiamentos)</font>', ss["Cell"]),
         Paragraph(f'<font color="#{_hx(CORAL)}"><b>{brl(-total_financ)}</b></font>', ss["CellR"])],
    ]
    rt = Table(rd, colWidths=[None, 50*mm])
    rt.setStyle(TableStyle([
        ("LINEBELOW", (0,0), (-1,-1), .3, LINE),
        ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 4),
    ]))
    els.append(rt)

    final_cor = TEAL_DEEP if liquido >= 0 else CORAL
    ft = Table([[Paragraph("<b>PATRIMONIO LIQUIDO</b>", ParagraphStyle("pl", fontName="Helvetica-Bold", fontSize=11, textColor=WHITE)),
                 Paragraph(f"<b>{brl(liquido)}</b>", ParagraphStyle("pv", fontName="Helvetica-Bold", fontSize=13, textColor=WHITE, alignment=TA_RIGHT))]],
                colWidths=[None, 50*mm])
    ft.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), final_cor),
        ("TOPPADDING", (0,0), (-1,-1), 10), ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING", (0,0), (-1,-1), 12), ("RIGHTPADDING", (0,0), (-1,-1), 12),
    ]))
    els.append(ft)
    els.append(Spacer(1, 14))

    # Sugestões automáticas
    dicas = _sugestoes_patrimonio(contas, veiculos, total_contas, total_veic, total_financ, liquido)
    if dicas:
        els += _secao(ss, "Analise e sugestoes", "Observacoes automaticas com base no patrimonio atual")
        for titulo, cor, texto in dicas:
            els.append(_caixa_dica(ss, titulo, texto, cor))
            els.append(Spacer(1, 6))

    els += _rodape(ss, auth)
    doc.build(els)
    return buf.getvalue()
