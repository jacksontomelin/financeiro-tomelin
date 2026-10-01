"""Mensagens de erro reais, em português, dizendo QUAL campo e QUAL regra.

Três camadas:
1. Antes de gravar (before_flush): confere o tamanho de todo campo de texto
   de todas as tabelas, usando o limite declarado no próprio model.
2. Validação da requisição (Pydantic): campo obrigatório, número, data etc.
3. Erros do banco que escaparem: duplicado, em uso, obrigatório, data.
"""
import logging
import re
import secrets
import traceback

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import event, String
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session

log = logging.getLogger("tomelin.erros")

# ---------------------------------------------------------------- nomes
CAMPOS = {
    "nome": "Nome", "razao_social": "Razão social", "nome_fantasia": "Nome fantasia",
    "tipo": "Tipo", "documento": "CPF/CNPJ", "cpf": "CPF", "cnpj": "CNPJ",
    "telefone": "Telefone", "whatsapp": "WhatsApp", "email": "E-mail",
    "obs": "Observações", "observacao": "Observação", "logo": "Logo",
    "cep": "CEP", "logradouro": "Logradouro", "numero": "Número",
    "complemento": "Complemento", "bairro": "Bairro", "cidade": "Cidade",
    "estado": "Estado (UF)", "uf": "Estado (UF)",
    "descricao": "Descrição", "valor": "Valor", "valor_pago": "Valor pago",
    "juros": "Juros", "multa": "Multa", "desconto": "Desconto",
    "vencimento": "Vencimento", "data": "Data", "data_pagamento": "Data de pagamento",
    "competencia": "Competência", "parcelas": "Parcelas", "parcela": "Parcela",
    "categoria_id": "Categoria", "conta_id": "Conta", "contato_id": "Contato",
    "veiculo_id": "Veículo", "usuario_id": "Usuário", "meta_id": "Meta",
    "saldo_inicial": "Saldo inicial", "banco": "Banco", "agencia": "Agência",
    "cor": "Cor", "icone": "Ícone", "placa": "Placa", "renavam": "Renavam",
    "chassi": "Chassi", "marca": "Marca", "modelo": "Modelo", "ano": "Ano",
    "km": "Quilometragem", "senha": "Senha", "senha_atual": "Senha atual",
    "nova_senha": "Nova senha", "papel": "Perfil", "url": "Endereço (URL)",
    "alvo": "Valor da meta", "prazo": "Prazo", "quantidade": "Quantidade",
    "chave": "Chave de acesso", "loja": "Loja",
    "data_vencimento": "Vencimento", "data_competencia": "Competência",
    "forma_pagamento": "Forma de pagamento", "total_parcelas": "Total de parcelas",
    "recorrente": "Recorrente", "valor_alvo": "Valor da meta", "valor_atual": "Valor atual",
    "estabelecimento": "Estabelecimento", "chave_acesso": "Chave de acesso",
    "fipe_codigo": "Código FIPE", "fipe_valor": "Valor FIPE", "valor_parcela": "Valor da parcela",
    "parcelas_total": "Total de parcelas", "parcelas_pagas": "Parcelas pagas",
    "financiado": "Financiado", "financiamento_banco": "Banco do financiamento",
    "venc_dia": "Dia do vencimento", "valor_fixo": "Valor fixo", "cor_card": "Cor do cartão",
    "numero_nota": "Número da nota", "cnpj_emitente": "CNPJ do emitente",
    "data_emissao": "Data de emissão",
}
TABELAS = {
    "contatos": "Contatos", "lancamentos": "Lançamentos", "contas": "Contas",
    "categorias": "Categorias", "veiculos": "Veículos", "usuarios": "Usuários",
    "metas": "Metas", "compras": "Compras", "itens_compra": "Itens de compra",
}


def nome_campo(c: str) -> str:
    return CAMPOS.get(c, c.replace("_id", "").replace("_", " ").capitalize())


def nome_tabela(t: str) -> str:
    return TABELAS.get(t, t.replace("_", " ").capitalize())


class ErroCampo(Exception):
    def __init__(self, campo: str, mensagem: str, status: int = 422):
        super().__init__(mensagem)
        self.campo, self.mensagem, self.status = campo, mensagem, status


# ---------------------------------------- 1) tamanho, antes de gravar
@event.listens_for(Session, "before_flush")
def _conferir_tamanhos(session, flush_context, instances):
    for obj in list(session.new) + list(session.dirty):
        tabela = getattr(obj, "__table__", None)
        if tabela is None:
            continue
        for col in tabela.columns:
            if not isinstance(col.type, String) or not col.type.length:
                continue
            v = getattr(obj, col.key, None)
            if isinstance(v, str) and len(v) > col.type.length:
                raise ErroCampo(
                    col.key,
                    f"{nome_campo(col.key)}: aceita no máximo {col.type.length} "
                    f"caracteres (foram {len(v)}). Encurte e tente de novo.")


