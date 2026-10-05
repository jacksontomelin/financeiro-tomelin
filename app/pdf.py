"""Geração de PDFs (recibos, balancete contábil, patrimônio) com a identidade Tomelin."""
import io
import os
import hashlib
import uuid
from datetime import date, datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable,
)
from reportlab.graphics.shapes import Drawing, Rect
from .config import settings

NAVY = colors.HexColor("#082D51")
STEEL = colors.HexColor("#305C74")
GOLD = colors.HexColor("#C9A94E")
GREEN = colors.HexColor("#2F817A")
RED = colors.HexColor("#B4503E")
INK = colors.HexColor("#0C2135")
LINE = colors.HexColor("#D9E0E7")
SOFT = colors.HexColor("#F1F3F4")

_LOGO = os.path.join(os.path.dirname(__file__), "static", "icons", "logo-horizontal.png")


def brl(v) -> str:
    try:
        v = float(v or 0)
    except (TypeError, ValueError):
        v = 0.0
    sinal = "-" if v < 0 else ""
    v = abs(v)
    return sinal + "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def pct(parte, total) -> str:
    if not total:
        return "-"
    return f"{(parte/total*100):.1f}%".replace(".", ",")


def _hash(*args) -> str:
    """Hash determinístico: mesmo args sempre gera mesmo código."""
    seed = "|".join(str(a) for a in args)
    return hashlib.sha256(seed.encode()).hexdigest()[:20].upper()


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("H", parent=ss["Title"], textColor=NAVY, fontSize=16, spaceAfter=2))
    ss.add(ParagraphStyle("Sub", parent=ss["Normal"], textColor=STEEL, fontSize=9))
    ss.add(ParagraphStyle("Sec", parent=ss["Heading2"], textColor=NAVY, fontSize=12, spaceBefore=10, spaceAfter=4))
    ss.add(ParagraphStyle("Cell", parent=ss["Normal"], fontSize=9.5, textColor=INK))
    ss.add(ParagraphStyle("CellR", parent=ss["Normal"], fontSize=9.5, textColor=INK, alignment=2))
    ss.add(ParagraphStyle("Foot", parent=ss["Normal"], fontSize=7.5, textColor=STEEL))
    return ss


def _doc(title):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, title=title,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
    )
    return buf, doc


def _cabecalho(ss, titulo, subtitulo=""):
    els = []
    if os.path.exists(_LOGO):
        try:
            img = Image(_LOGO)
            ratio = img.imageWidth / img.imageHeight
            img.drawHeight = 16 * mm
            img.drawWidth = 16 * mm * ratio
            img.hAlign = "LEFT"
            els.append(img)
            els.append(Spacer(1, 4))
        except Exception:
            pass
    els.append(Paragraph(titulo, ss["H"]))
    linha2 = settings.EMPRESA_NOME
    if subtitulo:
        linha2 += " · " + subtitulo
    els.append(Paragraph(linha2, ss["Sub"]))
    els.append(Spacer(1, 4))
    els.append(HRFlowable(width="100%", thickness=1.2, color=GOLD, spaceAfter=8))
    return els


# ── QR Code real de autenticidade ──
def _qr_drawing(url: str, size=14*mm):
    """Gera QR code real que pode ser escaneado pelo celular."""
    try:
        import qrcode, io
        from reportlab.lib.utils import ImageReader
        qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=4, border=1)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color=(8, 45, 81), back_color=(255, 255, 255))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        from reportlab.platypus import Image as RLImage
        return RLImage(buf, width=size, height=size)
    except Exception:
        # fallback: quadrado simples
        d = Drawing(size, size)
        d.add(Rect(0, 0, size, size, fillColor=colors.white, strokeColor=LINE, strokeWidth=.5))
        d.add(Rect(2, 2, size-4, size-4, fillColor=NAVY, strokeColor=None))
        return d


