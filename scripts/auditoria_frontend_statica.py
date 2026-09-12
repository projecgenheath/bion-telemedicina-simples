#!/usr/bin/env python3
"""Auditoria estática de front-end — BION Telemedicina.
Dimensões: acessibilidade, padrões React, consistência UX, performance.
"""
import re
import glob
import os

RAIZ = "/home/z/my-project/src"
ACHADOS = []  # (severidade, dimensão, arquivo, linha, descrição)

def adicionar(sev, dim, arq, linha, desc):
    ACHADOS.append((sev, dim, arq.replace(RAIZ + "/", ""), linha, desc))

arquivos = sorted(
    glob.glob(f"{RAIZ}/**/*.tsx", recursive=True)
    + glob.glob(f"{RAIZ}/**/*.ts", recursive=True)
)

# Padrões
RX_BTN = re.compile(r"<Button\b", re.S)
RX_ICON_BTN = re.compile(
    r'<Button\b([^>]*)>(.*?)</Button>', re.S
)
RX_ONCLICK_DIV = re.compile(r"<(div|span|li|tr)[^>]*onClick", re.S)
RX_INPUT = re.compile(r"<(Input|Textarea)\b([^>]*)/?>", re.S)
RX_DIALOG_CONTENT = re.compile(r"<(DialogContent|SheetContent|DrawerContent)\b", re.S)
RX_DIALOG_TITLE = re.compile(r"<(DialogTitle|SheetTitle|DrawerTitle)\b")
RX_LABEL_FOR = re.compile(r"htmlFor=|aria-label=|<Label")
RX_PLACEHOLDER_ONLY = re.compile(r"<Input\b[^>]*placeholder=")
RX_HARDCODED_COLOR = re.compile(r"#(?:[0-9a-fA-F]{3}){1,2}\b")
RX_MOTION_DIV = re.compile(r"animate-[\w-]+")

# Icones lucide comuns usados em botões
RX_ICONE = re.compile(
    r"<([A-Z][A-Za-z0-9]*)\s+className=\"[^\"]*(w-4|h-4|w-5|h-5|size-4|size-5)", re.S
)

stats = {
    "icon_btn_total": 0,
    "icon_btn_sem_label": 0,
    "inputs_total": 0,
    "inputs_sem_label": 0,
    "onclick_div": 0,
    "dialogs_sem_title": 0,
    "cores_hardcoded": 0,
}

for arq in arquivos:
    if "/ui/" in arq:  # shadcn primitives — não auditar internos
        continue
    try:
        txt = open(arq, encoding="utf-8").read()
    except Exception:
        continue
    rel = arq
    linhas = txt.split("\n")

    # 1) Botões icon-only sem aria-label
    for m in RX_ICON_BTN.finditer(txt):
        attrs, conteudo = m.group(1), m.group(2)
        tem_texto = bool(re.search(r">\s*[\wÀ-ú]", re.sub(r"<[^>]+>", ">", conteudo)))
        if tem_texto:
            continue
        # botão só com ícone(s)
        if "<" in conteudo and not tem_texto:
            stats["icon_btn_total"] += 1
            if "aria-label" not in attrs and "aria-label" not in conteudo:
                stats["icon_btn_sem_label"] += 1
                nlinha = txt[: m.start()].count("\n") + 1
                adicionar(
                    "MEDIA", "A11Y", rel, nlinha,
                    "Botão só-ícone sem aria-label (leitor de tela lê vazio)",
                )

    # 2) Inputs sem label associado
    for m in RX_INPUT.finditer(txt):
        attrs = m.group(2)
        stats["inputs_total"] += 1
        nlinha = txt[: m.start()].count("\n") + 1
        janela = "\n".join(linhas[max(0, nlinha - 6): nlinha + 2])
        if (
            "aria-label" not in attrs
            and not re.search(r"htmlFor=|<Label", janela)
        ):
            stats["inputs_sem_label"] += 1
            adicionar(
                "MEDIA", "A11Y", rel, nlinha,
                "Input sem <Label htmlFor> nem aria-label",
            )

    # 3) onClick em elemento não-interativo
    for m in RX_ONCLICK_DIV.finditer(txt):
        stats["onclick_div"] += 1
        nlinha = txt[: m.start()].count("\n") + 1
        snippet = txt[m.start(): m.start() + 80].replace("\n", " ")
        if "role=" not in snippet and "button" not in snippet:
            adicionar(
                "MEDIA", "A11Y", rel, nlinha,
                f"onClick em elemento não-interativo sem role/tabIndex: {snippet[:60]}",
            )

    # 4) Dialog/Sheet sem Title (warning Radix no console)
    tem_content = RX_DIALOG_CONTENT.search(txt)
    if tem_content and not RX_DIALOG_TITLE.search(txt):
        stats["dialogs_sem_title"] += 1
        nlinha = txt[: tem_content.start()].count("\n") + 1
        adicionar(
            "ALTA", "A11Y", rel, nlinha,
            "Dialog/Sheet/Drawer sem Title → warning Radix + leitor de tela sem contexto",
        )

    # 5) Cores hardcoded fora do design system
    for m in RX_HARDCODED_COLOR.finditer(txt):
        nlinha = txt[: m.start()].count("\n") + 1
        if "svg" in txt[max(0, txt.rfind("\n", 0, m.start() - 200)): m.start()].lower():
            continue
        stats["cores_hardcoded"] += 1
        adicionar(
            "BAIXA", "UX-CONSISTÊNCIA", rel, nlinha,
            f"Cor hardcoded {m.group(0)} fora do design system (tema claro/escuro quebra)",
        )

# Resumo por dimensão
print("=" * 70)
print("AUDITORIA ESTÁTICA — BION FRONT-END")
print("=" * 70)
print(f"\nArquivos analisados: {len(arquivos)}")
print(f"\nSTATS:")
print(f"  Botões icon-only: {stats['icon_btn_total']} | sem aria-label: {stats['icon_btn_sem_label']}")
print(f"  Inputs: {stats['inputs_total']} | sem label: {stats['inputs_sem_label']}")
print(f"  onClick em não-interativos: {stats['onclick_div']}")
print(f"  Dialogs sem Title: {stats['dialogs_sem_title']}")
print(f"  Cores hardcoded: {stats['cores_hardcoded']}")

sev_ordem = {"ALTA": 0, "MEDIA": 1, "BAIXA": 2}
ACHADOS.sort(key=lambda a: (sev_ordem[a[0]], a[1], a[2]))

print(f"\n{'SEV':<6} {'DIM':<16} {'LOCAL':<42} DEScriÇÃO")
print("-" * 130)
for sev, dim, arq, linha, desc in ACHADOS:
    print(f"{sev:<6} {dim:<16} {arq.split('src/')[-1]}:{linha:<5} {desc[:70]}")

from collections import Counter
c = Counter((a[0], a[1]) for a in ACHADOS)
print("\nRESUMO:")
for (sev, dim), n in sorted(c.items()):
    print(f"  {sev:<6} {dim:<18} {n}")
print(f"\nTOTAL DE ACHADOS: {len(ACHADOS)}")
