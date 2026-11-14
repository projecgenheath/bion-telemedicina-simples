"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Brain,
  CalendarCheck,
  CheckCircle,
  ChevronDown,
  CreditCard,
  FileText,
  Heart,
  Lock,
  MessageCircle,
  Mic,
  PhoneOff,
  ScreenShare,
  ShieldCheck,
  Sparkles,
  Star,
  Stethoscope,
  TrendingUp,
  Video,
  Wallet,
  Zap,
} from "lucide-react";
import { Logo } from "@/components/bion/brand";

/* ============================================================
   BION — Landing imersiva (novembro/2026)
   Tons 100% da marca: #24058D (primária), #123e7d (sea),
   #14457f (deep), #0a1f44 (ink), #0b1424 (night), #f2f6fc
   (paper), #9ac1f4 (sky) e o verde accent do design system.
   Animações em CSS puro + IntersectionObserver (sem novas
   dependências) e com respeito a prefers-reduced-motion.
   ============================================================ */

const LN_CSS = `
.ln-root{color:#0a1f44;background:#f2f6fc}
/* --- barra de progresso de leitura --- */
.ln-progresso{position:fixed;top:0;left:0;z-index:70;height:3px;width:0;
  background:linear-gradient(90deg,#24058D,#123e7d,#9ac1f4);
  transition:width .15s linear}
/* --- header --- */
.ln-header{position:sticky;top:0;z-index:50;border-bottom:1px solid transparent;
  transition:background .45s,border-color .45s,box-shadow .45s,backdrop-filter .45s}
.ln-header-fixo{background:rgba(11,20,36,.82);-webkit-backdrop-filter:blur(16px);
  backdrop-filter:blur(16px);border-color:rgba(255,255,255,.09);
  box-shadow:0 10px 40px rgba(11,20,36,.35)}
.ln-nav-link{position:relative;color:rgba(255,255,255,.72);transition:color .3s}
.ln-nav-link::after{content:"";position:absolute;left:0;bottom:-7px;height:2px;width:0;
  border-radius:2px;background:linear-gradient(90deg,#9ac1f4,#c7d9fb);transition:width .35s}
.ln-nav-link:hover{color:#fff}
.ln-nav-link:hover::after{width:100%}
/* --- botões --- */
.ln-botao{display:inline-flex;align-items:center;gap:.55rem;border-radius:9999px;
  font-weight:800;letter-spacing:.01em;cursor:pointer;user-select:none;
  transition:transform .35s cubic-bezier(.22,1,.36,1),box-shadow .35s,background-color .35s,color .35s,border-color .35s}
.ln-botao:active{transform:scale(.96)}
.ln-botao-primario{background:#24058D;color:#fff;padding:.9rem 1.9rem;font-size:.95rem;
  box-shadow:0 14px 34px -10px rgba(36,5,141,.55)}
.ln-botao-primario:hover{background:#3D1AAE;transform:translateY(-2px);
  box-shadow:0 22px 44px -12px rgba(36,5,141,.6)}
.ln-botao-glass{background:rgba(255,255,255,.08);color:#fff;padding:.9rem 1.9rem;
  font-size:.95rem;border:1px solid rgba(255,255,255,.22);
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
.ln-botao-glass:hover{background:rgba(154,193,244,.16);border-color:rgba(154,193,244,.5);transform:translateY(-2px)}
.ln-botao-branco{background:#fff;color:#24058D;padding:.95rem 2rem;font-size:1rem;
  box-shadow:0 16px 40px -12px rgba(0,0,0,.45)}
.ln-botao-branco:hover{transform:translateY(-2px);box-shadow:0 24px 52px -14px rgba(0,0,0,.5)}
.ln-brilho{position:relative;overflow:hidden}
.ln-brilho::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.38) 50%,transparent 58%);
  transform:translateX(-130%)}
.ln-brilho:hover::after{transform:translateX(130%);transition:transform .9s ease}
/* --- hero --- */
.ln-hero{position:relative;overflow:hidden;
  background:linear-gradient(168deg,#0b1424 0%,#0c1a33 42%,#24058D 175%)}
.ln-aura{position:absolute;border-radius:9999px;filter:blur(90px);pointer-events:none;
  animation:ln-deriva 26s ease-in-out infinite alternate;will-change:transform}
@keyframes ln-deriva{
  0%{transform:translate(0,0) scale(1)}
  45%{transform:translate(46px,-38px) scale(1.14)}
  100%{transform:translate(-38px,26px) scale(.94)}}
.ln-grade{position:absolute;inset:0;pointer-events:none;
  background-image:linear-gradient(rgba(154,193,244,.08) 1px,transparent 1px),
    linear-gradient(90deg,rgba(154,193,244,.08) 1px,transparent 1px);
  background-size:54px 54px;
  -webkit-mask-image:radial-gradient(ellipse 85% 65% at 50% 38%,#000 25%,transparent 78%);
  mask-image:radial-gradient(ellipse 85% 65% at 50% 38%,#000 25%,transparent 78%)}
.ln-grad{background:linear-gradient(90deg,#9ac1f4,#dcebff 45%,#9ac1f4 90%);
  background-size:220% 100%;-webkit-background-clip:text;background-clip:text;
  color:transparent;animation:ln-gradiente 7s linear infinite}
@keyframes ln-gradiente{to{background-position:-220% 0}}
.ln-grad-marca{background:linear-gradient(92deg,#24058D 10%,#123e7d 90%);
  -webkit-background-clip:text;background-clip:text;color:transparent}
/* --- "ao vivo" + anéis de pulso --- */
.ln-ponto-vivo{position:relative;display:inline-block;width:8px;height:8px;border-radius:9999px;background:#e5484d}
.ln-ponto-vivo::before,.ln-ponto-vivo::after{content:"";position:absolute;inset:-5px;
  border-radius:inherit;border:2px solid rgba(229,72,77,.55);animation:ln-pulso 2.2s ease-out infinite}
.ln-ponto-vivo::after{animation-delay:1.1s}
@keyframes ln-pulso{0%{transform:scale(.7);opacity:.9}75%{transform:scale(1.7);opacity:0}100%{opacity:0}}
.ln-pulse-anel{position:relative}
.ln-pulse-anel::before,.ln-pulse-anel::after{content:"";position:absolute;inset:-10px;
  border-radius:inherit;border:2px solid rgba(154,193,244,.5);animation:ln-pulso 3s ease-out infinite}
.ln-pulse-anel::after{animation-delay:1.5s}
/* --- flutuação de chips/cards --- */
.ln-float{animation:ln-flutuar 7s ease-in-out infinite;will-change:transform}
@keyframes ln-flutuar{0%,100%{transform:translateY(0)}50%{transform:translateY(-13px)}}
/* --- marquee de especialidades --- */
.ln-marquee{overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent);
  mask-image:linear-gradient(90deg,transparent,#000 14%,#000 86%,transparent)}
.ln-marquee-track{display:flex;gap:.8rem;width:max-content;padding-right:.8rem;
  animation:ln-marquee 30s linear infinite}
.ln-marquee:hover .ln-marquee-track{animation-play-state:paused}
@keyframes ln-marquee{to{transform:translateX(-50%)}}
/* --- reveals no scroll --- */
[data-rv]{opacity:0;transform:translateY(30px);
  transition:opacity .85s cubic-bezier(.22,1,.36,1),transform .85s cubic-bezier(.22,1,.36,1);
  transition-delay:var(--rv-delay,0ms)}
[data-rv="suave"]{transform:translateY(16px)}
[data-rv="escala"]{transform:translateY(28px) scale(.96)}
[data-rv].rv-in{opacity:1;transform:none}
/* --- cartões com tilt --- */
.ln-tilt{transition:transform .55s cubic-bezier(.22,1,.36,1),box-shadow .55s}
.ln-tilt:hover{transform:perspective(900px) rotateX(2deg) translateY(-7px) scale(1.015);
  box-shadow:0 30px 70px -24px rgba(36,5,141,.38)}
/* --- gráfico de repasses --- */
.ln-barra{transform:scaleY(.06);transform-origin:bottom;
  transition:transform 1s cubic-bezier(.22,1,.36,1);transition-delay:var(--rv-delay,0ms)}
.rv-in .ln-barra{transform:scaleY(1)}
/* --- chat do mockup --- */
.ln-msg{opacity:0;transform:translateY(12px) scale(.95)}
.rv-in .ln-msg{animation:ln-surge .6s cubic-bezier(.22,1,.36,1) both;
  animation-delay:var(--msg-d,0ms)}
@keyframes ln-surge{from{opacity:0;transform:translateY(12px) scale(.95)}
  to{opacity:1;transform:translateY(0) scale(1)}}
.ln-dot{width:6px;height:6px;border-radius:9999px;background:#9ac1f4;opacity:.5;
  animation:ln-pulo 1.1s ease-in-out infinite}
@keyframes ln-pulo{0%,100%{transform:translateY(0);opacity:.45}50%{transform:translateY(-5px);opacity:1}}
/* --- FAQ --- */
summary.ln-faq-sum{list-style:none;cursor:pointer}
summary.ln-faq-sum::-webkit-details-marker{display:none}
.ln-faq-seta{transition:transform .4s cubic-bezier(.22,1,.36,1)}
details[open] .ln-faq-seta{transform:rotate(180deg)}
details[open] .ln-faq-corpo{animation:ln-surge .5s cubic-bezier(.22,1,.36,1) both}
details.ln-faq{transition:border-color .4s,background-color .4s}
details[open].ln-faq{border-color:rgba(36,5,141,.35);background:rgba(36,5,141,.04)}
/* --- acessibilidade: movimento reduzido --- */
@media (prefers-reduced-motion:reduce){
  [data-rv]{transition:none;opacity:1;transform:none}
  .ln-msg{opacity:1;transform:none;animation:none!important}
  .ln-barra{transform:none;transition:none}
  .ln-aura,.ln-float,.ln-marquee-track,.ln-grad,.ln-ponto-vivo::before,
  .ln-ponto-vivo::after,.ln-pulse-anel::before,.ln-pulse-anel::after,
  .ln-dot,.ln-brilho::after{animation:none!important;transition:none!important}
  .ln-progresso{transition:none}
}
`;