def _rodape(ss, auth=None, verify_url=None):
    partes = [settings.EMPRESA_NOME]
    if settings.EMPRESA_DOC:
        partes.append(settings.EMPRESA_DOC)
    partes.append(settings.EMPRESA_CIDADE)
    partes.append("Emitido em " + datetime.now().strftime("%d/%m/%Y às %H:%M"))
    linha_final = Paragraph(" · ".join([p for p in partes if p]), ss["Foot"])

    if not auth:
        return [Spacer(1, 10),
                HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=4),
                linha_final]

    qr = _qr_drawing(verify_url or auth, size=14*mm)
    auth_p = Paragraph(
        f'<font size="7"><b>Autenticidade:</b> {auth}</font>', ss["Foot"])
    ft = Table([[qr, [auth_p, Spacer(1, 3), linha_final]]], colWidths=[15*mm, None])
    ft.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (1, 0), (1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [Spacer(1, 10),
            HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=6),
            ft]


# ---------------------------------------------------------------- VISUAL COLORIDO
from reportlab.lib.colors import HexColor, Color
from reportlab.graphics.shapes import String, Circle, Group, Line
from reportlab.graphics.charts.doughnut import Doughnut

TEMAS = {
    "verde":    ("#14594C", "#2F9E7E"),
    "laranja":  ("#8E3326", "#E07A5F"),
    "azul":     ("#061E38", "#2F817A"),
    "dourado":  ("#7A5E16", "#D4B25A"),
}
PALETA = ["#2F817A", "#C9A94E", "#C9573F", "#305C74", "#7F3F98", "#38A3C9", "#E59A4B", "#A0285F", "#3EA88A", "#7E8C9A"]


def _mix(hexcor, t):
    """Mistura a cor com branco (t=0 cor pura, t=1 branco): fundos suaves das tabelas e cartões."""
    c = HexColor(hexcor)
    return Color(c.red + (1 - c.red) * t, c.green + (1 - c.green) * t, c.blue + (1 - c.blue) * t)


def _doc_colorido(title):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title=title, author=settings.EMPRESA_NOME,
                            leftMargin=18 * mm, rightMargin=18 * mm, topMargin=50 * mm, bottomMargin=22 * mm)
    return buf, doc


def _pagina(titulo, subtitulo, tema="azul"):
    """Desenha em toda página: faixa em gradiente com logo e título; rodapé com cores e página."""
    c1, c2 = TEMAS.get(tema, TEMAS["azul"])

    def desenha(cv, doc):
        W, H = A4
        cv.saveState()
        p = cv.beginPath(); p.rect(0, H - 42 * mm, W, 42 * mm)
        cv.clipPath(p, stroke=0, fill=0)
        cv.linearGradient(0, H, W, H - 42 * mm, (HexColor(c1), HexColor(c2)), extend=False)
        cv.restoreState()
        cv.saveState()
        for (x, y, r, a) in ((W - 22 * mm, H - 4 * mm, 34 * mm, .09), (W - 70 * mm, H - 44 * mm, 18 * mm, .07),
                             (14 * mm, H - 46 * mm, 24 * mm, .06), (W * .55, H - 8 * mm, 8 * mm, .08)):
            cv.setFillColor(Color(1, 1, 1, alpha=a)); cv.circle(x, y, r, stroke=0, fill=1)
        # pequenas moedas douradas decorativas
        for (x, y, r) in ((W * .47, H - 31 * mm, 3.2 * mm), (W * .52, H - 35 * mm, 2.2 * mm)):
            cv.setFillColor(HexColor("#F4D27A")); cv.setStrokeColor(HexColor("#8C6D24")); cv.setLineWidth(.6)
            cv.circle(x, y, r, stroke=1, fill=1)
        cv.setFillColor(colors.white); cv.roundRect(18 * mm, H - 33 * mm, 56 * mm, 22 * mm, 4 * mm, stroke=0, fill=1)
        if os.path.exists(_LOGO):
            try:
                cv.drawImage(_LOGO, 21 * mm, H - 31 * mm, width=50 * mm, height=18 * mm, preserveAspectRatio=True, mask="auto", anchor="c")
            except Exception:
                pass
        cv.setFillColor(colors.white); cv.setFont("Helvetica-Bold", 19)
        cv.drawRightString(W - 18 * mm, H - 20 * mm, titulo)
        cv.setFont("Helvetica", 9.5); cv.setFillColor(Color(1, 1, 1, alpha=.88))
        cv.drawRightString(W - 18 * mm, H - 26.5 * mm, subtitulo)
        largura = (W - 36 * mm) / 5
        for k, cor in enumerate(PALETA[:5]):
            cv.setFillColor(HexColor(cor)); cv.rect(18 * mm + k * largura, 14 * mm, largura, 1.3 * mm, stroke=0, fill=1)
        cv.setFillColor(STEEL); cv.setFont("Helvetica", 7.5)
        cv.drawString(18 * mm, 9.5 * mm, settings.EMPRESA_NOME)
        cv.drawRightString(W - 18 * mm, 9.5 * mm, f"Página {doc.page}")
        cv.setFillColor(HexColor("#9AA8B6")); cv.setFont("Helvetica", 6.5)
        cv.drawCentredString(W / 2, 5.5 * mm, "Sistema criado pela UniController · Dev Jackson Tomelin")
        cv.restoreState()
    return desenha


