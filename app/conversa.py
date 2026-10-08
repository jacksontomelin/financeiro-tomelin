"""Conversa no grupo do WhatsApp: o sistema pergunta o que falta, entende
frases do dia a dia e aprende com quem usa.

- Comando incompleto vira conversa: "despesa" → "Qual o valor?" → "Do quê?"
  → "Qual categoria? 1 Mercado 2 Moradia..." → "Já está paga? 1 Sim 2 Não".
- "baixa" sem número mostra as contas em aberto numeradas; responde o número.
- Frases soltas: "gastei 50 no mercado", "recebi 3000 de salário",
  "quanto tenho?", "o que vence hoje?".
- Não entendeu? Oferece as opções mais parecidas; a escolha fica guardada
  e na próxima vez a mesma frase já funciona ("aprendi").
- Categoria escolhida numa conversa também fica guardada: "mercado assaí"
  passa a cair sempre na mesma categoria.
- "cancelar" sai de qualquer conversa; "o que você aprendeu" lista o que ficou
  guardado; "esquecer FRASE" apaga.

O andamento de cada conversa fica na memória (10 min); o que foi aprendido
fica no banco.
"""
import json
import re
import time
from datetime import date, datetime

from . import models

VALIDADE = 10 * 60
_ESTADO: dict[str, dict] = {}          # remetente -> {"etapa", "dados", "ate"}
_ULTIMA_CONVERSA: dict[str, float] = {}

SIM = {"sim", "s", "ss", "isso", "pode", "ok", "claro", "1", "ja", "paguei", "paga", "pago", "uhum", "aham", "positivo", "beleza", "blz"}
SIM_PALAVRA = SIM - {"1"}               # onde "1" é um número de opção, só palavra vale como sim
NAO = {"nao", "n", "2", "ainda nao", "negativo", "depois", "nem"}
CANCELAR = {"cancelar", "cancela", "sair", "parar", "para", "esquece", "deixa", "deixa pra la", "nada", "voltar"}

# palavras que indicam assunto de dinheiro: só nesses casos o sistema responde
# a uma frase que não entendeu (no grupo da família tem conversa de todo tipo)
ASSUNTO = ("saldo", "conta", "pagar", "pago", "paguei", "gastei", "gasto", "gastos", "receb", "despesa", "receita",
           "venc", "boleto", "fatura", "cartao", "dinheiro", "quanto", "real", "reais", "r$", "pix", "divida",
           "dever", "devo", "salario", "meta", "economi", "orcamento", "lancamento", "baixa", "extrato", "mes")

# frases do dia a dia → comando (o primeiro que bater ganha)
INTENCOES = [
    (r"\b(quanto (eu )?tenho|meu saldo|saldo (das|de) conta|quanto (tem|ha|sobrou) na conta|dinheiro (em|na) conta)\b", "saldo", "ver o saldo das contas"),
    (r"\b(vence|vencendo|vencem) hoje\b|\bpra hoje\b|\bo que (tem|tenho) (pra|para) pagar hoje\b", "hoje", "ver o que vence hoje"),
    (r"\b(atrasad|vencid|vai vencer|vencendo|proximos? venc|o que vence)", "vencer", "ver atrasadas e as que vencem"),
    (r"\b(quanto (eu )?gastei|onde (o dinheiro|gastei)|maiores gastos|gastei mais)\b", "gastos", "ver onde o dinheiro foi"),
    (r"\b(como (esta|ta|anda) o mes|resumo do mes|fechamento do mes|balanco)\b", "resumo", "ver o resumo do mês"),
    (r"\b(o que (tenho|tem) (pra|para|a) pagar|contas (a|pra|para) pagar|quanto devo)\b", "pagar", "ver as contas a pagar"),
    (r"\b(o que (tenho|tem) (pra|para|a) receber|quem (me )?deve|contas a receber)\b", "receber", "ver o que tem a receber"),
    (r"\b(semana)\b", "semana", "ver a semana"),
    (r"\b(mes que vem|proximo mes)\b", "proximo mes", "ver o mês que vem"),
    (r"\b(parcela|parcelas|fatura|cartao)\b", "parcelas", "ver as parcelas do cartão"),
    (r"\b(meta|metas|guardar|guardei|reserva)\b", "metas", "ver as metas"),
    (r"\b(previs|projec|vai sobrar|vai faltar)", "projecao", "ver a previsão de saldo"),
    (r"\b(dica|conselho|ajuda (a|pra) economizar|economizar)\b", "dica", "receber uma dica"),
    (r"\b(ultimo lancamento|o que lancei|lancei por ultimo)\b", "ultimo", "ver o último lançamento"),
]
OPCOES_PADRAO = [("saldo", "ver o saldo das contas"), ("vencer", "ver o que vence"), ("resumo", "ver o resumo do mês"),
                 ("lancar", "lançar uma despesa"), ("menu", "ver todos os comandos")]


