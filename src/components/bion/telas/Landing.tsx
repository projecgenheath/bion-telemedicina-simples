"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Calendar, Video, FileText, ArrowRight, Sparkles, Stethoscope,
  Shield, Heart, Zap, CheckCircle, Star, Users, ChevronDown,
  Clock, Award, Smartphone,
} from "lucide-react";
import { Logo } from "@/components/bion/brand";

const ESPECIALIDADES = ["Clínico Geral", "Dermatologia", "Psiquiatria", "Nutrição", "Pediatria", "Cardiologia"];

const DEPOIMENTOS = [
  { nome: "Maria S.", texto: "Consegui consulta em 10 minutos. O médico foi atencioso e resolveu meu problema.", estrelas: 5 },
  { nome: "João P.", texto: "Praticidade total. Fiz a consulta no intervalo do trabalho, sem sair do escritório.", estrelas: 5 },
  { nome: "Ana L.", texto: "Melhor que ir ao pronto-socorro. Atendimento rápido e sem fila.", estrelas: 5 },
];

const FAQ = [
  { q: "Como funciona o pagamento?", a: "Você paga com cartão de crédito ou débito no momento do agendamento. O valor é cobrado só após a confirmação." },
  { q: "Preciso instalar algum app?", a: "Não. A consulta acontece direto no navegador. Funciona no celular, tablet ou computador." },
  { q: "Os médicos são verificados?", a: "Sim. Todos têm CRM ativo e passam por validação antes de atender na plataforma." },
  { q: "Posso cancelar?", a: "Sim. Cancelamentos com mais de 2 horas de antecedência são reembolsados integralmente." },
];

