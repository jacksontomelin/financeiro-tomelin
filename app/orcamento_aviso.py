"""Aviso no WhatsApp quando uma categoria passa de 80% ou estoura o orçamento.

Avisa uma vez por nível (80% e 100%) por categoria por mês. Se o gasto
voltar a ficar abaixo (lançamento excluído ou corrigido), o aviso pode
acontecer de novo.
"""
import logging
import threading
from datetime import date
from decimal import Decimal

from . import cfg, models, service

log = logging.getLogger("tomelin.orcamento")
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
         "setembro", "outubro", "novembro", "dezembro"]


def _brl(v) -> str:
    return "R$ " + f"{float(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def verificar(db, categoria_id: int | None, competencia: date | None = None, enviar: bool = True) -> str | None:
    """Devolve o texto do aviso quando um nível novo foi atingido (e manda, se enviar=True)."""
    if not categoria_id or not cfg.get_bool(db, "ORCAMENTO_AVISO", True):
        return None
    c = db.get(models.Categoria, categoria_id)
    if not c or not c.orcamento_mensal or c.tipo != models.TipoMov.despesa:
        return None
    ref = competencia or date.today()
    ini, fim = service._range_mes(ref)
    gasto = service._gasto_por_categoria(db, ini, fim).get(c.id, Decimal(0))
    limite = Decimal(c.orcamento_mensal)
    if limite <= 0:
        return None
    pct = gasto / limite * 100
    nivel = 100 if gasto > limite else 80 if pct >= 80 else 0
    chave = f"_orc_aviso:{ini:%Y-%m}:{c.id}"
    ja = int(cfg.get(db, chave, "0") or 0)
    if nivel < ja:                      # voltou a ficar abaixo: libera avisar de novo
        cfg.set_interno(db, chave, str(nivel), "interno: último aviso de orçamento")
        return None
    if nivel == 0 or nivel == ja:
        return None
    hoje = date.today()
    mes = "" if (ini.year, ini.month) == (hoje.year, hoje.month) else f" ({MESES[ini.month - 1]})"
    if nivel == 100:
        texto = (f"🔴 *Orçamento estourado: {c.nome}*{mes}\n\n"
                 f"Gasto {_brl(gasto)} de {_brl(limite)} ({pct:.0f}%).\n"
                 f"Passou {_brl(gasto - limite)} do limite.")
    else:
        texto = (f"⚠️ *Orçamento quase no limite: {c.nome}*{mes}\n\n"
                 f"Já foram {_brl(gasto)} de {_brl(limite)} ({pct:.0f}%).\n"
                 f"Restam {_brl(limite - gasto)}")
        if not mes:
            dias = (fim - hoje).days
            texto += f" para os próximos {dias} dia(s)." if dias > 0 else " até o fim do mês."
        else:
            texto += "."
    if enviar:
        from . import whatsapp
        if not whatsapp.enviar(texto, db=db):
            return texto               # não marca: avisa quando o WhatsApp estiver ligado
    cfg.set_interno(db, chave, str(nivel), "interno: último aviso de orçamento")
    return texto


def em_segundo_plano(categoria_id: int | None, competencia: date | None = None):
    """Confere sem atrasar a resposta da tela (o envio ao gateway pode demorar)."""
    if not categoria_id:
        return

    def rodar():
        from .database import SessionLocal
        db = SessionLocal()
        try:
            verificar(db, categoria_id, competencia)
        except Exception as e:
            log.warning("Aviso de orçamento falhou: %s", e)
        finally:
            db.close()
    threading.Thread(target=rodar, daemon=True).start()
