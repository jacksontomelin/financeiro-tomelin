"""Conversa no grupo: o sistema pergunta o que falta, entende frases e aprende."""
import re
from datetime import date

from app import models, whatsapp

NUM = {"1️⃣": 1, "2️⃣": 2, "3️⃣": 3, "4️⃣": 4, "5️⃣": 5, "6️⃣": 6, "7️⃣": 7, "8️⃣": 8, "9️⃣": 9}


def _diz(db, texto, quem):
    return whatsapp.processar_comando(texto, db, remetente=quem) or ""


def _opcao(resposta, trecho):
    """Número da opção cuja linha contém o trecho."""
    for linha in resposta.splitlines():
        if trecho in linha:
            for emo, n in NUM.items():
                if linha.startswith(emo):
                    return str(n)
    raise AssertionError(f"opção '{trecho}' não está em:\n{resposta}")


def _ultimo(db):
    db.expire_all()
    return db.query(models.Lancamento).order_by(models.Lancamento.id.desc()).first()


def test_despesa_passo_a_passo(db):
    q = "5547900000001"
    assert "Qual o valor" in _diz(db, "despesa", q)
    assert "de quê" in _diz(db, "89,90", q)
    assert "categoria" in _diz(db, "farmácia do bairro", q).lower()
    assert "Já foi pago" in _diz(db, "0", q)
    r = _diz(db, "2", q)
    assert "Pronto, lancei" in r
    l = _ultimo(db)
    assert float(l.valor) == 89.90 and l.descricao == "Farmácia Do Bairro" and l.data_pagamento is None


def test_frase_do_dia_a_dia_e_categoria_aprendida(db, api):
    q = "5547900000002"
    api.post("/api/categorias", json={"nome": "Bichos Teste", "tipo": "despesa"})
    r = _diz(db, "gastei 40 reais na ração do cachorro", q)
    assert "categoria" in r.lower() or "Acho que é" in r
    r = _diz(db, "bichos teste", q)                    # escreve o nome da categoria
    assert "Pronto, lancei" in r and "pago hoje" in r
    l = _ultimo(db)
    assert float(l.valor) == 40 and l.data_pagamento == date.today() and "Ração" in l.descricao
    cat_id = l.categoria_id
    # da segunda vez já sugere a categoria aprendida
    r = _diz(db, "gastei 25 ração", q)
    assert "Acho que é *Bichos Teste*" in r
    assert "Pronto, lancei" in _diz(db, "sim", q)
    assert _ultimo(db).categoria_id == cat_id


def test_baixa_escolhendo_da_lista(db, api):
    q = "5547900000003"
    l = api.post("/api/lancamentos", json={"descricao": "Conta de gás conversa", "tipo": "despesa", "valor": "77",
                                           "data_vencimento": "2020-01-01"}).json()
    r = _diz(db, "baixa", q)
    assert "Qual você pagou" in r
    r = _diz(db, _opcao(r, "Conta de gás conversa"), q)
    assert "Baixa registrada" in r
    db.expire_all()
    assert db.get(models.Lancamento, l["id"]).data_pagamento is not None


def test_comando_completo_oferece_baixa(db):
    q = "5547900000004"
    r = _diz(db, "despesa 150 mercado conversa", q)
    assert "Já pagou? Responda *sim*" in r
    lid = int(re.search(r"#(\d+):", r).group(1))
    assert "Baixa registrada" in _diz(db, "sim", q)
    db.expire_all()
    assert db.get(models.Lancamento, lid).data_pagamento is not None


def test_aprende_frase_nova(db):
    q = "5547900000005"
    r = _diz(db, "como anda meu dinheiro", q)
    assert "Não entendi bem" in r
    r = _diz(db, _opcao(r, "saldo"), q)
    assert "Anotado" in r and "Contas" in r
    # da próxima vez entende direto
    r = _diz(db, "como anda meu dinheiro", q)
    assert "Contas" in r and "Não entendi" not in r
    assert "como anda meu dinheiro" in _diz(db, "o que você aprendeu", q)
    assert "esqueci" in _diz(db, "esquecer como anda meu dinheiro", q)


def test_conversa_da_familia_nao_e_respondida(db):
    q = "5547900000006"
    assert _diz(db, "vamos almoçar na vó amanhã?", q) == ""
    assert _diz(db, "kkkkk", q) == ""


def test_saudacao_com_opcoes_e_cancelar(db):
    q = "5547900000007"
    r = _diz(db, "bom dia", q)
    assert "Como posso ajudar" in r
    assert "Contas" in _diz(db, "1", q)               # 1 = ver o saldo
    assert "Qual o valor" in _diz(db, "receita", q)
    assert "Cancelado" in _diz(db, "cancelar", q)


def test_entende_perguntas(db):
    q = "5547900000008"
    assert "Contas" in _diz(db, "quanto eu tenho?", q)
    assert _diz(db, "o que vence hoje", q)