def _sa(t: str) -> str:
    from .whatsapp import _sem_acento
    return re.sub(r"\s+", " ", _sem_acento((t or "").lower())).strip(" .!?,;")


def _brl(v) -> str:
    from .whatsapp import _brl as f
    return f(v)


# ── memória do que foi aprendido (no banco) ─────────────────────────────────
def _ler(db, chave: str) -> dict:
    from . import cfg
    try:
        return json.loads(cfg.get(db, chave, "") or "{}") or {}
    except Exception:
        return {}


def _gravar(db, chave: str, valor: dict):
    from . import cfg
    cfg.set_interno(db, chave, json.dumps(valor, ensure_ascii=False)[:20000])


def apelidos(db) -> dict:
    return _ler(db, "_zap_apelidos")


def aprender_apelido(db, frase: str, comando: str):
    a = apelidos(db)
    a[_sa(frase)[:80]] = comando
    _gravar(db, "_zap_apelidos", dict(list(a.items())[-200:]))


def categoria_aprendida(db, descricao: str, tipo: str) -> models.Categoria | None:
    m = _ler(db, "_zap_categorias")
    d = _sa(descricao)
    for palavra in sorted(m, key=len, reverse=True):          # a mais específica primeiro
        if palavra and re.search(rf"\b{re.escape(palavra)}\b", d):
            c = db.get(models.Categoria, m[palavra])
            if c and (c.tipo.value if hasattr(c.tipo, "value") else c.tipo) == tipo:
                return c
    return None


def aprender_categoria(db, descricao: str, cat_id: int):
    palavras = [p for p in _sa(descricao).split() if len(p) >= 3 and not p.isdigit()]
    if not palavras:
        return
    m = _ler(db, "_zap_categorias")
    m[" ".join(palavras[:2])] = cat_id       # "mercado assai" e também a primeira palavra
    m[palavras[0]] = cat_id
    _gravar(db, "_zap_categorias", dict(list(m.items())[-400:]))


# ── estado da conversa ──────────────────────────────────────────────────────
def _chave(remetente) -> str:
    return remetente or "?"


def _estado(remetente) -> dict | None:
    e = _ESTADO.get(_chave(remetente))
    if e and e["ate"] < time.time():
        _ESTADO.pop(_chave(remetente), None)
        return None
    return e


def _abrir(remetente, etapa: str, **dados):
    _ESTADO[_chave(remetente)] = {"etapa": etapa, "dados": dados, "ate": time.time() + VALIDADE}


def _fechar(remetente):
    _ESTADO.pop(_chave(remetente), None)


def _nome(db, remetente) -> str:
    d = re.sub(r"\D", "", remetente or "")
    if len(d) < 8:
        return ""
    for u in db.query(models.Usuario).filter(models.Usuario.ativo.is_(True)).all():
        n = re.sub(r"\D", "", getattr(u, "whatsapp", None) or "")
        if n and n[-8:] == d[-8:]:
            return (u.nome or "").split(" ")[0]
    from . import cfg
    meu = re.sub(r"\D", "", cfg.get(db, "WHATSAPP_MEU_NUMERO", "") or "")
    if meu and meu[-8:] == d[-8:]:
        adm = db.query(models.Usuario).order_by(models.Usuario.id).first()
        return (adm.nome or "").split(" ")[0] if adm else ""
    return ""


def _saudacao() -> str:
    h = datetime.now().hour
    return "Bom dia" if 5 <= h < 12 else "Boa tarde" if 12 <= h < 18 else "Boa noite"


def _num(t: str) -> int | None:
    m = re.fullmatch(r"#?(\d{1,3})", t.strip())
    return int(m.group(1)) if m else None


