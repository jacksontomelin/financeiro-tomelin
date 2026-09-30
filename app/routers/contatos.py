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


# ── Cache local: quanto tempo um dado consultado continua válido ──
CACHE_DIAS_CNPJ = 90    # dado cadastral muda pouco
CACHE_DIAS_CEP  = 365   # endereço de CEP praticamente não muda


def _cache_valido(reg, dias: int) -> bool:
    from datetime import datetime, timedelta
    if not reg or not reg.consultado_em:
        return False
    return (datetime.utcnow() - reg.consultado_em) < timedelta(days=dias)


@router.get("/buscar-cep/{cep}")
def buscar_cep(cep: str, forcar: bool = False, db: Session = Depends(get_db)):
    """
    Consulta CEP. Usa o cache local primeiro; só vai à rede se não tiver
    ou se forcar=true. Provedores: BrasilAPI → ViaCEP → OpenCEP.
    """
    import re, httpx
    from datetime import datetime
    c = re.sub(r"\D", "", cep or "")
    if len(c) != 8:
        raise HTTPException(400, "CEP deve ter 8 dígitos.")

    # 1) cache local
    reg = db.get(models.CepCache, c)
    if reg and not forcar and _cache_valido(reg, CACHE_DIAS_CEP):
        return {"cep": c, "logradouro": reg.logradouro or "", "bairro": reg.bairro or "",
                "cidade": reg.cidade or "", "estado": reg.estado or "",
                "fonte": (reg.fonte or "") + " (cache)", "do_cache": True}

    # 2) provedores externos
    def _brasilapi():
        r = httpx.get(f"https://brasilapi.com.br/api/cep/v2/{c}", timeout=6)
        if r.status_code == 404: return "NAO_ENCONTRADO"
        r.raise_for_status(); d = r.json()
        return {"logradouro": d.get("street") or "", "bairro": d.get("neighborhood") or "",
                "cidade": d.get("city") or "", "estado": d.get("state") or "", "fonte": "BrasilAPI"}

    def _viacep():
        r = httpx.get(f"https://viacep.com.br/ws/{c}/json/", timeout=6)
        r.raise_for_status(); d = r.json()
        if d.get("erro"): return "NAO_ENCONTRADO"
        return {"logradouro": d.get("logradouro") or "", "bairro": d.get("bairro") or "",
                "cidade": d.get("localidade") or "", "estado": d.get("uf") or "", "fonte": "ViaCEP"}

    def _opencep():
        r = httpx.get(f"https://opencep.com/v1/{c}", timeout=6)
        if r.status_code == 404: return "NAO_ENCONTRADO"
        r.raise_for_status(); d = r.json()
        return {"logradouro": d.get("logradouro") or "", "bairro": d.get("bairro") or "",
                "cidade": d.get("localidade") or "", "estado": d.get("uf") or "", "fonte": "OpenCEP"}

    erros = []
    for nome, fn in (("BrasilAPI", _brasilapi), ("ViaCEP", _viacep), ("OpenCEP", _opencep)):
        try:
            res = fn()
            if res == "NAO_ENCONTRADO":
                raise HTTPException(404, "CEP não encontrado.")
            if res and res.get("cidade"):
                # 3) grava no cache
                if reg:
                    for k, v in res.items():
                        setattr(reg, k, v)
                    reg.consultado_em = datetime.utcnow()
                else:
                    db.add(models.CepCache(cep=c, consultado_em=datetime.utcnow(), **res))
                db.commit()
                return {"cep": c, **res, "do_cache": False}
            erros.append(f"{nome}: vazio")
        except HTTPException:
            raise
        except Exception as e:
            erros.append(f"{nome}: {type(e).__name__}")

    # 4) rede falhou — se tem cache vencido, usa mesmo assim
    if reg:
        log.warning("CEP %s: rede falhou (%s), usando cache vencido", c, "; ".join(erros))
        return {"cep": c, "logradouro": reg.logradouro or "", "bairro": reg.bairro or "",
                "cidade": reg.cidade or "", "estado": reg.estado or "",
                "fonte": (reg.fonte or "") + " (cache antigo)", "do_cache": True}

    log.warning("CEP %s falhou em todos os provedores: %s", c, "; ".join(erros))
    raise HTTPException(503, "Serviços de CEP indisponíveis. Preencha o endereço manualmente.")


