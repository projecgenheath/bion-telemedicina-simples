"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Calendar, Video, FileText, ArrowRight, Sparkles, Stethoscope,
  Shield, Heart, Zap, CheckCircle, Star, Clock, Smartphone,
} from "lucide-react";
import { Logo } from "@/components/bion/brand";

export function Landing() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-[#f8f5ff] to-[#f1ecfb] text-[#1a1040]">
      {/* Header */}
      <header className={`max-w-6xl mx-auto px-6 py-5 flex items-center justify-between transition-all duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
        <Logo />
        <button type="button" onClick={() => router.push("/entrar")}
          className="px-6 py-2.5 rounded-full bg-[#24058D] text-white font-bold text-sm hover:bg-[#3D1AAE] transition-all hover:scale-105 shadow-lg shadow-[#24058D]/20">
          Acessar Plataforma
        </button>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-12 pb-16">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Texto */}
          <div className={`space-y-6 transition-all duration-700 delay-100 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#24058D]/10 text-[#24058D] text-sm font-bold">
              <Sparkles className="w-4 h-4" />
              Telemedicina simples e humanizada
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08]">
              Do agendamento à consulta médica em
              <span className="text-[#24058D]"> minutos</span>.
            </h1>

            <p className="text-lg text-[#1a1040]/70 max-w-lg leading-relaxed">
              Marque consultas, converse com médicos especialistas em vídeo HD e receba as orientações sem sair de casa.
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              <button type="button" onClick={() => router.push("/entrar")}
                className="group px-8 py-4 rounded-2xl bg-[#24058D] text-white font-bold shadow-lg shadow-[#24058D]/25 hover:bg-[#3D1AAE] hover:scale-105 transition-all flex items-center gap-2">
                Começar Agora
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button type="button" onClick={() => router.push("/entrar")}
                className="px-6 py-4 rounded-2xl border-2 border-[#24058D]/20 text-[#24058D] font-bold hover:bg-[#24058D]/5 hover:border-[#24058D]/40 transition-all flex items-center gap-2">
                <Stethoscope className="w-5 h-5" /> Sou Médico
              </button>
            </div>

            {/* Stats */}
            <div className="flex gap-8 pt-4">
              {[
                { n: "100%", l: "Online" },
                { n: "30min", l: "Por consulta" },
                { n: "HD", l: "Vídeo" },
              ].map((s, i) => (
                <div key={i} className="text-center">
                  <div className="text-2xl font-black text-[#24058D]">{s.n}</div>
                  <div className="text-xs text-[#1a1040]/50">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Card */}
          <div className={`transition-all duration-700 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <div className="bg-white rounded-3xl p-6 shadow-xl shadow-[#24058D]/10 border border-[#24058D]/10 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#24058D]/10 flex items-center justify-center">
                  <Stethoscope className="w-7 h-7 text-[#24058D]" />
                </div>
                <div>
                  <div className="font-bold text-lg">Médicos parceiros</div>
                  <div className="text-sm text-[#1a1040]/60">Clínica geral e especialidades</div>
                </div>
                <span className="ml-auto text-xs font-bold px-3 py-1.5 rounded-full bg-[#24058D] text-white">
                  100% online
                </span>
              </div>

              <div className="bg-[#f8f5ff] p-5 rounded-2xl space-y-2">
                <div className="text-sm text-[#1a1040]/60 font-medium">Agenda aberta:</div>
                <div className="text-2xl font-black text-[#24058D]">Escolha seu horário</div>
                <div className="text-sm text-[#1a1040]/50 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Consultas de 30 minutos
                </div>
              </div>

              <button type="button" onClick={() => router.push("/entrar")}
                className="w-full py-4 rounded-2xl bg-[#24058D] text-white font-bold hover:bg-[#3D1AAE] transition-all flex items-center justify-center gap-2">
                <Video className="w-5 h-5" /> Agendar Consulta
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Pilares */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Zap, t: "Agendamento em 1 Minuto", d: "Escolha especialidade, médico e horário e pague com cartão, sem sair de casa." },
            { icon: Video, t: "Videoconsulta em HD", d: "Sala com testes de câmera, microfone e sem instalar nada." },
            { icon: Shield, t: "Seguro e Privado", d: "Seus dados protegidos. Consultas criptografadas e confidenciais." },
          ].map((f, i) => (
            <div key={i} className={`p-6 rounded-3xl bg-white border border-[#24058D]/10 hover:shadow-lg hover:shadow-[#24058D]/10 hover:scale-[1.02] transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
              style={{ transitionDelay: `${400 + i * 100}ms` }}>
              <div className="w-12 h-12 rounded-2xl bg-[#24058D]/10 flex items-center justify-center text-[#24058D] mb-4">
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg mb-2">{f.t}</h3>
              <p className="text-sm text-[#1a1040]/60 leading-relaxed">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section className="bg-[#24058D] text-white py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-black text-center mb-10">Como funciona</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { n: "1", icon: Smartphone, t: "Agende", d: "Escolha especialidade, médico e horário. Pague em segundos." },
              { n: "2", icon: Video, t: "Consulte", d: "Entre na sala de vídeo HD. Sem instalar nada." },
              { n: "3", icon: FileText, t: "Receba", d: "Orientações e receitas direto no celular." },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                  <s.icon className="w-8 h-8" />
                </div>
                <div className="text-sm font-bold text-white/50 mb-1">Passo {s.n}</div>
                <h3 className="font-bold text-xl mb-2">{s.t}</h3>
                <p className="text-white/70 text-sm">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="py-16 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <Heart className="w-12 h-12 mx-auto text-[#24058D] mb-4" />
          <h2 className="text-3xl font-black mb-4">Pronto para começar?</h2>
          <p className="text-[#1a1040]/60 mb-6">Cadastre-se grátis. Sem compromisso.</p>
          <button type="button" onClick={() => router.push("/entrar")}
            className="px-10 py-4 rounded-2xl bg-[#24058D] text-white font-bold text-lg shadow-lg shadow-[#24058D]/25 hover:bg-[#3D1AAE] hover:scale-105 transition-all">
            Criar conta grátis
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#24058D]/10 py-6">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#1a1040]/40">
          <div className="flex items-center gap-2">
            <Logo />
            <span>© 2026 BION</span>
          </div>
          <div className="flex gap-6">
            <a href="/termos-de-uso" className="hover:text-[#24058D] transition">Termos</a>
            <a href="/politica-de-privacidade" className="hover:text-[#24058D] transition">Privacidade</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