# ── entrada: antes dos comandos fixos ───────────────────────────────────────
def antes(t: str, db, remetente) -> tuple[str, str] | None:
    """('resposta', texto) quando a conversa responde; ('comando', texto) quando
    a frase vira um comando conhecido; None para seguir o caminho normal."""
    low = _sa(t)
    if "\n" in t.strip() or len(t) > 160:      # texto longo/de várias linhas: nunca é resposta de conversa
        return None
    e = _estado(remetente)
    if low in CANCELAR and e:
        _fechar(remetente)
        return "resposta", "👍 Cancelado. Quando precisar, é só chamar. Mande *menu* para ver tudo."
    if e:
        r = _continuar(e, t, low, db, remetente)
        if r is not None:
            _ULTIMA_CONVERSA[_chave(remetente)] = time.time()
            return r
    # ensinou antes? a frase vira o comando
    a = apelidos(db)
    if low in a:
        return "comando", a[low]
    if low in ("o que voce aprendeu", "o que vc aprendeu", "aprendeu", "aprendizado", "o que aprendeu"):
        return "resposta", _texto_aprendido(db)
    m = re.match(r"^(esquecer|esquece|desaprender) (.+)$", low)
    if m:
        frase = m.group(2).strip(" \"'")
        if frase in a:
            a.pop(frase); _gravar(db, "_zap_apelidos", a)
            return "resposta", f"🧹 Pronto, esqueci *{frase}*."
        return "resposta", f"Não tinha aprendido *{frase}*. Mande *o que você aprendeu* para ver a lista."
    if low in ("oi", "ola", "oie", "eai", "e ai", "bom dia", "boa tarde", "boa noite", "opa", "salve", "fala", "hey"):
        return "resposta", saudacao(db, remetente)
    if low in ("obrigado", "obrigada", "valeu", "vlw", "brigado", "tmj", "show", "top", "perfeito", "otimo"):
        if time.time() - _ULTIMA_CONVERSA.get(_chave(remetente), 0) < 300:
            return "resposta", "😊 Por nada! Estou por aqui."
        return None
    if low in ("lancar", "lancamento", "novo lancamento", "lançar"):
        return "resposta", iniciar_lancamento(db, remetente, "despesa")
    return None


def saudacao(db, remetente) -> str:
    from . import service
    nome = _nome(db, remetente)
    hoje = date.today()
    vence = (db.query(models.Lancamento)
             .filter(models.Lancamento.data_pagamento.is_(None), models.Lancamento.data_vencimento == hoje,
                     models.Lancamento.tipo == models.TipoMov.despesa).count())
    atras = (db.query(models.Lancamento)
             .filter(models.Lancamento.data_pagamento.is_(None), models.Lancamento.data_vencimento < hoje,
                     models.Lancamento.tipo == models.TipoMov.despesa).count())
    linhas = [f"👋 {_saudacao()}{', ' + nome if nome else ''}! Como posso ajudar?"]
    if vence or atras:
        partes = []
        if vence:
            partes.append(f"*{vence}* conta(s) vencem hoje")
        if atras:
            partes.append(f"*{atras}* atrasada(s)")
        linhas.append("📌 " + " e ".join(partes) + ".")
    linhas += ["", "1️⃣ Ver o saldo", "2️⃣ O que vence", "3️⃣ Lançar uma despesa", "4️⃣ Dar baixa numa conta", "5️⃣ Todos os comandos",
               "", "_Responda o número ou escreva do seu jeito, ex.: \"gastei 50 no mercado\"._"]
    _abrir(remetente, "escolha", opcoes=["saldo", "vencer", "lancar", "baixa", "menu"])
    _ULTIMA_CONVERSA[_chave(remetente)] = time.time()
    return "\n".join(linhas)


def _texto_aprendido(db) -> str:
    a = apelidos(db)
    c = _ler(db, "_zap_categorias")
    if not a and not c:
        return ("🧠 Ainda não aprendi nada. Quando eu não entender uma frase, vou te dar opções; "
                "a que você escolher eu guardo para a próxima vez.")
    L = ["🧠 *O que aprendi com você*", ""]
    if a:
        L.append("*Frases:*")
        L += [f"• \"{k}\" → *{v}*" for k, v in list(a.items())[-15:]]
    if c:
        nomes = {x.id: x.nome for x in db.query(models.Categoria).all()}
        L += ["", "*Categorias:*"]
        L += [f"• {k} → {nomes.get(v, '?')}" for k, v in list(c.items())[-15:] if " " not in k]
    L += ["", "_Para apagar: `esquecer FRASE`._"]
    return "\n".join(L)


