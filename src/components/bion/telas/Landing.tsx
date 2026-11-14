"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Calendar,
  Video,
  FileText,
  Clock,
  ArrowRight,
  Sparkles,
  Stethoscope,
  Shield,
  Heart,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/bion/brand";

export function Landing() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Header */}
      <header className={`max-w-6xl mx-auto w-full px-6 py-6 flex items-center justify-between transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}>
        <Logo />
        <button type="button"
          onClick={() => router.push("/entrar")}
          className="px-6 py-2.5 rounded-full bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 shadow-lg transition-all hover:scale-105 active:scale-95"
        >
          Acessar Plataforma
        </button>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-8 pb-16 flex-1 flex flex-col justify-center">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Texto */}
          <div className={`space-y-6 transition-all duration-1000 delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent text-sm font-bold animate-pulse">
              <Sparkles className="w-4 h-4" />
              <span>Telemedicina simples e humanizada</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05]">
              Consulta médica
              <span className="block text-primary animate-pulse">em minutos.</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-lg leading-relaxed">
              Marque, converse por vídeo HD e receba orientações sem sair de casa. 
              <span className="text-foreground font-medium"> Simples assim.</span>
            </p>

            <div className="flex flex-wrap gap-4 pt-4">
              <button type="button"
                onClick={() => router.push("/entrar")}
                className="px-8 py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base shadow-xl hover:shadow-2xl hover:scale-105 transition-all flex items-center gap-2 active:scale-95"
              >
                Começar Agora <ArrowRight className="w-5 h-5" />
              </button>
              <button type="button"
                onClick={() => router.push("/entrar")}
                className="px-6 py-4 rounded-2xl border-2 border-primary/30 text-primary font-bold text-base hover:bg-primary/5 hover:border-primary transition-all flex items-center gap-2"
              >
                <Stethoscope className="w-5 h-5" /> Sou Médico
              </button>
            </div>

            {/* Stats */}
            <div className="flex gap-8 pt-6">
              {[
                { n: "100%", l: "Online" },
                { n: "30min", l: "Por consulta" },
                { n: "HD", l: "Vídeo" },
              ].map((s, i) => (
                <div key={i} className={`text-center transition-all duration-700 delay-${300 + i * 100} ${mounted ? "opacity-100" : "opacity-0"}`}>
                  <div className="text-2xl font-black text-primary">{s.n}</div>
                  <div className="text-xs text-muted-foreground">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Card flutuante */}
          <div className={`relative transition-all duration-1000 delay-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-accent/20 rounded-3xl blur-2xl animate-pulse" />
            <div className="relative bg-card border rounded-3xl p-6 shadow-2xl space-y-4 hover:scale-[1.02] transition-transform">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Stethoscope className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <div className="font-bold text-lg">Médicos parceiros</div>
                    <div className="text-sm text-muted-foreground">Clínica geral e especialidades</div>
                  </div>
                </div>
                <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-primary text-primary-foreground animate-bounce">
                  100% online
                </span>
              </div>

              <div className="bg-muted/50 p-5 rounded-2xl space-y-2">
                <div className="text-sm text-muted-foreground font-medium">Agenda aberta:</div>
                <div className="text-3xl font-black text-primary">Escolha seu horário</div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Consultas de 30 minutos
                </div>
              </div>

              <button type="button"
                onClick={() => router.push("/entrar")}
                className="w-full py-4 rounded-2xl font-bold text-base shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2 text-primary-foreground"
                style={{ backgroundColor: "var(--accent)" }}
              >
                <Video className="w-5 h-5" /> Agendar Consulta
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Pilares */}
      <section className="max-w-6xl mx-auto w-full px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Zap, t: "Rápido", d: "Agende em menos de 1 minuto. Escolha especialidade, médico e horário." },
            { icon: Video, t: "Vídeo HD", d: "Sala com testes de câmera e microfone. Sem instalar nada." },
            { icon: Shield, t: "Seguro", d: "Seus dados protegidos. Consultas criptografadas e confidenciais." },
          ].map((f, i) => (
            <div
              key={i}
              className={`p-6 rounded-3xl border bg-card hover:shadow-xl hover:scale-[1.03] transition-all duration-500 space-y-4 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: `${600 + i * 150}ms` }}
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <f.icon className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-lg">{f.t}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className={`bg-primary/5 py-16 transition-all duration-1000 delay-1000 ${mounted ? "opacity-100" : "opacity-0"}`}>
        <div className="max-w-2xl mx-auto text-center px-6 space-y-6">
          <Heart className="w-12 h-12 mx-auto text-primary animate-pulse" />
          <h2 className="text-3xl md:text-4xl font-black">Pronto para começar?</h2>
          <p className="text-muted-foreground">Junte-se a pacientes e médicos que já usam a BION.</p>
          <button type="button"
            onClick={() => router.push("/entrar")}
            className="px-10 py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-lg shadow-xl hover:shadow-2xl hover:scale-105 transition-all"
          >
            Criar conta grátis
          </button>
        </div>
      </section>
    </div>
  );
}