# ---------------------------------------- exclusão de item em uso
def bloquear_se_em_uso(db, oque: str, nome: str, refs: list):
    """refs = [(Model, coluna, valor, "lançamento|lançamentos"), ...]. Levanta 409 se houver uso."""
    from sqlalchemy import func, select
    usos = []
    for model, col, valor, rotulo in refs:
        n = db.scalar(select(func.count()).select_from(model).where(getattr(model, col) == valor)) or 0
        if n:
            um, varios = rotulo.split("|")
            usos.append(f"{n} {varios if n > 1 else um}")
    if usos:
        raise ErroCampo(None, f"Não é possível excluir {oque} “{nome}”: está em uso em "
                              f"{' e '.join(usos)}. Troque {oque} desses itens ou exclua-os primeiro.",
                        status=409)


# ---------------------------------------- 2) validação da requisição
def _traduz_pydantic(e: dict) -> tuple[str, str]:
    loc = [str(x) for x in e.get("loc", []) if x not in ("body", "query", "path")]
    campo = loc[-1] if loc else ""
    # item de lista: "itens → 2 → valor"
    rot = nome_campo(campo) if campo and not campo.isdigit() else "Campo"
    if len(loc) > 1:
        rot = " › ".join(nome_campo(x) if not x.isdigit() else f"item {int(x)+1}" for x in loc)
    t, ctx = e.get("type", ""), e.get("ctx") or {}
    entrada = e.get("input")
    tam = len(entrada) if isinstance(entrada, str) else None

    if t == "missing":
        return campo, f"{rot}: preenchimento obrigatório."
    if t == "string_too_long":
        return campo, f"{rot}: aceita no máximo {ctx.get('max_length')} caracteres" + (f" (foram {tam})." if tam else ".")
    if t == "string_too_short":
        return campo, f"{rot}: precisa ter pelo menos {ctx.get('min_length')} caracteres."
    if t in ("int_parsing", "int_type", "int_from_float"):
        return campo, f"{rot}: precisa ser um número inteiro" + (f" (recebido: “{entrada}”)." if entrada not in (None, "") else ".")
    if t in ("float_parsing", "float_type", "decimal_parsing", "decimal_type"):
        return campo, f"{rot}: precisa ser um valor numérico, ex.: 1250,90" + (f" (recebido: “{entrada}”)." if entrada not in (None, "") else ".")
    if t.startswith("date") or t.startswith("datetime"):
        return campo, f"{rot}: data inválida" + (f" (“{entrada}”)" if entrada else "") + ". Use o formato dd/mm/aaaa."
    if t in ("greater_than", "greater_than_equal"):
        lim = ctx.get("gt", ctx.get("ge"))
        return campo, f"{rot}: precisa ser maior que {lim}." if t == "greater_than" else f"{rot}: precisa ser no mínimo {lim}."
    if t in ("less_than", "less_than_equal"):
        lim = ctx.get("lt", ctx.get("le"))
        return campo, f"{rot}: precisa ser menor que {lim}." if t == "less_than" else f"{rot}: pode ser no máximo {lim}."
    if t in ("literal_error", "enum"):
        return campo, f"{rot}: valor inválido. Opções aceitas: {ctx.get('expected', '')}."
    if t in ("bool_parsing", "bool_type"):
        return campo, f"{rot}: precisa ser sim ou não."
    if t in ("string_type",):
        return campo, f"{rot}: precisa ser texto."
    if t == "value_error":
        msg = str(e.get("msg", "")).removeprefix("Value error, ")
        return campo, f"{rot}: {msg}"
    if "email" in t or "email" in str(e.get("msg", "")).lower():
        return campo, f"{rot}: e-mail inválido."
    return campo, f"{rot}: {e.get('msg', 'valor inválido')}."


async def erro_validacao(request: Request, exc: RequestValidationError):
    itens = [_traduz_pydantic(e) for e in exc.errors()]
    return JSONResponse(status_code=422, content={
        "detail": " · ".join(m for _, m in itens),
        "campo": itens[0][0] if itens else None,
        "erros": [{"campo": c, "mensagem": m} for c, m in itens],
    })


async def erro_campo(request: Request, exc: ErroCampo):
    return JSONResponse(status_code=exc.status, content={"detail": exc.mensagem, "campo": exc.campo})


