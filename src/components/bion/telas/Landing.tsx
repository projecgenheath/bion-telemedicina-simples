"use client";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Video,
  FileText,
  Clock,
  ArrowRight,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { Logo } from "@/components/bion/brand";

export function Landing() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="max-w-6xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-3">
          <button type="button"
            onClick={() => router.push("/entrar")}
            className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 shadow-md transition"
          >
            Acessar Plataforma
          </button>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-6 pt-12 pb-20 flex-1 flex flex-col justify-center">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent-soft text-accent text-xs font-bold">
              <Sparkles className="w-4 h-4" style={{ color: "var(--accent)" }} />
              <span style={{ color: "var(--accent)" }}>
                Telemedicina simples e humanizada
              </span>
            </div>

            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.08]">
              Do agendamento à consulta médica em <span className="text-primary">minutos</span>.
            </h1>

            <p className="text-base md:text-lg text-muted-foreground max-w-lg leading-relaxed">
              Marque consultas, converse com médicos especialistas em vídeo HD e receba as orientações
              do médico sem sair de casa.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <button type="button"
                onClick={() => router.push("/entrar")}
                className="px-8 py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg hover:opacity-90 transition flex items-center gap-2 active:scale-95"
              >
                Começar Agora <ArrowRight className="w-4 h-4" />
              </button>
              <button type="button"
                onClick={() => router.push("/entrar")}
                className="px-6 py-4 rounded-2xl border font-bold text-sm hover:bg-muted transition"
              >
                Sou Médico / Especialista
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full" />
            <div className="relative bg-card border rounded-3xl p-6 shadow-2xl space-y-5">
              {/* Cartão genérico e honesto: sem médico fictício, sem CRM de
                  exemplo e sem "próximo horário" inventado do relógio — a
                  agenda real só aparece após o login, com médicos de verdade. */}
              <div className="flex items-center gap-3 pb-4 border-b">
                <div className="w-14 h-14 rounded-2xl bg-primary-soft flex items-center justify-center text-primary shadow-sm">
                  <Stethoscope className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base">Médicos parceiros</div>
                  <div className="text-xs text-muted-foreground">Clínica geral e especialidades · atendimento por vídeo</div>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-primary-soft text-primary">
                  100% online
                </span>
              </div>

              <div className="bg-muted/60 p-4 rounded-2xl space-y-2 text-xs">
                <div className="text-muted-foreground font-medium">
                  Agenda aberta:
                </div>
                <div className="text-2xl font-extrabold text-primary">Escolha o melhor horário para você</div>
                <div className="text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Consultas de 30 minutos, por vídeo
                </div>
              </div>

              <button type="button"
                onClick={() => router.push("/entrar")}
                className="w-full py-4 rounded-2xl text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition flex items-center justify-center gap-2"
                style={{ backgroundColor: "var(--accent)" }}
              >
                <Video className="w-4 h-4" /> Agendar ou Entrar na Sala
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Pilares */}
      <section className="max-w-6xl mx-auto w-full px-6 pb-16 grid md:grid-cols-3 gap-6">
        {[
          {
            icon: Calendar,
            t: "Agendamento em 1 Minuto",
            d: "Escolha especialidade, médico e horário e pague com cartão, sem sair de casa.",
          },
          {
            icon: Video,
            t: "Videoconsulta em HD",
            d: "Sala com testes de câmera, microfone e sem instalar nada.",
          },
          {
            icon: FileText,
            t: "Sobre os documentos",
            d: "Os documentos ainda não têm assinatura digital ICP-Brasil do médico, então podem não ser aceitos como documentos válidos.",
          },
        ].map((f, i) => (
          <div
            key={i}
            className="p-6 rounded-3xl border bg-card hover:shadow-md transition space-y-3"
          >
            <div className="w-12 h-12 rounded-2xl bg-primary-soft flex items-center justify-center text-primary">
              <f.icon className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-foreground">{f.t}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{f.d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
