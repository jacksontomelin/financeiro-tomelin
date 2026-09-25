"""
Leitor de NF-e / NFC-e por QR Code.

Fluxo:
1. Front-end escaneia o QR code da nota fiscal (câmera do celular)
   OU o usuário cola a URL / chave de acesso manualmente
2. Backend acessa a URL da SEFAZ do estado correspondente
3. Parseia o HTML/XML retornado
4. Retorna dados estruturados: valor total, CNPJ/nome do emitente, data, itens
5. Front-end pré-preenche o formulário de lançamento

Suporte: NFC-e (cupom fiscal eletrônico, modelo 65) de todos os estados.
Os portais estaduais são acessíveis publicamente (sem autenticação).
"""
import re
import logging
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional
import httpx

log = logging.getLogger("tomelin.nfe")

# Mapeamento UF → portal NFC-e (URL base de consulta do consumidor)
# Padrão nacional: a URL já vem no QR code da nota
PORTAIS_NFCE = {
    "AC": "https://www.sefaznet.ac.gov.br/nfce/consulta",
    "AL": "https://nfce.sefaz.al.gov.br/consultaNFCe.htm",
    "AM": "https://sistemas.sefaz.am.gov.br/nfceweb/consultaNFCe.jsp",
    "AP": "https://www.sefaz.ap.gov.br/nfce/nfcep.php",
    "BA": "https://www.nfe.ba.gov.br/servicos/nfce/default.aspx",
    "CE": "https://nfce.sefaz.ce.gov.br/pages/showNFCe.html",
    "DF": "https://www.fazenda.df.gov.br/nfce/danfce",
    "ES": "https://app.sefaz.es.gov.br/ConsultaNFCe",
    "GO": "https://nfce.goinfra.go.gov.br/consultaHtml.do",
    "MA": "https://www.nfe.sefaz.ma.gov.br/nfce/danfce",
    "MG": "https://portalsped.fazenda.mg.gov.br/portalnfce",
    "MS": "https://www.dfe.ms.gov.br/nfce/consulta",
    "MT": "https://www.sefaz.mt.gov.br/nfce/consultanfce",
    "PA": "https://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/nfceForm.seam",
    "PB": "https://www.receita.pb.gov.br/nfce",
    "PE": "https://nfce.sefaz.pe.gov.br/nfce-web/consultaNFCe",
    "PI": "https://www.sefaz.pi.gov.br/nfce/consulta",
    "PR": "https://www.fazenda.pr.gov.br/nfce/qrcode",
    "RJ": "https://nfce.fazenda.rj.gov.br/consulta",
    "RN": "https://nfce.set.rn.gov.br/consultarNFCe.aspx",
    "RO": "https://www.nfe.ro.gov.br/nfeweb/consulta",
    "RR": "https://www.sefaz.rr.gov.br/nfce/servlet/NfceDanfeServlet",
    "RS": "https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx",
    "SC": "https://sat.sef.sc.gov.br/nfce/consulta",
    "SE": "https://nfce.se.gov.br/consultas",
    "SP": "https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica",
    "TO": "https://sefaz.to.gov.br/nfce/consulta",
}

UF_MAP = {
    "11":"RO","12":"AC","13":"AM","14":"RR","15":"PA","16":"AP","17":"TO",
    "21":"MA","22":"PI","23":"CE","24":"RN","25":"PB","26":"PE","27":"AL",
    "28":"SE","29":"BA","31":"MG","32":"ES","33":"RJ","35":"SP","41":"PR",
    "42":"SC","43":"RS","50":"MS","51":"MT","52":"GO","53":"DF",
}


def _formata_cnpj(c: str) -> str:
    c = re.sub(r"\D", "", c)
    if len(c) == 14:
        return f"{c[:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:]}"
    return c


def _dinheiro(v) -> Optional[Decimal]:
    if v is None:
        return None
    try:
        s = str(v).replace(",", ".").strip()
        s = re.sub(r"[^\d.]", "", s)
        return Decimal(s) if s else None
    except (InvalidOperation, ValueError):
        return None


def parsear_chave(chave: str) -> dict:
    """Extrai metadados de uma chave de acesso NF-e de 44 dígitos."""
    c = re.sub(r"\D", "", chave)
    if len(c) != 44:
        raise ValueError(f"Chave inválida: {len(c)} dígitos (esperado 44)")
    return {
        "uf": UF_MAP.get(c[:2], c[:2]),
        "aamm": c[2:6],
        "cnpj": _formata_cnpj(c[6:20]),
        "modelo": "NFC-e" if c[20:22] == "65" else "NF-e",
        "serie": str(int(c[22:25])),
        "numero": str(int(c[25:34])),
        "chave": c,
        "ano": "20" + c[2:4],
        "mes": c[4:6],
    }


