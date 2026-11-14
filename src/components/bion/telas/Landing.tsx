"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Calendar, Video, FileText, Clock, ArrowRight, Sparkles,
  Stethoscope, Shield, Heart, Zap, CheckCircle, Star,
  Users, Phone, ChevronDown,
} from "lucide-react";
import { Logo } from "@/components/bion/brand";

export function Landing() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white overflow-hidden">
      {/* Gradiente de fundo animado */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent/15 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      {/* Header */}
      <header className={`relative z-10 max-w-6xl mx-auto w-full px-6 py-5 flex items-center justify-between transition-all duration-700 ${mounted ? "opacity-100" : "opacity-0"}`}>
        <Logo />
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => router.push("/entrar")}
            className="hidden sm:block text-sm text-white/70 hover:text-white transition">
            Entrar
          </button>
          <button type="button" onClick={() => router.push("/entrar")}
            className="px-5 py-2.5 rounded-full bg-white text-[#0a0f1a] font-bold text-sm hover:bg-white/90 transition-all hover:scale-105">
            Começar grátis
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-12 pb-20">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur border border-white/10 text-sm font-medium mb-8 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}>
            <Sparkles className="w-4 h-4 text-accent" />
            <span>Telemedicina que funciona de verdade</span>
          </div>

          {/* Título */}
          <h1 className={`text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.05] mb-6 transition-all duration-1000 delay-200 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            Sua saúde,
            <span className="block bg-gradient-to-r from-primary via-blue-400 to-accent bg-clip-text text-transparent">
              sem sair de casa.
            </span>
          </h1>

          {/* Subtítulo */}
          <p className={`text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed transition-all duration-1000 delay-300 ${mounted ? "opacity-100" : "opacity-0"}`}>
            Agende em 1 minuto. Consulte por vídeo HD. Receba orientações na hora.
            <span className="text-white font-medium"> Médicos reais, atendimento real.</span>
          </p>

          {/* CTAs */}
          <div className={`flex flex-wrap justify-center gap-4 mb-12 transition-all duration-1000 delay-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <button type="button" onClick={() => router.push("/entrar")}
              className="group px-8 py-4 rounded-2xl bg-primary font-bold text-lg shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 transition-all flex items-center gap-2">
              Agendar consulta
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button type="button" onClick={() => router.push("/entrar")}
              className="px-8 py-4 rounded-2xl bg-white/10 backdrop-blur border border-white/20 font-bold text-lg hover:bg-white/20 transition-all flex items-center gap-2">
              <Stethoscope className="w-5 h-5" /> Sou médico
            </button>
          </div>

          {/* Social proof */}
          <div className={`flex items-center justify-center gap-6 text-sm text-white/50 transition-all duration-1000 delay-700 ${mounted ? "opacity-100" : "opacity-0"}`}>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {[1,2,3,4].map(i => (
                  <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent border-2 border-[#0a0f1a]" />
                ))}
              </div>
              <span>+500 pacientes</span>
            </div>
            <div className="flex items-center gap-1">
              {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
              <span className="ml-1">4.9</span>
            </div>
          </div>
        </div>

        {/* Card preview */}
        <div className={`mt-16 max-w-md mx-auto transition-all duration-1000 delay-1000 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-3xl blur opacity-30" />
            <div className="relative bg-[#12182a] border border-white/10 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
                  <Video className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <div className="font-bold text-lg">Próxima consulta</div>
                  <div className="text-white/50">Hoje, 14:30 • Dr. Silva</div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 bg-white/5 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-primary">30</div>
                  <div className="text-xs text-white/50">minutos</div>
                </div>
                <div className="flex-1 bg-white/5 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-accent">HD</div>
                  <div className="text-xs text-white/50">vídeo</div>
                </div>
                <div className="flex-1 bg-white/5 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-green-400">✓</div>
                  <div className="text-xs text-white/50">confirmada</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section className="relative z-10 py-20 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-black text-center mb-12">Como funciona</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { n: "01", icon: Calendar, t: "Agende", d: "Escolha especialidade, médico e horário. Pague com cartão em segundos." },
              { n: "02", icon: Video, t: "Consulte", d: "Entre na sala de vídeo HD. Sem instalar app, sem complicação." },
              { n: "03", icon: FileText, t: "Receba", d: "Orientações, receitas e encaminhamentos direto no seu celular." },
            ].map((s, i) => (
              <div key={i} className="relative p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-primary/50 transition-all group">
                <div className="text-6xl font-black text-white/5 absolute top-4 right-4 group-hover:text-primary/10 transition-colors">{s.n}</div>
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <s.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-bold text-xl mb-2">{s.t}</h3>
                <p className="text-white/60">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefícios */}
      <section className="relative z-10 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-black mb-6">Por que a BION?</h2>
              <div className="space-y-4">
                {[
                  { icon: Zap, t: "Rápido de verdade", d: "Do agendamento à consulta em minutos, não dias." },
                  { icon: Shield, t: "Dados protegidos", d: "Criptografia de ponta. Sua privacidade é prioridade." },
                  { icon: Users, t: "Médicos verificados", d: "Todos os profissionais têm CRM ativo e validado." },
                  { icon: Heart, t: "Atendimento humano", d: "Tecnologia que aproxima, não que distancia." },
                ].map((b, i) => (
                  <div key={i} className="flex gap-4 p-4 rounded-2xl hover:bg-white/5 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                      <b.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <div className="font-bold">{b.t}</div>
                      <div className="text-white/60 text-sm">{b.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-primary/20 to-accent/20 rounded-3xl blur-2xl" />
              <div className="relative bg-[#12182a] border border-white/10 rounded-3xl p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <span className="font-medium">Consulta confirmada</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Especialidade</span>
                    <span>Clínico Geral</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Médico</span>
                    <span>Dr. João Silva</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Horário</span>
                    <span>Hoje, 14:30</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Valor</span>
                    <span className="text-green-400 font-bold">R$ 89,90</span>
                  </div>
                </div>
                <button type="button" onClick={() => router.push("/entrar")}
                  className="w-full py-4 rounded-2xl bg-primary font-bold hover:bg-primary/90 transition-all">
                  Entrar na sala
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="relative z-10 py-20">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/20 text-accent text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            Comece agora
          </div>
          <h2 className="text-4xl md:text-5xl font-black mb-6">
            Sua próxima consulta
            <span className="block text-primary">está a um clique.</span>
          </h2>
          <p className="text-white/60 text-lg mb-8">
            Cadastre-se grátis. Sem compromisso. Cancele quando quiser.
          </p>
          <button type="button" onClick={() => router.push("/entrar")}
            className="group px-10 py-5 rounded-2xl bg-primary font-bold text-xl shadow-lg shadow-primary/30 hover:shadow-xl hover:scale-105 transition-all inline-flex items-center gap-3">
            Criar minha conta
            <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/40">
          <div className="flex items-center gap-2">
            <Logo />
            <span>© 2026 BION</span>
          </div>
          <div className="flex gap-6">
            <a href="/termos-de-uso" className="hover:text-white transition">Termos</a>
            <a href="/politica-de-privacidade" className="hover:text-white transition">Privacidade</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
