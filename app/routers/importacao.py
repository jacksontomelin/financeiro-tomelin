"""Importação de extrato bancário (OFX/CSV) em duas etapas: prévia e confirmação."""
import base64, binascii
from collections import Counter
from datetime import timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, extrato
from ..models import TipoMov
from ..security import usuario_atual
from ..erros import ErroCampo

router = APIRouter(prefix="/api/importacao", tags=["importacao"], dependencies=[Depends(usuario_atual)])

MAX_BYTES = 2 * 1024 * 1024
MAX_LINHAS = 2000
JANELA_PENDENTE = 7   # dias para casar uma linha do extrato com uma conta pendente


class PreviaIn(BaseModel):
    conta_id: Optional[int] = None
    nome: str = ""
    conteudo: str = ""        # base64 do arquivo
    inverter: bool = False    # fatura de cartão: compras vêm positivas


class ItemIn(BaseModel):
    import_id: str
    data: str
    descricao: str
    valor: float              # sempre positivo
    tipo: str                 # receita | despesa
    acao: str                 # criar | baixar
    pendente_id: Optional[int] = None
    categoria_id: Optional[int] = None


class ConfirmarIn(BaseModel):
    conta_id: Optional[int] = None
    itens: list[ItemIn] = []


def _conta(db, cid):
    if not cid:
        raise ErroCampo("conta_id", "Conta: escolha em qual conta o extrato entra.")
    c = db.get(models.Conta, cid)
    if not c:
        raise ErroCampo("conta_id", "Conta: não existe mais.")
    return c


def _sugestor(db):
    """Aprende com os lançamentos já categorizados: palavras da descrição -> categoria mais usada."""
    mapa, mapa1 = {}, {}
    q = (db.query(models.Lancamento.descricao, models.Lancamento.tipo, models.Lancamento.categoria_id)
         .filter(models.Lancamento.categoria_id.isnot(None)).order_by(models.Lancamento.id.desc()).limit(4000))
    for desc, tipo, cat in q:
        k = extrato.chave_descricao(desc or "")
        if not k:
            continue
        mapa.setdefault((tipo.value, k), Counter())[cat] += 1
        mapa1.setdefault((tipo.value, k.split()[0]), Counter())[cat] += 1

    def sugerir(desc, tipo):
        k = extrato.chave_descricao(desc)
        if not k:
            return None
        c = mapa.get((tipo, k)) or mapa1.get((tipo, k.split()[0]))
        return c.most_common(1)[0][0] if c else None
    return sugerir


