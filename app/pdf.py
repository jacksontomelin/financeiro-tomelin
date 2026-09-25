"""Geração de PDFs (recibos, balancete contábil, patrimônio) com a identidade Tomelin."""
import io
import os
from datetime import date

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable,
)

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
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle("H", parent=ss["Title"], textColor=NAVY, fontSize=16, spaceAfter=2))
    ss.add(ParagraphStyle("Sub", parent=ss["Normal"], textColor=STEEL, fontSize=9))
    ss.add(ParagraphStyle("Sec", parent=ss["Heading2"], textColor=NAVY, fontSize=12, spaceBefore=10, spaceAfter=4))
    ss.add(ParagraphStyle("Cell", parent=ss["Normal"], fontSize=9.5, textColor=INK))
    ss.add(ParagraphStyle("CellR", parent=ss["Normal"], fontSize=9.5, textColor=INK, alignment=2))
    ss.add(ParagraphStyle("Foot", parent=ss["Normal"], fontSize=8, textColor=STEEL))
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


def _rodape(ss):
    partes = [settings.EMPRESA_NOME]
    if settings.EMPRESA_DOC:
        partes.append(settings.EMPRESA_DOC)
    partes.append(settings.EMPRESA_CIDADE)
    partes.append("Emitido em " + date.today().strftime("%d/%m/%Y"))
    return [Spacer(1, 10),
            HRFlowable(width="100%", thickness=0.6, color=LINE, spaceAfter=4),
            Paragraph(" · ".join([p for p in partes if p]), ss["Foot"])]


# ---------------------------------------------------------------- RECIBO
def recibo(l, categoria="", conta="", contato="") -> bytes:
    ss = _styles()
    buf, doc = _doc(f"Recibo #{l.id:04d}")
    tipo_lbl = "RECEBIMENTO" if l.tipo.value == "receita" else "PAGAMENTO"
    els = _cabecalho(ss, f"Recibo de {tipo_lbl.title()}", f"Nº {l.id:04d}")

    linhas = [
        ("Descrição", l.descricao),
        ("Categoria", categoria or "—"),
        ("Situação", l.status.capitalize()),
        ("Competência", l.data_competencia.strftime("%d/%m/%Y") if l.data_competencia else "—"),
        ("Vencimento", l.data_vencimento.strftime("%d/%m/%Y") if l.data_vencimento else "—"),
        ("Pagamento", l.data_pagamento.strftime("%d/%m/%Y") if l.data_pagamento else "—"),
        ("Conta", conta or "—"),
        (("Recebido de" if l.tipo.value == "receita" else "Pago para"), contato or "—"),
    ]
    t = Table([[Paragraph(f"<b>{k}</b>", ss["Cell"]), Paragraph(str(v), ss["Cell"])] for k, v in linhas],
              colWidths=[40 * mm, None])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    els.append(t)
    els.append(Spacer(1, 8))

    valores = [["Valor", brl(l.valor)]]
    if l.juros:
        valores.append(["Juros", brl(l.juros)])
    if l.multa:
        valores.append(["Multa", brl(l.multa)])
    valores.append(["TOTAL", brl(l.valor_total)])
    vt = Table([[Paragraph(f"<b>{k}</b>", ss["Cell"]), Paragraph(f"<b>{v}</b>", ss["CellR"])] for k, v in valores],
               colWidths=[None, 45 * mm])
    vt.setStyle(TableStyle([
        ("BACKGROUND", (0, -1), (-1, -1), SOFT),
        ("TEXTCOLOR", (0, -1), (-1, -1), NAVY),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, GOLD),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    els.append(vt)
    els.append(Spacer(1, 14))
    frase = ("Recebi(emos) a importância acima." if l.tipo.value == "receita"
             else "Pagamento registrado conforme discriminado acima.")
    els.append(Paragraph(frase, ss["Cell"]))
    els += _rodape(ss)
    doc.build(els)
    return buf.getvalue()


# ---------------------------------------------------------------- BALANCETE
def balancete(periodo_label, receitas, despesas, tot_rec, tot_desp, juros_total=0) -> bytes:
    ss = _styles()
    buf, doc = _doc("Balancete")
    els = _cabecalho(ss, "Balancete Financeiro", periodo_label)

    def bloco(titulo, itens, total, cor):
        els.append(Paragraph(titulo, ss["Sec"]))
        data = [[Paragraph("<b>Categoria</b>", ss["Cell"]), Paragraph("<b>Valor</b>", ss["CellR"])]]
        for nome, val in itens:
            data.append([Paragraph(nome, ss["Cell"]), Paragraph(brl(val), ss["CellR"])])
        data.append([Paragraph("<b>Total</b>", ss["Cell"]), Paragraph(f"<b>{brl(total)}</b>", ss["CellR"])])
        t = Table(data, colWidths=[None, 45 * mm])
        t.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, 0), 0.8, cor),
            ("LINEBELOW", (0, 1), (-1, -2), 0.3, LINE),
            ("LINEABOVE", (0, -1), (-1, -1), 0.8, cor),
            ("TEXTCOLOR", (0, -1), (-1, -1), cor),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        els.append(t)
        els.append(Spacer(1, 6))

    bloco("Receitas", receitas, tot_rec, GREEN)
    bloco("Despesas", despesas, tot_desp, GOLD)

    resultado = tot_rec - tot_desp
    res_cor = GREEN if resultado >= 0 else RED
    rt = Table([[Paragraph("<b>RESULTADO DO PERÍODO</b>", ss["Cell"]),
                 Paragraph(f"<b>{brl(resultado)}</b>", ss["CellR"])]], colWidths=[None, 45 * mm])
    rt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SOFT),
        ("TEXTCOLOR", (0, 0), (-1, -1), res_cor),
        ("LINEABOVE", (0, 0), (-1, -1), 1, res_cor),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    els.append(rt)
    if juros_total:
        els.append(Spacer(1, 6))
        els.append(Paragraph(f"Juros pagos no período: <b>{brl(juros_total)}</b>", ss["Cell"]))
    els += _rodape(ss)
    doc.build(els)
    return buf.getvalue()


