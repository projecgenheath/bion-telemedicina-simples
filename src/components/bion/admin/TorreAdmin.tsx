"use client";

import { useCallback, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  CalendarClock,
  CircleHelp,
  FileChartColumn,
  FileSearch,
  Gauge,
  HeartPulse,
  Inbox,
  LayoutGrid,
  LifeBuoy,
  Lock,
  MessageSquare,
  Shield,
  Stethoscope,
  Wallet,
} from "lucide-react";
import { useBion } from "@/lib/bion-store";
import { PATH_TO_VIEW, urlDa, type View } from "@/lib/rotas";
import { AdminShell, ID_FILA, type GrupoNavAdmin } from "./AdminShell";
import { ContaPainel } from "./comando/ContaPainel";
import { FilaPainel } from "./comando/FilaPainel";
import { ProvedorDadosAdmin, useDadosAdmin } from "./dados";
import { buscarGlobal } from "./busca";
import { contarPorCategoria } from "./metricas";
import { useCascaLarga } from "./ui/preferencias";
import "./admin.css";

type Icone = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const MODULOS: Partial<Record<View, { rotulo: string; icone: Icone }>> = {
  dashboard: { rotulo: "Início", icone: LayoutGrid },
  "admin-agendamentos": { rotulo: "Agendamentos", icone: CalendarClock },
  "admin-medicos": { rotulo: "Médicos", icone: Stethoscope },
  "admin-pacientes": { rotulo: "Pacientes", icone: HeartPulse },
  usuarios: { rotulo: "Médicos", icone: Stethoscope },
  "admin-repasses": { rotulo: "Repasses", icone: Wallet },
  relatorios: { rotulo: "Relatórios", icone: FileChartColumn },
  auditoria: { rotulo: "Auditoria", icone: FileSearch },
  "llm-monitor": { rotulo: "Monitor LLM", icone: Gauge },
  suporte: { rotulo: "Chamados", icone: LifeBuoy },
  privacidade: { rotulo: "Privacidade & LGPD", icone: Shield },
  notificacoes: { rotulo: "Notificações", icone: Bell },
  lembretes: { rotulo: "Lembretes", icone: BellRing },
  ajuda: { rotulo: "Ajuda", icone: CircleHelp },
  mensagens: { rotulo: "Mensagens", icone: MessageSquare },
  travas: { rotulo: "Travas", icone: Lock },
};

const nada = () => () => {};
const hashFila = () => window.location.hash === "#fila";

/**
 * Casca do administrador ligada ao layout autenticado (só papel admin).
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
  const { sessao, sair, naoLidas, naoLidasMensagens, auditLogs, medicos, pacientes, consultas, tickets } = useBion();
  const { fila, reembolsos, repasses, agora } = useDadosAdmin();
  const largo = useCascaLarga();
  const naFila = useSyncExternalStore(nada, hashFila, () => false);

  const comando = path === "/painel";
  const redesenhada =
    comando ||
    view === "admin-repasses" ||
    view === "admin-agendamentos" ||
    view === "admin-medicos" ||
    view === "admin-pacientes" ||
    view === "usuarios" ||
    view === "auditoria" ||
    view === "llm-monitor" ||
    view === "relatorios" ||
    view === "suporte" ||
    view === "privacidade" ||
    view === "notificacoes" ||
    view === "lembretes" ||
    view === "ajuda" ||
    view === "mensagens" ||
    view === "travas";
  const info = view ? MODULOS[view] : undefined;
  const contagem = contarPorCategoria(fila);
  const criticos24h = auditLogs.filter((l) => l.severidade === "critical" && agora - l.ts <= 86_400_000).length;

  const grupos: GrupoNavAdmin[] = [
    {
      rotulo: "Comando",
      itens: [
        { id: "dashboard", rotulo: "Início", icone: LayoutGrid, palavras: "comando painel agora hoje" },
        { id: ID_FILA, rotulo: "Fila", icone: Inbox, selo: fila.length || undefined, palavras: "decisoes pendencias caixa" },
      ],
    },
    {
      rotulo: "Operação",
      itens: [
        { id: "admin-agendamentos", rotulo: "Agendamentos", icone: CalendarClock, selo: reembolsos.dados?.total || undefined, palavras: "consultas agenda remarcar cancelar reembolsos" },
        { id: "admin-medicos", rotulo: "Médicos", icone: Stethoscope, selo: contagem.validacao || undefined, palavras: "crm validacao aprovar suspender" },
        { id: "admin-pacientes", rotulo: "Pacientes", icone: HeartPulse, palavras: "cpf cadastro senha" },
      ],
    },
    {
      rotulo: "Dinheiro",
      itens: [
        { id: "admin-repasses", rotulo: "Repasses", icone: Wallet, selo: repasses.dados?.total || undefined, palavras: "pix pagar dinheiro" },
        { id: "relatorios", rotulo: "Relatórios", icone: FileChartColumn, palavras: "pdf csv indicadores exportar" },
      ],
    },
    {
      rotulo: "Atendimento",
      itens: [
        { id: "suporte", rotulo: "Chamados", icone: LifeBuoy, selo: contagem.chamado || undefined, palavras: "suporte tickets atendimento responder" },
      ],
    },
    {
      rotulo: "Sistema",
      itens: [
        { id: "auditoria", rotulo: "Auditoria", icone: FileSearch, selo: criticos24h || undefined, tomSelo: "critico", palavras: "logs trilha eventos csv pdf" },
        { id: "llm-monitor", rotulo: "Monitor LLM", icone: Gauge, palavras: "ia bion modelo latencia" },
        { id: "privacidade", rotulo: "Privacidade & LGPD", icone: Shield, palavras: "lgpd cofre anonimizar consentimentos titular" },
        { id: "travas", rotulo: "Travas", icone: Lock, palavras: "cron cobranca stripe live trava segredo comprovante" },
        { id: "mensagens", rotulo: "Mensagens", icone: MessageSquare, selo: naoLidasMensagens || undefined, palavras: "conversas chat" },
        { id: "notificacoes", rotulo: "Notificações", icone: Bell, selo: naoLidas || undefined, palavras: "avisos alertas" },
        { id: "lembretes", rotulo: "Lembretes", icone: BellRing, palavras: "horarios" },
        { id: "ajuda", rotulo: "Ajuda", icone: CircleHelp, palavras: "faq duvidas" },
      ],
    },
  ];

  const navegar = (id: string) => {
    if (id === ID_FILA) return router.push("/painel#fila");
    const [destino, consulta] = id.split("?");
    router.push(consulta ? `${urlDa(destino as View)}?${consulta}` : urlDa(destino as View));
  };
  const buscar = useCallback(
    (termo: string) => buscarGlobal(termo, { medicos, pacientes, consultas, tickets }),
    [medicos, pacientes, consultas, tickets],
  );
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
      notificacoesNaoLidas={naoLidas}
      mensagensNaoLidas={naoLidasMensagens}
      onNotificacoes={() => router.push(urlDa("notificacoes"))}
      onMensagens={() => router.push(urlDa("mensagens"))}
      abrirNaFila={comando && naFila}
      buscar={buscar}
      modulo={comando ? undefined : { titulo: info?.rotulo ?? "Página", icone: info?.icone, onVoltar: () => router.push("/painel") }}
    >
      {redesenhada ? children : <div className="ba-folha">{children}</div>}
    </AdminShell>
  );
}
