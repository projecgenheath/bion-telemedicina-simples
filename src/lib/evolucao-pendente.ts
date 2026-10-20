/**
 * Fila do Admin — "Evolução pendente com paciente esperando" (plano
 * teleconsulta-v2, §3.4 e §5). Função PURA: cruza as consultas com paciente
 * na sala agora com as evoluções em rascunho do MESMO médico (contrato da
 * tabela Evolucao na main: status "rascunho" | "concluida"). É a mesma trava
 * de `medicoLivreAgora` (motivo "evolucao_pendente"): qualquer Evolucao em
 * rascunho do médico, fora a da própria consulta. Regra combinada: com essa
 * trava o job não toca e não cria ChamadaConsulta, então a Fila detecta o caso
 * sozinha. Não cria ChamadaConsulta nem mexe no toque.
 */
import { salaAbertaEm } from "@/lib/janela-sala";

export const STATUS_EVOLUCAO_PENDENTE = ["rascunho"] as const;
/** Ping da presença mais novo que isso = paciente está na sala agora (2 × o ping de 30 s). */
export const PACIENTE_PRESENTE_MS = 60_000;

export type ConsultaEsperando = {
  id: string;
  medicoId: string;
  medico: string;
  paciente: string;
  especialidade: string;
  dataInicio: Date;
  status: string;
  /** Últimos pings do PACIENTE desta consulta na sala. */
  pingsPaciente: Date[];
  /** Desde quando o paciente está na sessão atual (PresencaSala.entrouEm), se houver. */
  entrouEm: Date | null;
};
export type EvolucaoAberta = {
  consultaId: string;
  medicoId: string;
  paciente: string;
  status: string;
  dataInicio: Date; // da consulta da evolução
  consultaStatus: string;
};
export type EvolucaoPendenteItem = {
  consultaId: string;
  dataInicio: string;
  medico: string;
  paciente: string;
  especialidade: string;
  esperandoDesde: string | null;
  pendentes: { consultaId: string; paciente: string; status: "rascunho"; dataInicio: string }[];
};

const ABERTOS = ["confirmada", "em_espera", "pendente_anamnese"];

export function cruzarEvolucaoPendente(esperando: ConsultaEsperando[], evolucoes: EvolucaoAberta[], agora: Date): EvolucaoPendenteItem[] {
  const t = agora.getTime();
  const porMedico = new Map<string, EvolucaoAberta[]>();
  for (const e of evolucoes) {
    if (!(STATUS_EVOLUCAO_PENDENTE as readonly string[]).includes(e.status)) continue;
    porMedico.set(e.medicoId, [...(porMedico.get(e.medicoId) ?? []), e]);
  }
  const out: EvolucaoPendenteItem[] = [];
  for (const c of esperando) {
    if (!ABERTOS.includes(c.status) || !salaAbertaEm(c.dataInicio, t)) continue;
    if (!c.pingsPaciente.some((p) => t - p.getTime() <= PACIENTE_PRESENTE_MS && p.getTime() <= t + 5_000)) continue;
    // Mesma trava de medicoLivreAgora: qualquer rascunho do médico, menos o desta consulta.
    const pend = (porMedico.get(c.medicoId) ?? []).filter((e) => e.consultaId !== c.id);
    if (!pend.length) continue;
    out.push({
      consultaId: c.id,
      dataInicio: c.dataInicio.toISOString(),
      medico: c.medico,
      paciente: c.paciente,
      especialidade: c.especialidade,
      esperandoDesde: c.entrouEm ? c.entrouEm.toISOString() : null,
      pendentes: pend
        .sort((a, b) => a.dataInicio.getTime() - b.dataInicio.getTime())
        .map((e) => ({ consultaId: e.consultaId, paciente: e.paciente, status: "rascunho" as const, dataInicio: e.dataInicio.toISOString() })),
    });
  }
  return out.sort((a, b) => Date.parse(a.esperandoDesde ?? a.dataInicio) - Date.parse(b.esperandoDesde ?? b.dataInicio));
}
