"""Página pública de validação dos documentos (aberta pelo QR code dos PDFs).

/verificar/<código>       confere no registro e mostra o que foi emitido
/verificar/<código>/pdf   devolve o PDF original (?baixar=1 para salvar)

O código tem 20 caracteres hexadecimais (80 bits): não dá para adivinhar,
então só abre o documento quem tem o papel ou o arquivo em mãos.
"""
import html
import re
from datetime import timezone

import pytz
from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse, Response
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from . import models

router = APIRouter(tags=["verificacao"])
_CODIGO = re.compile(r"^[A-F0-9]{20}$")

_TIPOS = {
    "recibo": ("Recibo", "#2F9E7E", "#1F6F5C"),
    "balancete": ("Balancete", "#305C74", "#082D51"),
    "patrimonio": ("Patrimônio", "#C9A94E", "#8A6D1E"),
    "imposto_renda": ("Relatório do IR", "#2F9E7E", "#14594C"),
}


def _brl(v) -> str:
    if v is None:
        return "-"
    s = f"{float(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("- R$ " if float(v) < 0 else "R$ ") + s.lstrip("-")


def _quando(dt) -> str:
    if not dt:
        return "-"
    tz = pytz.timezone(settings.TIMEZONE)
    return dt.replace(tzinfo=timezone.utc).astimezone(tz).strftime("%d/%m/%Y às %H:%M")


def _codigo(code: str) -> str:
    c = (code or "").strip().upper()
    return c if _CODIGO.match(c) else ""


def _pagina(conteudo: str, cor: str = "#305C74", cor2: str = "#082D51", titulo: str = "Validação de documento", status: int = 200) -> HTMLResponse:
    e = html.escape
    return HTMLResponse(status_code=status, content=f"""<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>{e(titulo)} · Tomelin</title>
<link rel="icon" href="/static/icons/favicon-32.png">
<style>
  *{{box-sizing:border-box}}
  body{{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px 16px;
       font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0F2740;
       background:radial-gradient(900px 500px at 10% -10%,{cor}33,transparent 60%),radial-gradient(700px 500px at 110% 110%,{cor2}2b,transparent 60%),#F1F5F9}}
  .card{{width:100%;max-width:460px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 24px 60px -24px rgba(8,45,81,.35)}}
  .topo{{padding:26px 24px 22px;color:#fff;text-align:center;position:relative;background:linear-gradient(135deg,{cor2},{cor})}}
  .topo::after{{content:"";position:absolute;right:-40px;top:-40px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.08)}}
  .logo{{width:60px;height:60px;border-radius:18px;background:#fff;display:grid;place-items:center;margin:0 auto 12px;box-shadow:0 10px 24px -10px rgba(0,0,0,.4)}}
  .logo img{{width:34px;height:auto}}
  .selo{{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:99px;font-weight:800;font-size:14px;background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}}
  .selo svg{{width:18px;height:18px}}
  h1{{font-size:20px;margin:12px 0 4px}}
  .sub{{font-size:13px;opacity:.8}}
  .corpo{{padding:22px 24px 8px}}
  .linha{{display:flex;justify-content:space-between;gap:14px;padding:11px 0;border-bottom:1px solid #EEF1F4;font-size:14px}}
  .linha:last-child{{border-bottom:0}}
  .linha span{{color:#6B7C8F;flex-shrink:0}} .linha b{{text-align:right;overflow-wrap:anywhere}}
  .valor{{font-size:26px;font-weight:900;text-align:center;margin:4px 0 14px;color:{cor2}}}
  .codigo{{font-family:ui-monospace,Menlo,monospace;font-weight:700;letter-spacing:.06em;background:#F1F5F9;border-radius:10px;padding:10px;text-align:center;margin:14px 0 4px;font-size:14px}}
  .bts{{display:flex;gap:10px;padding:14px 24px 22px;flex-wrap:wrap}}
  .bt{{flex:1;min-width:150px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:13px 16px;border-radius:14px;font-weight:800;font-size:14px;text-decoration:none;transition:transform .15s}}
  .bt:active{{transform:scale(.97)}}
  .bt svg{{width:18px;height:18px}}
  .bt{{white-space:nowrap}} .bt-1{{flex:1.6;color:#fff;background:linear-gradient(135deg,{cor2},{cor});box-shadow:0 10px 22px -12px {cor2}}}
  .bt-2{{color:{cor2};background:#F1F5F9;box-shadow:inset 0 0 0 1.5px #E2E8F0}}
  .aviso{{font-size:13px;line-height:1.5;color:#45586B;background:#F8FAFC;border-radius:12px;padding:12px 14px;margin:6px 0 14px}}
  .rodape{{text-align:center;font-size:11.5px;color:#94A3B8;padding:0 20px 18px}}
  .rodape b{{color:#45586B}}
</style></head><body><div class="card">{conteudo}
<div class="rodape">Tomelin Gestão Financeira · Criado pela <b>UniController</b> · Dev <b>Jackson Tomelin</b></div>
</div></body></html>""")


