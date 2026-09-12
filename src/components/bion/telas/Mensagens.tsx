"use client";
import { useState } from "react";

export function Mensagens() {
  const conversas = [
    {
      n: "Dra. Ana Ribeiro",
      e: "Clínica Geral",
      m: "Seus exames estão normais 🙂",
      h: "09:12",
      nao: 2,
      on: true,
    },
    {
      n: "Dr. Carlos Mendes",
      e: "Cardiologia",
      m: "Mantenha a medicação por 30 dias.",
      h: "Ontem",
      nao: 0,
      on: false,
    },
    {
      n: "Suporte BION",
      e: "Atendimento",
      m: "Como podemos ajudar você hoje?",
      h: "Seg",
      nao: 0,
      on: true,
    },
  ];
  const [ativa, setAtiva] = useState(0);
  const [texto, setTexto] = useState("");
  const [msgs, setMsgs] = useState([
    { eu: false, t: "Olá Marina! Recebi o resultado do seu hemograma.", h: "09:05" },
    { eu: false, t: "Está tudo dentro do esperado, sem alterações importantes.", h: "09:06" },
    { eu: true, t: "Que ótimo, muito obrigada doutora!", h: "09:10" },
    {
      eu: false,
      t: "Seus exames estão normais 🙂 Lembre-se de tomar a medicação pela manhã.",
      h: "09:12",
    },
  ]);
  const enviar = () => {
    if (!texto.trim()) return;
    setMsgs((m) => [
      ...m,
      {
        eu: true,
        t: texto.trim(),
        h: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setTexto("");
  };
  const c = conversas[ativa]!;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Mensagens & Orientações</h1>
        <p className="text-muted-foreground mt-1">
          Fale diretamente com seu médico especialista entre as consultas.
        </p>
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-4 min-w-0">
        <div className="space-y-2">
          {conversas.map((k, i) => (
            <button
              key={k.n}
              onClick={() => setAtiva(i)}
              className={`w-full text-left bg-card border rounded-2xl p-3 flex items-center gap-3 transition ${
                i === ativa ? "border-primary bg-primary-soft" : "hover:border-primary"
              }`}
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
                  {k.n.split(" ")[1]?.[0] ?? k.n[0]}
                </div>
                {k.on && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card"
                    style={{ backgroundColor: "var(--accent)" }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{k.n}</div>
                <div className="text-[11px] text-muted-foreground truncate">{k.m}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">{k.h}</div>
                {k.nao > 0 && (
                  <span
                    className="inline-block mt-1 text-[10px] font-bold text-primary-foreground rounded-full px-1.5"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    {k.nao}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="bg-card border rounded-3xl flex flex-col min-h-[460px] min-w-0 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b bg-muted/40">
            <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
              {c.n.split(" ")[1]?.[0] ?? c.n[0]}
            </div>
            <div>
              <div className="text-xs font-bold">{c.n}</div>
              <div className="text-[11px] text-muted-foreground">
                {c.e} • {c.on ? "Online" : "Offline"}
              </div>
            </div>
          </div>

          <div className="flex-1 p-4 space-y-3 overflow-y-auto">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.eu ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs shadow-xs ${
                    m.eu
                      ? "bg-primary text-primary-foreground rounded-tr-xs"
                      : "bg-muted text-foreground rounded-tl-xs"
                  }`}
                >
                  <p className="leading-relaxed">{m.t}</p>
                  <div
                    className={`text-[10px] mt-1 text-right ${m.eu ? "opacity-75" : "text-muted-foreground"}`}
                  >
                    {m.h}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t bg-card flex items-center gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") enviar();
              }}
              placeholder="Escreva sua mensagem..."
              className="flex-1 bg-muted rounded-2xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              onClick={enviar}
              className="px-5 py-2.5 rounded-2xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition"
            >
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
