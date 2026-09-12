#!/usr/bin/env python3
"""Verifica inputs nativos (<input>/<textarea>) sem label/aria-label."""
import re, glob

RX_INPUT = re.compile(r"<(input|textarea)\b([^>]*?)(/?)>", re.S)

total, sem = 0, []
for arq in sorted(glob.glob("/home/z/my-project/src/**/*.tsx", recursive=True)):
    if "/ui/" in arq:
        continue
    txt = open(arq, encoding="utf-8").read()
    for m in RX_INPUT.finditer(txt):
        total += 1
        attrs = m.group(2)
        if 'type="hidden"' in attrs or "className" in attrs and "sr-only" in attrs:
            pass
        nlinha = txt[: m.start()].count("\n") + 1
        linhas = txt.split("\n")
        janela = "\n".join(linhas[max(0, nlinha - 8): nlinha + 14])
        tem_label = bool(re.search(r"<Label|htmlFor=|aria-label=|sr-only", janela))
        if not tem_label:
            sem.append((arq.split("src/")[-1], nlinha, attrs.strip()[:60]))

print(f"Inputs nativos totais: {total}")
print(f"Sem Label/aria-label/sr-only na vizinhança: {len(sem)}\n")
for arq, linha, attrs in sem[:30]:
    print(f"  {arq}:{linha}  {attrs}")
