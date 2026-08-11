import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Activity, Calendar, Video, FileText, MessageSquare, User, Bell, Search,
  Stethoscope, Shield, Clock, ChevronRight, Plus, Users, TrendingUp,
  Wifi, Mic, Camera, MonitorUp, Paperclip, PhoneOff, Pill, ClipboardList,
  Star, Award, Globe, ArrowRight, Check, Heart, Sparkles, LogOut, Home,
  FolderHeart, Menu,
} from "lucide-react";
import { BionProvider, useBion } from "@/lib/bion-store";
import { Consulta } from "@/components/bion/Consulta";
import { Notificacoes } from "@/components/bion/Notificacoes";
import { AgendaConsultas } from "@/components/bion/AgendaConsultas";
import { Arquivos } from "@/components/bion/Arquivos";

export const Route = createFileRoute("/")({ component: BionApp });

type Role = "paciente" | "medico" | "admin";
type View =
  | "landing" | "login" | "dashboard" | "agendar" | "sala-espera"
  | "consulta" | "medico-perfil" | "paciente-perfil" | "historico"
  | "mensagens" | "lembretes" | "notificacoes" | "consultas";

function BionApp() {
  return (
    <BionProvider>
      <BionRoot />
    </BionProvider>
  );
}

function BionRoot() {
  const [view, setView] = useState<View>("landing");
  const [role, setRole] = useState<Role>("paciente");

  if (view === "landing") return <Landing onEnter={() => setView("login")} />;
  if (view === "login")
    return <Login onLogin={(r) => { setRole(r); setView("dashboard"); }} />;

  return (
    <Shell role={role} view={view} setView={setView} onLogout={() => setView("landing")}>
      {view === "dashboard" && role === "paciente" && <PacienteDashboard go={setView} />}
      {view === "dashboard" && role === "medico" && <MedicoDashboard go={setView} />}
      {view === "dashboard" && role === "admin" && <AdminDashboard />}
      {view === "agendar" && <Agendar onDone={() => setView("dashboard")} />}
      {view === "sala-espera" && <SalaEspera onEnter={() => setView("consulta")} />}
      {view === "consulta" && <Consulta onEnd={() => setView("dashboard")} role={role} />}
      {view === "notificacoes" && <Notificacoes />}
      {view === "consultas" && <MinhasConsultas perfil={role === "medico" ? "medico" : "paciente"} />}
      {view === "medico-perfil" && <MedicoPerfil />}
      {view === "paciente-perfil" && <PacientePerfil />}
      {view === "historico" && <Historico />}
      {view === "mensagens" && <Mensagens />}
      {view === "lembretes" && <Lembretes />}
    </Shell>
  );
}


/* ---------- Brand ---------- */
function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" };
  return (
    <div className={`font-extrabold tracking-tight ${sizes[size]} flex items-center gap-2`}>
      <div className="relative">
        <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
          <Heart className="w-4 h-4 text-primary-foreground fill-primary-foreground" />
        </div>
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent border-2 border-background" />
      </div>
      <span className="text-primary">BION</span>
    </div>
  );
}