# ── conversas em andamento ──────────────────────────────────────────────────
def _continuar(e, t, low, db, remetente):
    etapa, d = e["etapa"], e["dados"]
    from .whatsapp import _parse_valor

    if etapa == "escolha":                       # menu numerado da saudação
        n = _num(low)
        if n and 1 <= n <= len(d["opcoes"]):
            _fechar(remetente)
            op = d["opcoes"][n - 1]
            if op == "lancar":
                return "resposta", iniciar_lancamento(db, remetente, "despesa")
            if op == "baixa":
                return "resposta", iniciar_baixa(db, remetente)
            return "comando", op
        _fechar(remetente)
        return None

    if etapa == "sugestao":                      # "você quis dizer..."
        n = _num(low)
        if n and 1 <= n <= len(d["opcoes"]):
            _fechar(remetente)
            cmd = d["opcoes"][n - 1]
            aprender_apelido(db, d["frase"], cmd)
            pre = f"🧠 Anotado: quando você disser \"{d['frase']}\", eu entendo *{cmd}*.\n\n"
            if cmd == "lancar":
                return "resposta", pre + iniciar_lancamento(db, remetente, "despesa")
            return "comando_aprendido", pre + "\x00" + cmd
        _fechar(remetente)
        return None

    if etapa == "valor":
        v = _parse_valor(re.sub(r"[^\d,.]", "", t) or "x")
        if not v or v <= 0:
            return "resposta", "🤔 Não entendi o valor. Mande só o número, ex.: *150* ou *89,90*. (ou *cancelar*)"
        d["valor"] = str(v)
        if d.get("descricao"):
            return "resposta", _perguntar_categoria(db, remetente, d)
        _abrir(remetente, "descricao", **d)
        return "resposta", f"📝 {_brl(v)} de quê? Escreva uma descrição curta, ex.: *mercado*, *luz*, *farmácia*."

    if etapa == "descricao":
        if len(low) < 2:
            return "resposta", "📝 Escreva uma descrição curta, ex.: *mercado*."
        d["descricao"] = t.strip()[:120].title()
        return "resposta", _perguntar_categoria(db, remetente, d)

    if etapa == "categoria":
        n = _num(low)
        cats = d["cats"]
        if d.get("sugerida") and (low in SIM_PALAVRA):
            d["categoria_id"] = d["sugerida"]
        elif n is not None and 0 <= n <= len(cats):
            d["categoria_id"] = cats[n - 1][0] if n else None
            if n:
                aprender_categoria(db, d["descricao"], d["categoria_id"])
        else:
            # escreveu o nome: procura em todas as categorias desse tipo
            todas = [(c.id, c.nome) for c in db.query(models.Categoria).filter(models.Categoria.tipo == d["tipo"]).all()]
            achada = None
            if len(low) >= 3:
                achada = (next((c for c in todas if _sa(c[1]) == low), None)
                          or next((c for c in todas if _sa(c[1]).startswith(low)), None)
                          or next((c for c in todas if low in _sa(c[1])), None))
            if not achada:
                return "resposta", "🤔 Não achei essa categoria. Responda o *número* da lista ou *0* para sem categoria."
            d["categoria_id"] = achada[0]
            aprender_categoria(db, d["descricao"], achada[0])
        if d.get("pago") is not None:
            return "resposta", _criar(db, remetente, d)
        _abrir(remetente, "pago", **d)
        verbo = "recebido" if d["tipo"] == "receita" else "pago"
        return "resposta", f"💳 Já foi {verbo}?\n\n1️⃣ Sim, hoje\n2️⃣ Não, fica em aberto"

    if etapa == "pago":
        if low in SIM:
            d["pago"] = True
        elif low in NAO:
            d["pago"] = False
        else:
            return "resposta", "Responda *1* (sim) ou *2* (não)."
        return "resposta", _criar(db, remetente, d)

    if etapa == "confirma_baixa":                 # depois de lançar: "já pagou?"
        if low in SIM_PALAVRA:
            _fechar(remetente)
            from .whatsapp import _dar_baixa
            return "resposta", _dar_baixa(db, str(d["lid"]))
        _fechar(remetente)
        return None if low not in NAO else ("resposta", "👍 Ok, fica em aberto. Quando pagar, mande *baixa " + str(d["lid"]) + "*.")

    if etapa == "baixa":
        n = _num(low)
        ids = d["ids"]
        if n and 1 <= n <= len(ids):
            _fechar(remetente)
            from .whatsapp import _dar_baixa
            return "resposta", _dar_baixa(db, str(ids[n - 1]))
        if n and n > len(ids):                    # digitou o número do lançamento direto
            _fechar(remetente)
            from .whatsapp import _dar_baixa
            return "resposta", _dar_baixa(db, str(n))
        _fechar(remetente)
        return None
    return None


