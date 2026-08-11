import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ApptStatus = "confirmada" | "cancelada" | "concluida";

export type Consulta = {
  id: string;
  medico: string;
  especialidade: string;
  paciente: string;
  data: string; // "Hoje" | "14 Dez"
  hora: string; // "14:30"
  status: ApptStatus;
  remarcada?: boolean;
  motivoCancelamento?: string;
};

export type Arquivo = {
  id: string;
  nome: string;
  tipo: string;
  tamanhoKb: number;
  enviadoPor: "paciente" | "medico";
  data: string;
  consulta: string;
};

export type NotifTipo = "lembrete" | "mensagem" | "receita" | "agenda" | "exame";

export type Notificacao = {
  id: string;
  tipo: NotifTipo;
  titulo: string;
  texto: string;
  hora: string;
  lida: boolean;
};

let seq = 0;
const uid = () => `id-${++seq}-${Math.random().toString(36).slice(2, 7)}`;

const agora = () =>
  new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const consultasIniciais: Consulta[] = [
  { id: "c1", medico: "Dra. Ana Ribeiro", especialidade: "Clínica Geral", paciente: "Marina Silva", data: "Hoje", hora: "14:30", status: "confirmada" },
  { id: "c2", medico: "Dr. Carlos Mendes", especialidade: "Cardiologia", paciente: "Marina Silva", data: "12 Dez", hora: "15:30", status: "confirmada" },
  { id: "c3", medico: "Dra. Ana Ribeiro", especialidade: "Clínica Geral", paciente: "João Pereira", data: "Hoje", hora: "16:00", status: "confirmada" },
  { id: "c4", medico: "Dra. Julia Lima", especialidade: "Dermatologia", paciente: "Marina Silva", data: "28 Out", hora: "10:00", status: "concluida" },
];

const arquivosIniciais: Arquivo[] = [
  { id: "a1", nome: "hemograma-completo.pdf", tipo: "Exame laboratorial", tamanhoKb: 480, enviadoPor: "paciente", data: "08 Nov 2025", consulta: "Clínica Geral — Dra. Ana Ribeiro" },
  { id: "a2", nome: "receita-losartana.pdf", tipo: "Receita", tamanhoKb: 120, enviadoPor: "medico", data: "12 Nov 2025", consulta: "Clínica Geral — Dra. Ana Ribeiro" },
];

const notificacoesIniciais: Notificacao[] = [
  { id: "n1", tipo: "lembrete", titulo: "Hora do medicamento", texto: "Losartana 50mg — tomar agora.", hora: "08:00", lida: false },
  { id: "n2", tipo: "mensagem", titulo: "Mensagem da Dra. Ana Ribeiro", texto: "Seus exames estão normais 🙂", hora: "09:12", lida: false },
  { id: "n3", tipo: "receita", titulo: "Receita disponível", texto: "Receita de Losartana 50mg pronta para download.", hora: "Ontem", lida: true },
  { id: "n4", tipo: "agenda", titulo: "Consulta confirmada", texto: "Dra. Ana Ribeiro — hoje às 14:30.", hora: "Ontem", lida: true },
];

type Store = {
  consultas: Consulta[];
  arquivos: Arquivo[];
  notificacoes: Notificacao[];
  naoLidas: number;
  cancelarConsulta: (id: string, motivo: string) => void;
  remarcarConsulta: (id: string, data: string, hora: string) => void;
  adicionarConsulta: (c: Omit<Consulta, "id" | "status">) => void;
  adicionarArquivo: (a: Omit<Arquivo, "id" | "data">) => void;
  notificar: (n: Omit<Notificacao, "id" | "hora" | "lida">) => void;
  marcarLida: (id: string) => void;
  marcarTodasLidas: () => void;
};

const BionContext = createContext<Store | null>(null);

export function BionProvider({ children }: { children: ReactNode }) {
  const [consultas, setConsultas] = useState<Consulta[]>(consultasIniciais);
  const [arquivos, setArquivos] = useState<Arquivo[]>(arquivosIniciais);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>(notificacoesIniciais);

  const notificar = useCallback((n: Omit<Notificacao, "id" | "hora" | "lida">) => {
    setNotificacoes((prev) => [{ ...n, id: uid(), hora: agora(), lida: false }, ...prev]);
  }, []);

  const cancelarConsulta = useCallback((id: string, motivo: string) => {
    setConsultas((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "cancelada" as const, motivoCancelamento: motivo } : c)),
    );
    setConsultas((prev) => {
      const c = prev.find((x) => x.id === id);
      if (c) {
        notificar({
          tipo: "agenda",
          titulo: "Consulta cancelada",
          texto: `${c.medico} — ${c.data} às ${c.hora}. Motivo: ${motivo}`,
        });
      }
      return prev;
    });
  }, [notificar]);

  const remarcarConsulta = useCallback((id: string, data: string, hora: string) => {
    setConsultas((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, data, hora, status: "confirmada" as const, remarcada: true } : c,
      ),
    );
    setConsultas((prev) => {
      const c = prev.find((x) => x.id === id);
      if (c) {
        notificar({
          tipo: "agenda",
          titulo: "Consulta remarcada",
          texto: `${c.medico} — novo horário: ${data} às ${hora}. A agenda do médico foi atualizada.`,
        });
      }
      return prev;
    });
  }, [notificar]);

  const adicionarConsulta = useCallback((c: Omit<Consulta, "id" | "status">) => {
    setConsultas((prev) => [{ ...c, id: uid(), status: "confirmada" }, ...prev]);
  }, []);

  const adicionarArquivo = useCallback((a: Omit<Arquivo, "id" | "data">) => {
    const data = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
    setArquivos((prev) => [{ ...a, id: uid(), data }, ...prev]);
    notificar({
      tipo: "exame",
      titulo: a.enviadoPor === "paciente" ? "Exame enviado" : "Novo arquivo do médico",
      texto: `${a.nome} adicionado ao histórico da consulta.`,
    });
  }, [notificar]);

  const marcarLida = useCallback((id: string) => {
    setNotificacoes((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
  }, []);

  const marcarTodasLidas = useCallback(() => {
    setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
  }, []);

  const value = useMemo<Store>(
    () => ({
      consultas,
      arquivos,
      notificacoes,
      naoLidas: notificacoes.filter((n) => !n.lida).length,
      cancelarConsulta,
      remarcarConsulta,
      adicionarConsulta,
      adicionarArquivo,
      notificar,
      marcarLida,
      marcarTodasLidas,
    }),
    [consultas, arquivos, notificacoes, cancelarConsulta, remarcarConsulta, adicionarConsulta, adicionarArquivo, notificar, marcarLida, marcarTodasLidas],
  );

  return <BionContext.Provider value={value}>{children}</BionContext.Provider>;
}

export function useBion() {
  const ctx = useContext(BionContext);
  if (!ctx) throw new Error("useBion deve ser usado dentro de BionProvider");
  return ctx;
}
