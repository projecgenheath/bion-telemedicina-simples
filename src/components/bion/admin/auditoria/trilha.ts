/**
 * Regras puras da Auditoria do admin (Torre BION). Nada de React aqui:
 * filtros, agrupamento por dia/hora e as linhas do CSV/PDF, tudo no fuso
 * da clínica (America/Sao_Paulo), independentemente do fuso do navegador.
 * Testes: auditoria.teste.ts (rodar também com TZ=UTC e TZ=Asia/Tokyo).
 *
 * A exportação segue a MESMA lógica do AuditTrail antigo (mesmas colunas,
 * mesma ordem, mesmo escape, BOM e nomes de arquivo); a única diferença é
 * que a data sai sempre no fuso da clínica, e não no fuso do navegador.
 */
import { FUSO_CLINICA, instanteFusoClinica, partesFusoClinica, type AuditCategoria, type AuditLog, type AuditSeveridade } from "@/lib/bion-tipos";
import { humanizar, type Tom } from "../rotulos";
import { chaveDia } from "../tempo";

export const CATEGORIAS: { k: AuditCategoria; label: string }[] = [
  { k: "autenticacao", label: "Autenticação" },
  { k: "consulta", label: "Consulta" },
  { k: "documento", label: "Documento" },
  { k: "prontuario", label: "Prontuário" },
  { k: "usuario", label: "Usuário" },
  { k: "admin", label: "Administração" },
  { k: "suporte", label: "Suporte" },
  { k: "consentimento", label: "Consentimento" },
  { k: "sistema", label: "Sistema" },
];

export const PERFIS: { k: string; label: string }[] = [
  { k: "paciente", label: "Paciente" },
  { k: "medico", label: "Médico" },
  { k: "admin", label: "Admin" },
];

export const SEVERIDADES: { k: AuditSeveridade; label: string; tom: Tom }[] = [
  { k: "critical", label: "Crítico", tom: "critico" },
  { k: "warning", label: "Atenção", tom: "atencao" },
  { k: "info", label: "Informativo", tom: "neutro" },
];

export const rotuloCategoria = (c: string) => CATEGORIAS.find((x) => x.k === c)?.label ?? humanizar(c);

/** Perfil legível. "sistema" aparece nos turnos da BION IA (LLM_TURNO). */
export function rotuloPerfil(role: string | null | undefined): string {
  if (role === "medico") return "Médico";
  if (role === "admin") return "Admin";
  if (role === "paciente") return "Paciente";
  return humanizar(role);
}

/** Código do servidor (AUDITORIA_CSV_EXPORTADA) vira frase; texto livre fica como veio. */
export function rotuloAcao(acao: string): string {
  return /^[A-Z0-9_]+$/.test(acao) ? humanizar(acao) : acao;
}

/* ------------------------------------------------------------------ */
/* Filtros                                                             */
/* ------------------------------------------------------------------ */

export type FiltrosAuditoria = {
  busca: string;
  categoria: "todas" | AuditCategoria;
  perfil: string; // "todos" | role
  severidade: "todas" | AuditSeveridade;
  usuario: string; // "todos" | nome
  entidade: string; // "todas" | entidade (minúsculas)
  de: string; // AAAA-MM-DD (dia no fuso da clínica) ou ""
  ate: string;
};

export const FILTROS_VAZIOS: FiltrosAuditoria = {
  busca: "",
  categoria: "todas",
  perfil: "todos",
  severidade: "todas",
  usuario: "todos",
  entidade: "todas",
  de: "",
  ate: "",
};

const DIA_RX = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 00:00 do dia AAAA-MM-DD no fuso da clínica (NaN se inválido). */
export function inicioDoDia(dia: string): number {
  const m = DIA_RX.exec(dia);
  return m ? instanteFusoClinica(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0) : NaN;
}
/** Fim exclusivo: 00:00 do dia seguinte no fuso da clínica. */
export function fimDoDia(dia: string): number {
  const m = DIA_RX.exec(dia);
  if (!m) return NaN;
  const meioDia = instanteFusoClinica(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0) + 86_400_000;
  const p = partesFusoClinica(meioDia);
  return instanteFusoClinica(p.ano, p.mes, p.dia, 0, 0);
}

