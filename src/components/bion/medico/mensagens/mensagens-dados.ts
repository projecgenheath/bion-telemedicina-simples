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

/** Item "Mensagens" do menu (rodada do menu): paciente da conversa mais
 *  recente; null quando o médico ainda não tem nenhuma conversa (abre a lista). */
export function ultimaConversa(
  pacientes: PacienteDoMedico[],
  mensagens: Mensagem[],
  meuId: string,
  naoLidasPorPaciente: ReadonlyMap<string, number>,
): PacienteDoMedico | null {
  const primeira = conversasDoMedico(pacientes, mensagens, meuId, naoLidasPorPaciente)[0];
  return primeira?.ultima ? primeira.paciente : null;
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

/* ---------- Termos em destaque (nomes de remédios do próprio paciente) ---------- */

/**
 * Nome do fármaco a partir do que o cliente já tem: "Amitriptilina 25 mg (controlado)" → "Amitriptilina";
 * "Dipirona sódica 1 g" → "Dipirona sódica". Para no primeiro número, parêntese, vírgula ou traço.
 */
export function nomeFarmaco(bruto: string | null | undefined): string {
  if (!bruto) return "";
  const s = bruto.split(/[\d(,;–—-]/)[0].replace(/\s+/g, " ").trim();
  return s.length >= 4 ? s : "";
}

/**
 * Termos a destacar: nomes dos medicamentos em uso e das receitas do paciente (sem repetir, maiores primeiro).
 * Nada de lista fixa: sem dado do paciente, nada é destacado.
 */
export function termosMedicamentos(fontes: (string | null | undefined)[]): string[] {
  const vistos = new Map<string, string>();
  for (const f of fontes) {
    const n = nomeFarmaco(f);
    if (n && !vistos.has(semAcento(n))) vistos.set(semAcento(n), n);
  }
  return [...vistos.values()].sort((a, b) => b.length - a.length);
}

export type TrechoMensagem = { texto: string; destaque: boolean };

/** Quebra o texto nos termos (sem diferenciar maiúsculas nem acentos, só palavra inteira). */
export function destacarTermos(texto: string, termos: string[]): TrechoMensagem[] {
  if (!texto || termos.length === 0) return [{ texto, destaque: false }];
  const base = semAcento(texto);
  const alvos = termos.map(semAcento);
  const partes: TrechoMensagem[] = [];
  let i = 0;
  let ultimo = 0;
  const letra = (c: string | undefined) => !!c && /[a-z0-9]/.test(c);
  while (i < base.length) {
    const t = alvos.find((a) => base.startsWith(a, i) && !letra(base[i - 1]) && !letra(base[i + a.length]));
    if (t) {
      if (i > ultimo) partes.push({ texto: texto.slice(ultimo, i), destaque: false });
      partes.push({ texto: texto.slice(i, i + t.length), destaque: true });
      i += t.length;
      ultimo = i;
    } else i++;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo), destaque: false });
  return partes;
}