const ESPECIALIDADES_MARQUEE = [
  "Clínica Geral",
  "Cardiologia",
  "Dermatologia",
  "Pediatria",
  "Ortopedia",
];

const PASSOS = [
  {
    n: "01",
    icone: Zap,
    titulo: "Agende",
    texto:
      "Escolha a especialidade, o médico e o horário. Pagamento com cartão em segundos, sem sair de casa.",
  },
  {
    n: "02",
    icone: Video,
    titulo: "Consulte",
    texto:
      "Entre na sala de vídeo pelo navegador. Câmera e microfone testados antes de você entrar — sem instalar nada.",
  },
  {
    n: "03",
    icone: FileText,
    titulo: "Receba",
    texto:
      "Receita, atestado e orientações assinados pelo médico, direto no app. Seu histórico fica com você.",
  },
];

const PILARES_CONFIANCA = [
  {
    icone: ShieldCheck,
    titulo: "Dados protegidos",
    texto: "Conformidade LGPD com consentimentos e painel de privacidade.",
  },
  {
    icone: Lock,
    titulo: "Chamada criptografada",
    texto: "O vídeo usa a criptografia padrão do navegador (WebRTC).",
  },
  {
    icone: CreditCard,
    titulo: "Pagamento seguro",
    texto: "Checkout com cartão processado em ambiente certificado.",
  },
  {
    icone: BadgeCheck,
    titulo: "Médicos verificados",
    texto: "Cadastro conferido pela equipe antes de atender pacientes.",
  },
];