const norm = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Entidade normalizada (o servidor grava "Repasse" e "repasse"). */
export const entidadeDe = (l: Pick<AuditLog, "entidade">) => norm(l.entidade).trim();

/** Mesmos critérios do AuditTrail antigo + entidade; período no fuso da clínica. Mais recente primeiro. */
export function filtrarEventos(logs: AuditLog[], f: FiltrosAuditoria): AuditLog[] {
  const q = norm(f.busca.trim());
  const de = f.de ? inicioDoDia(f.de) : NaN;
  const ate = f.ate ? fimDoDia(f.ate) : NaN;
  return logs
    .filter((l) => {
      if (f.categoria !== "todas" && l.categoria !== f.categoria) return false;
      if (f.perfil !== "todos" && l.role !== f.perfil) return false;
      if (f.severidade !== "todas" && l.severidade !== f.severidade) return false;
      if (f.usuario !== "todos" && l.usuario !== f.usuario) return false;
      if (f.entidade !== "todas" && entidadeDe(l) !== f.entidade) return false;
      if (Number.isFinite(de) && l.ts < de) return false;
      if (Number.isFinite(ate) && l.ts >= ate) return false;
      if (q && ![l.acao, rotuloAcao(l.acao), l.usuario, l.detalhes, l.entidade, l.entidadeId, l.categoria].some((v) => norm(v).includes(q))) return false;
      return true;
    })
    .sort((a, b) => b.ts - a.ts);
}

/** Quantos filtros (fora a busca) estão ligados. */
export function filtrosAtivos(f: FiltrosAuditoria): number {
  return (
    Number(f.categoria !== "todas") +
    Number(f.perfil !== "todos") +
    Number(f.severidade !== "todas") +
    Number(f.usuario !== "todos") +
    Number(f.entidade !== "todas") +
    Number(Boolean(f.de)) +
    Number(Boolean(f.ate))
  );
}

/** Contagem por chave (categoria ou severidade) para os chips. */
export function contarPor<K extends "categoria" | "severidade">(logs: AuditLog[], chave: K): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of logs) out[l[chave]] = (out[l[chave]] ?? 0) + 1;
  return out;
}