def _cartoes(ss, itens):
    """Cartões coloridos lado a lado: [(rótulo, valor, cor_hex)]."""
    cel, larg = [], []
    for k, (rot, val, cor) in enumerate(itens):
        if k:
            cel.append(""); larg.append(4 * mm)
        cel.append(Paragraph(f'<font size="7.5" color="{cor}"><b>{rot.upper()}</b></font><br/>'
                             f'<font size="14" color="{cor}"><b>{val}</b></font>', ParagraphStyle("kpi", parent=ss["Cell"], leading=19)))
        larg.append(None)
    t = Table([cel], colWidths=larg)
    est = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
           ("LEFTPADDING", (0, 0), (-1, -1), 10)]
    col = 0
    for (_, _, cor) in itens:
        est += [("BACKGROUND", (col, 0), (col, 0), _mix(cor, .88)), ("LINEABOVE", (col, 0), (col, 0), 3, HexColor(cor)),
                ("ROUNDEDCORNERS", [6, 6, 6, 6])]
        col += 2
    t.setStyle(TableStyle(est))
    return t


def _rosca(itens, total, rotulo_centro):
    """Gráfico de rosca com o total no centro e legenda colorida ao lado."""
    d = Drawing(174 * mm, 58 * mm)
    if not total or not itens:
        return d
    top = sorted(itens, key=lambda x: -x[1])
    if len(top) > 7:
        outros = sum(v for _, v in top[6:]); top = top[:6] + [("Outros", outros)]
    g = Doughnut()
    g.x, g.y, g.width, g.height = 4 * mm, 3 * mm, 52 * mm, 52 * mm
    g.data = [max(v, 0.0001) for _, v in top]
    g.labels = None
    g.innerRadiusFraction = .58
    g.slices.strokeColor = colors.white; g.slices.strokeWidth = 1.5
    for k in range(len(top)):
        g.slices[k].fillColor = HexColor(PALETA[k % len(PALETA)])
    d.add(g)
    cx, cy = 30 * mm, 29 * mm
    d.add(String(cx, cy + 2, rotulo_centro, fontName="Helvetica", fontSize=7, fillColor=STEEL, textAnchor="middle"))
    d.add(String(cx, cy - 8, brl(total), fontName="Helvetica-Bold", fontSize=9.5, fillColor=INK, textAnchor="middle"))
    y = 50 * mm
    for k, (nome, v) in enumerate(top):
        cor = HexColor(PALETA[k % len(PALETA)])
        d.add(Rect(66 * mm, y - 1, 4 * mm, 4 * mm, rx=1, ry=1, fillColor=cor, strokeColor=None))
        d.add(String(73 * mm, y, (nome[:24] + "…") if len(nome) > 25 else nome, fontName="Helvetica", fontSize=8.5, fillColor=INK))
        largura = 30 * mm * (v / top[0][1])
        d.add(Rect(116 * mm, y - .5, 30 * mm, 3.4 * mm, rx=1.7, ry=1.7, fillColor=_mix(PALETA[k % len(PALETA)], .85), strokeColor=None))
        d.add(Rect(116 * mm, y - .5, max(largura, 1.5 * mm), 3.4 * mm, rx=1.7, ry=1.7, fillColor=cor, strokeColor=None))
        d.add(String(174 * mm, y, f"{brl(v)} · {pct(v, total)}", fontName="Helvetica", fontSize=7.5, fillColor=INK, textAnchor="end"))
        y -= 7 * mm
    return d


