"use client";

import { useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  CalendarDays,
  CircleHelp,
  FileSearch,
  Gauge,
  HeartPulse,
  Home,
  Inbox,
  LifeBuoy,
  MessageSquare,
  Shield,
  Stethoscope,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { PATH_TO_VIEW, urlDa, type View } from "@/lib/rotas";
import { AdminShell, ID_FILA, type GrupoNavAdmin } from "./AdminShell";
import { ContaPainel } from "./comando/ContaPainel";
import { FilaPainel } from "./comando/FilaPainel";
import { ProvedorDadosAdmin, useDadosAdmin } from "./dados";
import { contarPorCategoria } from "./metricas";
import { useLargo } from "./ui/preferencias";
import "./admin.css";

type Icone = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/** Título e ícone de cada rota que o admin pode abrir (as antigas seguem com o visual antigo). */
const MODULOS: Partial<Record<View, { rotulo: string; icone: Icone }>> = {
  dashboard: { rotulo: "Início", icone: Home },
  "admin-agendamentos": { rotulo: "Agendamentos", icone: CalendarDays },
  "admin-medicos": { rotulo: "Médicos", icone: Stethoscope },
  "admin-pacientes": { rotulo: "Pacientes", icone: HeartPulse },
  usuarios: { rotulo: "Usuários & CRM", icone: Users },
  "admin-repasses": { rotulo: "Repasses", icone: Wallet },
  relatorios: { rotulo: "Relatórios", icone: TrendingUp },
  auditoria: { rotulo: "Auditoria", icone: FileSearch },
  "llm-monitor": { rotulo: "Monitor LLM", icone: Gauge },
  suporte: { rotulo: "Chamados", icone: LifeBuoy },
  privacidade: { rotulo: "Privacidade & LGPD", icone: Shield },
  notificacoes: { rotulo: "Notificações", icone: Bell },
  lembretes: { rotulo: "Lembretes", icone: BellRing },
  ajuda: { rotulo: "Ajuda", icone: CircleHelp },
  mensagens: { rotulo: "Mensagens", icone: MessageSquare },
};

const nada = () => () => {};
const hashFila = () => window.location.hash === "#fila";

/**
 * Casca do administrador ligada ao layout autenticado (só papel admin).
 * /painel = Centro de Comando (novo). As demais rotas do admin continuam
 * com as telas atuais, dentro de uma "folha" sólida (legibilidade sobre o
 * céu) até serem redesenhadas nos PRs seguintes.
 */
export function TorreAdmin({ children }: { children: ReactNode }) {
  return (
    <ProvedorDadosAdmin>
      <TorreInterna>{children}</TorreInterna>
    </ProvedorDadosAdmin>
  );
}

function TorreInterna({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const path = (pathname || "/").split("?")[0].replace(/\/+$/, "") || "/";
  const view: View | undefined = PATH_TO_VIEW[path];
  const { sessao, sair, naoLidas, auditLogs } = useBion();
  const { fila, reembolsos, repasses, agora } = useDadosAdmin();
  const largo = useLargo();
  const naFila = useSyncExternalStore(nada, hashFila, () => false);

  const comando = path === "/painel";
  // Telas já redesenhadas no visual Torre não usam a "folha" das telas antigas.
  const redesenhada = comando || view === "admin-repasses" || view === "admin-agendamentos";
  const info = view ? MODULOS[view] : undefined;
  const contagem = contarPorCategoria(fila);
  const criticos24h = auditLogs.filter((l) => l.severidade === "critical" && agora - l.ts <= 86_400_000).length;

  const grupos: GrupoNavAdmin[] = [
    {
      rotulo: "Comando",
      itens: [
        { id: "dashboard", rotulo: "Início", icone: Home },
        { id: ID_FILA, rotulo: "Fila", icone: Inbox, selo: fila.length || undefined },
      ],
    },
    {
      rotulo: "Operação",
      itens: [
        { id: "admin-agendamentos", rotulo: "Agendamentos", icone: CalendarDays, selo: reembolsos.dados?.total || undefined },
        { id: "admin-medicos", rotulo: "Médicos", icone: Stethoscope, selo: contagem.validacao || undefined },
        { id: "admin-pacientes", rotulo: "Pacientes", icone: HeartPulse },
        { id: "usuarios", rotulo: "Usuários & CRM", icone: Users },
      ],
    },
    {
      rotulo: "Dinheiro",
      itens: [
        { id: "admin-repasses", rotulo: "Repasses", icone: Wallet, selo: repasses.dados?.total || undefined },
        { id: "relatorios", rotulo: "Relatórios", icone: TrendingUp },
      ],
    },
    {
      rotulo: "Sistema",
      itens: [
        { id: "auditoria", rotulo: "Auditoria", icone: FileSearch, selo: criticos24h || undefined, tomSelo: "critico" },
        { id: "llm-monitor", rotulo: "Monitor LLM", icone: Gauge },
        { id: "suporte", rotulo: "Chamados", icone: LifeBuoy, selo: contagem.chamado || undefined },
        { id: "privacidade", rotulo: "Privacidade & LGPD", icone: Shield },
      ],
    },
  ];

  const navegar = (id: string) => {
    // Só chega aqui "fila" quando o celular está dentro de um módulo: volta ao Comando já na Fila.
    if (id === ID_FILA) return router.push("/painel#fila");
    // Itens da Fila podem levar parâmetros (ex.: "admin-repasses?repasse=ID").
    const [destino, consulta] = id.split("?");
    router.push(consulta ? `${urlDa(destino as View)}?${consulta}` : urlDa(destino as View));
  };
  const sairDaConta = async () => {
    await sair();
    router.replace("/");
  };

  return (
    <AdminShell
      grupos={grupos}
      ativo={comando ? "dashboard" : (view ?? "")}
      onNavegar={navegar}
      migalhas={[
        { rotulo: "Torre", onClick: () => router.push("/painel") },
        { rotulo: comando ? "Centro de Comando" : (info?.rotulo ?? "Página") },
      ]}
      usuario={{ nome: sessao.nome || "Administrador" }}
      conta={<ContaPainel onAbrir={navegar} onSair={() => void sairDaConta()} comTitulo={!largo} />}
      fila={<FilaPainel onAbrir={navegar} comTitulo={!largo} />}
      filaContagem={fila.length}
      abrirNaFila={comando && naFila}
      modulo={comando ? undefined : { titulo: info?.rotulo ?? "Página", icone: info?.icone, onVoltar: () => router.push("/painel") }}
      acoesBarra={
        <button
          type="button"
          onClick={() => router.push(urlDa("notificacoes"))}
          className="ba-icone-botao relative"
          aria-label={`Notificações${naoLidas ? ` (${naoLidas} não lidas)` : ""}`}
        >
          <Bell className="w-5 h-5" aria-hidden />
          {naoLidas ? <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full" data-tom="atencao" style={{ background: "var(--ba-tom)" }} aria-hidden /> : null}
        </button>
      }
    >
      {redesenhada ? children : <div className="ba-folha">{children}</div>}
    </AdminShell>
  );
}