const BENEFICIOS_PACIENTE = [
  {
    icone: CalendarCheck,
    titulo: "Agende em 1 minuto",
    texto:
      "Especialidade, médico e horário em poucos toques. Pague com cartão e receba a confirmação na hora.",
  },
  {
    icone: Video,
    titulo: "Vídeo HD sem instalar nada",
    texto:
      "A sala abre no navegador, com teste de câmera e microfone antes de entrar. Do celular, tablet ou computador.",
  },
  {
    icone: FileText,
    titulo: "Documentos na hora",
    texto:
      "Receitas, atestados e orientações assinados eletronicamente pelo médico e guardados no seu histórico.",
  },
];

const BENEFICIOS_MEDICO = [
  "Agenda, preços e duração definidos por você",
  "Repasses transparentes com acompanhamento diário",
  "Copiloto de IA para prescrição e evolução",
  "Perfil público com avaliações de pacientes",
  "Receitas e atestados emitidos em poucos toques",
];

const BARRAS_REPASSES = [30, 44, 38, 56, 50, 66, 60, 74, 68, 86, 80, 100];

const AGENDA_HOJE = [
  { hora: "09:00", paciente: "Retorno — pressão arterial", cor: "#16a34a" },
  { hora: "10:30", paciente: "Primeira consulta — dermatologia", cor: "#9ac1f4" },
  { hora: "14:00", paciente: "Renovação de receita", cor: "#16a34a" },
];

const FAQ = [
  {
    pergunta: "Preciso baixar algum aplicativo?",
    resposta:
      "Não. Agendamento, pagamento e a própria videoconsulta acontecem no navegador do celular ou do computador. Também existe o app nativo para quem preferir.",
  },
  {
    pergunta: "Como funciona o pagamento?",
    resposta:
      "Você paga a consulta com cartão no checkout seguro, direto no fluxo de agendamento. A confirmação chega na hora.",
  },
  {
    pergunta: "A consulta gera receita e atestado?",
    resposta:
      "Sim. O médico emite receitas, atestados e orientações assinados eletronicamente, e tudo fica guardado no seu histórico dentro do app.",
  },
  {
    pergunta: "Sou médico. Como começo a atender?",
    resposta:
      "Crie sua conta, passe pela verificação da equipe, configure agenda e preços — e comece a atender pacientes de qualquer lugar, com repasse transparente.",
  },
  {
    pergunta: "Meus dados estão protegidos?",
    resposta:
      "Sim. A BION segue a LGPD com consentimentos explícitos, chamadas criptografadas e um painel de privacidade para você controlar o que é compartilhado.",
  },
];

/* ---------- hook: contagem animada ---------- */
function useContador(alvo: number, ativo: boolean, duracao = 1500) {
  const [valor, setValor] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setValor(alvo));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const t0 = performance.now();
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / duracao);
      setValor(Math.round(alvo * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [ativo, alvo, duracao]);
  return valor;
}