def _tabela_colorida(ss, cabecalho, linhas, total_linha, cor, larguras, com_cor=True):
    """Tabela com cabeçalho colorido, linhas alternadas e quadradinho de cor por linha."""
    data = [[Paragraph(f'<font color="white"><b>{h}</b></font>', ss["CellR"] if k else ss["Cell"]) for k, h in enumerate(cabecalho)]]
    for n, lin in enumerate(linhas):
        nome = lin[0]
        marca = f'<font color="{PALETA[n % len(PALETA)]}">&#9632;</font>&nbsp; ' if com_cor else ""
        data.append([Paragraph(marca + str(nome), ss["Cell"])] + [Paragraph(str(v), ss["CellR"]) for v in lin[1:]])
    if total_linha:
        data.append([Paragraph(f"<b>{total_linha[0]}</b>", ss["Cell"])] + [Paragraph(f"<b>{v}</b>", ss["CellR"]) for v in total_linha[1:]])
    t = Table(data, colWidths=larguras, repeatRows=1)
    est = [("BACKGROUND", (0, 0), (-1, 0), HexColor(cor)), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
           ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
           ("ROUNDEDCORNERS", [5, 5, 5, 5])]
    for r in range(1, len(linhas) + 1):
        if r % 2 == 0:
            est.append(("BACKGROUND", (0, r), (-1, r), _mix(cor, .93)))
    if total_linha:
        est += [("BACKGROUND", (0, -1), (-1, -1), _mix(cor, .80)), ("LINEABOVE", (0, -1), (-1, -1), 1.2, HexColor(cor)),
                ("TEXTCOLOR", (0, -1), (-1, -1), HexColor(cor))]
    t.setStyle(TableStyle(est))
    return t


def _secao(ss, titulo, cor):
    return Paragraph(f'<font color="{cor}">&#9679;</font>&nbsp; <font color="#082D51"><b>{titulo}</b></font>',
                     ParagraphStyle("sec2", parent=ss["Normal"], fontSize=12, spaceBefore=12, spaceAfter=6))


def _aviso(ss, texto, cor="#305C74"):
    t = Table([[Paragraph(f'<font color="{cor}"><b>i</b></font>', ParagraphStyle("ic", alignment=1, fontSize=11)),
                Paragraph(texto, ss["Cell"])]], colWidths=[8 * mm, None])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), _mix(cor, .9)), ("LINEBEFORE", (0, 0), (0, -1), 3, HexColor(cor)),
                           ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    return t


