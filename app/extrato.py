"""Leitura de extratos bancários: OFX (1.x SGML e 2.x XML) e CSV de vários bancos.

Sem dependências externas. Devolve linhas padronizadas:
  {"data": date, "valor": Decimal (negativo = saída), "descricao": str, "id": str|None}
"""
import csv, hashlib, html, io, re, unicodedata
from datetime import date, datetime
from decimal import Decimal, InvalidOperation


class ErroExtrato(Exception):
    pass


def decodificar(bruto: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return bruto.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ErroExtrato("não consegui ler o texto do arquivo")


def _data(txt: str):
    t = (txt or "").strip()
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(t[:10] if fmt.startswith("%Y") or len(t) >= 10 else t[:8], fmt).date()
        except ValueError:
            continue
    return None


def _valor(txt: str):
    """Aceita 1.234,56 | 1234.56 | -1.234,56 | (123,45) | R$ 10,00 | 123,45 D."""
    t = (txt or "").strip().upper().replace("R$", "").replace("\u00a0", "").replace(" ", "")
    if not t:
        return None
    neg = t.startswith("-") or (t.startswith("(") and t.endswith(")")) or t.endswith("D")
    t = t.strip("()+-CD")
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".") if t.rfind(",") > t.rfind(".") else t.replace(",", "")
    elif "," in t:
        t = t.replace(",", ".")
    try:
        v = Decimal(t)
    except InvalidOperation:
        return None
    return -v if neg else v


def ler_ofx(texto: str) -> list[dict]:
    blocos = re.findall(r"<STMTTRN>(.*?)</STMTTRN>", texto, re.S | re.I)
    if not blocos:   # alguns bancos não fecham a tag
        blocos = re.split(r"<STMTTRN>", texto, flags=re.I)[1:]

    def campo(b, tag):
        m = re.search(rf"<{tag}>\s*([^<\r\n]*)", b, re.I)
        return html.unescape(m.group(1).strip()) if m else ""

    linhas = []
    for b in blocos:
        dt = campo(b, "DTPOSTED")
        d = None
        if len(dt) >= 8 and dt[:8].isdigit():
            try:
                d = date(int(dt[:4]), int(dt[4:6]), int(dt[6:8]))
            except ValueError:
                d = None
        v = _valor(campo(b, "TRNAMT"))
        desc = campo(b, "MEMO") or campo(b, "NAME") or campo(b, "PAYEE") or "Sem descrição"
        if d and v is not None and v != 0:
            linhas.append({"data": d, "valor": v, "descricao": desc[:200], "id": campo(b, "FITID") or None})
    if not linhas:
        raise ErroExtrato("o arquivo OFX não tem movimentações")
    return linhas


def _sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)).lower()


def ler_csv(texto: str) -> list[dict]:
    amostra = "\n".join(texto.splitlines()[:15])
    delim = max([";", ",", "\t"], key=lambda d: amostra.count(d))
    rows = [r for r in csv.reader(io.StringIO(texto), delimiter=delim) if any(c.strip() for c in r)]
    if not rows:
        raise ErroExtrato("o arquivo CSV está vazio")

    def acha(cab, *chaves, evita=()):
        for i, c in enumerate(cab):
            n = _sem_acento(c)
            if any(k in n for k in chaves) and not any(e in n for e in evita):
                return i
        return None

    cab_i = None
    for i, r in enumerate(rows[:12]):
        n = [_sem_acento(c) for c in r]
        if any("data" in c or c.strip() == "date" for c in n) and any(k in c for c in n for k in ("valor", "amount", "value", "credito", "debito", "entrada", "saida")):
            cab_i = i; break
    if cab_i is None:
        raise ErroExtrato("não achei o cabeçalho do CSV (colunas de data e valor)")
    cab = rows[cab_i]
    c_data = acha(cab, "data", "date")
    c_valor = acha(cab, "valor", "amount", "value", "quantia", evita=("saldo",))
    c_cred = acha(cab, "credito", "entrada")
    c_deb = acha(cab, "debito", "saida")
    c_desc = acha(cab, "descri", "histor", "memo", "title", "estabelecimento", "detalhe", "lancamento", evita=("data",))
    c_id = acha(cab, "identificador", "fitid", "id transacao", "id da transacao")
    if c_data is None or (c_valor is None and c_cred is None and c_deb is None):
        raise ErroExtrato("o CSV precisa ter colunas de data e de valor")

    linhas = []
    for r in rows[cab_i + 1:]:
        pega = lambda i: r[i] if i is not None and i < len(r) else ""
        d = _data(pega(c_data))
        desc = (pega(c_desc) or "Sem descrição").strip()
        if not d or _sem_acento(desc).startswith(("saldo", "s a l d o")):
            continue
        if c_valor is not None and pega(c_valor).strip():
            v = _valor(pega(c_valor))
        else:
            cr, db = _valor(pega(c_cred)) or Decimal(0), _valor(pega(c_deb)) or Decimal(0)
            v = cr - abs(db)
        if v is None or v == 0:
            continue
        linhas.append({"data": d, "valor": v, "descricao": desc[:200], "id": pega(c_id).strip() or None})
    if not linhas:
        raise ErroExtrato("o CSV não tem movimentações reconhecíveis")
    return linhas


def ler(nome: str, bruto: bytes) -> tuple[str, list[dict]]:
    texto = decodificar(bruto)
    if "<OFX" in texto.upper() or "OFXHEADER" in texto.upper() or nome.lower().endswith(".ofx"):
        return "OFX", ler_ofx(texto)
    return "CSV", ler_csv(texto)


def id_importacao(conta_id: int, formato: str, linha: dict, ordem: int) -> str:
    """Identidade estável da linha, para não importar duas vezes."""
    if linha.get("id"):
        base = f"{conta_id}|{formato}|{linha['id']}"
    else:
        base = f"{conta_id}|{linha['data']}|{linha['valor']}|{linha['descricao']}|{ordem}"
    return "x" + hashlib.sha1(base.encode()).hexdigest()


_PALAVRAS_GENERICAS = {"pix", "compra", "compras", "pagamento", "pagto", "pgto", "pag", "transferencia", "enviado",
                       "enviada", "recebido", "recebida", "debito", "credito", "cartao", "boleto", "ted", "doc",
                       "para", "de", "da", "do", "com", "em", "no", "na", "conta", "automatico", "deb", "cred", "aut"}


def chave_descricao(desc: str) -> str:
    """Duas primeiras palavras que importam: 'PIX ENVIADO - SUPERMERCADO ANGELONI' -> 'supermercado angeloni'."""
    pal = [p for p in re.sub(r"[^a-z ]", " ", _sem_acento(desc)).split() if len(p) >= 3 and p not in _PALAVRAS_GENERICAS]
    return " ".join(pal[:2])
