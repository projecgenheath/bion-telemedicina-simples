import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Calendar,
  Video,
  FileText,
  MessageSquare,
  User,
  Bell,
  Search,
  Stethoscope,
  Shield,
  Clock,
  ChevronRight,
  Plus,
  Users,
  TrendingUp,
  Wifi,
  Mic,
  Camera,
  MonitorUp,
  Paperclip,
  PhoneOff,
  Pill,
  ClipboardList,
  Star,
  Award,
  Globe,
  ArrowRight,
  Check,
  Heart,
  Sparkles,
  LogOut,
  Home,
  FolderHeart,
  Menu,
  LifeBuoy,
  Bot,
  Trash2,
  FileSearch,
  CircleHelp,
} from "lucide-react";
import { BionProvider, useBion, type Sessao } from "@/lib/bion-store";
import { Consulta } from "@/components/bion/Consulta";
import { SalaEspera } from "@/components/bion/SalaEspera";
import { AgendamentoFluxo } from "@/components/bion/AgendamentoFluxo";
import { PosConsultaModal } from "@/components/bion/PosConsultaModal";
import { BionIA } from "@/components/bion/BionIA";
import { ChamadosSuporte } from "@/components/bion/ChamadosSuporte";
import { MedicoPerfilView } from "@/components/bion/MedicoPerfilView";
import { PacientePerfilView } from "@/components/bion/PacientePerfilView";
import { MinhasAvaliacoes } from "@/components/bion/MinhasAvaliacoes";
import { Notificacoes } from "@/components/bion/Notificacoes";
import { AgendaConsultas } from "@/components/bion/AgendaConsultas";
import { Usuarios } from "@/components/bion/Usuarios";
import { Receitas } from "@/components/bion/Receitas";
import { Prontuario } from "@/components/bion/Prontuario";
import { Relatorios } from "@/components/bion/Relatorios";
import { HistoricoClinico } from "@/components/bion/HistoricoClinico";
import { AuditTrail } from "@/components/bion/AuditTrail";
import { Ajuda } from "@/components/bion/Ajuda";