def _carimbo(texto, cor):
    """Carimbo redondo inclinado (PAGO / RECEBIDO)."""
    d = Drawing(36 * mm, 36 * mm)
    g = Group()
    c = HexColor(cor)
    g.add(Circle(18 * mm, 18 * mm, 16 * mm, fillColor=None, strokeColor=c, strokeWidth=2.2))
    g.add(Circle(18 * mm, 18 * mm, 13.4 * mm, fillColor=None, strokeColor=c, strokeWidth=.8))
    g.add(String(18 * mm, 16.2 * mm, texto, fontName="Helvetica-Bold", fontSize=12 if len(texto) <= 5 else 9.5, fillColor=c, textAnchor="middle"))
    g.add(String(18 * mm, 10.5 * mm, datetime.now().strftime("%d/%m/%Y"), fontName="Helvetica", fontSize=6.5, fillColor=c, textAnchor="middle"))
    g.add(String(18 * mm, 23.5 * mm, "TOMELIN", fontName="Helvetica-Bold", fontSize=6.5, fillColor=c, textAnchor="middle"))
    g.transform = (0.94, 0.34, -0.34, 0.94, 7.5 * mm, -5 * mm)    # gira ~20 graus
    d.add(g)
    return d


# ---------------------------------------------------------------- RECIBO
def recibo(l, categoria="", conta="", contato="") -> bytes:
    ss = _styles()
    buf, doc = _doc_colorido(f"Recibo #{l.id:04d}")
    auth = _hash("recibo", l.id, l.valor_total)
    base = getattr(settings, "APP_URL", "").rstrip("/") or "http://localhost:8000"
    verify_url = f"{base}/verificar/{auth}"
    rec = l.tipo.value == "receita"
    tema, cor = ("verde", "#2F9E7E") if rec else ("laranja", "#C9573F")
    tipo_lbl = "Recebimento" if rec else "Pagamento"
    els = []

    pago = bool(l.data_pagamento)
    valor_box = Table([[Paragraph(f'<font size="8" color="{cor}"><b>VALOR TOTAL</b></font><br/>'
                                  f'<font size="24" color="{cor}"><b>{brl(l.valor_total)}</b></font><br/>'
                                  f'<font size="9" color="#45586B">{l.descricao}</font>', ParagraphStyle("valor", parent=ss["Cell"], leading=28)),
                        _carimbo("RECEBIDO" if rec else "PAGO", cor) if pago else
                        Paragraph(f'<font size="9" color="#C2742A"><b>EM ABERTO</b></font>', ParagraphStyle("ab", alignment=1))]],
                      colWidths=[None, 40 * mm])
    valor_box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), _mix(cor, .9)), ("LINEBEFORE", (0, 0), (0, -1), 4, HexColor(cor)),
                                   ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 10),
                                   ("BOTTOMPADDING", (0, 0), (-1, -1), 10), ("LEFTPADDING", (0, 0), (-1, -1), 12),
                                   ("ROUNDEDCORNERS", [6, 6, 6, 6])]))
    els += [valor_box, Spacer(1, 10)]

    els.append(_secao(ss, "Detalhes", cor))
    linhas = [("Descrição", l.descricao), ("Categoria", categoria or "-"), ("Situação", l.status.capitalize()),
              ("Competência", l.data_competencia.strftime("%d/%m/%Y") if l.data_competencia else "-"),
              ("Vencimento", l.data_vencimento.strftime("%d/%m/%Y") if l.data_vencimento else "-"),
              ("Pagamento", l.data_pagamento.strftime("%d/%m/%Y") if l.data_pagamento else "-"),
              ("Conta", conta or "-"), (("Recebido de" if rec else "Pago para"), contato or "-")]
    t = Table([[Paragraph(f'<font color="#45586B">{k}</font>', ss["Cell"]), Paragraph(f"<b>{v}</b>", ss["Cell"])] for k, v in linhas],
              colWidths=[40 * mm, None])
    est = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
           ("LEFTPADDING", (0, 0), (-1, -1), 8), ("ROUNDEDCORNERS", [5, 5, 5, 5])]
    for r in range(len(linhas)):
        if r % 2 == 0:
            est.append(("BACKGROUND", (0, r), (-1, r), _mix(cor, .94)))
    t.setStyle(TableStyle(est)); els.append(t)

    if l.juros or l.multa:
        els.append(_secao(ss, "Composição do valor", cor))
        comp = [("Valor", brl(l.valor))] + ([("Juros", brl(l.juros))] if l.juros else []) + ([("Multa", brl(l.multa))] if l.multa else [])
        els.append(_tabela_colorida(ss, ["Item", "Valor"], comp, ("Total", brl(l.valor_total)), cor, [None, 45 * mm], com_cor=False))

    els.append(Spacer(1, 14))
    frase = "Recebi(emos) a importância acima." if rec else "Pagamento registrado conforme discriminado acima."
    els.append(Paragraph(frase, ss["Cell"]))
    els.append(Spacer(1, 26))
    els.append(HRFlowable(width="55%", thickness=.6, color=HexColor(cor), spaceAfter=2))
    els.append(Paragraph("Assinatura / Carimbo", ParagraphStyle("sig", fontSize=8, textColor=STEEL, alignment=1)))
    els += _rodape(ss, auth, verify_url)
    doc.build(els, onFirstPage=_pagina(f"Recibo de {tipo_lbl}", f"Nº {l.id:04d} · {settings.EMPRESA_NOME}", tema),
              onLaterPages=_pagina(f"Recibo de {tipo_lbl}", f"Nº {l.id:04d}", tema))
    return buf.getvalue()


