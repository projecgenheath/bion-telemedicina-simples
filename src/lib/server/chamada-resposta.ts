import "server-only";
import { NextResponse } from "next/server";
import { consultaEncerrada } from "@/lib/chamada-recebida-logica";

/**
 * Respostas da rota POST /api/telemedicina/[consultaId]/chamada que levam
 * `motivo` no corpo. Saem direto com NextResponse.json: o falha() de
 * lib/server/http.ts devolve só { erro } e perderia o motivo.
 */
export const MOTIVO_CONSULTA_ENCERRADA = "consulta_encerrada";
export const TEXTO_CONSULTA_ENCERRADA = "Esta consulta foi cancelada ou já foi concluída.";

export function respostaComMotivo(status: number, erro: string, motivo: string): NextResponse {
  return NextResponse.json({ erro, motivo }, { status });
}

/** Consulta cancelada/concluída (valores de Consulta.status no schema): 409 sem gravar nada. null = segue. */
export function bloqueioConsultaEncerrada(statusConsulta: string): NextResponse | null {
  if (!consultaEncerrada(statusConsulta)) return null;
  return respostaComMotivo(409, TEXTO_CONSULTA_ENCERRADA, MOTIVO_CONSULTA_ENCERRADA);
}
