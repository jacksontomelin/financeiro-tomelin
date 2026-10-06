"""Envio de e-mail pelo SMTP configurado na tela de Configurações.

Os erros viram frases que dizem o que conferir (senha, porta, servidor),
em vez do texto técnico do servidor de e-mail.
"""
import smtplib
import socket
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from . import cfg


class ErroEmail(Exception):
    pass


def config(db) -> dict:
    usuario = (cfg.get(db, "SMTP_USUARIO", "") or "").strip()
    return {
        "host": (cfg.get(db, "SMTP_HOST", "") or "").strip(),
        "porta": cfg.get_int(db, "SMTP_PORTA", 587),
        "seguranca": (cfg.get(db, "SMTP_SEGURANCA", "starttls") or "starttls").strip().lower(),
        "usuario": usuario,
        "senha": cfg.get(db, "SMTP_SENHA", "") or "",
        "remetente": (cfg.get(db, "SMTP_REMETENTE", "") or "").strip() or usuario,
    }


def configurado(db) -> bool:
    c = config(db)
    return bool(c["host"] and c["remetente"])


def enviar(db, para: str, assunto: str, texto: str, html: str | None = None):
    c = config(db)
    if not c["host"]:
        raise ErroEmail("E-mail não configurado: preencha o servidor SMTP em Configurações → E-mail.")
    if not c["remetente"]:
        raise ErroEmail("E-mail não configurado: falta o usuário ou o remetente em Configurações → E-mail.")
    if not para or "@" not in para:
        raise ErroEmail(f"Endereço de destino inválido: \"{para}\".")
    nome = cfg.get(db, "EMPRESA_NOME", "Tomelin Gestão Financeira") or "Tomelin Gestão Financeira"
    m = EmailMessage()
    m["Subject"] = assunto
    m["From"] = formataddr((nome, c["remetente"]))
    m["To"] = para
    m["Message-ID"] = make_msgid(domain=c["remetente"].split("@")[-1] or None)
    m.set_content(texto)
    if html:
        m.add_alternative(html, subtype="html")
    try:
        if c["seguranca"] == "ssl":
            s = smtplib.SMTP_SSL(c["host"], c["porta"], timeout=15, context=ssl.create_default_context())
        else:
            s = smtplib.SMTP(c["host"], c["porta"], timeout=15)
        with s:
            s.ehlo()
            if c["seguranca"] == "starttls":
                s.starttls(context=ssl.create_default_context()); s.ehlo()
            if c["usuario"]:
                s.login(c["usuario"], c["senha"])
            s.send_message(m)
    except smtplib.SMTPAuthenticationError:
        raise ErroEmail("O servidor de e-mail recusou o usuário ou a senha. No Gmail, use uma \"senha de app\" "
                        "(Conta Google → Segurança → Senhas de app), não a senha normal.")
    except smtplib.SMTPNotSupportedError:
        raise ErroEmail("O servidor de e-mail não aceita STARTTLS nessa porta. Tente segurança \"ssl\" com a porta 465.")
    except smtplib.SMTPRecipientsRefused:
        raise ErroEmail(f"O servidor de e-mail recusou o destinatário \"{para}\".")
    except smtplib.SMTPSenderRefused:
        raise ErroEmail(f"O servidor de e-mail recusou o remetente \"{c['remetente']}\". Use o mesmo endereço do usuário.")
    except (socket.gaierror,):
        raise ErroEmail(f"Servidor de e-mail \"{c['host']}\" não encontrado. Confira o endereço do SMTP.")
    except (socket.timeout, TimeoutError):
        raise ErroEmail(f"O servidor de e-mail não respondeu (porta {c['porta']}). Confira a porta e se a VPS libera saída nela.")
    except ConnectionRefusedError:
        raise ErroEmail(f"Conexão recusada em {c['host']}:{c['porta']}. Confira a porta (587 ou 465).")
    except ssl.SSLError as e:
        raise ErroEmail(f"Erro de segurança na conexão ({e.reason or 'SSL'}). Porta 465 usa \"ssl\"; porta 587 usa \"starttls\".")
    except smtplib.SMTPException as e:
        raise ErroEmail(f"O servidor de e-mail recusou o envio: {str(e)[:160]}")
    except OSError as e:
        raise ErroEmail(f"Não consegui falar com o servidor de e-mail: {e.strerror or e}")