function Contador({
  alvo,
  sufixo = "",
  sufixoPos = "",
}: {
  alvo: number;
  sufixo?: string;
  sufixoPos?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setAtivo(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const valor = useContador(alvo, ativo);
  return (
    <span ref={ref}>
      {valor}
      {sufixo}
      {sufixoPos ? (
        <span className="text-[#9ac1f4]">{sufixoPos}</span>
      ) : null}
    </span>
  );
}

/* ---------- hook: cronômetro da chamada (mockup) ---------- */
function useCronometro() {
  const [seg, setSeg] = useState(12 * 60 + 41);
  useEffect(() => {
    const id = setInterval(() => setSeg((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const m = Math.floor(seg / 60).toString().padStart(2, "0");
  const s = (seg % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const atraso = (ms: number) => ({ "--rv-delay": `${ms}ms` }) as React.CSSProperties;

export function Landing() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const mockRef = useRef<HTMLDivElement>(null);
  const [progresso, setProgresso] = useState(0);
  const [cabecalhoFixo, setCabecalhoFixo] = useState(false);
  const cronometro = useCronometro();

  /* reveals no scroll */
  useEffect(() => {
    const raiz = rootRef.current;
    if (!raiz) return;
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            e.target.classList.add("rv-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px 0px" },
    );
    raiz.querySelectorAll("[data-rv]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* progresso de leitura + header + parallax do mockup */
  useEffect(() => {
    let raf = 0;
    const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const aplicar = () => {
      raf = 0;
      const doc = document.documentElement;
      const total = doc.scrollHeight - doc.clientHeight;
      const y = window.scrollY;
      setProgresso(total > 0 ? Math.min(100, (y / total) * 100) : 0);
      setCabecalhoFixo(y > 28);
      if (mockRef.current && !reduzido) {
        mockRef.current.style.transform = `translateY(${Math.min(y * 0.045, 52)}px)`;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(aplicar);
    };
    aplicar();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* rolagem suave entre âncoras */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  const irParaEntrar = () => router.push("/entrar");

  return (
    <div ref={rootRef} className="ln-root min-h-screen">
      <style>{LN_CSS}</style>

      {/* barra de progresso */}
      <div
        className="ln-progresso"
        aria-hidden
        style={{ width: `${progresso}%` }}
      />

      {/* ===================== HEADER ===================== */}
      <header className={`ln-header ${cabecalhoFixo ? "ln-header-fixo" : ""}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-5 lg:px-8">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0 })}
            className="flex items-center gap-3 rounded-2xl bg-white/95 py-1.5 pl-1.5 pr-4 shadow-lg shadow-black/25 transition-transform duration-300 hover:scale-[1.04]"
          >
            <Logo size="sm" />
            <span className="hidden text-xs font-black tracking-[0.22em] text-[#24058D] sm:block">
              TELEMEDICINA
            </span>
          </button>

          <nav className="hidden items-center gap-7 text-sm font-bold md:flex" aria-label="Seções da página">
            <a href="#pacientes" className="ln-nav-link">Para pacientes</a>
            <a href="#medicos" className="ln-nav-link">Para médicos</a>
            <a href="#como-funciona" className="ln-nav-link">Como funciona</a>
            <a href="#faq" className="ln-nav-link">Dúvidas</a>
          </nav>

          <button
            type="button"
            onClick={irParaEntrar}
            className="ln-botao ln-botao-primario ln-brilho !px-5 !py-2.5 !text-sm"
          >
            <span className="hidden sm:inline">Acessar plataforma</span>
            <span className="sm:hidden">Entrar</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ===================== HERO ===================== */}
      <section className="ln-hero" id="inicio">
        {/* auroras */}
        <div
          className="ln-aura"
          aria-hidden
          style={{
            width: 560,
            height: 560,
            left: "-10%",
            top: "-22%",
            background:
              "radial-gradient(circle at 32% 32%, rgba(36,5,141,.85), transparent 66%)",
            animationDuration: "24s",
          }}
        />
        <div
          className="ln-aura"
          aria-hidden
          style={{
            width: 460,
            height: 460,
            right: "-6%",
            top: "-8%",
            background:
              "radial-gradient(circle at 60% 40%, rgba(18,62,125,.8), transparent 68%)",
            animationDuration: "30s",
            animationDelay: "-6s",
          }}
        />
        <div
          className="ln-aura"
          aria-hidden
          style={{
            width: 380,
            height: 380,
            right: "18%",
            bottom: "-16%",
            background:
              "radial-gradient(circle at 50% 50%, rgba(154,193,244,.35), transparent 70%)",
            animationDuration: "20s",
            animationDelay: "-12s",
          }}
        />
        <div className="ln-grade" aria-hidden />

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_.95fr] lg:gap-10 lg:px-8">
          {/* ---------- texto ---------- */}
          <div className="space-y-8">
            <div
              data-rv="suave"
              className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur"
            >
              <Sparkles className="h-4 w-4 text-[#9ac1f4]" />
              Telemedicina simples, humana e segura
            </div>

            <h1
              data-rv="suave"
              style={atraso(90)}
              className="max-w-xl text-4xl font-black leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-[3.65rem]"
            >
              Consulte um médico em{" "}
              <span className="ln-grad">minutos</span>, não em semanas.
            </h1>

            <p
              data-rv="suave"
              style={atraso(180)}
              className="max-w-lg text-lg leading-relaxed text-white/70"
            >
              Agende pelo navegador, pague com segurança e entre na sala de
              vídeo na hora marcada. Sem fila, sem trânsito e sem instalar
              nada — a consulta acontece onde você estiver.
            </p>

            <div data-rv="suave" style={atraso(260)} className="flex flex-wrap items-center gap-4 pt-1">
              <button type="button" onClick={irParaEntrar} className="ln-botao ln-botao-primario ln-brilho group !px-8 !py-4 !text-base">
                Começar agora
                <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1.5" />
              </button>
              <a href="#medicos" className="ln-botao ln-botao-glass !px-7 !py-4 !text-base">
                <Stethoscope className="h-5 w-5 text-[#9ac1f4]" />
                Sou médico
              </a>
            </div>

            {/* estatísticas animadas */}
            <dl
              data-rv="suave"
              style={atraso(340)}
              className="grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-7"
            >
              <div>
                <dt className="order-2 mt-1 text-xs font-semibold leading-snug text-white/55">
                  duração da consulta
                </dt>
                <dd className="order-1 text-3xl font-black text-white">
                  <Contador alvo={30} sufixo=" min" />
                </dd>
              </div>
              <div>
                <dt className="order-2 mt-1 text-xs font-semibold leading-snug text-white/55">
                  online, do agendamento ao retorno
                </dt>
                <dd className="order-1 text-3xl font-black text-white">
                  <Contador alvo={100} sufixo="%" />
                </dd>
              </div>
              <div>
                <dt className="order-2 mt-1 text-xs font-semibold leading-snug text-white/55">
                  aberto para agendar
                </dt>
                <dd className="order-1 text-3xl font-black text-white">
                  <Contador alvo={24} sufixoPos="/7" />
                </dd>
              </div>
            </dl>
          </div>

          {/* ---------- mockup da videochamada ---------- */}
          <div data-rv="escala" style={atraso(200)} className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div ref={mockRef} className="relative will-change-transform">
              {/* chips flutuantes */}
              <div
                className="ln-float absolute -top-7 right-4 z-20 hidden items-center gap-2.5 rounded-2xl border border-white/15 bg-[#0f1b31]/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur sm:flex"
                aria-hidden
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#16a34a]/15 text-[#4ade80]">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="text-left">
                  <div className="text-sm font-black text-white">Receita enviada</div>
                  <div className="text-[11px] font-semibold text-white/50">assina em segundos</div>
                </div>
              </div>

              <div
                className="ln-float absolute -left-6 top-1/3 z-20 hidden items-center gap-2.5 rounded-2xl border border-white/15 bg-[#0f1b31]/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur md:flex"
                style={{ animationDelay: "-2.5s" }}
                aria-hidden
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#9ac1f4]/15 text-[#9ac1f4]">
                  <CheckCircle className="h-5 w-5" />
                </span>
                <div className="text-left">
                  <div className="text-sm font-black text-white">Pagamento confirmado</div>
                  <div className="text-[11px] font-semibold text-white/50">checkout seguro</div>
                </div>
              </div>

              <div
                className="ln-float absolute -bottom-8 left-10 z-20 hidden items-center gap-2.5 rounded-2xl border border-white/15 bg-[#0f1b31]/95 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur sm:flex"
                style={{ animationDelay: "-4.5s" }}
                aria-hidden
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#24058D] text-[#9ac1f4]">
                  <Star className="h-5 w-5" />
                </span>
                <div className="text-left">
                  <div className="text-sm font-black text-white">Avaliação do paciente</div>
                  <div className="text-[11px] font-semibold text-white/50">exibida no perfil público</div>
                </div>
              </div>

              {/* card da chamada */}
              <div className="rounded-[2rem] border border-white/10 bg-[#0f1b31]/90 p-4 shadow-2xl shadow-black/50 backdrop-blur">
                {/* topo: ao vivo + cronômetro */}
                <div className="mb-4 flex items-center justify-between px-1">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#e5484d]/10 px-3 py-1 text-[11px] font-black tracking-widest text-[#ff8a8d]">
                    <span className="ln-ponto-vivo" aria-hidden />
                    AO VIVO
                  </span>
                  <span className="inline-flex items-center gap-2 text-[11px] font-bold text-white/60">
                    <span suppressHydrationWarning>{cronometro}</span>
                    <span className="rounded-full bg-[#9ac1f4]/10 px-2 py-0.5 font-black text-[#9ac1f4]">
                      HD
                    </span>
                  </span>
                </div>

                {/* vídeo principal: médica */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#123e7d] via-[#14457f] to-[#0a1f44]">
                  <div className="flex aspect-[4/3] flex-col items-center justify-center gap-4">
                    <div className="ln-pulse-anel relative grid h-24 w-24 place-items-center rounded-[2rem] bg-gradient-to-br from-[#24058D] to-[#123e7d] text-white shadow-2xl shadow-black/40">
                      <Stethoscope className="h-11 w-11" />
                    </div>
                    <div className="text-center">
                      <div className="text-base font-black text-white">Dra. Ana Beatriz</div>
                      <div className="text-xs font-semibold text-[#9ac1f4]">
                        Cardiologia • CRM verificado
                      </div>
                    </div>
                  </div>

                  {/* você (PiP) */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-2xl border border-white/15 bg-[#0b1424]/85 px-3 py-2 backdrop-blur">
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#9ac1f4]/20 text-[#9ac1f4]">
                      <Mic className="h-4 w-4" />
                    </span>
                    <span className="text-xs font-black text-white">Você</span>
                  </div>

                  {/* selo da chamada */}
                  <div className="absolute left-3 top-3 rounded-full bg-black/35 px-3 py-1 text-[11px] font-bold text-white/80 backdrop-blur">
                    Sala privada e criptografada
                  </div>
                </div>

                {/* controles */}
                <div className="mt-4 flex items-center justify-center gap-3">
                  {[Mic, Video, ScreenShare].map((Icone, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={["Microfone", "Câmera", "Compartilhar tela"][i]}
                      className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/5 text-white/80 transition-all duration-300 hover:scale-110 hover:border-[#9ac1f4]/40 hover:bg-[#9ac1f4]/10 hover:text-white"
                    >
                      <Icone className="h-5 w-5" />
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label="Encerrar chamada"
                    className="ml-2 grid h-11 w-11 place-items-center rounded-2xl bg-[#e5484d] text-white shadow-lg shadow-[#e5484d]/40 transition-all duration-300 hover:scale-110"
                  >
                    <PhoneOff className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* marquee de especialidades */}
        <div className="relative border-t border-white/10 bg-[#0b1424]/70 py-5 backdrop-blur">
          <div className="ln-marquee" aria-hidden>
            <div className="ln-marquee-track">
              {[...ESPECIALIDADES_MARQUEE, ...ESPECIALIDADES_MARQUEE, ...ESPECIALIDADES_MARQUEE, ...ESPECIALIDADES_MARQUEE].map((nome, i) => (
                <span
                  key={i}
                  className="whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm font-bold text-white/75"
                >
                  <Heart className="mr-2 inline h-3.5 w-3.5 text-[#9ac1f4]" />
                  {nome}
                </span>
              ))}
            </div>
          </div>
          <span className="sr-only">
            Especialidades disponíveis: {ESPECIALIDADES_MARQUEE.join(", ")}.
          </span>
        </div>
      </section>

      {/* ===================== PILARES DE CONFIANÇA ===================== */}
      <section className="bg-[#f2f6fc]">
        <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PILARES_CONFIANCA.map((p, i) => (
              <div
                key={p.titulo}
                data-rv="suave"
                style={atraso(i * 90)}
                className="ln-tilt rounded-3xl border border-[#24058D]/10 bg-white p-6 shadow-sm"
              >
                <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#24058D]/10 text-[#24058D]">
                  <p.icone className="h-6 w-6" />
                </span>
                <h3 className="mb-1 text-base font-black">{p.titulo}</h3>
                <p className="text-sm leading-relaxed text-[#0a1f44]/65">{p.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== PARA PACIENTES ===================== */}
      <section id="pacientes" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
          <div data-rv="suave" className="mb-14 max-w-2xl">
            <span className="inline-block rounded-full bg-[#24058D]/10 px-4 py-1.5 text-xs font-black tracking-[0.18em] text-[#24058D]">
              PARA VOCÊ, PACIENTE
            </span>
            <h2 className="mt-5 text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Toda a consulta,{" "}
              <span className="ln-grad-marca">na palma da mão</span>.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[#0a1f44]/65">
              Da escolha do horário à receita assinada, tudo acontece em um
              lugar só — sem ligar para clínicas e sem esperar semanas por um
              retorno.
            </p>
          </div>

          <div className="grid items-center gap-12 lg:grid-cols-[1fr_400px] lg:gap-16">
            {/* benefícios */}
            <div className="space-y-5">
              {BENEFICIOS_PACIENTE.map((b, i) => (
                <div
                  key={b.titulo}
                  data-rv
                  style={atraso(i * 110)}
                  className="ln-tilt group flex gap-5 rounded-3xl border border-[#24058D]/10 bg-[#f2f6fc]/60 p-6"
                >
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#24058D] to-[#123e7d] text-white shadow-lg shadow-[#24058D]/25 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3">
                    <b.icone className="h-7 w-7" />
                  </span>
                  <div>
                    <h3 className="mb-1.5 text-lg font-black">{b.titulo}</h3>
                    <p className="leading-relaxed text-[#0a1f44]/65">{b.texto}</p>
                  </div>
                </div>
              ))}
              <div data-rv style={atraso(360)} className="pt-2">
                <button type="button" onClick={irParaEntrar} className="ln-botao ln-botao-primario ln-brilho group !px-8 !py-4 !text-base">
                  Criar conta grátis
                  <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1.5" />
                </button>
              </div>
            </div>

            {/* mockup: celular com chat */}
            <div data-rv="escala" style={atraso(150)} className="relative mx-auto w-full max-w-[340px]">
              <div className="ln-float relative rounded-[2.6rem] border border-[#24058D]/15 bg-[#0b1424] p-3 shadow-2xl shadow-[#24058D]/25">
                {/* entalhe */}
                <div className="absolute left-1/2 top-[22px] z-10 h-6 w-28 -translate-x-1/2 rounded-full bg-[#0b1424]" aria-hidden />
                <div className="overflow-hidden rounded-[2.1rem] bg-[#f2f6fc]">
                  {/* cabeçalho do chat */}
                  <div className="flex items-center gap-3 bg-[#24058D] px-5 pb-5 pt-10">
                    <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-white/15 text-sm font-black text-white">
                      AB
                      <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#24058D] bg-[#16a34a]" aria-hidden />
                    </span>
                    <div>
                      <div className="text-sm font-black text-white">Dra. Ana Beatriz</div>
                      <div className="text-[11px] font-semibold text-[#9ac1f4]">Cardiologia • online agora</div>
                    </div>
                    <Video className="ml-auto h-5 w-5 text-white/70" />
                  </div>

                  {/* mensagens */}
                  <div className="space-y-3 px-4 py-5">
                    <div className="ln-msg ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-[#24058D] px-4 py-2.5 text-sm leading-snug text-white" style={{ "--msg-d": "500ms" } as React.CSSProperties}>
                      Doutora, boa noite! Minha receita acabou — dá pra renovar por vídeo?
                    </div>
                    <div className="ln-msg mr-auto max-w-[82%] rounded-2xl rounded-bl-md border border-[#24058D]/10 bg-white px-4 py-2.5 text-sm leading-snug text-[#0a1f44] shadow-sm" style={{ "--msg-d": "1500ms" } as React.CSSProperties}>
                      Boa noite! Sim, dá sim. Tenho horário amanhã às 10h — já deixo reservado pra você.
                    </div>
                    <div className="ln-msg ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-[#24058D] px-4 py-2.5 text-sm leading-snug text-white" style={{ "--msg-d": "2500ms" } as React.CSSProperties}>
                      Perfeito, obrigada! 🙏
                    </div>
                    <div className="ln-msg mr-auto flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-md border border-[#24058D]/10 bg-white px-4 py-3 shadow-sm" style={{ "--msg-d": "3300ms" } as React.CSSProperties} aria-hidden>
                      <span className="ln-dot" />
                      <span className="ln-dot" style={{ animationDelay: ".18s" }} />
                      <span className="ln-dot" style={{ animationDelay: ".36s" }} />
                    </div>
                  </div>
                </div>

                {/* chips flutuantes do celular */}
                <div className="ln-float absolute -right-8 top-24 hidden items-center gap-2 rounded-2xl border border-[#16a34a]/25 bg-white px-4 py-3 shadow-xl md:flex" style={{ animationDelay: "-3s" }} aria-hidden>
                  <CheckCircle className="h-5 w-5 text-[#16a34a]" />
                  <div className="text-left">
                    <div className="text-xs font-black">Receita renovada</div>
                    <div className="text-[10px] font-semibold text-[#0a1f44]/55">assinada eletronicamente</div>
                  </div>
                </div>
                <div className="ln-float absolute -left-10 bottom-16 hidden items-center gap-2 rounded-2xl border border-[#24058D]/15 bg-white px-4 py-3 shadow-xl md:flex" style={{ animationDelay: "-1.5s" }} aria-hidden>
                  <Star className="h-5 w-5 text-[#24058D]" />
                  <div className="text-left">
                    <div className="text-xs font-black">Avaliação enviada</div>
                    <div className="text-[10px] font-semibold text-[#0a1f44]/55">após a consulta</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== COMO FUNCIONA ===================== */}
      <section id="como-funciona" className="scroll-mt-20 bg-gradient-to-b from-[#f2f6fc] via-white to-[#f2f6fc]">
        <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
          <div data-rv="suave" className="mx-auto mb-16 max-w-2xl text-center">
            <span className="inline-block rounded-full bg-[#24058D]/10 px-4 py-1.5 text-xs font-black tracking-[0.18em] text-[#24058D]">
              COMO FUNCIONA
            </span>
            <h2 className="mt-5 text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Três passos. <span className="ln-grad-marca">Zero burocracia.</span>
            </h2>
          </div>

          <div className="relative grid gap-10 md:grid-cols-3 md:gap-8">
            {/* linha conectora */}
            <div
              data-rv="suave"
              aria-hidden
              className="absolute left-[12%] right-[12%] top-[52px] hidden h-[3px] origin-left rounded-full bg-gradient-to-r from-[#24058D] via-[#123e7d] to-[#9ac1f4] transition-transform duration-1000 md:block"
            />
            {PASSOS.map((p, i) => (
              <div
                key={p.n}
                data-rv
                style={atraso(i * 140)}
                className="ln-tilt relative rounded-3xl border border-[#24058D]/10 bg-white p-8 text-center shadow-sm"
              >
                <div className="mx-auto mb-6 grid h-[72px] w-[72px] place-items-center rounded-3xl bg-gradient-to-br from-[#24058D] to-[#123e7d] text-white shadow-xl shadow-[#24058D]/30">
                  <p.icone className="h-8 w-8" />
                </div>
                <div className="ln-grad-marca text-5xl font-black leading-none">{p.n}</div>
                <h3 className="mt-3 text-xl font-black">{p.titulo}</h3>
                <p className="mt-2 leading-relaxed text-[#0a1f44]/65">{p.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== PARA MÉDICOS ===================== */}
      <section id="medicos" className="relative scroll-mt-20 overflow-hidden bg-[#0b1424]">
        <div
          className="ln-aura"
          aria-hidden
          style={{
            width: 520,
            height: 520,
            left: "-14%",
            top: "-10%",
            background:
              "radial-gradient(circle at 40% 40%, rgba(36,5,141,.7), transparent 66%)",
            animationDuration: "28s",
          }}
        />
        <div
          className="ln-aura"
          aria-hidden
          style={{
            width: 420,
            height: 420,
            right: "-10%",
            bottom: "-20%",
            background:
              "radial-gradient(circle at 55% 45%, rgba(18,62,125,.65), transparent 70%)",
            animationDuration: "22s",
            animationDelay: "-8s",
          }}
        />

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-28">
          {/* texto */}
          <div>
            <div data-rv="suave">
              <span className="inline-block rounded-full border border-[#9ac1f4]/25 bg-[#9ac1f4]/10 px-4 py-1.5 text-xs font-black tracking-[0.18em] text-[#9ac1f4]">
                PARA MÉDICOS
              </span>
              <h2 className="mt-5 text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
                Seu consultório,{" "}
                <span className="ln-grad">sem limite de endereço</span>.
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/70">
                Atenda de onde estiver com agenda própria, repasse transparente
                e um copiloto de IA ao seu lado na prescrição.
              </p>
            </div>

            <ul data-rv="suave" style={atraso(120)} className="mt-8 space-y-4">
              {BENEFICIOS_MEDICO.map((item) => (
                <li key={item} className="flex items-start gap-3.5">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#9ac1f4]/15 text-[#9ac1f4]">
                    <BadgeCheck className="h-5 w-5" />
                  </span>
                  <span className="text-base font-semibold leading-snug text-white/85">{item}</span>
                </li>
              ))}
            </ul>

            <div data-rv="suave" style={atraso(220)} className="mt-10 flex flex-wrap items-center gap-4">
              <button type="button" onClick={irParaEntrar} className="ln-botao ln-botao-branco ln-brilho group !px-8 !py-4 !text-base">
                Quero atender na BION
                <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1.5" />
              </button>
              <a href="/termos-medico" className="text-sm font-bold text-white/60 underline decoration-white/25 underline-offset-4 transition hover:text-[#9ac1f4]">
                Termos do médico
              </a>
            </div>
          </div>

          {/* painel do médico (mockup) */}
          <div data-rv="escala" style={atraso(160)} className="relative mx-auto w-full max-w-lg">
            <div className="ln-float rounded-[2rem] border border-white/10 bg-[#0f1b31]/95 p-6 shadow-2xl shadow-black/50 backdrop-blur">
              {/* gráfico de repasses */}
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#9ac1f4]/15 text-[#9ac1f4]">
                    <TrendingUp className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-black text-white">Movimento de repasses</div>
                    <div className="text-[11px] font-semibold text-white/50">dados de exemplo</div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#16a34a]/15 px-3 py-1 text-[11px] font-black text-[#4ade80]">
                  <Brain className="h-3.5 w-3.5" /> com IA
                </span>
              </div>
              <div className="flex h-36 items-end gap-[9px] pt-4" data-rv style={atraso(300)} aria-hidden>
                {BARRAS_REPASSES.map((alt, i) => (
                  <span
                    key={i}
                    className="ln-barra w-full rounded-t-lg"
                    style={{
                      height: `${alt}%`,
                      "--rv-delay": `${i * 70}ms`,
                      background:
                        i === BARRAS_REPASSES.length - 1
                          ? "linear-gradient(180deg,#9ac1f4,#24058D)"
                          : "linear-gradient(180deg,rgba(154,193,244,.75),rgba(18,62,125,.9))",
                    } as React.CSSProperties}
                  />
                ))}
              </div>

              {/* agenda de hoje */}
              <div className="mt-6 rounded-2xl border border-white/10 bg-[#0b1424]/80 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CalendarCheck className="h-5 w-5 text-[#9ac1f4]" />
                    <span className="text-sm font-black text-white">Agenda de hoje</span>
                  </div>
                  <span className="rounded-full bg-[#9ac1f4]/10 px-2.5 py-1 text-[11px] font-black text-[#9ac1f4]">
                    exemplo
                  </span>
                </div>
                <ul className="space-y-3">
                  {AGENDA_HOJE.map((item) => (
                    <li key={item.hora} className="flex items-center gap-3.5">
                      <span className="w-11 shrink-0 text-xs font-black text-white/80">{item.hora}</span>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.cor }} aria-hidden />
                      <span className="truncate text-sm font-semibold text-white/70">{item.paciente}</span>
                      <MessageCircle className="ml-auto h-4 w-4 shrink-0 text-white/35" />
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* chip flutuante */}
            <div
              className="ln-float absolute -right-4 -top-6 hidden items-center gap-2.5 rounded-2xl border border-white/15 bg-[#0f1b31]/95 px-4 py-3 shadow-2xl backdrop-blur md:flex"
              style={{ animationDelay: "-2s" }}
              aria-hidden
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#16a34a]/15 text-[#4ade80]">
                <Wallet className="h-5 w-5" />
              </span>
              <div className="text-left">
                <div className="text-sm font-black text-white">Consulta confirmada</div>
                <div className="text-[11px] font-semibold text-white/50">lembrete automático enviado</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== FAQ ===================== */}
      <section id="faq" className="scroll-mt-20 bg-[#f2f6fc]">
        <div className="mx-auto max-w-3xl px-5 py-20 lg:px-8 lg:py-28">
          <div data-rv="suave" className="mb-12 text-center">
            <span className="inline-block rounded-full bg-[#24058D]/10 px-4 py-1.5 text-xs font-black tracking-[0.18em] text-[#24058D]">
              DÚVIDAS FREQUENTES
            </span>
            <h2 className="mt-5 text-3xl font-black leading-tight tracking-tight sm:text-4xl">
              Perguntas, <span className="ln-grad-marca">respondidas</span>.
            </h2>
          </div>

          <div data-rv="suave" style={atraso(120)} className="space-y-4">
            {FAQ.map((f) => (
              <details key={f.pergunta} className="ln-faq group rounded-2xl border border-[#24058D]/10 bg-white p-5 shadow-sm">
                <summary className="ln-faq-sum flex items-center justify-between gap-4 text-base font-black">
                  {f.pergunta}
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#24058D]/10 text-[#24058D]">
                    <ChevronDown className="ln-faq-seta h-5 w-5" />
                  </span>
                </summary>
                <p className="ln-faq-corpo pt-3 leading-relaxed text-[#0a1f44]/70">{f.resposta}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== CTA FINAL ===================== */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#24058D] via-[#123e7d] to-[#0b1424]">
        <div
          className="ln-aura"
          aria-hidden
          style={{
            width: 480,
            height: 480,
            left: "50%",
            top: "-30%",
            transform: "translateX(-50%)",
            background:
              "radial-gradient(circle at 50% 50%, rgba(154,193,244,.4), transparent 70%)",
            animationDuration: "18s",
          }}
        />
        <div className="ln-grade opacity-60" aria-hidden />

        <div className="relative mx-auto max-w-3xl px-5 py-24 text-center lg:py-32">
          <div data-rv="suave" className="space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur">
              <Heart className="h-4 w-4 text-[#9ac1f4]" />
              Saúde que cabe na sua rotina
            </span>
            <h2 className="text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl">
              Comece agora.{" "}
              <span className="ln-grad">Leva menos que uma consulta.</span>
            </h2>
            <p className="mx-auto max-w-xl text-lg leading-relaxed text-white/70">
              Crie sua conta grátis — como paciente para consultar em minutos,
              ou como médico para atender de qualquer lugar.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <button type="button" onClick={irParaEntrar} className="ln-botao ln-botao-branco ln-brilho group !px-9 !py-4 !text-base">
                Sou paciente
                <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1.5" />
              </button>
              <button type="button" onClick={irParaEntrar} className="ln-botao ln-botao-glass !px-8 !py-4 !text-base">
                <Stethoscope className="h-5 w-5 text-[#9ac1f4]" />
                Sou médico
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="bg-[#0b1424]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-5 py-10 sm:flex-row lg:px-8">
          <div className="flex items-center gap-4">
            <span className="grid place-items-center rounded-2xl bg-white p-1.5 shadow-lg shadow-black/30">
              <Logo size="sm" />
            </span>
            <div>
              <div className="text-sm font-black text-white">BION</div>
              <div className="text-xs font-semibold text-white/50">
                © 2026 — Telemedicina para pacientes e médicos
              </div>
            </div>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-sm font-bold text-white/60" aria-label="Links jurídicos">
            <a href="/termos-de-uso" className="transition hover:text-[#9ac1f4]">Termos de uso</a>
            <a href="/politica-de-privacidade" className="transition hover:text-[#9ac1f4]">Privacidade</a>
            <a href="/termos-medico" className="transition hover:text-[#9ac1f4]">Termos do médico</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