/* ---------- Landing ---------- */
function Landing({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <Logo />
        <button onClick={onEnter} className="px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-medium hover:opacity-90 transition">
          Entrar
        </button>
      </header>
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-24">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-soft text-accent-foreground text-sm font-medium mb-6">
              <Sparkles className="w-4 h-4" style={{color: "var(--accent)"}}/>
              <span style={{color: "var(--accent)"}}>A telemedicina mais simples do Brasil</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-foreground leading-[1.05]">
              Do agendamento à consulta em <span className="text-primary">minutos</span>.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-md">
              Marque, converse com o médico e receba receitas, exames e atestados em um só lugar. Sem burocracia.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={onEnter} className="px-6 py-3.5 rounded-full bg-primary text-primary-foreground font-semibold hover:opacity-90 transition flex items-center gap-2">
                Começar agora <ArrowRight className="w-4 h-4"/>
              </button>
              <button className="px-6 py-3.5 rounded-full border border-border font-semibold hover:bg-muted transition">
                Sou médico
              </button>
            </div>
            <div className="mt-10 flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2"><Shield className="w-4 h-4"/> LGPD</div>
              <div className="flex items-center gap-2"><Check className="w-4 h-4"/> Criptografia</div>
              <div className="flex items-center gap-2"><Star className="w-4 h-4"/> 4.9/5</div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full"/>
            <div className="relative bg-card border rounded-3xl p-6 shadow-xl">
              <div className="flex items-center gap-3 pb-4 border-b">
                <div className="w-12 h-12 rounded-full bg-primary-soft flex items-center justify-center">
                  <Stethoscope className="w-6 h-6 text-primary"/>
                </div>
                <div>
                  <div className="font-semibold">Dra. Ana Ribeiro</div>
                  <div className="text-sm text-muted-foreground">Clínica Geral</div>
                </div>
                <div className="ml-auto text-xs font-medium px-2.5 py-1 rounded-full bg-accent-soft" style={{color: "var(--accent)"}}>Online</div>
              </div>
              <div className="py-5">
                <div className="text-sm text-muted-foreground">Sua próxima consulta</div>
                <div className="text-2xl font-bold mt-1">Hoje, 14:30</div>
                <div className="text-sm text-muted-foreground mt-1">Em 45 minutos</div>
              </div>
              <button onClick={onEnter} className="w-full py-3 rounded-xl text-primary-foreground font-semibold" style={{backgroundColor: "var(--accent)"}}>
                Entrar na sala
              </button>
            </div>
          </div>
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-6">
        {[
          {icon: Calendar, t: "Agende em 1 minuto", d: "Especialidade, médico, horário. Pronto."},
          {icon: Video, t: "Consulta em vídeo HD", d: "Interface simples, sem instalação."},
          {icon: FileText, t: "Tudo em um lugar", d: "Receitas, exames e atestados digitais."},
        ].map((f, i) => (
          <div key={i} className="p-6 rounded-2xl border bg-card hover:shadow-md transition">
            <div className="w-11 h-11 rounded-xl bg-primary-soft flex items-center justify-center mb-4">
              <f.icon className="w-5 h-5 text-primary"/>
            </div>
            <div className="font-semibold text-lg">{f.t}</div>
            <div className="text-sm text-muted-foreground mt-1">{f.d}</div>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ---------- Login ---------- */
function Login({ onLogin }: { onLogin: (r: Role) => void }) {
  const [tab, setTab] = useState<Role>("paciente");
  return (
    <div className="min-h-screen bg-primary-soft flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8"><Logo size="lg"/></div>
        <div className="bg-card border rounded-3xl p-8 shadow-lg">
          <h2 className="text-2xl font-bold">Bem-vindo</h2>
          <p className="text-sm text-muted-foreground mt-1">Escolha seu perfil para continuar</p>
          <div className="grid grid-cols-3 gap-2 mt-6 p-1 bg-muted rounded-xl">
            {(["paciente","medico","admin"] as Role[]).map(r => (
              <button key={r} onClick={() => setTab(r)}
                className={`py-2 rounded-lg text-sm font-medium capitalize transition ${tab===r?"bg-card shadow text-foreground":"text-muted-foreground"}`}>
                {r}
              </button>
            ))}
          </div>
          <div className="mt-6 space-y-3">
            <input placeholder="E-mail, CPF ou telefone" className="w-full px-4 py-3 rounded-xl border bg-background"/>
            <input placeholder="Senha" type="password" className="w-full px-4 py-3 rounded-xl border bg-background"/>
          </div>
          <button onClick={() => onLogin(tab)} className="w-full mt-6 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition">
            Entrar
          </button>
          <div className="mt-4 flex items-center justify-between text-sm">
            <button className="text-primary font-medium">Esqueci a senha</button>
            <button className="text-muted-foreground">Criar conta</button>
          </div>
          <div className="mt-6 pt-4 border-t flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Shield className="w-3.5 h-3.5"/> Login seguro com 2FA opcional
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Shell ---------- */
function Shell({ role, view, setView, onLogout, children }: {
  role: Role; view: View; setView: (v: View)=>void; onLogout: ()=>void; children: React.ReactNode;
}) {
  const menus: Record<Role, {icon: any; label: string; view: View}[]> = {
    paciente: [
      {icon: Home, label: "Início", view: "dashboard"},
      {icon: Calendar, label: "Agendar", view: "agendar"},
      {icon: Clock, label: "Consultas", view: "consultas"},
      {icon: MessageSquare, label: "Mensagens", view: "mensagens"},
      {icon: FolderHeart, label: "Histórico", view: "historico"},
      {icon: Bell, label: "Notificações", view: "notificacoes"},
      {icon: User, label: "Perfil", view: "paciente-perfil"},
    ],
    medico: [
      {icon: Home, label: "Início", view: "dashboard"},
      {icon: Calendar, label: "Agenda", view: "consultas"},
      {icon: MessageSquare, label: "Mensagens", view: "mensagens"},
      {icon: Users, label: "Pacientes", view: "historico"},
      {icon: Bell, label: "Notificações", view: "notificacoes"},
      {icon: User, label: "Meu perfil", view: "medico-perfil"},
    ],
    admin: [
      {icon: Home, label: "Painel", view: "dashboard"},
      {icon: Users, label: "Usuários", view: "historico"},
      {icon: Bell, label: "Lembretes", view: "lembretes"},
      {icon: TrendingUp, label: "Relatórios", view: "dashboard"},
    ],
  };

  const menu = menus[role];
  return (
    <div className="min-h-screen bg-background flex overflow-x-hidden">
      <aside className="hidden md:flex w-64 flex-col border-r bg-card">
        <div className="p-6"><Logo/></div>
        <nav className="flex-1 px-3 space-y-1">
          {menu.map(m => {
            const active = view === m.view;
            return (
              <button key={m.label} onClick={() => setView(m.view)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${active?"bg-primary-soft text-primary":"text-muted-foreground hover:bg-muted"}`}>
                <m.icon className="w-4 h-4"/> {m.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          <div className="flex items-center gap-3 p-2">
            <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
              {role[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium capitalize truncate">{role}</div>
              <div className="text-xs text-muted-foreground truncate">bion.app</div>
            </div>
            <button onClick={onLogout} className="p-1.5 rounded-lg hover:bg-muted" title="Sair"><LogOut className="w-4 h-4"/></button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="h-16 border-b bg-card/60 backdrop-blur flex items-center gap-4 px-4 md:px-6 sticky top-0 z-10">
          <div className="md:hidden"><Logo size="sm"/></div>
          <div className="hidden md:flex items-center gap-2 flex-1 max-w-md px-3 py-2 rounded-xl bg-muted">
            <Search className="w-4 h-4 text-muted-foreground"/>
            <input placeholder="Buscar..." className="bg-transparent outline-none text-sm flex-1"/>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <SinoNotificacoes onClick={() => setView("notificacoes")}/>
            <button onClick={onLogout} className="md:hidden p-2 rounded-lg hover:bg-muted" title="Sair">
              <LogOut className="w-5 h-5"/>
            </button>
          </div>
        </header>
        <div className="p-5 pb-28 md:p-8 md:pb-8 max-w-6xl">{children}</div>
      </main>

      {/* Navegação mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-card border-t flex">
        {menu.slice(0, 5).map(m => {
          const active = view === m.view;
          return (
            <button key={m.label} onClick={() => setView(m.view)}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active?"text-primary":"text-muted-foreground"}`}>
              <m.icon className="w-5 h-5"/>
              {m.label}
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
    <button onClick={onClick} className="p-2 rounded-lg hover:bg-muted relative" title="Notificações">
      <Bell className="w-5 h-5"/>
      {naoLidas > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-primary-foreground flex items-center justify-center"
          style={{backgroundColor: "var(--accent)"}}>{naoLidas}</span>
      )}
    </button>
  );
}

function MinhasConsultas({ perfil }: { perfil: "paciente" | "medico" }) {
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold">{perfil === "medico" ? "Agenda" : "Minhas consultas"}</h1>
      <p className="text-muted-foreground mt-1">
        {perfil === "medico" ? "Cancelamentos e remarcações aparecem aqui automaticamente" : "Cancele ou remarque quando precisar"}
      </p>
      <div className="mt-6"><AgendaConsultas perfil={perfil}/></div>
    </div>
  );
}

/* ---------- Cards ---------- */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-card border rounded-2xl p-5 ${className}`}>{children}</div>;
}
function Stat({ icon: Icon, label, value, tone = "primary" }: any) {
  const bg = tone === "accent" ? "bg-accent-soft" : "bg-primary-soft";
  const color = tone === "accent" ? "var(--accent)" : "var(--primary)";
  return (
    <Card>
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" style={{color}}/>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
    </Card>
  );
}

/* ---------- Paciente ---------- */
function PacienteDashboard({ go }: { go: (v: View)=>void }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Olá, Marina 👋</h1>
        <p className="text-muted-foreground mt-1">Como podemos cuidar de você hoje?</p>
      </div>

      <div className="relative overflow-hidden rounded-3xl p-6 md:p-8 bg-primary text-primary-foreground">
        <div className="absolute -right-16 -bottom-16 w-64 h-64 rounded-full bg-white/10"/>
        <div className="absolute -right-24 top-8 w-40 h-40 rounded-full bg-white/5"/>
        <div className="relative flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <div className="text-sm opacity-80">Próxima consulta</div>
            <div className="text-3xl font-bold mt-1">Dra. Ana Ribeiro</div>
            <div className="opacity-90 mt-1">Clínica Geral • Hoje, 14:30</div>
            <div className="flex items-center gap-2 mt-4 text-sm opacity-90">
              <Clock className="w-4 h-4"/> Em 45 minutos
            </div>
          </div>
          <button onClick={() => go("sala-espera")} className="px-6 py-3.5 rounded-xl bg-white text-primary font-semibold hover:bg-white/90 transition flex items-center gap-2">
            <Video className="w-4 h-4"/> Entrar na sala
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <button onClick={() => go("agendar")} className="group bg-card border rounded-2xl p-5 text-left hover:border-primary transition">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{backgroundColor: "var(--accent-soft)"}}>
            <Plus className="w-5 h-5" style={{color: "var(--accent)"}}/>
          </div>
          <div className="font-semibold text-lg">Agendar consulta</div>
          <div className="text-sm text-muted-foreground">Escolha especialidade e horário</div>
        </button>
        <button onClick={() => go("historico")} className="group bg-card border rounded-2xl p-5 text-left hover:border-primary transition">
          <div className="w-11 h-11 rounded-xl bg-primary-soft flex items-center justify-center mb-3">
            <FolderHeart className="w-5 h-5 text-primary"/>
          </div>
          <div className="font-semibold text-lg">Meu histórico</div>
          <div className="text-sm text-muted-foreground">Receitas, exames e atestados</div>
        </button>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {[
          {icon: FileText, label: "Receitas", count: 3},
          {icon: ClipboardList, label: "Exames", count: 5},
          {icon: Award, label: "Atestados", count: 1},
          {icon: MessageSquare, label: "Mensagens", count: 2},
        ].map((i, k) => (
          <Card key={k} className="hover:shadow-md transition cursor-pointer">
            <div className="flex items-start justify-between">
              <i.icon className="w-5 h-5 text-primary"/>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-soft text-primary">{i.count}</span>
            </div>
            <div className="mt-3 font-semibold">{i.label}</div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold text-lg">Consultas recentes</div>
          <button onClick={() => go("historico")} className="text-sm text-primary font-medium">Ver tudo</button>
        </div>
        <div className="divide-y">
          {[
            {d: "Dr. Carlos Mendes", s: "Cardiologia", date: "12 Nov", status: "Concluída"},
            {d: "Dra. Julia Lima", s: "Dermatologia", date: "28 Out", status: "Concluída"},
          ].map((c, i) => (
            <div key={i} className="py-3 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary-soft flex items-center justify-center">
                <Stethoscope className="w-4 h-4 text-primary"/>
              </div>
              <div className="flex-1">
                <div className="font-medium">{c.d}</div>
                <div className="text-sm text-muted-foreground">{c.s} • {c.date}</div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-accent-soft" style={{color: "var(--accent)"}}>{c.status}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------- Médico ---------- */
function MedicoDashboard({ go }: { go: (v: View)=>void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Bom dia, Dra. Ana</h1>
          <p className="text-muted-foreground mt-1">Você tem 8 consultas hoje</p>
        </div>
        <button onClick={() => go("consulta")} className="px-5 py-3 rounded-xl font-semibold text-primary-foreground flex items-center gap-2 hover:opacity-90 transition" style={{backgroundColor: "var(--accent)"}}>
          <Video className="w-4 h-4"/> Iniciar consulta
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={Calendar} label="Consultas hoje" value="8"/>
        <Stat icon={Users} label="Pacientes atendidos" value="142" tone="accent"/>
        <Stat icon={Clock} label="Próximo em" value="12min"/>
        <Stat icon={TrendingUp} label="Receita do mês" value="R$ 24k" tone="accent"/>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-lg">Próximo paciente</div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-accent-soft" style={{color: "var(--accent)"}}>Em espera</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">MS</div>
              <div className="flex-1">
                <div className="font-semibold">Marina Silva</div>
                <div className="text-sm text-muted-foreground">32 anos • Consulta de retorno</div>
                <div className="text-sm text-muted-foreground mt-0.5">Motivo: revisão de exames</div>
              </div>
              <button onClick={() => go("consulta")} className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium">
                Iniciar
              </button>
            </div>
          </Card>

          <Card>
            <div className="font-semibold text-lg mb-4">Agenda de hoje</div>
            <div className="space-y-2">
              {[
                {h: "14:30", p: "Marina Silva", t: "Retorno", now: true},
                {h: "15:15", p: "João Pereira", t: "Primeira consulta"},
                {h: "16:00", p: "Beatriz Costa", t: "Retorno"},
                {h: "16:45", p: "Rafael Santos", t: "Primeira consulta"},
              ].map((a, i) => (
                <div key={i} className={`flex items-center gap-4 p-3 rounded-xl ${a.now?"bg-primary-soft":"hover:bg-muted"}`}>
                  <div className={`text-sm font-semibold w-14 ${a.now?"text-primary":""}`}>{a.h}</div>
                  <div className="flex-1">
                    <div className="font-medium">{a.p}</div>
                    <div className="text-xs text-muted-foreground">{a.t}</div>
                  </div>
                  {a.now && <span className="text-xs font-semibold text-primary">Agora</span>}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="font-semibold mb-3">Notificações</div>
            <div className="space-y-3">
              {[
                {t: "Novo exame anexado", d: "Marina Silva"},
                {t: "Consulta reagendada", d: "Pedro Alves"},
                {t: "Mensagem recebida", d: "Julia Cardoso"},
              ].map((n, i) => (
                <div key={i} className="flex gap-3">
                  <div className="w-2 h-2 rounded-full mt-2" style={{backgroundColor: "var(--accent)"}}/>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{n.t}</div>
                    <div className="text-xs text-muted-foreground">{n.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="font-semibold mb-3">Pacientes recentes</div>
            <div className="space-y-3">
              {["Marina Silva","João Pereira","Beatriz Costa"].map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-soft flex items-center justify-center text-primary text-xs font-semibold">
                    {p.split(" ").map(w=>w[0]).join("")}
                  </div>
                  <div className="text-sm">{p}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------- Admin ---------- */
function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Painel administrativo</h1>
        <p className="text-muted-foreground mt-1">Indicadores em tempo real</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat icon={Stethoscope} label="Médicos ativos" value="248"/>
        <Stat icon={Users} label="Pacientes cadastrados" value="12.4k" tone="accent"/>
        <Stat icon={Calendar} label="Consultas do dia" value="1.284"/>
        <Stat icon={Video} label="Em andamento" value="47" tone="accent"/>
        <Stat icon={TrendingUp} label="Receita" value="R$ 384k"/>
        <Stat icon={MessageSquare} label="Chamados abertos" value="12"/>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <div className="font-semibold text-lg mb-4">Atividade das últimas 24h</div>
          <div className="h-48 flex items-end gap-2">
            {[40,65,50,80,72,90,60,85,70,95,88,100].map((h,i)=>(
              <div key={i} className="flex-1 rounded-t-lg bg-primary/80" style={{height: `${h}%`}}/>
            ))}
          </div>
        </Card>
        <Card>
          <div className="font-semibold text-lg mb-4">Especialidades mais buscadas</div>
          <div className="space-y-3">
            {[
              {n: "Clínica Geral", p: 85},
              {n: "Dermatologia", p: 62},
              {n: "Cardiologia", p: 48},
              {n: "Pediatria", p: 40},
            ].map((s,i)=>(
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{s.n}</span>
                  <span className="text-muted-foreground">{s.p}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{width: `${s.p}%`}}/>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Agendar ---------- */
function Agendar({ onDone }: { onDone: ()=>void }) {
  const [step, setStep] = useState(0);
  const steps = ["Especialidade","Médico","Data","Horário","Motivo","Pagamento","Confirmação"];
  const next = () => setStep(s => Math.min(s+1, steps.length-1));
  const specs = ["Clínica Geral","Dermatologia","Cardiologia","Pediatria","Psicologia","Ortopedia"];
  const docs = [
    {n: "Dra. Ana Ribeiro", cr: "CRM 12345", v: "R$ 150", r: 4.9},
    {n: "Dr. Carlos Mendes", cr: "CRM 23456", v: "R$ 180", r: 4.8},
    {n: "Dra. Julia Lima", cr: "CRM 34567", v: "R$ 160", r: 5.0},
  ];
  const times = ["09:00","10:00","11:00","14:00","15:30","16:30"];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Agendar consulta</h1>
        <p className="text-muted-foreground mt-1">Passo {step+1} de {steps.length} — {steps[step]}</p>
        <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{width: `${((step+1)/steps.length)*100}%`}}/>
        </div>
      </div>

      <Card className="p-8">
        {step === 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {specs.map(s => (
              <button key={s} onClick={next} className="p-4 rounded-xl border hover:border-primary hover:bg-primary-soft transition text-left">
                <Stethoscope className="w-5 h-5 text-primary mb-2"/>
                <div className="font-medium">{s}</div>
              </button>
            ))}
          </div>
        )}
        {step === 1 && (
          <div className="space-y-3">
            {docs.map(d => (
              <button key={d.n} onClick={next} className="w-full p-4 rounded-xl border hover:border-primary transition flex items-center gap-4 text-left">
                <div className="w-14 h-14 rounded-full bg-primary-soft flex items-center justify-center text-primary font-semibold">
                  {d.n.split(" ").slice(-2).map(w=>w[0]).join("")}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{d.n}</div>
                  <div className="text-sm text-muted-foreground">{d.cr}</div>
                  <div className="flex items-center gap-1 text-xs mt-1"><Star className="w-3 h-3 fill-current" style={{color: "var(--accent)"}}/> {d.r}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{d.v}</div>
                  <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground mt-1"/>
                </div>
              </button>
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
            {Array.from({length: 14}).map((_,i)=>(
              <button key={i} onClick={next} className="p-3 rounded-xl border hover:border-primary hover:bg-primary-soft transition text-center">
                <div className="text-xs text-muted-foreground">{["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"][i%7]}</div>
                <div className="font-semibold mt-1">{15+i}</div>
              </button>
            ))}
          </div>
        )}
        {step === 3 && (
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            {times.map(t => (
              <button key={t} onClick={next} className="p-3 rounded-xl border hover:border-primary hover:bg-primary-soft transition font-medium">
                {t}
              </button>
            ))}
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <textarea placeholder="Descreva brevemente o motivo da consulta..." rows={5} className="w-full px-4 py-3 rounded-xl border bg-background"/>
            <button className="w-full p-4 rounded-xl border border-dashed hover:bg-muted flex items-center justify-center gap-2 text-muted-foreground">
              <Paperclip className="w-4 h-4"/> Anexar exames (opcional)
            </button>
            <button onClick={next} className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold">Continuar</button>
          </div>
        )}
        {step === 5 && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-muted">
              <div className="flex justify-between text-sm"><span>Consulta</span><span>R$ 150,00</span></div>
              <div className="flex justify-between font-bold mt-2 pt-2 border-t"><span>Total</span><span>R$ 150,00</span></div>
            </div>
            <div className="space-y-2">
              {["Pix (aprovação imediata)","Cartão de crédito","Boleto"].map((m,i)=>(
                <label key={i} className="flex items-center gap-3 p-4 rounded-xl border cursor-pointer hover:border-primary">
                  <input type="radio" name="pay" defaultChecked={i===0}/>
                  <span className="font-medium">{m}</span>
                </label>
              ))}
            </div>
            <button onClick={next} className="w-full py-3.5 rounded-xl text-primary-foreground font-semibold" style={{backgroundColor: "var(--accent)"}}>Confirmar pagamento</button>
          </div>
        )}
        {step === 6 && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{backgroundColor: "var(--accent-soft)"}}>
              <Check className="w-8 h-8" style={{color: "var(--accent)"}}/>
            </div>
            <h2 className="text-2xl font-bold mt-4">Consulta agendada!</h2>
            <p className="text-muted-foreground mt-2">Dra. Ana Ribeiro • 15 Nov, 15:30</p>
            <p className="text-sm text-muted-foreground mt-1">Enviamos os detalhes para seu e-mail.</p>
            <button onClick={onDone} className="mt-6 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold">
              Voltar ao início
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------- Sala de Espera ---------- */
function SalaEspera({ onEnter }: { onEnter: ()=>void }) {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">Sala de espera</h1>
      <p className="text-muted-foreground mt-1">Preparando sua consulta</p>

      <div className="mt-6 grid md:grid-cols-2 gap-6">
        <Card className="text-center py-10">
          <div className="text-sm text-muted-foreground">Sua consulta começa em</div>
          <div className="text-5xl font-bold text-primary mt-2 tabular-nums">02:34</div>
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary-soft flex items-center justify-center">
              <Stethoscope className="w-6 h-6 text-primary"/>
            </div>
            <div className="text-left">
              <div className="font-semibold">Dra. Ana Ribeiro</div>
              <div className="text-sm text-muted-foreground">Clínica Geral</div>
            </div>
          </div>
          <button onClick={onEnter} className="mt-6 px-6 py-3.5 rounded-xl text-primary-foreground font-semibold w-full max-w-xs" style={{backgroundColor: "var(--accent)"}}>
            Entrar na consulta
          </button>
        </Card>

        <div className="space-y-3">
          <Card className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center">
              <Camera className="w-5 h-5" style={{color: "var(--accent)"}}/>
            </div>
            <div className="flex-1">
              <div className="font-medium">Câmera</div>
              <div className="text-sm text-muted-foreground">Funcionando corretamente</div>
            </div>
            <Check className="w-5 h-5" style={{color: "var(--accent)"}}/>
          </Card>
          <Card className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center">
              <Mic className="w-5 h-5" style={{color: "var(--accent)"}}/>
            </div>
            <div className="flex-1">
              <div className="font-medium">Microfone</div>
              <div className="text-sm text-muted-foreground">Nível de áudio OK</div>
            </div>
            <Check className="w-5 h-5" style={{color: "var(--accent)"}}/>
          </Card>
          <Card className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center">
              <Wifi className="w-5 h-5" style={{color: "var(--accent)"}}/>
            </div>
            <div className="flex-1">
              <div className="font-medium">Conexão</div>
              <div className="text-sm text-muted-foreground">Excelente • 45 Mbps</div>
            </div>
            <Check className="w-5 h-5" style={{color: "var(--accent)"}}/>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------- Perfis ---------- */
function MedicoPerfil() {
  return (
    <div className="max-w-4xl">
      <Card className="p-8">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-32 h-32 rounded-3xl bg-primary text-primary-foreground flex items-center justify-center text-4xl font-bold">AR</div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">Dra. Ana Ribeiro</h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-accent-soft" style={{color: "var(--accent)"}}>Verificada</span>
            </div>
            <div className="text-muted-foreground mt-1">Clínica Geral • CRM 12345 SP</div>
            <div className="flex items-center gap-4 mt-3 text-sm">
              <div className="flex items-center gap-1"><Star className="w-4 h-4 fill-current" style={{color: "var(--accent)"}}/> 4.9 (312 avaliações)</div>
              <div className="flex items-center gap-1 text-muted-foreground"><Globe className="w-4 h-4"/> PT, EN, ES</div>
            </div>
            <div className="mt-4 text-2xl font-bold text-primary">R$ 150 <span className="text-sm font-normal text-muted-foreground">/ consulta</span></div>
          </div>
        </div>
      </Card>
      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <Card>
          <div className="font-semibold mb-3">Subespecialidades</div>
          <div className="flex flex-wrap gap-2">
            {["Medicina preventiva","Check-up","Doenças crônicas"].map(s=>(
              <span key={s} className="px-3 py-1 rounded-full bg-primary-soft text-primary text-sm">{s}</span>
            ))}
          </div>
        </Card>
        <Card>
          <div className="font-semibold mb-3">Formação</div>
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">USP</span> — Medicina, 2012</div>
            <div><span className="font-medium">HC-FMUSP</span> — Residência, 2015</div>
          </div>
        </Card>
        <Card className="md:col-span-2">
          <div className="font-semibold mb-3">Horários disponíveis</div>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
            {["Ter 09:00","Ter 10:00","Qua 14:00","Qui 15:30","Qui 16:30","Sex 09:00"].map(t=>(
              <button key={t} className="p-2 rounded-lg border text-sm hover:border-primary hover:bg-primary-soft">{t}</button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function PacientePerfil() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-6">
        <div className="w-24 h-24 rounded-3xl bg-primary text-primary-foreground flex items-center justify-center text-3xl font-bold">MS</div>
        <div>
          <h1 className="text-3xl font-bold">Marina Silva</h1>
          <p className="text-muted-foreground">32 anos • Feminino</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <div className="font-semibold mb-3">Dados pessoais</div>
          <div className="space-y-2 text-sm">
            <Row k="CPF" v="123.456.789-00"/>
            <Row k="E-mail" v="marina@email.com"/>
            <Row k="Telefone" v="(11) 99999-0000"/>
            <Row k="Convênio" v="Particular"/>
          </div>
        </Card>
        <Card>
          <div className="font-semibold mb-3">Saúde</div>
          <div className="space-y-2 text-sm">
            <Row k="Alergias" v="Dipirona"/>
            <Row k="Medicamentos" v="Losartana 50mg"/>
            <Row k="Tipo sanguíneo" v="O+"/>
          </div>
        </Card>
      </div>
    </div>
  );
}
function Row({k,v}:{k:string;v:string}) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
}

/* ---------- Histórico ---------- */
function Historico() {
  const items = [
    {t: "Receita — Losartana", d: "Dra. Ana Ribeiro • 12 Nov 2025", icon: Pill},
    {t: "Exame — Hemograma completo", d: "Lab Vida • 08 Nov 2025", icon: ClipboardList},
    {t: "Atestado — 2 dias", d: "Dr. Carlos Mendes • 28 Out 2025", icon: Award},
    {t: "Consulta — Cardiologia", d: "Dr. Carlos Mendes • 28 Out 2025", icon: Stethoscope},
    {t: "Receita — Vitamina D", d: "Dra. Julia Lima • 15 Out 2025", icon: Pill},
  ];
  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-bold">Histórico</h1>
      <p className="text-muted-foreground mt-1">Todos os seus documentos e consultas</p>

      <div className="mt-6">
        <div className="font-semibold text-lg mb-3">Exames e arquivos</div>
        <Arquivos perfil="paciente"/>
      </div>

      <div className="mt-8 font-semibold text-lg">Registros clínicos</div>
      <div className="mt-3 space-y-2">
        {items.map((i,k)=>(
          <Card key={k} className="flex items-center gap-4 hover:border-primary transition cursor-pointer">
            <div className="w-11 h-11 rounded-xl bg-primary-soft flex items-center justify-center">
              <i.icon className="w-5 h-5 text-primary"/>
            </div>
            <div className="flex-1">
              <div className="font-semibold">{i.t}</div>
              <div className="text-sm text-muted-foreground">{i.d}</div>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground"/>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------- Mensagens ---------- */
function Mensagens() {
  const conversas = [
    {n: "Dra. Ana Ribeiro", e: "Clínica Geral", m: "Seus exames estão normais 🙂", h: "09:12", nao: 2, on: true},
    {n: "Dr. Carlos Mendes", e: "Cardiologia", m: "Mantenha a medicação por 30 dias.", h: "Ontem", nao: 0, on: false},
    {n: "Suporte BION", e: "Atendimento", m: "Como podemos ajudar você hoje?", h: "Seg", nao: 0, on: true},
  ];
  const [ativa, setAtiva] = useState(0);
  const [texto, setTexto] = useState("");
  const [msgs, setMsgs] = useState([
    {eu: false, t: "Olá! Recebi o resultado do seu hemograma.", h: "09:05"},
    {eu: false, t: "Está tudo dentro do esperado, sem alterações.", h: "09:06"},
    {eu: true, t: "Que ótimo, obrigada doutora!", h: "09:10"},
    {eu: false, t: "Seus exames estão normais 🙂", h: "09:12"},
  ]);
  const enviar = () => {
    if (!texto.trim()) return;
    setMsgs(m => [...m, {eu: true, t: texto.trim(), h: "agora"}]);
    setTexto("");
  };
  const c = conversas[ativa]!;
  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold">Mensagens</h1>
      <p className="text-muted-foreground mt-1">Fale com seu médico entre as consultas</p>
      <div className="mt-6 grid md:grid-cols-[280px_1fr] gap-4 min-w-0">
        <div className="space-y-2">
          {conversas.map((k, i) => (
            <button key={k.n} onClick={() => setAtiva(i)}
              className={`w-full text-left bg-card border rounded-2xl p-3 flex items-center gap-3 transition ${i===ativa?"border-primary bg-primary-soft":"hover:border-primary"}`}>
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
                  {k.n.split(" ")[1]?.[0] ?? k.n[0]}
                </div>
                {k.on && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card" style={{backgroundColor:"var(--accent)"}}/>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{k.n}</div>
                <div className="text-xs text-muted-foreground truncate">{k.m}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-muted-foreground">{k.h}</div>
                {k.nao > 0 && (
                  <span className="inline-block mt-1 text-[10px] font-bold text-accent-foreground rounded-full px-1.5" style={{backgroundColor:"var(--accent)"}}>{k.nao}</span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="bg-card border rounded-2xl flex flex-col min-h-[420px] min-w-0">
          <div className="flex items-center gap-3 p-4 border-b">
            <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
              {c.n.split(" ")[1]?.[0] ?? c.n[0]}
            </div>
            <div>
              <div className="text-sm font-semibold">{c.n}</div>
              <div className="text-xs text-muted-foreground">{c.e} • {c.on ? "online" : "offline"}</div>
            </div>
          </div>
          <div className="flex-1 p-4 space-y-3 overflow-y-auto">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.eu ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.eu ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.t}
                  <div className={`text-[10px] mt-1 ${m.eu ? "opacity-70" : "text-muted-foreground"}`}>{m.h}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-muted"><Paperclip className="w-4 h-4 text-muted-foreground"/></button>
            <input value={texto} onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") enviar(); }}
              placeholder="Escreva uma mensagem..."
              className="flex-1 bg-muted rounded-xl px-3 py-2.5 text-sm outline-none"/>
            <button onClick={enviar} className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Lembretes ---------- */
function Lembretes() {
  const [itens, setItens] = useState([
    {t: "Losartana 50mg", d: "Todos os dias às 08:00", tipo: "Medicação", icon: Pill, feito: false},
    {t: "Vitamina D", d: "Domingos às 10:00", tipo: "Medicação", icon: Pill, feito: true},
    {t: "Retorno com Dr. Carlos", d: "12 de dezembro, 15:30", tipo: "Consulta", icon: Stethoscope, feito: false},
    {t: "Exame de sangue em jejum", d: "20 de dezembro, 07:00", tipo: "Exame", icon: ClipboardList, feito: false},
  ]);
  const toggle = (i: number) =>
    setItens(l => l.map((x, k) => (k === i ? { ...x, feito: !x.feito } : x)));
  const pendentes = itens.filter(i => !i.feito).length;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl md:text-3xl font-bold">Lembretes</h1>
      <p className="text-muted-foreground mt-1">
        {pendentes} lembrete{pendentes === 1 ? "" : "s"} pendente{pendentes === 1 ? "" : "s"}
      </p>

      <div className="mt-6 space-y-2">
        {itens.map((i, k) => (
          <Card key={k} className={`flex items-center gap-4 ${i.feito ? "opacity-55" : ""}`}>
            <div className="w-11 h-11 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
              <i.icon className="w-5 h-5 text-primary"/>
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-semibold ${i.feito ? "line-through" : ""}`}>{i.t}</div>
              <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5"/> {i.d}
              </div>
              <span className="inline-block mt-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {i.tipo}
              </span>
            </div>
            <button onClick={() => toggle(k)}
              className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition ${i.feito ? "bg-accent border-transparent" : "border-border hover:border-primary"}`}
              title={i.feito ? "Marcar como pendente" : "Marcar como concluído"}>
              <Check className={`w-4 h-4 ${i.feito ? "text-accent-foreground" : "text-muted-foreground"}`}/>
            </button>
          </Card>
        ))}
      </div>

      <button className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed text-sm font-semibold text-muted-foreground hover:border-primary hover:text-primary transition">
        <Plus className="w-4 h-4"/> Criar novo lembrete
      </button>
    </div>
  );
}
