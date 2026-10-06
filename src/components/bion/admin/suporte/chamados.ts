/**
 * Regras puras dos Chamados (Suporte) do admin — Torre BION. Nada de React.
 * Os chamados vêm do store (bootstrap) com a data já formatada no fuso da
 * clínica ("Hoje às 14:05", "Ontem às 09:10", "03/10/2026 às 18:00");
 * aqui ela é lida de volta para ordenar e medir a espera, sempre em SP.
 * Testes: chamados.teste.ts (também com TZ=UTC e TZ=Asia/Tokyo).
 */
import { instanteFusoClinica, partesFusoClinica, type TicketSuporte } from "@/lib/bion-tipos";
import type { Estado } from "../rotulos";

const D = 86_400_000;

export type StatusChamado = TicketSuporte["status"];
export type FiltroStatusChamado = "todos" | StatusChamado;
export type FiltroPerfilChamado = "todos" | TicketSuporte["perfil"];

export const FILTROS_STATUS: { id: FiltroStatusChamado; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "aberto", rotulo: "Abertos" },
  { id: "em_andamento", rotulo: "Em atendimento" },
  { id: "resolvido", rotulo: "Resolvidos" },
];

export const CATEGORIAS_CHAMADO: { id: TicketSuporte["categoria"]; rotulo: string }[] = [
  { id: "tecnico", rotulo: "Técnico / vídeo" },
  { id: "pagamento", rotulo: "Pagamento e reembolso" },
  { id: "agendamento", rotulo: "Agendamento" },
  { id: "outro", rotulo: "Outros assuntos" },
];

export function rotuloCategoriaChamado(c: string): string {
  return CATEGORIAS_CHAMADO.find((x) => x.id === c)?.rotulo ?? (c ? c.charAt(0).toUpperCase() + c.slice(1) : "—");
}

export const rotuloPerfilChamado = (p: string) => (p === "medico" ? "Médico" : "Paciente");

/** Tamanho máximo da resposta (o servidor só faz trim; limite de bom senso para a tela). */
export const RESPOSTA_MAX = 4000;

/** Lê "Hoje às HH:MM" / "Ontem às HH:MM" / "DD/MM/AAAA às HH:MM" (fuso da clínica) → instante. */
export function tsDoChamado(data: string | undefined, agora: number): number | null {
  const t = String(data ?? "").trim();
  const rel = /^(Hoje|Ontem) às (\d{1,2}):(\d{2})$/.exec(t);
  if (rel) {
    const p = partesFusoClinica(agora - (rel[1] === "Ontem" ? D : 0));
    return instanteFusoClinica(p.ano, p.mes, p.dia, Number(rel[2]), Number(rel[3]));
  }
  const abs = /^(\d{2})\/(\d{2})\/(\d{4}) às (\d{1,2}):(\d{2})$/.exec(t);
  if (abs) return instanteFusoClinica(Number(abs[3]), Number(abs[2]) - 1, Number(abs[1]), Number(abs[4]), Number(abs[5]));
  return null;
}

export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export type FiltrosChamado = { busca: string; status: FiltroStatusChamado; perfil: FiltroPerfilChamado; categoria: "todas" | TicketSuporte["categoria"] };
export const FILTROS_CHAMADO_VAZIOS: FiltrosChamado = { busca: "", status: "todos", perfil: "todos", categoria: "todas" };

export const filtrosChamadoAtivos = (f: FiltrosChamado) => f.busca.trim() !== "" || f.status !== "todos" || f.perfil !== "todos" || f.categoria !== "todas";

const PESO_STATUS: Record<StatusChamado, number> = { aberto: 0, em_andamento: 1, resolvido: 2 };

/**
 * Mesmos critérios da tela antiga (assunto + mensagem + usuário; status),
 * agora sem acento e também pela resposta e categoria; mais perfil e categoria.
 * Ordem: pendentes primeiro (aberto → em atendimento → resolvido); dentro
 * dos pendentes, o mais antigo primeiro (quem espera há mais tempo); nos
 * resolvidos, o mais recente primeiro. Sem data legível vai para o fim do grupo.
 */