# ---------------------------------------------------------------- BALANCETE
def balancete(periodo_label, receitas, despesas, tot_rec, tot_desp, juros_total=0) -> bytes:
    ss = _styles()
    buf, doc = _doc_colorido("Balancete")
    auth = _hash("balancete", periodo_label, tot_rec, tot_desp)
    resultado = tot_rec - tot_desp
    cor_res = "#2F9E7E" if resultado >= 0 else "#C9573F"
    els = [_cartoes(ss, [("Receitas", brl(tot_rec), "#2F9E7E"), ("Despesas", brl(tot_desp), "#C9573F"),
                         ("Resultado", brl(resultado), cor_res)])]
    if despesas and tot_desp:
        els.append(_secao(ss, "Para onde foi o dinheiro", "#C9A94E"))
        els.append(_rosca(despesas, tot_desp, "despesas"))
    if receitas and tot_rec and len(receitas) > 1:
        els.append(_secao(ss, "De onde veio o dinheiro", "#2F9E7E"))
        els.append(_rosca(receitas, tot_rec, "receitas"))
    els.append(_secao(ss, "Receitas por categoria", "#2F9E7E"))
    els.append(_tabela_colorida(ss, ["Categoria", "Valor", "%"], [(n, brl(v), pct(v, tot_rec)) for n, v in receitas],
                                ("Total", brl(tot_rec), "100%"), "#2F9E7E", [None, 40 * mm, 20 * mm]))
    els.append(_secao(ss, "Despesas por categoria", "#C9573F"))
    els.append(_tabela_colorida(ss, ["Categoria", "Valor", "%"], [(n, brl(v), pct(v, tot_desp)) for n, v in despesas],
                                ("Total", brl(tot_desp), "100%"), "#C9573F", [None, 40 * mm, 20 * mm]))
    els.append(Spacer(1, 10))
    rt = Table([[Paragraph('<font color="white" size="10"><b>RESULTADO DO PERÍODO</b></font>', ss["Cell"]),
                 Paragraph(f'<font color="white" size="14"><b>{brl(resultado)}</b></font>', ss["CellR"])]], colWidths=[None, 60 * mm])
    rt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), HexColor(cor_res)), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                            ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("ROUNDEDCORNERS", [6, 6, 6, 6])]))
    els.append(rt)
    if juros_total:
        els += [Spacer(1, 8), _aviso(ss, f"Juros e multas pagos no período: <b>{brl(juros_total)}</b> · equivalente anualizado: "
                                         f"<b>{brl(juros_total * 12)}</b>", "#C2742A")]
    if despesas and tot_desp:
        maior = max(despesas, key=lambda x: x[1])
        if maior[1] / tot_desp > 0.3:
            els += [Spacer(1, 6), _aviso(ss, f"A categoria <b>{maior[0]}</b> concentra <b>{pct(maior[1], tot_desp)}</b> das despesas do período.")]
    els += _rodape(ss, auth)
    doc.build(els, onFirstPage=_pagina("Balancete Financeiro", periodo_label, "azul"),
              onLaterPages=_pagina("Balancete Financeiro", periodo_label, "azul"))
    return buf.getvalue()


