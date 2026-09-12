"use client";
import { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  Video,
  FileText,
  Stethoscope,
  Clock,
  ChevronRight,
  Plus,
  Users,
  TrendingUp,
  Pill,
  Star,
  Check,
  Heart,
  LifeBuoy,
  Bot,
  FileSearch,
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
      <div className="text-[9px] font-bold uppercase tracking-wider opacity-75 mt-1">{r}</div>
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
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-80 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Início da consulta em
                </div>
                <ContagemRegressiva alvo={proxima.ts} />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
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
        <button
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

        <button
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

        <button
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
            <button
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
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {l.horario} • {l.frequencia}
                  </div>
                </div>
                <button
                  onClick={() => alternarLembrete(l.id)}
                  className={`w-7 h-7 rounded-xl border flex items-center justify-center transition ${
                    l.feito ? "bg-emerald-500 text-white border-transparent" : "border-border"
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
            <button
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
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold capitalize bg-accent-soft text-emerald-700">
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

/* ---------- Médico Dashboard ---------- */
export function MedicoDashboard({ go }: { go: (v: View) => void }) {
  const { sessao, consultas, avaliacoes } = useBion();
  const consultasHoje = consultas.filter((c) => c.data === "Hoje");
  const mediaNotas = avaliacoes.length
    ? (avaliacoes.reduce((s, a) => s + a.nota, 0) / avaliacoes.length).toFixed(1)
    : "4.9";

  const faturamentoMes = useMemo(() => {
    const umMesAtras = Date.now() - 30 * 86400000;
    const total = consultas
      .filter((c) => c.ts >= umMesAtras && c.status === "concluida")
      .reduce((s, c) => s + (Number((c.valor ?? "").replace(/\D/g, "")) || 0), 0);
    const base = 18000;
    return `R$ ${(base + total).toLocaleString("pt-BR")}`;
  }, [consultas]);

  const pacientesUnicos = useMemo(
    () => 140 + new Set(consultas.map((c) => c.paciente)).size,
    [consultas],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Bom dia, {sessao.nome} 🩺</h1>
          <p className="text-muted-foreground mt-1">
            Sua agenda de teleatendimentos está sincronizada para hoje.
          </p>
        </div>
        <button
          onClick={() => go("consulta")}
          className="px-6 py-3.5 rounded-2xl font-extrabold text-sm text-primary-foreground shadow-md hover:opacity-90 transition flex items-center gap-2 self-start sm:self-auto"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <Video className="w-4 h-4" /> Iniciar Atendimento
        </button>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-3xl p-5 shadow-sm">
          <div className="w-10 h-10 rounded-2xl bg-primary-soft flex items-center justify-center text-primary mb-3">
            <Calendar className="w-5 h-5" />
          </div>
          <div className="text-2xl font-extrabold">{consultasHoje.length || 2}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Consultas hoje</div>
        </div>

        <div className="bg-card border rounded-3xl p-5 shadow-sm">
          <div className="w-10 h-10 rounded-2xl bg-accent-soft flex items-center justify-center text-emerald-700 mb-3">
            <Users className="w-5 h-5" />
          </div>
          <div className="text-2xl font-extrabold">{pacientesUnicos}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Pacientes atendidos</div>
        </div>

        <div className="bg-card border rounded-3xl p-5 shadow-sm">
          <div className="w-10 h-10 rounded-2xl bg-primary-soft flex items-center justify-center text-primary mb-3">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="text-2xl font-extrabold">{faturamentoMes}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Faturamento do mês</div>
        </div>

        <div className="bg-card border rounded-3xl p-5 shadow-sm">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center text-amber-600 mb-3">
            <Star className="w-5 h-5 fill-amber-500" />
          </div>
          <div className="text-2xl font-extrabold">{mediaNotas}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Média de avaliações</div>
        </div>
      </div>

      {/* Próximo Paciente & Agenda */}
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-card border rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-extrabold text-base text-foreground">
                Próximo Paciente em Espera
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-accent-soft text-emerald-700">
                Na Sala Virtual
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-muted/60 border">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xl shadow-sm">
                  MS
                </div>
                <div>
                  <h3 className="font-bold text-base">Marina Silva</h3>
                  <p className="text-xs text-muted-foreground">32 anos • Teleconsulta de Retorno</p>
                  <p className="text-xs text-primary font-medium mt-0.5">
                    Motivo: Revisão de exames e pressão
                  </p>
                </div>
              </div>

              <button
                onClick={() => go("consulta")}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow hover:opacity-90 transition"
              >
                Abrir Sala & Prontuário
              </button>
            </div>
          </div>

          <div className="bg-card border rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-extrabold text-base text-foreground">Agenda do Dia</div>
              <button
                onClick={() => go("consultas")}
                className="text-xs font-bold text-primary hover:underline"
              >
                Ver calendário
              </button>
            </div>

            <div className="space-y-2">
              {[
                { h: "14:30", p: "Marina Silva", m: "Retorno de rotina", now: true },
                { h: "15:15", p: "João Pereira", m: "Primeira consulta de check-up", now: false },
                { h: "16:00", p: "Beatriz Costa", m: "Avaliação de cefaleia", now: false },
                { h: "17:00", p: "Rafael Santos", m: "Renovação de receita", now: false },
              ].map((a, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border text-xs ${
                    a.now
                      ? "bg-primary-soft border-primary/40 font-semibold text-primary"
                      : "bg-card"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold w-12">{a.h}</span>
                    <div>
                      <div className="text-foreground font-bold">{a.p}</div>
                      <div className="text-muted-foreground text-[11px]">{a.m}</div>
                    </div>
                  </div>
                  {a.now ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold">
                      Agora
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-[11px]">Confirmado</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Ações e Copilot Lateral */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-card border rounded-3xl p-6 shadow-sm space-y-4">
            <div className="font-extrabold text-base text-foreground">Ferramentas Rápidas</div>
            <div className="space-y-2">
              <button
                onClick={() => go("bion-ia")}
                className="w-full p-3.5 rounded-2xl bg-muted/60 hover:bg-muted border text-left transition flex items-center justify-between text-xs font-bold"
              >
                <span className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" /> BION Copilot IA
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>

              <button
                onClick={() => go("avaliacoes")}
                className="w-full p-3.5 rounded-2xl bg-muted/60 hover:bg-muted border text-left transition flex items-center justify-between text-xs font-bold"
              >
                <span className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" /> Minhas Avaliações
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>

              <button
                onClick={() => go("receitas")}
                className="w-full p-3.5 rounded-2xl bg-muted/60 hover:bg-muted border text-left transition flex items-center justify-between text-xs font-bold"
              >
                <span className="flex items-center gap-2">
                  <Pill className="w-4 h-4 text-primary" /> Prescrição Rápida
                </span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Admin Dashboard ---------- */
export function AdminDashboard({ go }: { go: (v: View) => void }) {
  const { medicos, tickets, auditLogs } = useBion();
  const medicosAtivos = medicos.filter((m) => m.status === "ativo").length;
  const medicosPendentes = medicos.filter((m) => m.status === "pendente").length;
  const ticketsAbertos = tickets.filter((t) => t.status !== "resolvido").length;
  const eventos24h = auditLogs.filter((l) => Date.now() - l.ts < 86400000).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Painel Administrativo BION 🛡️</h1>
          <p className="text-muted-foreground mt-1">
            Visão geral em tempo real da operação, médicos e faturamento.
          </p>
        </div>
        <button
          onClick={() => go("relatorios")}
          className="px-6 py-3 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow hover:opacity-90 transition flex items-center gap-2"
        >
          <FileText className="w-4 h-4" /> Emitir Relatórios & PDF
        </button>
      </div>

      {/* Grid de Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-card border rounded-3xl p-4 shadow-sm">
          <div className="text-xs text-muted-foreground font-medium">Médicos Ativos</div>
          <div className="text-2xl font-extrabold text-primary mt-1">{medicosAtivos}</div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5">CRM 100% verificado</div>
        </div>

        <div className="bg-card border rounded-3xl p-4 shadow-sm">
          <div className="text-xs text-muted-foreground font-medium">Pacientes</div>
          <div className="text-2xl font-extrabold text-foreground mt-1">12.480</div>
          <div className="text-[10px] text-emerald-600 font-bold mt-0.5">+14% este mês</div>
        </div>

        <div className="bg-card border rounded-3xl p-4 shadow-sm">
          <div className="text-xs text-muted-foreground font-medium">Consultas Hoje</div>
          <div className="text-2xl font-extrabold text-foreground mt-1">1.284</div>
          <div className="text-[10px] text-primary font-bold mt-0.5">47 em andamento</div>
        </div>

        <div className="bg-card border rounded-3xl p-4 shadow-sm">
          <div className="text-xs text-muted-foreground font-medium">Faturamento Mês</div>
          <div className="text-2xl font-extrabold text-emerald-600 mt-1">R$ 384k</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Taxa de repasse: 15%</div>
        </div>

        <div className="bg-card border rounded-3xl p-4 shadow-sm">
          <div className="text-xs text-muted-foreground font-medium">Chamados Suporte</div>
          <div className="text-2xl font-extrabold text-amber-600 mt-1">{ticketsAbertos}</div>
          <div className="text-[10px] text-amber-700 font-bold mt-0.5">Tempo méd: 6 min</div>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label="Ver auditoria geral"
          className="bg-card border rounded-3xl p-4 shadow-sm cursor-pointer hover:border-primary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          onClick={() => go("auditoria")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              go("auditoria");
            }
          }}
        >
          <div className="text-xs text-muted-foreground font-medium">Sat. Geral / Auditoria</div>
          <div className="text-2xl font-extrabold text-foreground mt-1 text-primary">
            {eventos24h}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Eventos em 24h</div>
        </div>
      </div>

      {/* Gráficos e Ações */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card border rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-extrabold text-base text-foreground">
              Distribuição por Especialidade
            </div>
            <button
              onClick={() => go("relatorios")}
              className="text-xs font-bold text-primary hover:underline"
            >
              Detalhar
            </button>
          </div>
          <div className="space-y-3">
            {[
              { n: "Clínica Geral", p: 85, v: "1.090 consultas" },
              { n: "Dermatologia", p: 62, v: "796 consultas" },
              { n: "Cardiologia", p: 48, v: "616 consultas" },
              { n: "Pediatria", p: 40, v: "513 consultas" },
              { n: "Psicologia", p: 35, v: "449 consultas" },
            ].map((s, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span>{s.n}</span>
                  <span className="text-muted-foreground">
                    {s.v} ({s.p}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${s.p}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-extrabold text-base text-foreground">Ações de Gestão Rápida</div>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => go("usuarios")}
              className="w-full p-4 rounded-2xl bg-muted/60 hover:bg-muted border text-left transition flex items-center justify-between"
            >
              <div>
                <div className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> Validar Médicos e CRM
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Aprovar credenciais de médicos cadastrados na plataforma.
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>

            <button
              onClick={() => go("suporte")}
              className="w-full p-4 rounded-2xl bg-muted/60 hover:bg-muted border text-left transition flex items-center justify-between"
            >
              <div>
                <div className="font-bold text-sm text-foreground flex items-center gap-2">
                  <LifeBuoy className="w-4 h-4 text-primary" /> Central de Chamados de Suporte
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {ticketsAbertos} chamados pendentes de resolução.
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => go("auditoria")}
              className="w-full p-4 rounded-2xl bg-muted/60 hover:bg-muted border text-left transition flex items-center justify-between"
            >
              <div>
                <div className="font-bold text-sm text-foreground flex items-center gap-2">
                  <FileSearch className="w-4 h-4 text-primary" /> Trilha de Auditoria
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {eventos24h} eventos registrados nas últimas 24h.
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => go("admin-agendamentos")}
              className="w-full p-4 rounded-2xl bg-muted/60 hover:bg-muted border text-left transition flex items-center justify-between"
            >
              <div>
                <div className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" /> Gerenciar Agendamentos
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Ver, remarcar ou cancelar consultas de toda a plataforma.
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => go("admin-pacientes")}
              className="w-full p-4 rounded-2xl bg-muted/60 hover:bg-muted border text-left transition flex items-center justify-between"
            >
              <div>
                <div className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Heart className="w-4 h-4 text-primary" /> Cadastro de Pacientes
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Cadastrar, editar e consultar o histórico de cada paciente.
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => go("admin-medicos")}
              className="w-full p-4 rounded-2xl bg-muted/60 hover:bg-muted border text-left transition flex items-center justify-between"
            >
              <div>
                <div className="font-bold text-sm text-foreground flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-primary" /> Cadastro de Médicos
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Incluir novos profissionais e acompanhar avaliações.
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

