#!/usr/bin/env python3
"""Verifica inputs nativos (<input>/<textarea>) sem label/aria-label.

FASE 4: reconhece agora a ASSOCIAÇÃO IMPLÍTICA — input dentro de um bloco
<label>…</label> — que é acessível segundo o HTML AAM (antes só <Label>
do shadcn/htmlFor/aria-label eram aceitos, gerando falsos positivos).
Achados restantes são reais: input visível sem qualquer rótulo.
"""
import bisect
import re
import glob

RX_INPUT = re.compile(r"<(input|textarea)\b")
RX_LABEL_ABRE = re.compile(r"<label\b")
RX_LABEL_FECHA = re.compile(r"</label\s*>")

total, sem = 0, []
for arq in sorted(glob.glob("/home/z/my-project/src/**/*.tsx", recursive=True)):
    if "/ui/" in arq:
        continue
    txt = open(arq, encoding="utf-8").read()
    if not RX_INPUT.search(txt):
        continue

    # Profundidade de <label> abertos em cada evento (abre/fecha), em ordem.
    # Componentes BION não aninham <label> — profundidade simples basta.
    eventos = sorted(
        [(m.start(), +1) for m in RX_LABEL_ABRE.finditer(txt)]
        + [(m.start(), -1) for m in RX_LABEL_FECHA.finditer(txt)]
    )
    chaves = [p for p, _ in eventos]
    profundidade_antes = []  # profundidade ANTES de processar o evento em chaves[i]
    prof = 0
    for p, delta in eventos:
        profundidade_antes.append(prof)
        prof = max(0, prof + delta)

    def labels_abertos_em(pos: int) -> int:
        """Quantos <label> estão abertos imediatamente antes de `pos`."""
        i = bisect.bisect_left(chaves, pos)
        return profundidade_antes[i] if i < len(profundidade_antes) else prof

    def fim_da_tag(pos: int) -> int:
        """Índice do '>' que fecha a tag JSX aberta em pos-1.

        JSX permite '>' dentro de expressões ({(e) => ...}) e strings —
        varre rastreando aspas e profundidade de {} () [] até achar o '>'
        real de fechamento (profundidade 0, fora de string)."""
        prof = 0
        i = pos
        quote = None
        while i < len(txt) and i - pos < 8000:
            c = txt[i]
            if quote:
                if c == "\\":
                    i += 2
                    continue
                if c == quote:
                    quote = None
            elif c in "\"'`":
                quote = c
            elif c in "{([":
                prof += 1
            elif c in "})]":
                prof = max(0, prof - 1)
            elif c == ">" and prof == 0:
                return i
            i += 1
        return min(i, pos + 8000)

    for m in RX_INPUT.finditer(txt):
        total += 1
        attrs = txt[m.start(): fim_da_tag(m.start()) + 1]
        if 'type="hidden"' in attrs or "sr-only" in attrs or "aria-label" in attrs:
            continue
        nlinha = txt[: m.start()].count("\n") + 1
        linhas = txt.split("\n")
        janela = "\n".join(linhas[max(0, nlinha - 8): nlinha + 14])
        tem_label = bool(re.search(r"<Label\b|htmlFor=|sr-only|aria-label=", janela))
        implicito = labels_abertos_em(m.start()) > 0
        if not tem_label and not implicito:
            sem.append((arq.split("src/")[-1], nlinha, attrs.strip()[:60]))

print(f"Inputs nativos totais: {total}")
print(f"Sem rótulo (real, sem associação implícita): {len(sem)}\n")
for arq, linha, attrs in sem[:30]:
    print(f"  {arq}:{linha}  {attrs}")
