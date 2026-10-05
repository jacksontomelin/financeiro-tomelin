"""Despesas dedutíveis no Imposto de Renda, por ano (regime de caixa: conta o
que foi pago no ano), agrupadas por tipo de dedução e por quem recebeu.

As regras e limites do IR mudam todo ano: o relatório organiza os valores
e aponta o que falta (CPF/CNPJ, comprovante); quem decide o que declarar é
a família, de preferência com o contador.
"""
from datetime import date
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models
from .doc_utils import formatar, valida_documento

TIPOS = {
    "saude": "Saúde",
    "educacao": "Educação",
    "previdencia": "Previdência privada",
    "pensao": "Pensão alimentícia",
}
DICAS = {
    "saude": "Médicos, dentistas, psicólogos, fisioterapeutas, hospitais, exames e plano de saúde. "
             "Remédio de farmácia não entra. Precisa do CPF ou CNPJ de quem recebeu.",
    "educacao": "Escola, faculdade e cursos técnicos. Tem limite anual por pessoa: confira o valor do ano na Receita.",
    "previdencia": "Só PGBL e previdência oficial complementar, com limite sobre a renda tributável.",
    "pensao": "Só pensão paga por decisão judicial ou escritura pública.",
}

# palavras que indicam o tipo, usadas para sugerir na primeira vez
_PALAVRAS = {
    "saude": ("saúde", "saude", "médic", "medic", "dentist", "odonto", "hospital", "psicól", "psicol",
              "fisioter", "exame", "plano de sa"),
    "educacao": ("escola", "educa", "faculdade", "colégio", "colegio", "universidade", "creche"),
    "previdencia": ("previdência privada", "previdencia privada", "pgbl"),
    "pensao": ("pensão", "pensao"),
}


def sugerir_tipo(nome: str) -> str | None:
    n = (nome or "").lower()
    for tipo, palavras in _PALAVRAS.items():
        if any(p in n for p in palavras):
            return tipo
    return None


def marcar_padrao(db: Session) -> int:
    """Na primeira vez, marca as categorias de despesa com nome óbvio (Saúde, Escola)."""
    from . import cfg
    if cfg.get(db, "_ir_padrao_feito", ""):
        return 0
    n = 0
    for c in db.query(models.Categoria).filter(models.Categoria.tipo == models.TipoMov.despesa,
                                               models.Categoria.ir_tipo.is_(None)).all():
        t = sugerir_tipo(c.nome)
        if t:
            c.ir_tipo = t; n += 1
    db.commit()
    cfg.set_interno(db, "_ir_padrao_feito", "1")
    return n


def relatorio(db: Session, ano: int) -> dict:
    ini, fim = date(ano, 1, 1), date(ano, 12, 31)
    cats = {c.id: c for c in db.query(models.Categoria).filter(models.Categoria.ir_tipo.isnot(None)).all()}
    lancs = []
    if cats:
        lancs = (db.query(models.Lancamento)
                 .filter(models.Lancamento.tipo == models.TipoMov.despesa,
                         models.Lancamento.categoria_id.in_(list(cats)),
                         models.Lancamento.data_pagamento >= ini, models.Lancamento.data_pagamento <= fim)
                 .order_by(models.Lancamento.data_pagamento).all())
    anexos = {}
    if lancs:
        anexos = dict(db.query(models.Anexo.lancamento_id, func.count())
                      .filter(models.Anexo.lancamento_id.in_([l.id for l in lancs]))
                      .group_by(models.Anexo.lancamento_id).all())
    grupos = {}
    for l in lancs:
        tipo = cats[l.categoria_id].ir_tipo
        g = grupos.setdefault(tipo, {"tipo": tipo, "nome": TIPOS.get(tipo, tipo), "dica": DICAS.get(tipo, ""),
                                     "total": Decimal(0), "prestadores": {}})
        ct = l.contato
        chave = ct.id if ct else 0
        doc = (ct.documento or "") if ct else ""
        valido, _ = valida_documento(doc)
        p = g["prestadores"].setdefault(chave, {
            "contato_id": ct.id if ct else None, "nome": ct.nome if ct else "Sem prestador informado",
            "documento": formatar(doc) if doc else "", "documento_ok": bool(doc) and valido,
            "total": Decimal(0), "lancamentos": []})
        valor = Decimal(l.valor or 0) + Decimal(l.juros or 0) + Decimal(l.multa or 0)
        p["total"] += valor; g["total"] += valor
        p["lancamentos"].append({"id": l.id, "data": l.data_pagamento.isoformat(), "descricao": l.descricao,
                                 "categoria": cats[l.categoria_id].nome, "valor": float(valor),
                                 "comprovantes": int(anexos.get(l.id, 0))})
    saida, total = [], Decimal(0)
    for tipo in TIPOS:
        if tipo not in grupos:
            continue
        g = grupos[tipo]
        prest = sorted(g["prestadores"].values(), key=lambda p: -p["total"])
        for p in prest:
            p["total"] = float(p["total"])
        total += g["total"]
        saida.append({**g, "total": float(g["total"]), "prestadores": prest})
    todos = [l for g in saida for p in g["prestadores"] for l in p["lancamentos"]]
    sem_doc = [p["nome"] for g in saida for p in g["prestadores"] if not p["documento_ok"]]
    return {
        "ano": ano, "total": float(total), "grupos": saida,
        "qtd": len(todos),
        "sem_comprovante": sum(1 for l in todos if not l["comprovantes"]),
        "sem_documento": sorted(set(sem_doc)),
        "categorias_marcadas": [{"id": c.id, "nome": c.nome, "ir_tipo": c.ir_tipo} for c in cats.values()],
    }