# ---------------------------------------------------------------- PATRIMÔNIO
def patrimonio(contas, veiculos, total_contas, total_veic, total_financ) -> bytes:
    ss = _styles()
    buf, doc = _doc_colorido("Patrimônio")
    auth = _hash("patrimonio", total_contas, total_veic, total_financ)
    total_ativos = total_contas + total_veic
    liquido = total_ativos - total_financ
    cor_liq = "#2F9E7E" if liquido >= 0 else "#C9573F"
    els = [_cartoes(ss, [("Ativos", brl(total_ativos), "#305C74"), ("Financiamentos", brl(total_financ), "#C9573F"),
                         ("Patrimônio líquido", brl(liquido), cor_liq)])]
    comp = [(n, max(float(s or 0), 0)) for n, s in contas] + [(n, max(float(v or 0), 0)) for n, v, *_ in veiculos]
    comp = [(n, v) for n, v in comp if v > 0]
    if comp:
        els.append(_secao(ss, "Onde está o patrimônio", "#C9A94E"))
        els.append(_rosca(comp, sum(v for _, v in comp), "ativos"))
    els.append(_secao(ss, "Contas e aplicações", "#305C74"))
    els.append(_tabela_colorida(ss, ["Conta", "Saldo", "%"], [(n, brl(s), pct(s, total_ativos)) for n, s in contas],
                                ("Subtotal", brl(total_contas), pct(total_contas, total_ativos)), "#305C74", [None, 40 * mm, 20 * mm]))
    if veiculos:
        els.append(_secao(ss, "Veículos", "#C9A94E"))
        els.append(_tabela_colorida(ss, ["Veículo", "Valor", "Falta pagar", "Líquido"],
                                    [(n, brl(v), brl(f), f'<font color="{"#2F9E7E" if q >= 0 else "#C9573F"}"><b>{brl(q)}</b></font>')
                                     for n, v, f, q in veiculos],
                                    ("Subtotal", brl(total_veic), brl(total_financ), brl(total_veic - total_financ)),
                                    "#8A6D1E", [None, 32 * mm, 32 * mm, 32 * mm]))
    els.append(Spacer(1, 10))
    rt = Table([[Paragraph('<font color="white" size="10"><b>PATRIMÔNIO LÍQUIDO</b></font><br/>'
                           '<font color="white" size="8">ativos menos financiamentos</font>', ss["Cell"]),
                 Paragraph(f'<font color="white" size="15"><b>{brl(liquido)}</b></font>', ss["CellR"])]], colWidths=[None, 62 * mm])
    rt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), HexColor(cor_liq)), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                            ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("ROUNDEDCORNERS", [6, 6, 6, 6])]))
    els.append(rt)
    if total_ativos:
        els += [Spacer(1, 8), _aviso(ss, f"Os financiamentos representam <b>{total_financ / total_ativos * 100:.1f}%</b> do total de ativos.")]
    els += _rodape(ss, auth)
    doc.build(els, onFirstPage=_pagina("Demonstrativo de Patrimônio", date.today().strftime("%d/%m/%Y"), "dourado"),
              onLaterPages=_pagina("Demonstrativo de Patrimônio", date.today().strftime("%d/%m/%Y"), "dourado"))
    return buf.getvalue()