export const Route = createFileRoute("/")({
  component: BionApp,
  head: () => ({
    meta: [
      { title: "BION — Consulta médica online em minutos" },
      {
        name: "description",
        content:
          "Agende, entre na sala e faça sua consulta por vídeo em minutos. Receitas, atestados e prontuário digital em um só lugar.",
      },
      { property: "og:title", content: "BION — Consulta médica online em minutos" },
      {
        property: "og:description",
        content:
          "Telemedicina simples e humanizada: agendamento rápido, vídeo em HD e documentos com validade legal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Role = "paciente" | "medico" | "admin";
type View =
  | "landing"
  | "login"
  | "dashboard"
  | "agendar"
  | "sala-espera"
  | "consulta"
  | "medico-perfil"
  | "paciente-perfil"
  | "historico"
  | "mensagens"
  | "lembretes"
  | "notificacoes"
  | "consultas"
  | "usuarios"
  | "receitas"
  | "prontuario"
  | "relatorios"
  | "suporte"
  | "bion-ia"
  | "avaliacoes"
  | "auditoria";

function BionApp() {
  return (
    <BionProvider>
      <BionRoot />
    </BionProvider>
  );
}

function BionRoot() {
  const [view, setView] = useState<View>("landing");
  const [posConsultaModalAberto, setPosConsultaModalAberto] = useState(false);
  const { sessao, setSessao } = useBion();

  const handleLogin = (role: Role) => {
    const perfisMap: Record<Role, { nome: string; email: string }> = {
      paciente: { nome: "Marina Silva", email: "marina.silva@email.com" },
      medico: { nome: "Dra. Ana Ribeiro", email: "ana.ribeiro@med.bion.app" },
      admin: { nome: "Administrador Geral", email: "admin@bion.app" },
    };
    setSessao({ role, ...perfisMap[role] });
    setView("dashboard");
  };

  if (view === "landing") return <Landing onEnter={() => setView("login")} />;
  if (view === "login") return <Login onLogin={handleLogin} />;

  return (
    <Shell role={sessao.role} view={view} setView={setView} onLogout={() => setView("landing")}>
      {view === "dashboard" && sessao.role === "paciente" && <PacienteDashboard go={setView} />}
      {view === "dashboard" && sessao.role === "medico" && <MedicoDashboard go={setView} />}
      {view === "dashboard" && sessao.role === "admin" && <AdminDashboard go={setView} />}
      {view === "agendar" && (
        <AgendamentoFluxo
          onDone={() => setView("dashboard")}
          onGoToWaitingRoom={() => setView("sala-espera")}
        />
      )}
      {view === "sala-espera" && <SalaEspera onEnter={() => setView("consulta")} />}
      {view === "consulta" && (
        <Consulta
          role={sessao.role}
          onEnd={() => {
            if (sessao.role === "paciente") {
              setPosConsultaModalAberto(true);
            }
            setView("dashboard");
          }}
        />
      )}
      {view === "notificacoes" && <Notificacoes />}
      {view === "consultas" && (
        <MinhasConsultas perfil={sessao.role === "medico" ? "medico" : "paciente"} />
      )}
      {view === "medico-perfil" && <MedicoPerfilView />}
      {view === "paciente-perfil" && <PacientePerfilView />}
      {view === "historico" && <Historico />}
      {view === "mensagens" && <Mensagens />}
      {view === "lembretes" && <Lembretes />}
      {view === "usuarios" && <Usuarios />}
      {view === "prontuario" && <Prontuario />}
      {view === "receitas" && (
        <Receitas perfil={sessao.role === "medico" ? "medico" : "paciente"} />
      )}
      {view === "relatorios" && <Relatorios />}
      {view === "suporte" && <ChamadosSuporte />}
      {view === "bion-ia" && <BionIA />}
      {view === "avaliacoes" && <MinhasAvaliacoes />}
      {view === "auditoria" && <AuditTrail />}

      {posConsultaModalAberto && (
        <PosConsultaModal
          medico="Dra. Ana Ribeiro"
          especialidade="Clínica Geral"
          onClose={() => setPosConsultaModalAberto(false)}
        />
      )}
    </Shell>
  );
}

/* ---------- Brand Logo ---------- */
function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" };
  const iconSizes = { sm: "w-6 h-6", md: "w-8 h-8", lg: "w-11 h-11" };
  return (
    <div className={`font-extrabold tracking-tight ${sizes[size]} flex items-center gap-2.5`}>
      <div className="relative shrink-0">
        <div
          className={`${iconSizes[size]} rounded-2xl bg-primary flex items-center justify-center shadow-md`}
        >
          <Heart className="w-4 h-4 text-primary-foreground fill-primary-foreground" />
        </div>
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent border-2 border-background" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-primary tracking-tight">BION</span>
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          Telemedicina
        </span>
      </div>
    </div>
  );
}

/* ---------- Landing Page ---------- */
function Landing({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="max-w-6xl mx-auto w-full px-6 py-6 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-3">
          <button
            onClick={onEnter}
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
                A telemedicina mais simples e humanizada do Brasil
              </span>
            </div>

            <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.08]">
              Do agendamento à consulta médica em <span className="text-primary">minutos</span>.
            </h1>

            <p className="text-base md:text-lg text-muted-foreground max-w-lg leading-relaxed">
              Marque consultas, converse com médicos especialistas em vídeo HD e receba receitas,
              exames e atestados assinados digitalmente sem sair de casa.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={onEnter}
                className="px-8 py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-lg hover:opacity-90 transition flex items-center gap-2 active:scale-95"
              >
                Começar Agora <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={onEnter}
                className="px-6 py-4 rounded-2xl border font-bold text-sm hover:bg-muted transition"
              >
                Sou Médico / Especialista
              </button>
            </div>

            <div className="pt-6 border-t flex items-center gap-6 text-xs text-muted-foreground font-medium flex-wrap">
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-primary" /> 100% LGPD & CFM
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-500" /> Assinatura ICP-Brasil
              </div>
              <div className="flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> 4.9/5 de Avaliação
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full" />
            <div className="relative bg-card border rounded-3xl p-6 shadow-2xl space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b">
                <div className="w-14 h-14 rounded-2xl bg-primary-soft flex items-center justify-center text-primary font-bold text-xl shadow-sm">
                  AR
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base">Dra. Ana Ribeiro</div>
                  <div className="text-xs text-muted-foreground">Clínica Geral • CRM 12345 SP</div>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-accent-soft text-emerald-700">
                  Disponível Agora
                </span>
              </div>

              <div className="bg-muted/60 p-4 rounded-2xl space-y-2 text-xs">
                <div className="text-muted-foreground font-medium">
                  Próximo horário para consulta:
                </div>
                <div className="text-2xl font-extrabold text-primary">Hoje, às 14:30</div>
                <div className="text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Duração média: 30 minutos
                </div>
              </div>

              <button
                onClick={onEnter}
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
            d: "Escolha especialidade, médico e pague com Pix instantâneo.",
          },
          {
            icon: Video,
            t: "Videoconsulta em HD",
            d: "Sala com testes de câmera, microfone e sem instalar nada.",
          },
          {
            icon: FileText,
            t: "Documentos com Validade",
            d: "Receitas e atestados aceitos em qualquer farmácia ou empresa.",
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

/* ---------- Login ---------- */
function Login({ onLogin }: { onLogin: (r: Role) => void }) {
  const [tab, setTab] = useState<Role>("paciente");
  const [identificador, setIdentificador] = useState("marina.silva@email.com");
  const [senha, setSenha] = useState("••••••••");

  const trocarAba = (r: Role) => {
    setTab(r);
    if (r === "paciente") setIdentificador("marina.silva@email.com");
    if (r === "medico") setIdentificador("ana.ribeiro@med.bion.app");
    if (r === "admin") setIdentificador("admin@bion.app");
  };

  return (
    <div className="min-h-screen bg-primary-soft flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center flex justify-center">
          <Logo size="lg" />
        </div>

        <div className="bg-card border rounded-3xl p-6 md:p-8 shadow-xl space-y-6">
          <div>
            <h2 className="text-2xl font-extrabold text-foreground">Acesse sua conta</h2>
            <p className="text-xs text-muted-foreground mt-1">Selecione seu perfil de acesso:</p>
          </div>

          <div className="grid grid-cols-3 gap-2 p-1 bg-muted rounded-2xl">
            {(["paciente", "medico", "admin"] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => trocarAba(r)}
                className={`py-2 rounded-xl text-xs font-bold capitalize transition ${
                  tab === r
                    ? "bg-card shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r === "medico" ? "Médico" : r === "admin" ? "Admin" : "Paciente"}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                E-mail, CPF ou CRM
              </label>
              <input
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                placeholder="Seu e-mail ou CPF"
                className="w-full px-4 py-3 rounded-2xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                Senha de Acesso
              </label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Sua senha"
                className="w-full px-4 py-3 rounded-2xl border text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <button
            onClick={() => onLogin(tab)}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-sm shadow-md hover:opacity-90 transition active:scale-[0.99]"
          >
            Entrar como{" "}
            {tab === "medico" ? "Médico" : tab === "admin" ? "Administrador" : "Paciente"}
          </button>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <button className="hover:text-primary transition font-medium">
              Esqueci minha senha
            </button>
            <button className="hover:text-primary transition font-medium">Criar nova conta</button>
          </div>

          <div className="pt-4 border-t flex items-center justify-center gap-1.5 text-xs text-muted-foreground text-center">
            <Shield className="w-3.5 h-3.5 text-primary" /> Acesso autenticado com criptografia de
            ponta a ponta
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Shell / Layout Principal ---------- */
function Shell({
  role,
  view,
  setView,
  onLogout,
  children,
}: {
  role: Role;
  view: View;
  setView: (v: View) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const { sessao, setSessao } = useBion();

  const menus: Record<
    Role,
    { icon: React.ComponentType<{ className?: string }>; label: string; view: View }[]
  > = {
    paciente: [
      { icon: Home, label: "Início", view: "dashboard" },
      { icon: Calendar, label: "Agendar", view: "agendar" },
      { icon: Clock, label: "Consultas", view: "consultas" },
      { icon: Pill, label: "Receitas", view: "receitas" },
      { icon: ClipboardList, label: "Prontuário", view: "prontuario" },
      { icon: FolderHeart, label: "Histórico", view: "historico" },
      { icon: MessageSquare, label: "Mensagens", view: "mensagens" },
      { icon: Bell, label: "Lembretes", view: "lembretes" },
      { icon: Bot, label: "BION Saúde IA", view: "bion-ia" },
      { icon: LifeBuoy, label: "Suporte", view: "suporte" },
      { icon: User, label: "Meu Perfil", view: "paciente-perfil" },
    ],
    medico: [
      { icon: Home, label: "Início", view: "dashboard" },
      { icon: Calendar, label: "Minha Agenda", view: "consultas" },
      { icon: Users, label: "Pacientes", view: "historico" },
      { icon: Pill, label: "Receitas & Docs", view: "receitas" },
      { icon: ClipboardList, label: "Prontuários", view: "prontuario" },
      { icon: Star, label: "Minhas Avaliações", view: "avaliacoes" },
      { icon: MessageSquare, label: "Mensagens", view: "mensagens" },
      { icon: Bot, label: "BION Copilot IA", view: "bion-ia" },
      { icon: LifeBuoy, label: "Suporte", view: "suporte" },
      { icon: User, label: "Meu Perfil", view: "medico-perfil" },
    ],
    admin: [
      { icon: Home, label: "Painel Geral", view: "dashboard" },
      { icon: Users, label: "Usuários & CRM", view: "usuarios" },
      { icon: TrendingUp, label: "Relatórios & PDF", view: "relatorios" },
      { icon: FileSearch, label: "Auditoria", view: "auditoria" },
      { icon: LifeBuoy, label: "Chamados Suporte", view: "suporte" },
      { icon: Bell, label: "Lembretes", view: "lembretes" },
    ],
  };

  const menu = menus[role];

  // Alternador rápido de perfil para testes e demonstração
  const trocarPerfilRapido = (novoRole: Role) => {
    const map = {
      paciente: { nome: "Marina Silva", email: "marina.silva@email.com" },
      medico: { nome: "Dra. Ana Ribeiro", email: "ana.ribeiro@med.bion.app" },
      admin: { nome: "Administrador Geral", email: "admin@bion.app" },
    };
    setSessao({ role: novoRole, ...map[novoRole] });
    setView("dashboard");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-x-hidden">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex w-64 flex-col border-r bg-card shrink-0">
        <div className="p-6">
          <Logo />
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {menu.map((m) => {
            const active = view === m.view;
            return (
              <button
                key={m.label}
                onClick={() => setView(m.view)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition ${
                  active
                    ? "bg-primary-soft text-primary shadow-xs"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <m.icon className="w-4 h-4" /> {m.label}
              </button>
            );
          })}
        </nav>

        {/* Rodapé do Perfil */}
        <div className="p-3 border-t">
          <div className="flex items-center gap-3 p-2 rounded-2xl bg-muted/60">
            <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shadow-sm">
              {sessao.nome
                .split(" ")
                .slice(-2)
                .map((w) => w[0])
                .join("")}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate">{sessao.nome}</div>
              <div className="text-[10px] text-muted-foreground capitalize truncate">{role}</div>
            </div>
            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground transition"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Área Principal */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Header Superior */}
        <header className="h-16 border-b bg-card/70 backdrop-blur flex items-center justify-between gap-4 px-4 md:px-8 sticky top-0 z-20">
          <div className="md:hidden">
            <Logo size="sm" />
          </div>

          {/* Troca Rápida de Perfil */}
          <div className="flex items-center gap-2 bg-muted/70 p-1 rounded-2xl">
            <span className="text-[10px] font-bold text-muted-foreground px-2 hidden sm:inline">
              Perfil Ativo:
            </span>
            {(["paciente", "medico", "admin"] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => trocarPerfilRapido(r)}
                className={`px-3 py-1 rounded-xl text-xs font-bold capitalize transition ${
                  role === r
                    ? "bg-card shadow-sm text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r === "medico" ? "Médica" : r === "admin" ? "Admin" : "Paciente"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <SinoNotificacoes onClick={() => setView("notificacoes")} />
            <button
              onClick={onLogout}
              className="md:hidden p-2 rounded-xl hover:bg-muted text-muted-foreground"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Conteúdo da Página */}
        <div className="p-4 md:p-8 pb-28 md:pb-12 max-w-6xl w-full mx-auto flex-1">{children}</div>
      </main>

      {/* Navegação Mobile Inferior */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t flex justify-around p-1 shadow-lg">
        {menu.slice(0, 5).map((m) => {
          const active = view === m.view;
          return (
            <button
              key={m.label}
              onClick={() => setView(m.view)}
              className={`flex-1 flex flex-col items-center gap-1 py-2 text-[10px] font-bold transition ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <m.icon className="w-5 h-5" />
              <span className="truncate">{m.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function SinoNotificacoes({ onClick }: { onClick: () => void }) {
  const { naoLidas } = useBion();
  return (
    <button
      onClick={onClick}
      className="p-2.5 rounded-2xl hover:bg-muted relative text-muted-foreground hover:text-foreground transition"
      title="Notificações"
    >
      <Bell className="w-5 h-5" />
      {naoLidas > 0 && (
        <span
          className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black text-primary-foreground flex items-center justify-center shadow-sm animate-pulse"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {naoLidas}
        </span>
      )}
    </button>
  );
}

function MinhasConsultas({ perfil }: { perfil: "paciente" | "medico" }) {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          {perfil === "medico" ? "Minha Agenda de Teleconsultas" : "Minhas Consultas"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {perfil === "medico"
            ? "Acompanhe seus horários, remarcações e pacientes confirmados."
            : "Gerencie suas consultas agendadas, cancele ou remarque quando necessário."}
        </p>
      </div>
      <AgendaConsultas perfil={perfil} />
    </div>
  );
}

/* ---------- Paciente Dashboard ---------- */
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

function PacienteDashboard({ go }: { go: (v: View) => void }) {
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
function MedicoDashboard({ go }: { go: (v: View) => void }) {
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
function AdminDashboard({ go }: { go: (v: View) => void }) {
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
          className="bg-card border rounded-3xl p-4 shadow-sm cursor-pointer hover:border-primary transition"
          onClick={() => go("auditoria")}
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
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Histórico Unificado ---------- */
function Historico() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <HistoricoClinico />
    </div>
  );
}

/* ---------- Mensagens entre Consultas ---------- */
function Mensagens() {
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

/* ---------- Lembretes & Medicamentos ---------- */
function Lembretes() {
  const { lembretes, adicionarLembrete, alternarLembrete, removerLembrete } = useBion();
  const [modalNovo, setModalNovo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [horario, setHorario] = useState("08:00");
  const [tipo, setTipo] = useState<"Medicação" | "Consulta" | "Exame" | "Hidratação">("Medicação");
  const [frequencia, setFrequencia] = useState("Todos os dias");

  const criarLembrete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    adicionarLembrete({
      titulo: titulo.trim(),
      horario,
      tipo,
      frequencia,
    });
    toast.success("Lembrete criado", {
      description: `"${titulo.trim()}" às ${horario} • ${frequencia}`,
    });
    setTitulo("");
    setModalNovo(false);
  };

  const pendentes = lembretes.filter((i) => !i.feito).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Lembretes & Alarmes de Saúde</h1>
          <p className="text-muted-foreground mt-1">
            {pendentes} lembrete{pendentes === 1 ? "" : "s"} pendente{pendentes === 1 ? "" : "s"}{" "}
            para hoje
          </p>
        </div>
        <button
          onClick={() => setModalNovo(true)}
          className="px-5 py-3 rounded-2xl text-primary-foreground font-bold text-xs shadow-md hover:opacity-90 transition flex items-center gap-1.5 self-start sm:self-auto"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <Plus className="w-4 h-4" /> Criar Lembrete
        </button>
      </div>

      <div className="space-y-2.5">
        {lembretes.map((l) => (
          <div
            key={l.id}
            className={`bg-card border rounded-3xl p-4 flex items-center justify-between gap-4 shadow-sm transition ${
              l.feito ? "opacity-55" : ""
            }`}
          >
            <div className="w-11 h-11 rounded-2xl bg-primary-soft flex items-center justify-center text-primary shrink-0">
              <Pill className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className={`font-bold text-sm text-foreground ${l.feito ? "line-through" : ""}`}>
                {l.titulo}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <Clock className="w-3.5 h-3.5" /> {l.horario} • {l.frequencia}
                <span className="px-2 py-0.5 rounded-lg bg-muted text-[10px] font-bold">
                  {l.tipo}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => alternarLembrete(l.id)}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition ${
                  l.feito
                    ? "bg-emerald-500 text-white border-transparent"
                    : "border-border hover:border-primary"
                }`}
                title={l.feito ? "Marcar como pendente" : "Marcar como tomado/concluído"}
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  removerLembrete(l.id);
                  toast.info("Lembrete removido");
                }}
                className="p-2 rounded-xl text-muted-foreground hover:text-red-500 hover:bg-muted transition"
                title="Excluir"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modalNovo && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setModalNovo(false)}
        >
          <form
            onSubmit={criarLembrete}
            className="bg-card border rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">Novo Lembrete de Saúde</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Título / Medicamento</label>
                <input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Losartana 50mg, Beber água, Medir Pressão"
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold block mb-1">Horário</label>
                  <input
                    type="time"
                    value={horario}
                    onChange={(e) => setHorario(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">Tipo</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as typeof tipo)}
                    className="w-full px-3 py-2 rounded-xl border bg-background"
                  >
                    <option value="Medicação">Medicação</option>
                    <option value="Consulta">Consulta</option>
                    <option value="Exame">Exame</option>
                    <option value="Hidratação">Hidratação</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">Frequência</label>
                <select
                  value={frequencia}
                  onChange={(e) => setFrequencia(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-background"
                >
                  <option value="Todos os dias">Todos os dias</option>
                  <option value="Segunda a Sexta">Segunda a Sexta</option>
                  <option value="A cada 12 horas">A cada 12 horas</option>
                  <option value="A cada 8 horas">A cada 8 horas</option>
                  <option value="Semanalmente">Semanalmente</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-2xl text-primary-foreground font-bold text-xs"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Salvar Lembrete
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
