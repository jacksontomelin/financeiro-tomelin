"""Esqueci a senha: código de 6 dígitos pelo WhatsApp ou e-mail do próprio membro.

- O código vale 15 minutos, aceita 5 tentativas e só serve uma vez.
- Pedir um código novo cancela o anterior.
- No banco fica só o resumo (HMAC) do código, nunca o código.
- WhatsApp vai para o número do membro (cadastro em Família). O administrador
  sem número cadastrado usa o "Seu número" da tela do WhatsApp.
"""
import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta

from . import cfg, models, zapapi, email_envio
from .config import settings

VALIDADE_MIN = 15
MAX_TENTATIVAS = 5


class ErroRecuperar(Exception):
    def __init__(self, mensagem: str, campo: str | None = None, status: int = 400):
        super().__init__(mensagem)
        self.campo, self.status = campo, status


def _resumo(uid: int, codigo: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"{uid}:{codigo}".encode(), hashlib.sha256).hexdigest()


def _eh_admin(db, uid) -> bool:
    av = db.get(models.UsuarioAvatar, uid)
    return bool(av and av.papel == "admin")


def numero_whatsapp(db, u: models.Usuario) -> str | None:
    if u.whatsapp:
        return u.whatsapp
    if _eh_admin(db, u.id):
        d = re.sub(r"\D", "", cfg.get(db, "WHATSAPP_MEU_NUMERO", "") or "")
        if len(d) in (10, 11):
            d = "55" + d
        return d or None
    return None


def mascara_numero(n: str) -> str:
    d = re.sub(r"\D", "", n or "")
    if d.startswith("55") and len(d) >= 12:
        d = d[2:]
    return f"({d[:2]}) •••••-{d[-4:]}" if len(d) >= 10 else "•••" + d[-4:]


def mascara_email(e: str) -> str:
    nome, _, dom = (e or "").partition("@")
    if not dom:
        return "•••"
    vis = nome[:1] + "•••" + (nome[-1:] if len(nome) > 2 else "")
    return f"{vis}@{dom}"


def whatsapp_pronto(db) -> bool:
    c = zapapi.config(db)
    return bool(c["ativo"] and c["url"] and c["chave"])


def canais(db, u: models.Usuario) -> list[dict]:
    out = []
    num = numero_whatsapp(db, u)
    if num and whatsapp_pronto(db):
        out.append({"canal": "whatsapp", "destino": mascara_numero(num)})
    if email_envio.configurado(db):
        out.append({"canal": "email", "destino": mascara_email(u.email)})
    return out


def motivo_sem_canal(db, u: models.Usuario) -> str:
    falta = []
    if not whatsapp_pronto(db):
        falta.append("o WhatsApp do sistema está desligado")
    elif not numero_whatsapp(db, u):
        falta.append("seu cadastro não tem número de WhatsApp")
    if not email_envio.configurado(db):
        falta.append("o envio de e-mail não foi configurado")
    return ("Não dá para mandar o código agora: " + " e ".join(falta) +
            ". Peça ao administrador da família para trocar sua senha em Família.")


def _texto(u, codigo, canal):
    nome = (u.nome or "").split(" ")[0]
    if canal == "whatsapp":
        return (f"🔐 *Tomelin Financeiro*\n\nOlá, {nome}! Seu código para criar uma senha nova é:\n\n"
                f"*{codigo}*\n\nVale por {VALIDADE_MIN} minutos. Se não foi você que pediu, ignore esta mensagem: "
                "sua senha continua a mesma.")
    return (f"Olá, {nome}!\n\nSeu código para criar uma senha nova no Tomelin Gestão Financeira é:\n\n"
            f"    {codigo}\n\nVale por {VALIDADE_MIN} minutos e só pode ser usado uma vez.\n"
            "Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.")


def _html(u, codigo):
    nome = (u.nome or "").split(" ")[0]
    digitos = "".join(f'<span style="display:inline-block;width:38px;height:48px;line-height:48px;margin:0 3px;'
                      f'border-radius:10px;background:#EEF3F8;color:#082D51;font:700 26px/48px Arial,sans-serif">{c}</span>'
                      for c in codigo)
    return f"""<div style="font-family:Arial,sans-serif;max-width:460px;margin:0 auto;padding:24px;color:#1B2B3A">
  <div style="font-weight:800;font-size:18px;color:#082D51">Tomelin Gestão Financeira</div>
  <p>Olá, {nome}! Seu código para criar uma senha nova é:</p>
  <div style="text-align:center;margin:22px 0">{digitos}</div>
  <p style="color:#5B6B7A;font-size:13px">Vale por {VALIDADE_MIN} minutos e só pode ser usado uma vez.<br>
  Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.</p>
</div>"""


def _mandar_whatsapp(db, numero: str, texto: str):
    c = zapapi.config(db)
    if not (c["ativo"] and c["url"] and c["chave"]):
        raise ErroRecuperar("O WhatsApp do sistema está desligado. Tente por e-mail ou fale com o administrador.")
    try:
        zapapi._req("POST", c["endpoint"], db, json={**zapapi._destino(numero), "texto": texto})
    except Exception as e:
        raise ErroRecuperar(f"O WhatsApp não conseguiu enviar o código ({str(e)[:120]}). Tente de novo em instantes ou use o e-mail.")