@router.get("/buscar-cnpj/{cnpj}")
def buscar_cnpj(cnpj: str, forcar: bool = False, db: Session = Depends(get_db)):
    """
    Consulta CNPJ. Usa o cache local primeiro; só vai à rede se não tiver
    ou se forcar=true. Provedores: BrasilAPI → ReceitaWS.
    """
    import re, httpx
    from datetime import datetime
    c = re.sub(r"\D", "", cnpj or "")
    if len(c) != 14:
        raise HTTPException(400, "CNPJ deve ter 14 dígitos.")

    ok, _ = valida_documento(c)
    if not ok:
        raise HTTPException(422, "CNPJ inválido — confira os dígitos.")

    def _do_cache(reg, sufixo="(cache)"):
        return {
            "nome": reg.nome_fantasia or reg.razao_social or "",
            "razao_social": reg.razao_social or "", "documento": c,
            "telefone": reg.telefone or "", "email": reg.email or "",
            "logradouro": reg.logradouro or "", "numero": reg.numero or "",
            "complemento": reg.complemento or "", "bairro": reg.bairro or "",
            "cidade": reg.cidade or "", "estado": reg.estado or "", "cep": reg.cep or "",
            "situacao": reg.situacao or "", "fonte": f"{reg.fonte or ''} {sufixo}".strip(),
            "do_cache": True,
        }

    # 1) cache local
    reg = db.get(models.CnpjCache, c)
    if reg and not forcar and _cache_valido(reg, CACHE_DIAS_CNPJ):
        return _do_cache(reg)

    # 2) provedores externos
    def _brasilapi():
        r = httpx.get(f"https://brasilapi.com.br/api/cnpj/v1/{c}", timeout=8)
        if r.status_code == 404: return "NAO_ENCONTRADO"
        r.raise_for_status(); d = r.json()
        return {"razao_social": d.get("razao_social") or "", "nome_fantasia": d.get("nome_fantasia") or "",
                "situacao": d.get("descricao_situacao_cadastral") or "",
                "telefone": d.get("ddd_telefone_1") or "", "email": d.get("email") or "",
                "logradouro": d.get("logradouro") or "", "numero": d.get("numero") or "",
                "complemento": d.get("complemento") or "", "bairro": d.get("bairro") or "",
                "cidade": d.get("municipio") or "", "estado": d.get("uf") or "",
                "cep": re.sub(r"\D", "", d.get("cep") or ""), "fonte": "BrasilAPI"}

    def _receitaws():
        r = httpx.get(f"https://receitaws.com.br/v1/cnpj/{c}", timeout=10)
        r.raise_for_status(); d = r.json()
        if d.get("status") == "ERROR": return "NAO_ENCONTRADO"
        return {"razao_social": d.get("nome") or "", "nome_fantasia": d.get("fantasia") or "",
                "situacao": d.get("situacao") or "",
                "telefone": d.get("telefone") or "", "email": d.get("email") or "",
                "logradouro": d.get("logradouro") or "", "numero": d.get("numero") or "",
                "complemento": d.get("complemento") or "", "bairro": d.get("bairro") or "",
                "cidade": d.get("municipio") or "", "estado": d.get("uf") or "",
                "cep": re.sub(r"\D", "", d.get("cep") or ""), "fonte": "ReceitaWS"}

    erros = []
    for nome, fn in (("BrasilAPI", _brasilapi), ("ReceitaWS", _receitaws)):
        try:
            res = fn()
            if res == "NAO_ENCONTRADO":
                raise HTTPException(404, "CNPJ não encontrado na Receita Federal.")
            if res and (res.get("razao_social") or res.get("nome_fantasia")):
                # 3) grava no cache
                if reg:
                    for k, v in res.items():
                        setattr(reg, k, v)
                    reg.consultado_em = datetime.utcnow()
                else:
                    db.add(models.CnpjCache(cnpj=c, consultado_em=datetime.utcnow(), **res))
                db.commit()
                return {
                    "nome": res.get("nome_fantasia") or res.get("razao_social") or "",
                    "razao_social": res.get("razao_social") or "", "documento": c,
                    "telefone": res.get("telefone") or "", "email": res.get("email") or "",
                    "logradouro": res.get("logradouro") or "", "numero": res.get("numero") or "",
                    "complemento": res.get("complemento") or "", "bairro": res.get("bairro") or "",
                    "cidade": res.get("cidade") or "", "estado": res.get("estado") or "",
                    "cep": res.get("cep") or "", "situacao": res.get("situacao") or "",
                    "fonte": res.get("fonte") or "", "do_cache": False,
                }
            erros.append(f"{nome}: vazio")
        except HTTPException:
            raise
        except Exception as e:
            erros.append(f"{nome}: {type(e).__name__}")

    # 4) rede falhou — usa cache vencido se existir
    if reg:
        log.warning("CNPJ %s: rede falhou (%s), usando cache vencido", c, "; ".join(erros))
        return _do_cache(reg, "(cache antigo)")

    log.warning("CNPJ %s falhou em todos os provedores: %s", c, "; ".join(erros))
    raise HTTPException(503, "Serviços de consulta de CNPJ indisponíveis. Preencha os dados manualmente.")


@router.get("/cache/estatisticas")
def cache_estatisticas(db: Session = Depends(get_db)):
    """Quantos CNPJs e CEPs estão guardados localmente."""
    from sqlalchemy import func
    return {
        "cnpjs": db.query(func.count(models.CnpjCache.cnpj)).scalar() or 0,
        "ceps":  db.query(func.count(models.CepCache.cep)).scalar() or 0,
    }


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
