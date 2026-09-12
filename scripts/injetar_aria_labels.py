#!/usr/bin/env python3
"""v3 — Injeta aria-label de forma SEGURA.
- Coleta todos os edits num único scan e aplica em ordem REVERSA de posição
  (posições nunca deslocam → zero corrupção).
- Parser de fim de tag string-aware (arrow functions => não quebram).
- Cadeia de fontes: aria existente → dentro de <label> → texto de <label>
  imediato (sem código) → MAPA semântico por value={var} → placeholder →
  type=file → value={busca} → pix readOnly.
"""
import re
import glob

MAPA = {
    "senha": "Senha", "confirmaSenha": "Confirmar senha",
    "identificador": "E-mail ou CPF",
    "anotacoes": "Anotações da consulta", "chatInput": "Mensagem no chat da consulta",
    "recMedicamento": "Medicamento e dosagem", "recDuracao": "Duração da receita",
    "recPosologia": "Posologia (modo de usar)", "recObs": "Observações ao paciente",
    "atestDias": "Dias de afastamento", "atestCid": "CID-10",
    "atestObs": "Justificativa e recomendações",
    "exameNome": "Exame solicitado", "exameObs": "Instruções de preparo",
    "titulo": "Título da receita", "medicamento": "Medicamento e dosagem",
    "posologia": "Posologia (modo de usar)", "duracao": "Duração",
    "conteudo": "Conteúdo da receita", "observacoes": "Observações",
    "email": "E-mail", "telefone": "Telefone", "convenio": "Convênio",
    "peso": "Peso (kg)", "altura": "Altura (cm)", "novaAlergia": "Nova alergia",
    "especialidade": "Especialidade", "crm": "CRM",
    "valor": "Valor da consulta (R$)", "bio": "Bio do médico",
    "formacao": "Formação", "nome": "Nome do médico",
    "cartaoNumero": "Número do cartão", "cartaoNome": "Nome impresso no cartão",
    "cartaoValidade": "Validade (MM/AA)", "cartaoCVV": "CVV do cartão",
    "novoAssunto": "Assunto do chamado", "novaMensagem": "Descrição do problema",
    "entrada": "Sua pergunta para a BION IA", "texto": "Mensagem",
    "comentario": "Comentário da avaliação", "motivo": "Motivo do cancelamento",
    "busca": "Buscar", "novaSenha": "Nova senha",
}

RX_TAG = re.compile(r"<(input|textarea)\b")
RX_TEM_ARIA = re.compile(r"aria-label=")
RX_LABEL_TXT = re.compile(r"<label\b[^>]*>([\s\S]*?)</label>", re.I)
RX_PLACEHOLDER = re.compile(r"placeholder=\"([^\"]*)\"")
RX_VALUE_VAR = re.compile(r"value=\{(\w+)")
RX_TYPE = re.compile(r'type="(\w+)"')
RX_CODIGO = re.compile(r"[=>{}()<>;$]|=>|\.\w")


def fim_da_tag(txt: str, ini: int) -> int:
    i, aspas = ini, None
    while i < len(txt):
        c = txt[i]
        if aspas:
            if c == aspas:
                aspas = None
        elif c in "\"'`":
            aspas = c
        elif c == ">":
            return i
        i += 1
    return -1


def limpar(t: str) -> str:
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t).strip().rstrip(":").strip()


def texto_valido(t: str) -> bool:
    return bool(t) and len(t) <= 60 and not RX_CODIGO.search(t) and bool(re.search(r"[A-Za-zÀ-ú0-9]", t))


arquivos = sorted(
    set(glob.glob("/home/z/my-project/src/components/bion/**/*.tsx", recursive=True))
    | set(glob.glob("/home/z/my-project/src/app/**/*.tsx", recursive=True))
)
arquivos = [a for a in arquivos if "/ui/" not in a]

total_inj, pendentes, dentro_label_n = 0, [], 0
for arq in arquivos:
    txt = open(arq, encoding="utf-8").read()
    edits = []  # (pos, fim_tag_nome, aria)
    for m in RX_TAG.finditer(txt):
        fim = fim_da_tag(txt, m.start())
        if fim == -1:
            continue
        corpo = txt[m.start(): fim + 1]
        if RX_TEM_ARIA.search(corpo):
            continue
        antes = txt[: m.start()]

        # input dentro de <label> envolvente → já associado
        aberturas = [l.end() for l in re.finditer(r"<label\b[^>]*>", antes, re.I)]
        if aberturas and "</label>" not in antes[aberturas[-1]:]:
            dentro_label_n += 1
            continue

        aria, origem = None, None

        # 1) label imediato válido
        texto_label, ultimo_fim = None, None
        for lt in RX_LABEL_TXT.finditer(antes):
            texto_label, ultimo_fim = limpar(lt.group(1)), lt.end()
        if (
            texto_label and ultimo_fim
            and (m.start() - ultimo_fim) <= 400
            and texto_valido(texto_label)
        ):
            aria, origem = texto_label, "label"

        # 2) MAPA por value={var}
        if not aria:
            mv = RX_VALUE_VAR.search(corpo)
            if mv and mv.group(1) in MAPA:
                aria, origem = MAPA[mv.group(1)], f"mapa:{mv.group(1)}"

        # 3) placeholder
        if not aria:
            mp = RX_PLACEHOLDER.search(corpo)
            if mp:
                p = mp.group(1).split(" (")[0].strip()
                if texto_valido(p):
                    aria, origem = p, "placeholder"

        # 4) type=file
        if not aria:
            mt = RX_TYPE.search(corpo)
            if mt and mt.group(1) == "file":
                aria, origem = "Anexar arquivo", "file"

        # 5) PIX readOnly
        if not aria and "readOnly" in corpo and "000201" in corpo:
            aria, origem = "Chave Pix para copiar", "pix"

        if not aria:
            rel = arq.split("src/")[-1]
            pendentes.append((rel, antes.count("\n") + 1, corpo[:60].replace("\n", " ")))
            continue

        edits.append((m.start(), m.end(), aria.replace('"', "'"), origem))

    if not edits:
        continue
    # aplicar em ordem REVERSA → posições anteriores intactas
    for pos, fim_tag, aria, origem in sorted(edits, key=lambda e: -e[0]):
        tag_nome = txt[pos: fim_tag]  # ex.: "<input"
        novo = f'{tag_nome}\n                  aria-label="{aria}"'
        txt = txt[:pos] + novo + txt[fim_tag:]
        total_inj += 1
    open(arq, "w", encoding="utf-8").write(txt)
    resumo = ", ".join(f"{o}:{a[:28]}" for _, _, a, o in sorted(edits, key=lambda e: e[0]))
    print(f"  {arq.split('src/')[-1]}: {len(edits)} → {resumo}")

print(f"\nTotal injetado: {total_inj}")
print(f"Já associados (dentro de label): {dentro_label_n}")
print(f"Pendentes (sem fonte confiável): {len(pendentes)}")
for p in pendentes:
    print(f"  {p[0]}:{p[1]} | {p[2]}")
