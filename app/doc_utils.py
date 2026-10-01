"""Validação de CPF e CNPJ (dígito verificador)."""
import re


def limpar(doc: str) -> str:
    return re.sub(r"\D", "", doc or "")


def valida_cpf(cpf: str) -> bool:
    c = limpar(cpf)
    if len(c) != 11 or c == c[0] * 11:
        return False
    for i in (9, 10):
        soma = sum(int(c[n]) * ((i + 1) - n) for n in range(i))
        dv = (soma * 10) % 11
        dv = 0 if dv == 10 else dv
        if dv != int(c[i]):
            return False
    return True


def valida_cnpj(cnpj: str) -> bool:
    c = limpar(cnpj)
    if len(c) != 14 or c == c[0] * 14:
        return False
    pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    pesos2 = [6] + pesos1
    for pesos, pos in ((pesos1, 12), (pesos2, 13)):
        soma = sum(int(c[i]) * pesos[i] for i in range(pos))
        resto = soma % 11
        dv = 0 if resto < 2 else 11 - resto
        if dv != int(c[pos]):
            return False
    return True


def valida_documento(doc: str) -> tuple[bool, str]:
    """Retorna (válido, tipo): tipo é 'cpf', 'cnpj' ou ''."""
    c = limpar(doc)
    if not c:
        return True, ""          # vazio é permitido
    if len(c) == 11:
        return valida_cpf(c), "cpf"
    if len(c) == 14:
        return valida_cnpj(c), "cnpj"
    return False, ""


def formatar(doc: str) -> str:
    c = limpar(doc)
    if len(c) == 11:
        return f"{c[:3]}.{c[3:6]}.{c[6:9]}-{c[9:]}"
    if len(c) == 14:
        return f"{c[:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:]}"
    return doc or ""