# ---------------------------------------- 3) erros do banco
def _diag(exc):
    """Extrai código e detalhes do erro (PostgreSQL via psycopg2; SQLite por texto)."""
    o = getattr(exc, "orig", None)
    d = getattr(o, "diag", None)
    return {
        "codigo": getattr(o, "pgcode", None) or "",
        "coluna": getattr(d, "column_name", None) or "",
        "tabela": getattr(d, "table_name", None) or "",
        "detalhe": getattr(d, "message_detail", None) or "",
        "texto": str(o or exc).split("\n")[0],
    }


async def erro_integridade(request: Request, exc: IntegrityError):
    d = _diag(exc)
    log.warning("IntegrityError %s em %s: %s | %s", d["codigo"], request.url.path, d["texto"], d["detalhe"])
    campo, msg, st = d["coluna"], None, 409
    excluindo = request.method == "DELETE"

    # obrigatório (PG 23502 / SQLite "NOT NULL constraint failed: t.c")
    m = re.search(r"NOT NULL constraint failed: \w+\.(\w+)", d["texto"])
    if d["codigo"] == "23502" or m:
        campo = campo or (m.group(1) if m else "")
        msg, st = f"{nome_campo(campo)}: preenchimento obrigatório.", 422

    # duplicado (PG 23505 "Key (email)=(x) already exists." / SQLite "UNIQUE ... t.c")
    elif d["codigo"] == "23505" or "UNIQUE constraint" in d["texto"]:
        k = re.search(r"Key \((.+?)\)=\((.*?)\)", d["detalhe"])
        m = re.search(r"UNIQUE constraint failed: \w+\.(\w+)", d["texto"])
        campo = k.group(1) if k else (m.group(1) if m else campo)
        valor = f" “{k.group(2)}”" if k else ""
        msg = f"{nome_campo(campo)}: já existe um cadastro com este valor{valor}."

    # chave estrangeira (PG 23503 / SQLite "FOREIGN KEY constraint failed")
    elif d["codigo"] == "23503" or "FOREIGN KEY" in d["texto"]:
        ref = re.search(r'referenced from table "(\w+)"', d["detalhe"])
        k = re.search(r"Key \((\w+)\)=\((.*?)\)", d["detalhe"])
        if excluindo or ref:
            onde = nome_tabela(ref.group(1)) if ref else "outros cadastros"
            msg = (f"Não é possível excluir: este registro está em uso em {onde}. "
                   f"Altere ou exclua esses itens primeiro.")
        else:
            campo = k.group(1) if k else campo
            msg = f"{nome_campo(campo)}: o item escolhido não existe mais (pode ter sido excluído). Recarregue e escolha de novo."

    elif d["codigo"] == "23514":
        msg, st = f"Valor fora das regras permitidas ({d['texto'][:120]}).", 422

    return JSONResponse(status_code=st, content={
        "detail": msg or f"Não foi possível salvar: {d['texto'][:160]}", "campo": campo or None})


async def erro_dado(request: Request, exc: DataError):
    d = _diag(exc)
    log.warning("DataError %s em %s: %s", d["codigo"], request.url.path, d["texto"])
    t, campo = d["texto"], d["coluna"] or None
    m = re.search(r"character varying\((\d+)\)", t)
    if m:
        msg = f"Um campo de texto aceita no máximo {m.group(1)} caracteres e o valor enviado é maior."
    elif d["codigo"] == "22003" or "out of range" in t:
        msg = "Valor numérico grande demais para o campo."
    elif d["codigo"] in ("22007", "22008") or "date" in t.lower():
        msg = f"Data inválida ou fora do intervalo permitido ({t[:100]})."
    elif d["codigo"] == "22P02":
        msg = f"Formato inválido: {t[:140]}"
    else:
        msg = f"Dado inválido: {t[:160]}"
    return JSONResponse(status_code=422, content={"detail": msg, "campo": campo})


async def erro_interno(request: Request, exc: Exception):
    codigo = secrets.token_hex(3).upper()
    log.error("ERRO %s em %s %s\n%s", codigo, request.method, request.url.path, traceback.format_exc())
    texto = str(exc).split("\n")[0][:160]
    return JSONResponse(status_code=500, content={
        "detail": f"Erro interno ao processar {request.method} {request.url.path}: "
                  f"{type(exc).__name__}{(' — ' + texto) if texto else ''}. "
                  f"Código {codigo} (procure no log do Coolify).",
        "codigo": codigo})


def registrar(app):
    app.add_exception_handler(RequestValidationError, erro_validacao)
    app.add_exception_handler(ErroCampo, erro_campo)
    app.add_exception_handler(IntegrityError, erro_integridade)
    app.add_exception_handler(DataError, erro_dado)
    app.add_exception_handler(Exception, erro_interno)
