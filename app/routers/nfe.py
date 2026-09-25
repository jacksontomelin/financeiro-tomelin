"""Endpoint para leitura de NF-e / NFC-e pelo QR code."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, nfe as nfe_svc
from ..security import usuario_atual

router = APIRouter(prefix="/api/nfe", tags=["nfe"],
                   dependencies=[Depends(usuario_atual)])


class QRInput(BaseModel):
    url: str  # URL completa do QR code OU chave de acesso (44 dígitos)


@router.post("/consultar")
def consultar(body: QRInput, db: Session = Depends(get_db)):
    """
    Recebe a URL do QR code ou a chave de acesso da NF-e.
    Acessa o portal estadual e retorna dados para pré-preencher o lançamento.
    """
    try:
        dados = nfe_svc.consultar_qrcode(body.url)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Erro inesperado ao consultar NF-e: {e}")

    # Tenta encontrar ou sugerir contato/categoria
    emitente = dados.get("emitente", "")
    cnpj = dados.get("cnpj_emitente", "")

    contato_id = None
    if cnpj:
        ct = db.query(models.Contato).filter(
            models.Contato.documento.like(f"%{cnpj.replace('.', '').replace('/', '').replace('-', '')}%")
        ).first()
        if not ct and emitente:
            ct = db.query(models.Contato).filter(
                models.Contato.nome.ilike(f"%{emitente.split()[0]}%")
            ).first()
        if ct:
            contato_id = ct.id

    # Sugere categoria baseado nos itens e no emitente
    cat_sugestao = _sugerir_categoria(db, dados)

    return {
        **dados,
        "valor_total": float(dados["valor_total"]) if dados.get("valor_total") else None,
        "contato_id_sugerido": contato_id,
        "categoria_sugerida": cat_sugestao,
        "descricao_sugerida": _sugerir_descricao(dados),
    }


def _sugerir_descricao(dados: dict) -> str:
    """Monta uma descrição curta para o lançamento."""
    emitente = dados.get("emitente") or ""
    num = dados.get("numero_nota") or ""
    itens = dados.get("itens") or []

    # Se tem poucos itens, usa o primeiro item
    if len(itens) == 1:
        return itens[0]["descricao"][:80]
    if len(itens) <= 3:
        nomes = ", ".join(i["descricao"][:25] for i in itens[:3])
        return nomes[:80]

    # Usa o nome da loja
    loja = emitente.split(" ")[0].title() if emitente else "Compra"
    n = f" #{num}" if num else ""
    return f"Compra {loja}{n} ({len(itens)} itens)"[:80]


def _sugerir_categoria(db: Session, dados: dict) -> dict | None:
    """Tenta sugerir uma categoria baseado no emitente ou itens."""
    emitente = (dados.get("emitente") or "").lower()
    itens_desc = " ".join(i.get("descricao", "") for i in (dados.get("itens") or [])).lower()
    texto = emitente + " " + itens_desc

    # Mapeamento de palavras-chave → tipo de categoria
    palavras = {
        "mercado": ["mercado", "supermercado", "atacado", "hiper", "extra", "pão de açúcar",
                    "carrefour", "atacadão", "angeloni", "bistek"],
        "saúde": ["farmácia", "farmacia", "drogaria", "droga", "manipulação", "saúde"],
        "combustível": ["posto", "combustível", "combustivel", "gasolina", "petrobras",
                        "shell", "ipiranga", "ale"],
        "alimentação": ["restaurante", "lanchonete", "mc donalds", "burger", "pizza",
                        "ifood", "delivery", "padaria", "café"],
        "vestuário": ["roupa", "calçado", "havan", "renner", "c&a", "riachuelo", "zara"],
        "eletro": ["eletro", "magazine", "americanas", "casas bahia", "fast shop"],
        "telefone": ["claro", "vivo", "tim", "oi ", "celular", "telecom"],
    }

    cat_nome = None
    for nome, kws in palavras.items():
        if any(kw in texto for kw in kws):
            cat_nome = nome.capitalize()
            break

    if not cat_nome:
        return None

    # Busca categoria correspondente no banco
    cats = db.query(models.Categoria).filter(
        models.Categoria.tipo == "despesa"
    ).all()
    for cat in cats:
        if any(kw in cat.nome.lower() for kw in [cat_nome.lower(), *palavras.get(cat_nome.lower(), [])[:2]]):
            return {"id": cat.id, "nome": cat.nome, "cor": cat.cor}
    return None