# ---------------------------------------------------------------- PATRIMÔNIO
def patrimonio(contas, veiculos, total_contas, total_veic, total_financ) -> bytes:
    ss = _styles()
    buf, doc = _doc("Patrimônio")
    els = _cabecalho(ss, "Demonstrativo de Patrimônio", date.today().strftime("%d/%m/%Y"))

    els.append(Paragraph("Contas e aplicações", ss["Sec"]))
    d1 = [[Paragraph("<b>Conta</b>", ss["Cell"]), Paragraph("<b>Saldo</b>", ss["CellR"])]]
    for nome, saldo in contas:
        d1.append([Paragraph(nome, ss["Cell"]), Paragraph(brl(saldo), ss["CellR"])])
    d1.append([Paragraph("<b>Subtotal</b>", ss["Cell"]), Paragraph(f"<b>{brl(total_contas)}</b>", ss["CellR"])])
    t1 = Table(d1, colWidths=[None, 45 * mm])
    t1.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, 0), 0.8, STEEL),
                            ("LINEBELOW", (0, 1), (-1, -2), 0.3, LINE),
                            ("LINEABOVE", (0, -1), (-1, -1), 0.8, STEEL),
                            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    els.append(t1); els.append(Spacer(1, 6))

    els.append(Paragraph("Veículos", ss["Sec"]))
    d2 = [[Paragraph("<b>Veículo</b>", ss["Cell"]), Paragraph("<b>Valor</b>", ss["CellR"]),
           Paragraph("<b>Falta pagar</b>", ss["CellR"]), Paragraph("<b>Líquido</b>", ss["CellR"])]]
    for nome, val, financ, liq in veiculos:
        d2.append([Paragraph(nome, ss["Cell"]), Paragraph(brl(val), ss["CellR"]),
                   Paragraph(brl(financ), ss["CellR"]), Paragraph(brl(liq), ss["CellR"])])
    t2 = Table(d2, colWidths=[None, 32 * mm, 32 * mm, 32 * mm])
    t2.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, 0), 0.8, GOLD),
                            ("LINEBELOW", (0, 1), (-1, -1), 0.3, LINE),
                            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    els.append(t2); els.append(Spacer(1, 8))

    liquido = total_contas + total_veic - total_financ
    linhas = [("Ativos (contas + veículos)", total_contas + total_veic),
              ("Passivos (financiamentos)", -total_financ),
              ("PATRIMÔNIO LÍQUIDO", liquido)]
    dt = Table([[Paragraph(f"<b>{k}</b>", ss["Cell"]), Paragraph(f"<b>{brl(v)}</b>", ss["CellR"])] for k, v in linhas],
               colWidths=[None, 45 * mm])
    dt.setStyle(TableStyle([
        ("BACKGROUND", (0, -1), (-1, -1), SOFT),
        ("TEXTCOLOR", (0, -1), (-1, -1), NAVY),
        ("LINEABOVE", (0, -1), (-1, -1), 1, GOLD),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    els.append(dt)
    els += _rodape(ss)
    doc.build(els)
    return buf.getvalue()
