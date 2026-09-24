#!/usr/bin/env python3
"""FASE 3 (auditoria front) — troca hexes de marca hardcoded por tokens bion-*.

Substitui APENAS formas seguras:
  1. Classes Tailwind com valor arbitrário:  `-[#0a1f44]` -> `-bion-ink`
     (funciona para text-/bg-/border-/from-/via-/to-/shadow- e preserva
     modificadores de opacidade, pois só o hex dentro dos colchetes muda).
  2. Props JS de gráficos: `cor: "#123e7d"` -> `cor: "var(--bion-sea)"`.
  3. constantes.ts: remove o export morto AZUL_MARINHO (sem consumidores).
"""
import re
import pathlib

RAIZ = pathlib.Path("/home/z/my-project/src/components/bion/paciente")

CLASSES = {
    "#0a1f44": "bion-ink",
    "#f2f6fc": "bion-paper",
    "#123e7d": "bion-sea",
    "#14457f": "bion-deep",
    "#9ac1f4": "bion-sky",
    "#0b1424": "bion-night",
    "#c2410c": "bion-alerta",
}

JS_PROPS = {
    "#123e7d": "var(--bion-sea)",
    "#9ac1f4": "var(--bion-sky)",
    "#c2410c": "var(--bion-alerta)",
}

total = 0
for arq in sorted(RAIZ.iterdir()):
    if arq.suffix not in {".tsx", ".ts"}:
        continue
    txt = arq.read_text(encoding="utf-8")
    original = txt

    # 1) classes Tailwind `-[#hex]`
    for hexv, token in CLASSES.items():
        txt, n = re.subn(rf"-\[{re.escape(hexv)}\]", f"-{token}", txt)
        total += n

    # 2) props JS `cor: "#hex"`
    for hexv, var_ in JS_PROPS.items():
        txt, n = re.subn(rf'cor: "{re.escape(hexv)}"', f'cor: "{var_}"', txt)
        total += n

    # 3) export morto em constantes.ts
    if arq.name == "constantes.ts":
        txt, n = re.subn(r'\nexport const AZUL_MARINHO = "[^"]+";\n', "\n", txt)
        total += n

    if txt != original:
        arq.write_text(txt, encoding="utf-8")
        restantes = len(re.findall(r"#[0-9a-fA-F]{6}\b", txt))
        print(f"{arq.name}: atualizado (hex restantes: {restantes})")

print(f"\nSubstituições totais: {total}")
# Verificação: nenhum hex deve sobrar nos componentes do paciente
sobras = []
for arq in sorted(RAIZ.iterdir()):
    if arq.suffix in {".tsx", ".ts"}:
        for i, linha in enumerate(arq.read_text(encoding="utf-8").split("\n"), 1):
            if re.search(r"#[0-9a-fA-F]{6}\b", linha):
                sobras.append(f"{arq.name}:{i}: {linha.strip()[:90]}")
print("SOBRAS:" if sobras else "ZERO hex hardcoded restante.")
for s in sobras:
    print(" ", s)