export function filtrarChamados(tickets: TicketSuporte[], f: FiltrosChamado, agora: number): TicketSuporte[] {
  const termo = normalizar(f.busca);
  const ts = new Map(tickets.map((t) => [t.id, tsDoChamado(t.data, agora)]));
  return tickets
    .filter((t) => {
      if (f.status !== "todos" && t.status !== f.status) return false;
      if (f.perfil !== "todos" && t.perfil !== f.perfil) return false;
      if (f.categoria !== "todas" && t.categoria !== f.categoria) return false;
      if (!termo) return true;
      return normalizar([t.assunto, t.mensagem, t.usuario, t.resposta ?? "", rotuloCategoriaChamado(t.categoria)].join(" ")).includes(termo);
    })
    .sort((a, b) => {
      const s = PESO_STATUS[a.status] - PESO_STATUS[b.status];
      if (s) return s;
      const ta = ts.get(a.id) ?? null;
      const tb = ts.get(b.id) ?? null;
      if (ta === null || tb === null) return ta === null ? (tb === null ? 0 : 1) : -1;
      return a.status === "resolvido" ? tb - ta : ta - tb;
    });
}

export function contarChamados(tickets: TicketSuporte[]): Record<FiltroStatusChamado, number> {
  const c: Record<FiltroStatusChamado, number> = { todos: tickets.length, aberto: 0, em_andamento: 0, resolvido: 0 };
  for (const t of tickets) if (t.status in c) c[t.status]++;
  return c;
}

/** Espera do pendente mais antigo (ms) — null se não houver pendente com data legível. */
export function esperaMaisAntiga(tickets: TicketSuporte[], agora: number): number | null {
  let max: number | null = null;
  for (const t of tickets) {
    if (t.status === "resolvido") continue;
    const ts = tsDoChamado(t.data, agora);
    if (ts === null) continue;
    const espera = Math.max(0, agora - ts);
    if (max === null || espera > max) max = espera;
  }
  return max;
}

/** "agora", "35 min", "3 h", "2 dias". */
export function duracaoCurta(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}

/** Tom da espera de um pendente: até 4 h normal; até 24 h atenção; mais que isso crítico. */
export function estadoEspera(ms: number | null): Estado | null {
  if (ms === null) return null;
  const tom = ms > D ? "critico" : ms > 4 * 3_600_000 ? "atencao" : "neutro";
  return { rotulo: `Esperando há ${duracaoCurta(ms)}`, tom };
}

export type ValidacaoResposta = { ok: boolean; erro?: string };
export function validarResposta(texto: string): ValidacaoResposta {
  const t = texto.trim();
  if (!t) return { ok: false, erro: "Escreva a resposta antes de enviar." };
  if (t.length < 5) return { ok: false, erro: "A resposta está curta demais." };
  if (t.length > RESPOSTA_MAX) return { ok: false, erro: `Use no máximo ${RESPOSTA_MAX} caracteres.` };
  return { ok: true };
}

/**
 * Pessoa por trás do chamado: o chamado só traz o NOME. Só liga à ficha
 * quando há exatamente uma pessoa com esse nome no perfil (homônimo → aviso).
 */
export function pessoaDoChamado(
  t: Pick<TicketSuporte, "usuario" | "perfil">,
  medicos: { id: string; nome: string }[],
  pacientes: { id: string; nome: string }[],
): { destino: string | null; homonimo: boolean } {
  const lista = t.perfil === "medico" ? medicos : pacientes;
  const alvo = normalizar(t.usuario);
  const achados = lista.filter((p) => normalizar(p.nome) === alvo);
  if (achados.length !== 1) return { destino: null, homonimo: achados.length > 1 };
  const id = encodeURIComponent(achados[0].id);
  return { destino: t.perfil === "medico" ? `admin-medicos?medico=${id}` : `admin-pacientes?paciente=${id}`, homonimo: false };
}

/** Outros chamados da mesma pessoa (mesmo nome e perfil), mais recentes primeiro na ordem do store. */
export function outrosDaPessoa(tickets: TicketSuporte[], t: TicketSuporte): TicketSuporte[] {
  const alvo = normalizar(t.usuario);
  return tickets.filter((x) => x.id !== t.id && x.perfil === t.perfil && normalizar(x.usuario) === alvo);
}
