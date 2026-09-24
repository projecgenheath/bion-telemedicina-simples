#!/usr/bin/env python3
"""Resolve conflitos do llm.ts: hunk 1 = lado remoto (política P2), demais = HEAD."""
import re

CAMINHO = "/home/z/my-project/src/lib/server/llm.ts"

with open(CAMINHO, encoding="utf-8") as f:
    texto = f.read()

padrao = re.compile(r"<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> [0-9a-f]+\n", re.DOTALL)
hunks = list(padrao.finditer(texto))
assert len(hunks) == 6, f"esperado 6 hunks, achei {len(hunks)}"

saida, fim = [], 0
for i, h in enumerate(hunks):
    saida.append(texto[fim:h.start()])
    escolha = h.group(2) if i == 0 else h.group(1)  # hunk 1 = remoto; demais = HEAD
    saida.append(escolha)
    fim = h.end()
saida.append(texto[fim:])

with open(CAMINHO, "w", encoding="utf-8") as f:
    f.write("".join(saida))
print("llm.ts resolvido: hunk 1 (público opt-in) = remoto; hunks 2-6 = HEAD")