_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
_BAIXAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>'
_OLHO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>'
_LOGO = '<div class="logo"><img src="/static/icons/logo-mark.png" alt="Tomelin"></div>'


@router.get("/verificar/{code}", response_class=HTMLResponse)
def verificar(code: str, db: Session = Depends(get_db)):
    e = html.escape
    c = _codigo(code)
    if not c:
        return _pagina(f"""<div class="topo">{_LOGO}<span class="selo">{_X} Código inválido</span>
            <h1>Este não é um código de documento</h1><div class="sub">O código tem 20 letras e números (0-9, A-F).</div></div>
            <div class="corpo"><div class="codigo">{e((code or '')[:40])}</div></div>""", "#C9573F", "#8E3326", "Código inválido", 400)
    d = db.get(models.DocumentoEmitido, c)
    if not d:
        return _pagina(f"""<div class="topo">{_LOGO}<span class="selo">{_X} Não encontrado</span>
            <h1>Documento não encontrado</h1><div class="sub">Não há registro de emissão com este código.</div></div>
            <div class="corpo"><div class="codigo">{c}</div>
            <div class="aviso">Confira se o código foi digitado certo. Documentos emitidos antes da validação existir
            (outubro de 2026) também não aparecem aqui: gere o PDF de novo pelo sistema para ter um código válido.<br><br>
            <b>Se você recebeu este documento de alguém, desconfie dele.</b></div></div>""", "#C9573F", "#8E3326", "Não encontrado", 404)

    nome, cor, cor2 = _TIPOS.get(d.tipo, ("Documento", "#305C74", "#082D51"))
    det = d.detalhes or {}
    linhas = [("Documento", d.titulo)]
    if d.resumo:
        linhas.append(("Referente a", d.resumo))
    if d.tipo == "recibo" and det.get("situacao"):
        sit = "Pago" if det["situacao"] == "pago" else "Em aberto"
        if det.get("pago_em"):
            a, m, dd = det["pago_em"][:10].split("-")
            sit += f" em {dd}/{m}/{a}"
        linhas.append(("Situação na emissão", sit))
    if d.tipo == "balancete":
        linhas += [("Receitas", _brl(det.get("receitas"))), ("Despesas", _brl(det.get("despesas")))]
    if d.tipo == "imposto_renda":
        linhas += [(k, _brl(v)) for k, v in det.items()]
    if d.tipo == "patrimonio":
        linhas += [("Contas", _brl(det.get("contas"))), ("Veículos", _brl(det.get("veiculos"))),
                   ("Financiamentos", _brl(det.get("financiamentos")))]
    linhas += [("Emitido em", _quando(d.emitido_em)), ("Modelo", "Cupom (bobina)" if d.estilo == "cupom" else "Padrão (A4)"),
               ("Emitido por", settings.EMPRESA_NOME)]
    rot_valor = {"recibo": "Valor", "balancete": "Resultado do período", "patrimonio": "Patrimônio líquido",
                 "imposto_renda": "Total dedutível"}.get(d.tipo, "Valor")
    corpo = "".join(f'<div class="linha"><span>{e(k)}</span><b>{e(str(v))}</b></div>' for k, v in linhas)
    return _pagina(f"""<div class="topo">{_LOGO}<span class="selo">{_OK} Documento autêntico</span>
        <h1>{e(nome)} verificado</h1><div class="sub">Emitido pelo sistema Tomelin Gestão Financeira</div></div>
        <div class="corpo">
          {f'<div class="sub" style="text-align:center;color:#6B7C8F;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">{e(rot_valor)}</div><div class="valor">{_brl(d.valor)}</div>' if d.valor is not None else ""}
          {corpo}
          <div class="codigo">{c}</div>
          <div class="sub" style="text-align:center;color:#94A3B8;font-size:12px;margin-bottom:6px">Compare o documento que você tem com o original abaixo.</div>
        </div>
        <div class="bts">
          <a class="bt bt-1" href="/verificar/{c}/pdf?baixar=1">{_BAIXAR} Baixar PDF original</a>
          <a class="bt bt-2" href="/verificar/{c}/pdf" target="_blank" rel="noopener">{_OLHO} Abrir</a>
        </div>""", cor, cor2, f"{nome} verificado")


@router.get("/verificar/{code}/pdf")
def verificar_pdf(code: str, baixar: int = 0, db: Session = Depends(get_db)):
    c = _codigo(code)
    d = db.get(models.DocumentoEmitido, c) if c else None
    if not d:
        return verificar(code, db)
    nome = f"{d.tipo}-{c}.pdf"
    return Response(content=d.pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'{"attachment" if baixar else "inline"}; filename="{nome}"',
        "Cache-Control": "private, max-age=3600", "X-Robots-Tag": "noindex"})
