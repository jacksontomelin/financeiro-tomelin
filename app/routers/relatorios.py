from datetime import date
from calendar import monthrange
from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ..database import get_db
from .. import service, pdf as pdfgen
from ..security import usuario_atual

router = APIRouter(prefix="/api/relatorios", tags=["relatorios"],
                   dependencies=[Depends(usuario_atual)])


def _periodo(de: date | None, ate: date | None):
    hoje = date.today()
    if not de:
        de = hoje.replace(day=1)
    if not ate:
        ate = hoje.replace(day=monthrange(hoje.year, hoje.month)[1])
    return de, ate


@router.get("/balancete")
def balancete(de: date | None = None, ate: date | None = None, db: Session = Depends(get_db)):
    de, ate = _periodo(de, ate)
    dados = service.balancete(db, de, ate)
    dados["de"] = de.isoformat()
    dados["ate"] = ate.isoformat()
    return dados


@router.get("/patrimonio")
def patrimonio(db: Session = Depends(get_db)):
    return service.patrimonio(db)


@router.get("/projecao")
def projecao(meses: int = 6, db: Session = Depends(get_db)):
    return service.projecao(db, meses=meses)


@router.get("/juros")
def juros(db: Session = Depends(get_db)):
    j = service.juros_resumo(db)
    return {k: float(v) for k, v in j.items()}


# ---------------- PDFs ----------------
def _pdf(data: bytes, filename: str):
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.get("/balancete.pdf")
def balancete_pdf(de: date | None = None, ate: date | None = None, db: Session = Depends(get_db)):
    de, ate = _periodo(de, ate)
    d = service.balancete(db, de, ate)
    label = f"{de.strftime('%d/%m/%Y')} a {ate.strftime('%d/%m/%Y')}"
    data = pdfgen.balancete(label, d["receitas"], d["despesas"],
                            d["total_receitas"], d["total_despesas"], d["juros"])
    return _pdf(data, f"balancete-{de.isoformat()}.pdf")


@router.get("/patrimonio.pdf")
def patrimonio_pdf(db: Session = Depends(get_db)):
    p = service.patrimonio(db)
    contas = [(c["nome"], c["saldo"]) for c in p["contas"]]
    veic = [(v["nome"], v["valor"], v["financiamento"], v["liquido"]) for v in p["veiculos"]]
    data = pdfgen.patrimonio(contas, veic, p["total_contas"],
                             p["total_veiculos"], p["total_financiamentos"])
    return _pdf(data, "patrimonio.pdf")
