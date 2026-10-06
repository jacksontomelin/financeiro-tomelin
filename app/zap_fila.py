"""Envios ao WhatsApp em segundo plano: a tela responde na hora (✓) e acompanha
até o gateway confirmar (✓✓) ou falhar, sem travar esperando o WhatsApp."""
import logging
import secrets
import threading
import time

log = logging.getLogger("tomelin.zap_fila")
_ENVIOS: dict[str, dict] = {}
_TRAVA = threading.Lock()
VALIDADE = 600   # segundos que o resultado fica disponível para a tela


def _limpa():
    agora = time.time()
    for k in [k for k, v in _ENVIOS.items() if agora - v["criado"] > VALIDADE]:
        _ENVIOS.pop(k, None)


def disparar(nome: str, tarefa) -> str:
    """tarefa(db) -> bool (True = gateway confirmou). Devolve o id para acompanhar."""
    with _TRAVA:
        _limpa()
        eid = secrets.token_hex(6)
        _ENVIOS[eid] = {"id": eid, "nome": nome, "status": "enviando", "motivo": None, "criado": time.time()}

    def rodar():
        from .database import SessionLocal
        db = SessionLocal()
        try:
            ok = bool(tarefa(db))
            _ENVIOS[eid].update(status="ok" if ok else "erro",
                                motivo=None if ok else "O gateway não confirmou o envio. Veja o diagnóstico na tela do WhatsApp.")
        except Exception as e:
            log.warning("Envio %s falhou: %s", nome, e)
            _ENVIOS[eid].update(status="erro", motivo=str(e)[:200])
        finally:
            _ENVIOS[eid]["fim"] = time.time()
            db.close()
    threading.Thread(target=rodar, daemon=True).start()
    return eid


def situacao(eid: str) -> dict | None:
    e = _ENVIOS.get(eid)
    if not e:
        return None
    return {k: v for k, v in e.items() if k in ("id", "nome", "status", "motivo")} | {
        "segundos": round((e.get("fim") or time.time()) - e["criado"], 1)}
