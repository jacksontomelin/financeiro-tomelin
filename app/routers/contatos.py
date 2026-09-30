from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..security import usuario_atual
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
    """Consulta CEP na API ViaCEP (gratuita, sem autenticação)."""
    import re, httpx
    cep_limpo = re.sub(r"\D", "", cep)
    if len(cep_limpo) != 8:
        raise HTTPException(400, "CEP inválido")
    try:
        r = httpx.get(f"https://viacep.com.br/ws/{cep_limpo}/json/", timeout=5)
        d = r.json()
        if d.get("erro"):
            raise HTTPException(404, "CEP não encontrado")
        return {
            "cep": d.get("cep", ""),
            "logradouro": d.get("logradouro", ""),
            "bairro": d.get("bairro", ""),
            "cidade": d.get("localidade", ""),
            "estado": d.get("uf", ""),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Erro ao consultar CEP: {e}")


@router.get("/buscar-cnpj/{cnpj}")
def buscar_cnpj(cnpj: str):
    """Consulta CNPJ na API BrasilAPI (gratuita, sem autenticação)."""
    import re, httpx
    cnpj_limpo = re.sub(r"\D", "", cnpj)
    if len(cnpj_limpo) != 14:
        raise HTTPException(400, "CNPJ inválido")
    try:
        r = httpx.get(f"https://brasilapi.com.br/api/cnpj/v1/{cnpj_limpo}", timeout=8)
        if r.status_code == 404:
            raise HTTPException(404, "CNPJ não encontrado")
        d = r.json()
        nome = d.get("razao_social") or d.get("nome_fantasia") or ""
        fantasia = d.get("nome_fantasia") or ""
        end = d.get("logradouro", "")
        num = d.get("numero", "")
        comp = d.get("complemento", "")
        bairro = d.get("bairro", "")
        cidade = d.get("municipio", "")
        estado = d.get("uf", "")
        cep_r = re.sub(r"\D", "", d.get("cep", ""))
        tel = d.get("ddd_telefone_1", "")
        email = d.get("email", "")
        return {
            "nome": fantasia or nome,
            "razao_social": nome,
            "documento": cnpj_limpo,
            "telefone": tel,
            "email": email,
            "logradouro": end,
            "numero": num,
            "complemento": comp,
            "bairro": bairro,
            "cidade": cidade,
            "estado": estado,
            "cep": cep_r,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Erro ao consultar CNPJ: {e}")


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
