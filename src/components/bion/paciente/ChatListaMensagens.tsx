"use client";

import type { Msg } from "./chat-bion-types";
import { BlocoRaciocinio } from "../BlocoRaciocinio";

export function ChatListaMensagens({
  mensagens,
  pensando,
  segundosEspera = 0,
}: {
  mensagens: Msg[];
  pensando: boolean;
  segundosEspera?: number;
}) {
  return (
    <>
      {mensagens.map((m, i) => (
        <div key={i} className={`bion-surgir flex ${m.remetente === "usuario" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
              m.remetente === "usuario"
                ? "bpp-bolha-eu bp-acao rounded-3xl rounded-br-md"
                : `bpp-bolha-ia bp-glass rounded-3xl rounded-bl-md text-bion-ink dark:text-bion-paper ${m.tipo === "erro" ? "border-2 border-amber-500/60" : ""} ${m.tipo?.startsWith("sucesso") ? "border-2 border-emerald-500/60" : ""} ${m.tipo === "anamnese" ? "border-l-4 border-l-bion-sea dark:border-l-[#FFC169]" : ""}`
            }`}
          >
            {m.texto.split("**").map((parte, j) =>
              j % 2 === 1 ? <strong key={j}>{parte}</strong> : <span key={j}>{parte}</span>,
            )}
            {m.remetente === "ia" && <BlocoRaciocinio raciocinio={m.raciocinio} />}
            {m.remetente === "ia" && m.fonte === "gemini" && (
              <div className="text-xs mt-2 opacity-70" aria-hidden="true">
                {/gemma/i.test(m.modelo ?? "") ? "Gemma 4 26B" : "Gemini"}
              </div>
            )}
          </div>
        </div>
      ))}

      {pensando && (
        <div className="flex justify-start" aria-live="polite" aria-label="BION está digitando">
          <div className="bp-glass bpp-animar px-4 py-3 rounded-3xl rounded-bl-md">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="bpp-dot-digitando"
                    style={{ animationDelay: `${d * 0.15}s` }}
                  />
                ))}
              </div>
              <span className="text-xs opacity-80">
                {segundosEspera > 2 ? `Pensando… ${segundosEspera}s` : "Digitando…"}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