def gerar_e_enviar(db, u: models.Usuario, canal: str, ip: str | None = None) -> dict:
    agora = datetime.utcnow()
    recentes = (db.query(models.RecuperacaoSenha)
                .filter(models.RecuperacaoSenha.usuario_id == u.id,
                        models.RecuperacaoSenha.criado_em > agora - timedelta(minutes=VALIDADE_MIN)).all())
    if len(recentes) >= 3:
        raise ErroRecuperar("Você já pediu 3 códigos nos últimos 15 minutos. Use o último que chegou ou espere um pouco.",
                            status=429)
    if recentes and (agora - max(r.criado_em for r in recentes)).total_seconds() < 45:
        raise ErroRecuperar("Espere alguns segundos antes de pedir outro código.", status=429)

    if canal == "whatsapp":
        destino = numero_whatsapp(db, u)
        if not destino:
            raise ErroRecuperar("Seu cadastro não tem número de WhatsApp. Use o e-mail ou peça ao administrador.")
    elif canal == "email":
        destino = u.email
        if not email_envio.configurado(db):
            raise ErroRecuperar("O envio de e-mail não foi configurado no sistema. Use o WhatsApp ou fale com o administrador.")
    else:
        raise ErroRecuperar("Escolha WhatsApp ou e-mail.")

    codigo = f"{secrets.randbelow(1_000_000):06d}"
    for r in recentes:                      # o código novo cancela os anteriores
        if not r.usado_em:
            r.expira_em = agora
    rec = models.RecuperacaoSenha(usuario_id=u.id, canal=canal, codigo_hash=_resumo(u.id, codigo),
                                  criado_em=agora, expira_em=agora + timedelta(minutes=VALIDADE_MIN), ip=ip)
    db.add(rec); db.commit()
    try:
        if canal == "whatsapp":
            _mandar_whatsapp(db, destino, _texto(u, codigo, canal))
        else:
            try:
                email_envio.enviar(db, destino, f"Seu código: {codigo} · Tomelin Financeiro",
                                   _texto(u, codigo, canal), _html(u, codigo))
            except email_envio.ErroEmail as e:
                raise ErroRecuperar(f"O e-mail não foi enviado: {e}")
    except ErroRecuperar:
        db.delete(rec); db.commit()         # não deixa código que ninguém recebeu
        raise
    return {"enviado": True, "canal": canal,
            "destino": mascara_numero(destino) if canal == "whatsapp" else mascara_email(destino),
            "validade_min": VALIDADE_MIN}


def confirmar(db, u: models.Usuario, codigo: str, nova_senha: str):
    from .routers.usuarios import MIN_SENHA
    codigo = re.sub(r"\D", "", codigo or "")
    agora = datetime.utcnow()
    rec = (db.query(models.RecuperacaoSenha)
           .filter(models.RecuperacaoSenha.usuario_id == u.id, models.RecuperacaoSenha.usado_em.is_(None))
           .order_by(models.RecuperacaoSenha.criado_em.desc()).first())
    if not rec or rec.expira_em <= agora:
        raise ErroRecuperar("Código vencido ou já usado. Peça um código novo.", "codigo")
    if rec.tentativas >= MAX_TENTATIVAS:
        raise ErroRecuperar("Muitas tentativas erradas com este código. Peça um código novo.", "codigo")
    if len(codigo) != 6 or not hmac.compare_digest(rec.codigo_hash, _resumo(u.id, codigo)):
        rec.tentativas += 1; db.commit()
        resta = MAX_TENTATIVAS - rec.tentativas
        raise ErroRecuperar("Código incorreto." + (f" Restam {resta} tentativa(s)." if resta else " Peça um código novo."),
                            "codigo")
    if len(nova_senha or "") < MIN_SENHA:
        raise ErroRecuperar(f"Nova senha: precisa ter no mínimo {MIN_SENHA} caracteres.", "nova_senha")
    if nova_senha == "tomelin123":
        raise ErroRecuperar("Nova senha: escolha uma diferente da senha de fábrica.", "nova_senha")
    from . import security
    if security.confere_senha(nova_senha, u.senha_hash):
        raise ErroRecuperar("Nova senha: é igual à atual. Se lembrou dela, é só entrar com ela.", "nova_senha")
    u.senha_hash = security.hash_senha(nova_senha)
    rec.usado_em = agora
    db.commit()
    # aviso de segurança no WhatsApp do próprio membro (em segundo plano)
    num = numero_whatsapp(db, u)
    if num and whatsapp_pronto(db):
        from . import zap_fila
        hora = datetime.now().strftime("%d/%m às %H:%M")
        txt = (f"🔐 *Tomelin Financeiro*: sua senha foi trocada em {hora}.\n"
               "Se não foi você, avise o administrador da família agora.")
        zap_fila.disparar("Aviso de senha trocada",
                          lambda sdb: bool(zapapi._req("POST", zapapi.config(sdb)["endpoint"], sdb,
                                                       json={**zapapi._destino(num), "texto": txt})))