def _perguntar_categoria(db, remetente, d) -> str:
    from .whatsapp import _sugerir_categoria
    tipo = d["tipo"]
    sug = categoria_aprendida(db, d["descricao"], tipo) or _sugerir_categoria(db, d["descricao"], tipo)
    # as mais usadas primeiro
    from sqlalchemy import func
    usadas = dict(db.query(models.Lancamento.categoria_id, func.count(models.Lancamento.id))
                  .group_by(models.Lancamento.categoria_id).all())
    cats = sorted(db.query(models.Categoria).filter(models.Categoria.tipo == tipo).all(),
                  key=lambda c: (-(usadas.get(c.id, 0)), c.nome))[:9]
    if sug and sug.id not in [c.id for c in cats]:
        cats = [sug] + cats[:8]
    d["cats"] = [(c.id, c.nome) for c in cats]
    d["sugerida"] = sug.id if sug else None
    _abrir(remetente, "categoria", **d)
    L = []
    if sug:
        L.append(f"🏷️ Acho que é *{sug.nome}*. Está certo? Responda *sim* ou o número de outra:")
    else:
        L.append("🏷️ Qual a categoria?")
    nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]
    L += [f"{nums[i]} {nome}" for i, (_, nome) in enumerate(d["cats"])]
    L.append("0️⃣ Sem categoria")
    L.append("_Ou escreva o nome de outra categoria._")
    return "\n".join(L)


def _criar(db, remetente, d) -> str:
    from decimal import Decimal
    from .whatsapp import _autor_zap
    _fechar(remetente)
    hoje = date.today()
    tipo = d["tipo"]
    l = models.Lancamento(descricao=d["descricao"], tipo=models.TipoMov(tipo), valor=Decimal(d["valor"]),
                          data_vencimento=hoje, data_competencia=hoje, categoria_id=d.get("categoria_id"),
                          data_pagamento=hoje if d.get("pago") else None)
    db.add(l); db.commit(); db.refresh(l)
    from .zap_midia import lembrar_lancamento
    lembrar_lancamento(remetente, l.id)
    from . import historico
    historico.registrar(db, l, "criou", autor=_autor_zap(remetente))
    cat = db.get(models.Categoria, l.categoria_id) if l.categoria_id else None
    emoji = "💵" if tipo == "receita" else "💸"
    st = ("✅ pago hoje" if tipo == "despesa" else "✅ recebido hoje") if l.data_pagamento else f"🟡 em aberto · quando pagar: *baixa {l.id}*"
    aviso = ""
    if tipo == "despesa" and cat:
        try:
            from .orcamento_aviso import verificar
            a = verificar(db, cat.id, hoje, enviar=False)
            aviso = f"\n\n{a}" if a else ""
        except Exception:
            pass
    return (f"{emoji} *Pronto, lancei!*\n\n#{l.id}: {l.descricao}\n💰 {_brl(l.valor)}"
            f"{' · ' + cat.nome if cat else ''}\n{st}\n\n📎 _Tem comprovante? Mande a foto agora que eu anexo._" + aviso)


# ── começos de conversa ─────────────────────────────────────────────────────
def iniciar_lancamento(db, remetente, tipo: str, valor=None, descricao=None, pago=None) -> str:
    d = {"tipo": tipo, "pago": pago}
    if descricao:
        d["descricao"] = descricao.strip()[:120].title()
    if valor:
        d["valor"] = str(valor)
        if d.get("descricao"):
            return _perguntar_categoria(db, remetente, d)
        _abrir(remetente, "descricao", **d)
        return f"📝 {_brl(valor)} de quê? Escreva uma descrição curta, ex.: *mercado*."
    _abrir(remetente, "valor", **d)
    rot = "Nova receita 💵" if tipo == "receita" else "Nova despesa 💸"
    return f"*{rot}*\n\nQual o valor? Ex.: *150* ou *89,90*\n_(mande *cancelar* para sair)_"


