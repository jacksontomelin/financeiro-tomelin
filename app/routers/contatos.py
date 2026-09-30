from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..security import usuario_atual
import logging
log = logging.getLogger("tomelin.contatos")
from ..doc_utils import valida_documento, limpar as _limpar_doc, formatar as _fmt_doc

router = APIRouter(prefix="/api/contatos", tags=["contatos"],
                   dependencies=[Depends(usuario_atual)])


@router.get("", response_model=list[schemas.ContatoOut])
def listar(tipo: str | None = None, busca: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Contato)
    if tipo:
        q = q.filter(models.Contato.tipo == tipo)
    if busca:
        q = q.filter(models.Contato.nome.ilike(f"%{busca}%"))
    return q.order_by(models.Contato.nome).all()


def _checa_doc(doc: str | None):
    """Valida CPF/CNPJ e devolve normalizado (só dígitos)."""
    if not doc:
        return None
    ok, tipo = valida_documento(doc)
    if not ok:
        rotulo = {"cpf": "CPF", "cnpj": "CNPJ"}.get(tipo, "Documento")
        raise HTTPException(422, f"{rotulo} inválido — confira os dígitos.")
    return _limpar_doc(doc)


@router.post("", response_model=schemas.ContatoOut)
def criar(dados: schemas.ContatoIn, db: Session = Depends(get_db)):
    payload = dados.model_dump()
    payload["documento"] = _checa_doc(payload.get("documento"))
    c = models.Contato(**payload)
    db.add(c); db.commit(); db.refresh(c)
    return c


@router.get("/{cid}", response_model=schemas.ContatoOut)
def obter(cid: int, db: Session = Depends(get_db)):
    o = db.get(models.Contato, cid)
    if not o:
        raise HTTPException(404, "Contato não encontrado.")
    return o

@router.put("/{cid}", response_model=schemas.ContatoOut)
def editar(cid: int, dados: schemas.ContatoIn, db: Session = Depends(get_db)):
    c = db.get(models.Contato, cid)
    if not c:
        raise HTTPException(404, "Contato não encontrado.")
    payload = dados.model_dump()
    payload["documento"] = _checa_doc(payload.get("documento"))
    for k, v in payload.items():
        setattr(c, k, v)
    db.commit(); db.refresh(c)
    return c


@router.delete("/{cid}")
def excluir(cid: int, db: Session = Depends(get_db)):
    c = db.get(models.Contato, cid)
    if not c:
        raise HTTPException(404, "Contato não encontrado.")
    db.delete(c); db.commit()
    return {"ok": True}


@router.get("/buscar-cep/{cep}")
def buscar_cep(cep: str):
    """
    Consulta CEP com fallback entre provedores gratuitos.
    Tenta BrasilAPI → ViaCEP → OpenCEP; o primeiro que responder vence.
    """
    import re, httpx
    c = re.sub(r"\D", "", cep or "")
    if len(c) != 8:
        raise HTTPException(400, "CEP deve ter 8 dígitos.")

    def _brasilapi():
        r = httpx.get(f"https://brasilapi.com.br/api/cep/v2/{c}", timeout=6)
        if r.status_code == 404:
            return "NAO_ENCONTRADO"
        r.raise_for_status()
        d = r.json()
        return {"cep": c, "logradouro": d.get("street") or "", "bairro": d.get("neighborhood") or "",
                "cidade": d.get("city") or "", "estado": d.get("state") or ""}

    def _viacep():
        r = httpx.get(f"https://viacep.com.br/ws/{c}/json/", timeout=6)
        r.raise_for_status()
        d = r.json()
        if d.get("erro"):
            return "NAO_ENCONTRADO"
        return {"cep": c, "logradouro": d.get("logradouro") or "", "bairro": d.get("bairro") or "",
                "cidade": d.get("localidade") or "", "estado": d.get("uf") or ""}

    def _opencep():
        r = httpx.get(f"https://opencep.com/v1/{c}", timeout=6)
        if r.status_code == 404:
            return "NAO_ENCONTRADO"
        r.raise_for_status()
        d = r.json()
        return {"cep": c, "logradouro": d.get("logradouro") or "", "bairro": d.get("bairro") or "",
                "cidade": d.get("localidade") or "", "estado": d.get("uf") or ""}

    erros = []
    for nome, fn in (("BrasilAPI", _brasilapi), ("ViaCEP", _viacep), ("OpenCEP", _opencep)):
        try:
            res = fn()
            if res == "NAO_ENCONTRADO":
                raise HTTPException(404, "CEP não encontrado.")
            if res and res.get("cidade"):
                return res
            erros.append(f"{nome}: resposta vazia")
        except HTTPException:
            raise
        except Exception as e:
            erros.append(f"{nome}: {type(e).__name__}")
            continue

    log.warning("Busca de CEP %s falhou em todos os provedores: %s", c, "; ".join(erros))
    raise HTTPException(503, "Serviços de CEP indisponíveis no momento. Preencha o endereço manualmente.")