@router.post("/previa")
def previa(dados: PreviaIn, db: Session = Depends(get_db)):
    conta = _conta(db, dados.conta_id)
    try:
        bruto = base64.b64decode((dados.conteudo or "").split(",", 1)[-1], validate=True)
    except (binascii.Error, ValueError):
        raise ErroCampo("arquivo", "Arquivo: chegou corrompido. Tente de novo.")
    if not bruto:
        raise ErroCampo("arquivo", "Arquivo: escolha o extrato (OFX ou CSV).")
    if len(bruto) > MAX_BYTES:
        raise ErroCampo("arquivo", "Arquivo: grande demais (limite de 2 MB). Exporte um período menor.")
    try:
        formato, linhas = extrato.ler(dados.nome or "", bruto)
    except extrato.ErroExtrato as e:
        raise ErroCampo("arquivo", f"Arquivo: {e}. Exporte no app do banco em OFX (recomendado) ou CSV.")
    if len(linhas) > MAX_LINHAS:
        raise ErroCampo("arquivo", f"Arquivo: {len(linhas)} movimentações; o limite é {MAX_LINHAS}. Exporte um período menor.")

    sugerir = _sugestor(db)
    datas = [l["data"] for l in linhas]
    ini, fim = min(datas), max(datas)
    ja = {i for (i,) in db.query(models.Lancamento.import_id).filter(models.Lancamento.import_id.isnot(None)).all()}
    pendentes = (db.query(models.Lancamento).filter(
        models.Lancamento.data_pagamento.is_(None),
        (models.Lancamento.conta_id == conta.id) | (models.Lancamento.conta_id.is_(None))).all())
    pagos = (db.query(models.Lancamento).filter(
        models.Lancamento.conta_id == conta.id, models.Lancamento.import_id.is_(None),
        models.Lancamento.data_pagamento >= ini - timedelta(days=1),
        models.Lancamento.data_pagamento <= fim + timedelta(days=1)).all())
    usados_pend, usados_pago = set(), set()
    ordem = Counter()
    itens = []
    for n, l in enumerate(sorted(linhas, key=lambda x: x["data"])):
        v = -l["valor"] if dados.inverter else l["valor"]
        tipo = "receita" if v > 0 else "despesa"
        valor = abs(v).quantize(Decimal("0.01"))
        chave = (l["data"], valor, l["descricao"])
        ordem[chave] += 1
        iid = extrato.id_importacao(conta.id, formato, {**l, "valor": valor}, ordem[chave])
        item = {"idx": n, "import_id": iid, "data": l["data"].isoformat(), "descricao": l["descricao"],
                "valor": float(valor), "tipo": tipo, "status": "novo", "pendente": None,
                "categoria_id": sugerir(l["descricao"], tipo)}
        if iid in ja:
            item["status"] = "importado"
        else:
            # já lançado à mão e pago neste dia, mesmo valor?
            dup = next((p for p in pagos if p.id not in usados_pago and p.tipo.value == tipo
                        and Decimal(p.valor_total).quantize(Decimal("0.01")) == valor
                        and abs((p.data_pagamento - l["data"]).days) <= 1), None)
            if dup:
                usados_pago.add(dup.id)
                item["status"] = "duplicado"
                item["duplicado_de"] = {"id": dup.id, "descricao": dup.descricao}
            else:
                # conta pendente que este pagamento quita?
                cands = [p for p in pendentes if p.id not in usados_pend and p.tipo.value == tipo
                         and Decimal(p.valor_total).quantize(Decimal("0.01")) == valor
                         and abs(((p.data_vencimento or p.data_competencia) - l["data"]).days) <= JANELA_PENDENTE]
                if cands:
                    p = min(cands, key=lambda p: abs(((p.data_vencimento or p.data_competencia) - l["data"]).days))
                    usados_pend.add(p.id)
                    item["pendente"] = {"id": p.id, "descricao": p.descricao,
                                        "vencimento": (p.data_vencimento or p.data_competencia).isoformat()}
                    item["categoria_id"] = p.categoria_id or item["categoria_id"]
        itens.append(item)
    return {
        "formato": formato, "conta": {"id": conta.id, "nome": conta.nome},
        "de": ini.isoformat(), "ate": fim.isoformat(), "inverter": dados.inverter,
        "entradas": float(sum(Decimal(str(i["valor"])) for i in itens if i["tipo"] == "receita")),
        "saidas": float(sum(Decimal(str(i["valor"])) for i in itens if i["tipo"] == "despesa")),
        "itens": itens,
    }


@router.post("/confirmar")
def confirmar(dados: ConfirmarIn, db: Session = Depends(get_db)):
    from datetime import date as _date
    conta = _conta(db, dados.conta_id)
    if not dados.itens:
        raise ErroCampo("itens", "Nada marcado para importar.")
    ja = {i for (i,) in db.query(models.Lancamento.import_id).filter(models.Lancamento.import_id.isnot(None)).all()}
    cats = {c.id: c for c in db.query(models.Categoria).all()}
    criados = baixados = pulados = 0
    for it in dados.itens:
        if it.import_id in ja:          # já entrou (arquivo importado de novo, duplo clique)
            pulados += 1; continue
        try:
            d = _date.fromisoformat(it.data[:10])
        except ValueError:
            raise ErroCampo("itens", f"Data inválida na linha \"{it.descricao}\".")
        if it.tipo not in ("receita", "despesa") or not (it.valor > 0):
            raise ErroCampo("itens", f"Linha \"{it.descricao}\": tipo ou valor inválido.")
        cat = it.categoria_id if it.categoria_id in cats and cats[it.categoria_id].tipo.value == it.tipo else None
        if it.acao == "baixar" and it.pendente_id:
            p = db.get(models.Lancamento, it.pendente_id)
            if not p or p.data_pagamento or p.tipo.value != it.tipo:
                raise ErroCampo("itens", f"\"{it.descricao}\": a conta pendente escolhida já foi paga ou não existe mais. Gere a prévia de novo.")
            p.data_pagamento = d
            p.conta_id = conta.id
            p.import_id = it.import_id
            if cat and not p.categoria_id:
                p.categoria_id = cat
            baixados += 1
        else:
            db.add(models.Lancamento(
                descricao=it.descricao.strip()[:200] or "Sem descrição", tipo=TipoMov(it.tipo),
                valor=Decimal(str(it.valor)).quantize(Decimal("0.01")),
                data_competencia=d, data_vencimento=d, data_pagamento=d,
                conta_id=conta.id, categoria_id=cat, import_id=it.import_id,
                obs="Importado do extrato bancário"))
            criados += 1
        ja.add(it.import_id)
    db.commit()
    return {"criados": criados, "baixados": baixados, "pulados": pulados}
