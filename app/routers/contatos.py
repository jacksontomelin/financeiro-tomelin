from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..security import usuario_atual

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


@router.post("", response_model=schemas.ContatoOut)
def criar(dados: schemas.ContatoIn, db: Session = Depends(get_db)):
    c = models.Contato(**dados.model_dump())
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
    for k, v in dados.model_dump().items():
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