@router.get("/buscar-cnpj/{cnpj}")
def buscar_cnpj(cnpj: str):
    """
    Consulta CNPJ com fallback entre provedores gratuitos.
    Tenta BrasilAPI → ReceitaWS; o primeiro que responder vence.
    """
    import re, httpx
    c = re.sub(r"\D", "", cnpj or "")
    if len(c) != 14:
        raise HTTPException(400, "CNPJ deve ter 14 dígitos.")

    ok, _ = valida_documento(c)
    if not ok:
        raise HTTPException(422, "CNPJ inválido — confira os dígitos.")

    def _brasilapi():
        r = httpx.get(f"https://brasilapi.com.br/api/cnpj/v1/{c}", timeout=8)
        if r.status_code == 404:
            return "NAO_ENCONTRADO"
        r.raise_for_status()
        d = r.json()
        return {
            "nome": d.get("nome_fantasia") or d.get("razao_social") or "",
            "razao_social": d.get("razao_social") or "",
            "documento": c,
            "telefone": d.get("ddd_telefone_1") or "",
            "email": d.get("email") or "",
            "logradouro": d.get("logradouro") or "",
            "numero": d.get("numero") or "",
            "complemento": d.get("complemento") or "",
            "bairro": d.get("bairro") or "",
            "cidade": d.get("municipio") or "",
            "estado": d.get("uf") or "",
            "cep": re.sub(r"\D", "", d.get("cep") or ""),
            "situacao": d.get("descricao_situacao_cadastral") or "",
            "fonte": "BrasilAPI",
        }

    def _receitaws():
        r = httpx.get(f"https://receitaws.com.br/v1/cnpj/{c}", timeout=10)
        r.raise_for_status()
        d = r.json()
        if d.get("status") == "ERROR":
            return "NAO_ENCONTRADO"
        return {
            "nome": d.get("fantasia") or d.get("nome") or "",
            "razao_social": d.get("nome") or "",
            "documento": c,
            "telefone": d.get("telefone") or "",
            "email": d.get("email") or "",
            "logradouro": d.get("logradouro") or "",
            "numero": d.get("numero") or "",
            "complemento": d.get("complemento") or "",
            "bairro": d.get("bairro") or "",
            "cidade": d.get("municipio") or "",
            "estado": d.get("uf") or "",
            "cep": re.sub(r"\D", "", d.get("cep") or ""),
            "situacao": d.get("situacao") or "",
            "fonte": "ReceitaWS",
        }

    erros = []
    for nome, fn in (("BrasilAPI", _brasilapi), ("ReceitaWS", _receitaws)):
        try:
            res = fn()
            if res == "NAO_ENCONTRADO":
                raise HTTPException(404, "CNPJ não encontrado na Receita Federal.")
            if res and (res.get("nome") or res.get("razao_social")):
                return res
            erros.append(f"{nome}: resposta vazia")
        except HTTPException:
            raise
        except Exception as e:
            erros.append(f"{nome}: {type(e).__name__}")
            continue

    log.warning("Busca de CNPJ %s falhou em todos os provedores: %s", c, "; ".join(erros))
    raise HTTPException(503, "Serviços de consulta de CNPJ indisponíveis. Preencha os dados manualmente.")


@router.get("/{cid}/resumo")
def resumo_contato(cid: int, db: Session = Depends(get_db)):
    """Totais movimentados com este contato + últimos lançamentos."""
    from sqlalchemy import func
    from ..models import Lancamento, TipoMov

    c = db.get(models.Contato, cid)
    if not c:
        raise HTTPException(404, "Contato não encontrado.")

    def _total(tipo, pagos: bool):
        q = db.query(func.coalesce(func.sum(Lancamento.valor), 0)) \
              .filter(Lancamento.contato_id == cid, Lancamento.tipo == tipo)
        q = q.filter(Lancamento.data_pagamento.isnot(None)) if pagos \
            else q.filter(Lancamento.data_pagamento.is_(None))
        return float(q.scalar() or 0)

    ultimos = db.query(Lancamento) \
                .filter(Lancamento.contato_id == cid) \
                .order_by(Lancamento.id.desc()).limit(10).all()

    return {
        "contato": {"id": c.id, "nome": c.nome, "tipo": c.tipo},
        "recebido":   _total(TipoMov.receita, True),
        "a_receber":  _total(TipoMov.receita, False),
        "pago":       _total(TipoMov.despesa, True),
        "a_pagar":    _total(TipoMov.despesa, False),
        "qtd":        db.query(func.count(Lancamento.id)).filter(Lancamento.contato_id == cid).scalar() or 0,
        "ultimos": [{
            "id": l.id, "descricao": l.descricao, "valor": float(l.valor),
            "tipo": l.tipo.value, "status": l.status,
            "vencimento": l.data_vencimento.isoformat() if l.data_vencimento else None,
        } for l in ultimos],
    }
