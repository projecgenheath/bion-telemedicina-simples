/* ==================================================================== */
/* Mensagens em três colunas (etapa 4, ref. 06) — funções puras.         */
/* Só o que já está no cliente: mensagens do store e a lista de          */
/* pacientes do médico. Sem presença "online" (não existe esse dado).    */
/* ==================================================================== */

import { partesFusoClinica, type Mensagem } from "@/lib/bion-tipos";
import type { PacienteDoMedico } from "../metricas";

export type ItemConversa = {
  paciente: PacienteDoMedico;
  ultima?: Mensagem;
  naoLidas: number;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Conversas do médico: pacientes com ao menos uma mensagem (a mais recente
 * no topo) e o paciente aberto, mesmo sem mensagens. Sem pacienteId não há
 * conversa (consulta legada). Sem mensagens, o paciente aberto vem no topo.
 */
export function conversasDoMedico(
  pacientes: PacienteDoMedico[],
  mensagens: Mensagem[],
  meuId: string,
  naoLidasPorPaciente: ReadonlyMap<string, number>,
  atualChave?: string,
): ItemConversa[] {
  const ultimas = new Map<string, Mensagem>();
  for (const m of mensagens) {
    const outro = m.deId === meuId ? m.paraId : m.paraId === meuId ? m.deId : null;
    if (!outro) continue;
    const u = ultimas.get(outro);
    if (!u || m.ts > u.ts) ultimas.set(outro, m);
  }
  const itens: ItemConversa[] = [];
  for (const p of pacientes) {
    if (!p.pacienteId) continue;
    const ultima = ultimas.get(p.pacienteId);
    if (!ultima && p.chave !== atualChave) continue;
    itens.push({ paciente: p, ultima, naoLidas: naoLidasPorPaciente.get(p.pacienteId) ?? 0 });
  }
  return itens.sort((a, b) => (b.ultima?.ts ?? Number.MAX_SAFE_INTEGER) - (a.ultima?.ts ?? Number.MAX_SAFE_INTEGER));
}

export function filtrarConversas(itens: ItemConversa[], busca: string, soNaoLidas: boolean): ItemConversa[] {
  const q = semAcento(busca.trim());
  return itens.filter((i) => (!soNaoLidas || i.naoLidas > 0) && (!q || semAcento(i.paciente.nome).includes(q)));
}

/** "09:12" hoje, "Ontem", ou "dd/mm" (fuso da clínica). */
export function horaCurta(ts: number, agora: number): string {
  const p = partesFusoClinica(ts);
  const h = partesFusoClinica(agora);
  const mesmo = (a: typeof p, b: typeof p) => a.ano === b.ano && a.mes === b.mes && a.dia === b.dia;
  if (mesmo(p, h)) return `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
  if (mesmo(p, partesFusoClinica(agora - 86_400_000))) return "Ontem";
  return `${String(p.dia).padStart(2, "0")}/${String(p.mes + 1).padStart(2, "0")}`;
}

/** Rótulo do separador de dia: "Hoje", "Ontem" ou "12 de novembro". */
export function rotuloDia(ts: number, agora: number): string {
  const c = horaCurta(ts, agora);
  if (c === "Ontem") return "Ontem";
  if (c.includes(":")) return "Hoje";
  const p = partesFusoClinica(ts);
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const ano = partesFusoClinica(agora).ano !== p.ano ? ` de ${p.ano}` : "";
  return `${p.dia} de ${meses[p.mes]}${ano}`;
}

/** Chave do dia (fuso da clínica) para agrupar a conversa. */
export const chaveDia = (ts: number) => {
  const p = partesFusoClinica(ts);
  return `${p.ano}-${p.mes}-${p.dia}`;
};
