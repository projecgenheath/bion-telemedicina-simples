"use client";
import { useRouter, usePathname } from "next/navigation";
import {
  Calendar,
  MessageSquare,
  User,
  Bell,
  Stethoscope,
  Shield,
  Clock,
  Users,
  TrendingUp,
  Pill,
  ClipboardList,
  Star,
  Heart,
  LogOut,
  Home,
  FolderHeart,
  LifeBuoy,
  Bot,
  FileSearch,
  CircleHelp,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { urlDa, viewDoPath, type Role, type View } from "@/lib/rotas";
import { Logo } from "@/components/bion/brand";
import { TemaToggle } from "@/components/bion/TemaToggle";
import { TourGuiado } from "@/components/bion/TourGuiado";

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
  const { sessao } = useBion();

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
      { icon: CircleHelp, label: "Ajuda & FAQ", view: "ajuda" },
      { icon: Shield, label: "Privacidade", view: "privacidade" },
      { icon: User, label: "Meu Perfil", view: "paciente-perfil" },
    ],
    medico: [
      { icon: Home, label: "Início", view: "dashboard" },
      { icon: Calendar, label: "Minha Agenda", view: "consultas" },
      { icon: Users, label: "Pacientes", view: "medico-pacientes" },
      { icon: FolderHeart, label: "Histórico Clínico", view: "historico" },
      { icon: Pill, label: "Receitas & Docs", view: "receitas" },
      { icon: ClipboardList, label: "Prontuários", view: "prontuario" },
      { icon: Star, label: "Minhas Avaliações", view: "avaliacoes" },
      { icon: MessageSquare, label: "Mensagens", view: "mensagens" },
      { icon: Bot, label: "BION Copilot IA", view: "bion-ia" },
      { icon: LifeBuoy, label: "Suporte", view: "suporte" },
      { icon: CircleHelp, label: "Ajuda & FAQ", view: "ajuda" },
      { icon: User, label: "Meu Perfil", view: "medico-perfil" },
    ],
    admin: [
      { icon: Home, label: "Painel Geral", view: "dashboard" },
      { icon: Users, label: "Usuários & CRM", view: "usuarios" },
      { icon: Heart, label: "Pacientes", view: "admin-pacientes" },
      { icon: Stethoscope, label: "Médicos", view: "admin-medicos" },
      { icon: Calendar, label: "Agendamentos", view: "admin-agendamentos" },
      { icon: TrendingUp, label: "Relatórios & PDF", view: "relatorios" },
      { icon: FileSearch, label: "Auditoria", view: "auditoria" },
      { icon: LifeBuoy, label: "Chamados Suporte", view: "suporte" },
      { icon: Bell, label: "Lembretes", view: "lembretes" },
      { icon: CircleHelp, label: "Ajuda & FAQ", view: "ajuda" },
      { icon: Shield, label: "Privacidade & LGPD", view: "privacidade" },
    ],
  };

  const menu = menus[role];

  const rotuloPerfil = { paciente: "Paciente", medico: "Médico", admin: "Administrador" }[role];

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

          {/* Indicador do perfil autenticado */}
          <div className="flex items-center gap-2 bg-muted/70 p-1.5 px-3 rounded-2xl">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold text-foreground hidden sm:inline">{sessao.nome}</span>
            <span className="text-[10px] font-bold text-primary bg-primary-soft px-2 py-0.5 rounded-lg">
              {rotuloPerfil}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <TemaToggle />
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

      <TourGuiado role={role} />

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

/* Wrapper usado pelo layout das rotas autenticadas: deriva a view da URL
   e converte navegação em rotas reais do App Router. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { sessao, sair } = useBion();
  const router = useRouter();
  const pathname = usePathname();
  const view = viewDoPath(pathname);
  const go = (v: View) => router.push(urlDa(v));
  const handleLogout = async () => {
    await sair();
    router.replace("/");
  };
  return (
    <Shell role={sessao.role} view={view} setView={go} onLogout={handleLogout}>
      {children}
    </Shell>
  );
}
