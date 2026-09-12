#!/usr/bin/env python3
"""Normaliza a diretiva "use client": exatamente uma no topo de cada página."""
import glob

alvo = glob.glob("src/app/(app)/*/page.tsx") + ["src/app/page.tsx", "src/app/entrar/page.tsx", "src/app/not-found.tsx"]
for caminho in alvo:
    with open(caminho) as f:
        linhas = f.readlines()
    tem = any(l.strip().replace("'", '"') == '"use client";' for l in linhas)
    corpo = [l for l in linhas if l.strip().replace("'", '"') not in ('"use client";', '"use client"')]
    # remove linhas em branco iniciais do corpo
    while corpo and corpo[0].strip() == "":
        corpo.pop(0)
    novo = '"use client";\n\n' + "".join(corpo)
    with open(caminho, "w") as f:
        f.write(novo)
    status = "normalizada" if tem else '"use client" ADICIONADA'
    print(f"✓ {caminho}: {status}")
