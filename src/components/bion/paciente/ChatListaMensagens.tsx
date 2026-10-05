"use client";

import type { Msg } from "./chat-bion-types";

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
        <div key={i} className={`flex ${m.remetente === "usuario" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
              m.remetente === "usuario"
                ? "bp-acao rounded-3xl rounded-br-md"
                : `bp-glass rounded-3xl rounded-bl-md text-bion-ink dark:text-bion-paper ${m.tipo === "erro" ? "border-2 border-amber-500/60" : ""} ${m.tipo?.startsWith("sucesso") ? "border-2 border-emerald-500/60" : ""} ${m.tipo === "anamnese" ? "border-l-4 border-l-bion-sea dark:border-l-sky-300" : ""}`
            }`}
          >
            {m.texto.split("**").map((parte, j) =>
              j % 2 === 1 ? <strong key={j}>{parte}</strong> : <span key={j}>{parte}</span>,
            )}
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
          <div className="bp-glass px-4 py-3 rounded-3xl rounded-bl-md">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="w-2 h-2 rounded-full bg-bion-ink/40 dark:bg-white/40 motion-safe:animate-bounce"
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
