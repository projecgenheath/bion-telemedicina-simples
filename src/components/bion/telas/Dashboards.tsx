"use client";
import { useState, useEffect, useMemo } from "react";
import {
  Video,
  Clock,
  Plus,
  TrendingUp,
  Pill,
  Star,
  Check,
  Bot,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import type { View } from "@/lib/rotas";

function ContagemRegressiva({ alvo }: { alvo: number }) {
  const calcRestante = (a: number) => a - Date.now();
  const [restante, setRestante] = useState(() => Math.max(0, calcRestante(alvo)));

  useEffect(() => {
    const i = setInterval(() => setRestante(calcRestante(alvo)), 1000);
    return () => clearInterval(i);
  }, [alvo]);

  if (restante <= 0) {
    return (
      <span className="font-extrabold text-sm px-3 py-1.5 rounded-xl bg-emerald-400 text-emerald-950">
        A consulta já começou!
      </span>
    );
  }

  const totalSeg = Math.floor(restante / 1000);
  const d = Math.floor(totalSeg / 86400);
  const h = Math.floor((totalSeg % 86400) / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;

  const bloco = (v: number, r: string) => (
    <div className="flex flex-col items-center min-w-[52px]">
      <div className="text-2xl font-extrabold tabular-nums leading-none">
        {String(v).padStart(2, "0")}
      </div>
      <div className="text-xs font-bold uppercase tracking-wider opacity-75 mt-1">{r}</div>
    </div>
  );

  return (
    <div className="flex items-center gap-2">
      {d > 0 && (
        <>
          {bloco(d, d === 1 ? "dia" : "dias")}
          <div className="text-xl font-thin opacity-60 pb-3">:</div>
        </>
      )}
      {bloco(h, "horas")}
      <div className="text-xl font-thin opacity-60 pb-3">:</div>
      {bloco(m, "min")}
      <div className="text-xl font-thin opacity-60 pb-3">:</div>
      {bloco(s, "seg")}
    </div>
  );
}

export function PacienteDashboard({ go }: { go: (v: View) => void }) {
  const { sessao, consultas, documentos, lembretes, alternarLembrete } = useBion();
  const proxima = consultas.find((c) => c.status === "confirmada") ?? consultas[0];
  const totalReceitas = documentos.filter((d) => d.tipo === "receita").length;
  const totalAtestados = documentos.filter((d) => d.tipo === "atestado").length;
  const primeiroNome = sessao.nome.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Olá, {primeiroNome} 👋</h1>
        <p className="text-muted-foreground mt-1">
          Como está sua saúde hoje? Veja sua agenda e cuidados ativos.
        </p>
      </div>

      {/* Card da Próxima Consulta */}
      {proxima && (
        <div className="relative overflow-hidden rounded-3xl p-6 md:p-8 bg-primary text-primary-foreground shadow-xl">
          <div className="absolute -right-16 -bottom-16 w-64 h-64 rounded-full bg-white/10" />
          <div className="absolute -right-24 top-8 w-40 h-40 rounded-full bg-white/5" />
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/20">
                Sua Próxima Teleconsulta
              </span>
              <h2 className="text-3xl font-extrabold mt-1">{proxima.medico}</h2>
              <div className="text-sm font-medium opacity-90">
                {proxima.especialidade} • {proxima.data}, às {proxima.hora}
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <div className="text-xs font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Início da consulta em
                </div>
                <ContagemRegressiva alvo={proxima.ts} />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button"
                onClick={() => go("sala-espera")}
                className="px-6 py-3.5 rounded-2xl bg-white text-primary font-extrabold text-sm hover:bg-white/90 transition shadow-md flex items-center justify-center gap-2 active:scale-95"
              >
                <Video className="w-4 h-4" /> Entrar na Sala de Espera
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ações Rápidas */}
      <div className="grid md:grid-cols-3 gap-4">
        <button type="button"
          onClick={() => go("agendar")}
          className="bg-card border rounded-3xl p-6 text-left hover:border-primary transition shadow-sm group"
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: "var(--accent-soft)" }}
          >
            <Plus className="w-6 h-6" style={{ color: "var(--accent)" }} />
          </div>
          <div className="font-extrabold text-lg text-foreground">Agendar Consulta</div>
          <div className="text-xs text-muted-foreground mt-1">
            Especialistas com atendimento no mesmo dia
          </div>
        </button>

        <button type="button"
          onClick={() => go("bion-ia")}
          className="bg-card border rounded-3xl p-6 text-left hover:border-primary transition shadow-sm group"
        >
          <div className="w-12 h-12 rounded-2xl bg-primary-soft flex items-center justify-center mb-4 text-primary">
            <Bot className="w-6 h-6" />
          </div>
          <div className="font-extrabold text-lg text-foreground">BION Saúde IA</div>
          <div className="text-xs text-muted-foreground mt-1">
            Tire dúvidas de receitas e preparo de exames
          </div>
        </button>

        <button type="button"
          onClick={() => go("receitas")}
          className="bg-card border rounded-3xl p-6 text-left hover:border-primary transition shadow-sm group"
        >
          <div className="w-12 h-12 rounded-2xl bg-primary-soft flex items-center justify-center mb-4 text-primary">
            <Pill className="w-6 h-6" />
          </div>
          <div className="font-extrabold text-lg text-foreground">Receitas & Atestados</div>
          <div className="text-xs text-muted-foreground mt-1">
            {totalReceitas} receitas e {totalAtestados} atestados assinados
          </div>
        </button>
      </div>

      {/* Lembretes & Medicamentos Ativos */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-card border rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-extrabold text-base text-foreground flex items-center gap-2">
              <Pill className="w-4 h-4 text-primary" /> Lembretes de Medicação
            </div>
            <button type="button"
              onClick={() => go("lembretes")}
              className="text-xs font-bold text-primary hover:underline"
            >
              Ver todos
            </button>
          </div>

          <div className="space-y-2">
            {lembretes.slice(0, 3).map((l) => (
              <div
                key={l.id}
                className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition ${
                  l.feito ? "bg-muted/40 opacity-60" : "bg-card"
                }`}
              >
                <div className="min-w-0">
                  <div className={`font-bold text-xs ${l.feito ? "line-through" : ""}`}>
                    {l.titulo}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {l.horario} • {l.frequencia}
                  </div>
                </div>
                <button type="button"
                  onClick={() => alternarLembrete(l.id)}
                  className={`w-7 h-7 rounded-xl border flex items-center justify-center transition ${
                    l.feito ? "bg-emerald-500 dark:bg-emerald-600 text-white border-transparent" : "border-border"
                  }`}
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Consultas Anteriores */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-extrabold text-base text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Consultas Recentes
            </div>
            <button type="button"
              onClick={() => go("consultas")}
              className="text-xs font-bold text-primary hover:underline"
            >
              Histórico completo
            </button>
          </div>

          <div className="space-y-2.5">
            {consultas.slice(0, 3).map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-2xl bg-muted/50 border flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-foreground">{c.medico}</div>
                  <div className="text-muted-foreground">
                    {c.especialidade} • {c.data}, {c.hora}
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold capitalize bg-accent-soft text-emerald-800 dark:text-emerald-200">
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