/** Valores distintos (ordenados) para os seletores do filtro. */
export function opcoesFiltro(logs: AuditLog[]): { usuarios: string[]; entidades: string[] } {
  const usuarios = [...new Set(logs.map((l) => l.usuario).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const entidades = [...new Set(logs.map(entidadeDe).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { usuarios, entidades };
}

/** Resumo das últimas 24 h (para o cabeçalho e o selo do trilho). */
export function resumo24h(logs: AuditLog[], agora: number): { criticos: number; avisos: number; total: number } {
  let criticos = 0;
  let avisos = 0;
  let total = 0;
  for (const l of logs) {
    if (l.ts > agora + 60_000 || agora - l.ts > 86_400_000) continue;
    total++;
    if (l.severidade === "critical") criticos++;
    else if (l.severidade === "warning") avisos++;
  }
  return { criticos, avisos, total };
}

/* ------------------------------------------------------------------ */
/* Linha do tempo                                                      */
/* ------------------------------------------------------------------ */

export type GrupoHora = { chave: string; hora: number; ts: number; itens: AuditLog[]; pior: AuditSeveridade };
export type GrupoDia = { dia: string; ts: number; total: number; horas: GrupoHora[] };

const PESO_SEV: Record<string, number> = { critical: 0, warning: 1, info: 2 };
export const piorSeveridade = (itens: Pick<AuditLog, "severidade">[]): AuditSeveridade =>
  itens.reduce<AuditSeveridade>((a, l) => ((PESO_SEV[l.severidade] ?? 2) < (PESO_SEV[a] ?? 2) ? l.severidade : a), "info");

/** Agrupa (lista já ordenada, mais recente primeiro) por dia e por hora cheia, no fuso da clínica. */
export function agruparPorDiaEHora(lista: AuditLog[]): GrupoDia[] {
  const dias: GrupoDia[] = [];
  for (const l of lista) {
    const dia = chaveDia(l.ts);
    const h = partesFusoClinica(l.ts).hora;
    let g = dias[dias.length - 1];
    if (!g || g.dia !== dia) {
      g = { dia, ts: l.ts, total: 0, horas: [] };
      dias.push(g);
    }
    g.total++;
    let gh = g.horas[g.horas.length - 1];
    if (!gh || gh.hora !== h) {
      gh = { chave: `${dia}-${h}`, hora: h, ts: l.ts, itens: [], pior: "info" };
      g.horas.push(gh);
    }
    gh.itens.push(l);
  }
  for (const g of dias) for (const gh of g.horas) gh.pior = piorSeveridade(gh.itens);
  return dias;
}

/** "14:00" (faixa de hora do grupo). */
export const rotuloHora = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** "14:05:09" no fuso da clínica. */
export function horaSegundos(ts: number): string {
  if (!Number.isFinite(ts)) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO_CLINICA, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(ts);
}

/* ------------------------------------------------------------------ */
/* Detalhe                                                             */
/* ------------------------------------------------------------------ */

/** Detalhes em JSON (ex.: turnos da BION IA) saem formatados; texto comum volta null. */
export function jsonFormatado(detalhes: string | null | undefined): string | null {
  const t = String(detalhes ?? "").trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return null;
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return null;
  }
}

/** Para onde "Ver entidade" leva (View de rotas.ts + parâmetros), quando o admin tem uma tela para ela. */
export function destinoEntidade(l: Pick<AuditLog, "entidade" | "entidadeId">): { view: string; rotulo: string } | null {
  const e = entidadeDe(l);
  const id = l.entidadeId ? encodeURIComponent(l.entidadeId) : "";
  if (e === "medico") return id ? { view: `admin-medicos?medico=${id}`, rotulo: "Abrir ficha do médico" } : null;
  if (e === "paciente") return id ? { view: `admin-pacientes?paciente=${id}`, rotulo: "Abrir ficha do paciente" } : null;
  if (e === "consulta") return id ? { view: `admin-agendamentos?consulta=${id}`, rotulo: "Abrir consulta" } : null;
  if (e === "repasse") return id ? { view: `admin-repasses?repasse=${id}`, rotulo: "Abrir repasse" } : null;
  if (e === "reembolso") return { view: "admin-agendamentos?aba=reembolsos", rotulo: "Abrir reembolsos" };
  if (e === "ticket") return { view: id ? `suporte?chamado=${id}` : "suporte", rotulo: id ? "Abrir chamado" : "Abrir chamados" };
  if (e === "llm") return { view: "llm-monitor", rotulo: "Abrir Monitor LLM" };
  return null;
}

/* ------------------------------------------------------------------ */
/* Exportação (mesma lógica do AuditTrail antigo)                     */
/* ------------------------------------------------------------------ */

/** Data/hora completa como no AuditTrail ("06/10/2026, 14:05:09"), mas sempre no fuso da clínica. */
export function formatarDataAuditoria(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", {
    timeZone: FUSO_CLINICA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Igual ao csvLinha do AuditTrail: vírgula, aspas só quando precisa. */
export function csvLinha(valores: (string | number | undefined)[]): string {
  return valores
    .map((v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

export const CABECALHO_CSV = ["Data/Hora", "Usuário", "Perfil", "Ação", "Categoria", "Severidade", "Entidade", "Detalhes"];

/** Conteúdo do CSV (com BOM), exatamente as colunas e valores crus do AuditTrail. */
export function csvAuditoria(filtrados: AuditLog[]): string {
  const linhas = [csvLinha(CABECALHO_CSV)];
  for (const l of filtrados) {
    linhas.push(csvLinha([formatarDataAuditoria(l.ts), l.usuario, l.role, l.acao, l.categoria, l.severidade, l.entidade ?? "", l.detalhes ?? ""]));
  }
  return "\uFEFF" + linhas.join("\n");
}

/** Texto gravado na auditoria ao exportar (o mesmo de antes). */
export const detalheExportacaoCsv = (n: number) => `Exportação CSV da auditoria (${n} registro(s))`;
export const detalheExportacaoPdf = (n: number, paginas: number) => `Exportação PDF da auditoria (${n} registro(s), ${paginas} página(s))`;