def _extrair_html(html: str, chave_meta: dict) -> dict:
    """Parseia o HTML do portal estadual e extrai dados da nota."""
    result = {**chave_meta, "itens": [], "valor_total": None,
              "emitente": None, "cnpj_emitente": chave_meta.get("cnpj"),
              "data_emissao": None, "numero_nota": chave_meta.get("numero"),
              "obs": None}

    # Remove tags para busca de texto
    txt = re.sub(r"<[^>]+>", " ", html)
    txt = re.sub(r"\s+", " ", txt)

    # Valor total (R$ X,XX ou vNF>X</vNF no XML)
    for pat in [
        r"Valor\s+Total\s*[:\s]+R?\$?\s*([\d\.]+,\d{2})",
        r"TOTAL\s*R?\$?\s*([\d\.]+,\d{2})",
        r"vNF\>([\d\.]+)\<",
        r"Total\s+a\s+pagar\s*[:\s]+R?\$?\s*([\d\.]+,\d{2})",
    ]:
        m = re.search(pat, html, re.I)
        if m:
            result["valor_total"] = _dinheiro(m.group(1))
            break

    # Nome do emitente
    for pat in [
        r"Emitente[:\s]*<[^>]*>\s*([^<]{3,80})",
        r"Razão Social[:\s]*<[^>]*>\s*([^<]{3,80})",
        r"xNome\>([^<]{3,80})\<",
        r"<title>([^<]{3,60})</title>",
    ]:
        m = re.search(pat, html, re.I)
        if m:
            nome = m.group(1).strip()
            if len(nome) > 2:
                result["emitente"] = nome
                break

    # CNPJ emitente (refina se já temos da chave)
    m = re.search(r"CNPJ[:\s]*(\d{2}[\.\d\-\/]{12,17}\d{2})", html, re.I)
    if m:
        result["cnpj_emitente"] = _formata_cnpj(m.group(1))

    # Data de emissão
    for pat in [
        r"Emiss[aã]o[:\s]*(\d{2}/\d{2}/\d{4})",
        r"Data[:\s]+(\d{2}/\d{2}/\d{4})",
        r"dhEmi[^>]*>([^<]{10,25})<",
    ]:
        m = re.search(pat, html, re.I)
        if m:
            raw = m.group(1).strip()[:10]
            try:
                result["data_emissao"] = datetime.strptime(raw, "%d/%m/%Y").date().isoformat()
            except ValueError:
                try:
                    result["data_emissao"] = datetime.fromisoformat(raw[:10]).date().isoformat()
                except Exception:
                    pass
            if result["data_emissao"]:
                break

    # Itens da nota (tenta extrair descrição + valor)
    # Padrão HTML tabela: busca linhas com produto/qtd/valor
    itens = []
    # Tenta XML inline (xProd + vProd)
    for m in re.finditer(r"xProd\>([^<]{2,100})\<.*?vProd\>([\d\.]+)\<", html, re.S):
        desc = m.group(1).strip()
        val = _dinheiro(m.group(2))
        if desc and val:
            itens.append({"descricao": desc, "valor": float(val)})
    # Tenta tabela HTML: padrão mais comum dos portais estaduais
    if not itens:
        rows = re.findall(
            r"<tr[^>]*>.*?<td[^>]*>\s*(\d+)\s*</td>.*?<td[^>]*>([^<]{3,80})</td>.*?R?\$\s*([\d\.]+,\d{2})",
            html, re.S | re.I)
        for num, desc, val in rows[:30]:
            v = _dinheiro(val)
            if v and v > 0:
                itens.append({"descricao": desc.strip(), "valor": float(v)})
    result["itens"] = itens[:30]

    # Observação com info da nota
    partes = []
    if result.get("emitente"):
        partes.append(result["emitente"])
    if result.get("numero_nota"):
        partes.append(f"NF {result['numero_nota']}")
    if result.get("data_emissao"):
        partes.append(result["data_emissao"])
    if partes:
        result["obs"] = " · ".join(partes)

    return result


def consultar_qrcode(url_ou_chave: str, timeout: int = 15) -> dict:
    """
    Principal: recebe URL do QR code ou chave de acesso.
    Retorna dict com dados da nota para pré-preencher o lançamento.
    """
    url_ou_chave = url_ou_chave.strip()

    # Determina se é URL completa ou só a chave
    if url_ou_chave.startswith("http"):
        url = url_ou_chave
        # Tenta extrair a chave da URL (parâmetro p= ou q= ou na própria URL)
        chave_raw = None
        for pat in [r"[?&]p=([0-9|]+)", r"[?&]chave=(\d+)", r"[?&]q=([0-9|]+)", r"(\d{44})"]:
            m = re.search(pat, url)
            if m:
                chave_raw = re.sub(r"\D", "", m.group(1))[:44]
                break
    else:
        # É a chave de acesso direto
        chave_raw = re.sub(r"\D", "", url_ou_chave)[:44]
        # Monta a URL do portal do estado
        if len(chave_raw) == 44:
            uf = UF_MAP.get(chave_raw[:2])
            portal = PORTAIS_NFCE.get(uf, "")
            url = f"{portal}?p={chave_raw}|2|1|1|" if portal else None
        else:
            url = None

    # Parseia a chave para metadados
    chave_meta = {}
    if chave_raw and len(chave_raw) == 44:
        try:
            chave_meta = parsear_chave(chave_raw)
        except ValueError as e:
            log.warning("chave inválida: %s", e)

    if not url:
        raise ValueError("URL inválida — cole a URL completa do QR code da nota fiscal.")

    # Acessa o portal estadual
    headers = {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
    }
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as c:
            r = c.get(url, headers=headers)
        html = r.text
    except httpx.TimeoutException:
        raise ValueError("Portal da SEFAZ demorou para responder. Tente novamente.")
    except Exception as e:
        raise ValueError(f"Não foi possível acessar o portal da SEFAZ: {e}")

    if r.status_code >= 400:
        raise ValueError(f"Portal da SEFAZ retornou erro {r.status_code}. A URL pode ter expirado.")

    # Parseia HTML
    dados = _extrair_html(html, chave_meta)

    # Validação mínima
    if not dados.get("valor_total") and not dados.get("emitente"):
        raise ValueError(
            "Não foi possível extrair dados da nota. "
            "O portal da SEFAZ pode ter bloqueado o acesso ou a URL expirou. "
            "Cadastre o lançamento manualmente."
        )

    return dados