export function Landing() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [faqAberto, setFaqAberto] = useState<number | null>(null);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-[#070b14] text-white overflow-x-hidden">
      {/* Fundo animado */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: "2s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className={`relative z-20 max-w-6xl mx-auto px-6 py-4 flex items-center justify-between transition-all duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-sm text-white/60">
          <a href="#como" className="hover:text-white transition">Como funciona</a>
          <a href="#especialidades" className="hover:text-white transition">Especialidades</a>
          <a href="#faq" className="hover:text-white transition">Dúvidas</a>
        </nav>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.push("/entrar")} className="text-sm text-white/70 hover:text-white transition">Entrar</button>
          <button type="button" onClick={() => router.push("/entrar")}
            className="px-5 py-2.5 rounded-full bg-primary font-bold text-sm hover:bg-primary/90 transition-all hover:scale-105 shadow-lg shadow-primary/20">
            Começar
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm mb-8 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}>
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-white/70">Médicos online agora</span>
        </div>

        <h1 className={`text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.02] mb-6 transition-all duration-1000 delay-100 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
          Consulta médica
          <span className="block mt-2 bg-gradient-to-r from-primary via-blue-400 to-cyan-300 bg-clip-text text-transparent">
            quando você precisar.
          </span>
        </h1>

        <p className={`text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 transition-all duration-1000 delay-200 ${mounted ? "opacity-100" : "opacity-0"}`}>
          Sem fila. Sem deslocamento. Sem espera. Agende, consulte e resolva — tudo pelo celular.
        </p>

        <div className={`flex flex-wrap justify-center gap-4 mb-8 transition-all duration-1000 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <button type="button" onClick={() => router.push("/entrar")}
            className="group px-8 py-4 rounded-2xl bg-primary font-bold text-lg shadow-xl shadow-primary/25 hover:shadow-2xl hover:shadow-primary/40 hover:scale-105 transition-all flex items-center gap-2">
            Agendar agora
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <button type="button" onClick={() => router.push("/entrar")}
            className="px-8 py-4 rounded-2xl bg-white/5 border border-white/10 font-bold text-lg hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-2">
            <Stethoscope className="w-5 h-5" /> Área do médico
          </button>
        </div>

        <div className={`flex items-center justify-center gap-8 text-sm text-white/40 transition-all duration-1000 delay-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {["bg-primary", "bg-accent", "bg-blue-400", "bg-cyan-400"].map((c, i) => (
                <div key={i} className={`w-7 h-7 rounded-full ${c} border-2 border-[#070b14]`} />
              ))}
            </div>
            <span>+500 consultas</span>
          </div>
          <div className="flex items-center gap-1">
            {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
            <span className="ml-1 text-white/60">4.9</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>~15 min espera</span>
          </div>
        </div>
      </section>

      {/* Especialidades */}
      <section id="especialidades" className="relative z-10 py-12 border-y border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-wrap justify-center gap-3">
            {ESPECIALIDADES.map((e, i) => (
              <span key={i} className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-primary/20 hover:border-primary/50 hover:text-white transition-all cursor-default">
                {e}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como" className="relative z-10 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-primary text-sm font-bold uppercase tracking-wider">Simples assim</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2">3 passos para sua consulta</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: "1", icon: Smartphone, t: "Agende", d: "Escolha especialidade, médico e horário. Pague com cartão em segundos." },
              { n: "2", icon: Video, t: "Entre na sala", d: "No horário, clique no link. Câmera e microfone são testados automaticamente." },
              { n: "3", icon: FileText, t: "Receba", d: "Orientações, receitas e encaminhamentos direto no app." },
            ].map((s, i) => (
              <div key={i} className="group relative p-6 rounded-3xl bg-gradient-to-b from-white/5 to-transparent border border-white/10 hover:border-primary/30 transition-all">
                <div className="absolute top-4 right-4 text-5xl font-black text-white/5 group-hover:text-primary/10 transition-colors">{s.n}</div>
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 group-hover:scale-110 transition-all">
                  <s.icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-bold text-xl mb-2">{s.t}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Depoimentos */}
      <section className="relative z-10 py-20 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-black text-center mb-12">O que dizem nossos pacientes</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {DEPOIMENTOS.map((d, i) => (
              <div key={i} className="p-6 rounded-3xl bg-white/5 border border-white/10 hover:border-white/20 transition-all">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: d.estrelas }).map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-white/80 mb-4">"{d.texto}"</p>
                <div className="text-sm text-white/50">{d.nome}</div>
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
              <span className="text-primary text-sm font-bold uppercase tracking-wider">Por que a BION</span>
              <h2 className="text-3xl md:text-4xl font-black mt-2 mb-8">Tecnologia a favor da sua saúde</h2>
              <div className="space-y-4">
                {[
                  { icon: Zap, t: "Rápido", d: "Do agendamento à consulta em minutos" },
                  { icon: Shield, t: "Seguro", d: "Dados criptografados, LGPD compliant" },
                  { icon: Award, t: "Qualidade", d: "Médicos com CRM verificado" },
                  { icon: Heart, t: "Humano", d: "Atendimento que se importa" },
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <b.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <span className="font-bold">{b.t}</span>
                      <span className="text-white/50 ml-2">— {b.d}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-primary/20 via-transparent to-accent/20 rounded-3xl blur-2xl" />
              <div className="relative bg-[#0d1220] border border-white/10 rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent" />
                    <div>
                      <div className="font-bold">Dr. João Silva</div>
                      <div className="text-sm text-white/50">Clínico Geral • CRM 12345</div>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-bold">Online</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold">4.9</div>
                    <div className="text-xs text-white/50">avaliação</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold">+200</div>
                    <div className="text-xs text-white/50">consultas</div>
                  </div>
                </div>
                <button type="button" onClick={() => router.push("/entrar")}
                  className="w-full py-3 rounded-xl bg-primary font-bold hover:bg-primary/90 transition-all">
                  Agendar com este médico
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative z-10 py-20 bg-white/[0.02]">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-black text-center mb-10">Dúvidas frequentes</h2>
          <div className="space-y-3">
            {FAQ.map((f, i) => (
              <div key={i} className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
                <button type="button" onClick={() => setFaqAberto(faqAberto === i ? null : i)}
                  className="w-full p-4 flex items-center justify-between text-left font-medium hover:bg-white/5 transition-colors">
                  {f.q}
                  <ChevronDown className={`w-5 h-5 text-white/50 transition-transform ${faqAberto === i ? "rotate-180" : ""}`} />
                </button>
                <div className={`overflow-hidden transition-all ${faqAberto === i ? "max-h-40" : "max-h-0"}`}>
                  <p className="px-4 pb-4 text-white/60 text-sm">{f.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="relative z-10 py-24">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            Comece grátis
          </div>
          <h2 className="text-4xl md:text-5xl font-black mb-4">
            Pronto para cuidar
            <span className="block text-primary">da sua saúde?</span>
          </h2>
          <p className="text-white/50 text-lg mb-8">Cadastre-se em 30 segundos. Sem compromisso.</p>
          <button type="button" onClick={() => router.push("/entrar")}
            className="group px-10 py-5 rounded-2xl bg-primary font-bold text-xl shadow-xl shadow-primary/30 hover:shadow-2xl hover:scale-105 transition-all inline-flex items-center gap-3">
            Criar minha conta
            <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/30">
          <div className="flex items-center gap-3">
            <Logo />
            <span>© 2026 BION Telemedicina</span>
          </div>
          <div className="flex gap-6">
            <a href="/termos-de-uso" className="hover:text-white/60 transition">Termos</a>
            <a href="/politica-de-privacidade" className="hover:text-white/60 transition">Privacidade</a>
            <a href="/termos-medico" className="hover:text-white/60 transition">Médicos</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