def iniciar_baixa(db, remetente) -> str:
    hoje = date.today()
    abertos = (db.query(models.Lancamento).filter(models.Lancamento.data_pagamento.is_(None))
               .order_by(models.Lancamento.data_vencimento.is_(None), models.Lancamento.data_vencimento).limit(9).all())
    if not abertos:
        return "🎉 Nenhuma conta em aberto. Tudo pago!"
    _abrir(remetente, "baixa", ids=[l.id for l in abertos])
    nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"]
    L = ["✅ *Qual você pagou?* Responda o número:", ""]
    for i, l in enumerate(abertos):
        v = l.data_vencimento
        quando = "" if not v else (" · 🔴 atrasada" if v < hoje else " · hoje" if v == hoje else f" · {v.strftime('%d/%m')}")
        L.append(f"{nums[i]} {l.descricao} · {_brl(l.valor)}{quando}")
    return "\n".join(L)


def oferecer_baixa(remetente, lid: int):
    """Depois de lançar pelo comando completo: a próxima resposta 'sim' dá baixa."""
    _abrir(remetente, "confirma_baixa", lid=lid)
    _ULTIMA_CONVERSA[_chave(remetente)] = time.time()


# ── saída: frase que nenhum comando pegou ───────────────────────────────────
def depois(t: str, db, remetente) -> str | None:
    if "\n" in t.strip() or len(t) > 200:      # mensagem longa (ou eco de resposta): não é pedido
        return None
    low = _sa(t)
    from .whatsapp import _parse_valor
    # "gastei 50 no mercado", "paguei 120 de luz", "comprei pão 12", "recebi 3000 salario"
    m = re.match(r"^(gastei|paguei|comprei|torrei|saiu|foi|recebi|ganhei|entrou|caiu)\b\s*(.*)$", low)
    if m:
        verbo = m.group(1)
        # o resto com acento, como foi escrito (vira a descrição)
        orig = re.sub(r"\s+", " ", t.lower()).strip(" .!?,;")
        resto = orig.split(None, 1)[1] if len(orig.split(None, 1)) > 1 else ""
        tipo = "receita" if verbo in ("recebi", "ganhei", "entrou", "caiu") else "despesa"
        vm = re.search(r"(?:r\$\s*)?(\d+(?:[.,]\d{1,3})*(?:[.,]\d{1,2})?)\s*(?:reais|real|conto|pila)?", resto)
        valor = _parse_valor(vm.group(1)) if vm else None
        desc = resto
        if vm:
            desc = (resto[:vm.start()] + " " + resto[vm.end():])
        desc = re.sub(r"(?<!\w)(no|na|nos|nas|de|do|da|em|com|pra|para|o|a|um|uma|r\$|reais|real)(?!\w)", " ", desc)
        desc = re.sub(r"\s+", " ", desc).strip()
        _ULTIMA_CONVERSA[_chave(remetente)] = time.time()
        return iniciar_lancamento(db, remetente, tipo, valor=valor if valor and valor > 0 else None,
                                  descricao=desc or None, pago=True)
    for padrao, cmd, _ in INTENCOES:
        if re.search(padrao, low):
            return "\x00" + cmd                    # vira o comando
    # não entendeu: só responde quando o assunto é dinheiro (o grupo tem outras conversas)
    if any(re.search(r"(^|[\s$])" + re.escape(p), low) for p in ASSUNTO) and len(low.split()) <= 12:
        ops = _parecidas(low)
        _abrir(remetente, "sugestao", frase=low, opcoes=[c for c, _ in ops])
        _ULTIMA_CONVERSA[_chave(remetente)] = time.time()
        nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"]
        L = ["🤔 Não entendi bem. Você quis dizer:", ""]
        L += [f"{nums[i]} {desc}" for i, (_, desc) in enumerate(ops)]
        L += ["", "_Responda o número. Eu guardo a resposta e da próxima vez já entendo._"]
        return "\n".join(L)
    return None


def _parecidas(low: str) -> list[tuple[str, str]]:
    """As opções que mais combinam com a frase (por palavras em comum)."""
    palavras = set(low.split())
    pontos = []
    for padrao, cmd, desc in INTENCOES:
        chaves = set(re.findall(r"[a-z]{4,}", padrao))
        p = sum(1 for w in palavras for c in chaves if w[:4] == c[:4])
        pontos.append((p, cmd, desc))
    pontos.sort(key=lambda x: -x[0])
    vistos, ops = set(), []
    for p, cmd, desc in pontos:
        if p and cmd not in vistos:
            ops.append((cmd, desc)); vistos.add(cmd)
        if len(ops) == 3:
            break
    for cmd, desc in OPCOES_PADRAO:
        if len(ops) >= 4:
            break
        if cmd not in vistos:
            ops.append((cmd, desc)); vistos.add(cmd)
    return ops
