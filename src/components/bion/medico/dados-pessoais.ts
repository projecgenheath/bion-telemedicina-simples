/**
 * Dados pessoais do médico (fase 2, parte 1) — constantes e formatação
 * ISOMÓRFICAS, usadas pelo sheet (cliente) e pelo validador do servidor
 * (src/lib/server/validar-perfil-medico.ts).
 *
 * Privacidade: estes dados são do PRÓPRIO médico (GET/PATCH
 * /api/medico/perfil) e nunca entram no diretório público (medicoWire).
 */

import { hojeEmSaoPaulo, lerDataIso } from "@/lib/idade";

/** Mesmos rótulos do paciente ("Feminino"/"Masculino") + opções neutras. CHECK no banco. */
export const GENEROS_MEDICO = ["Feminino", "Masculino", "Outro", "Prefiro não informar"] as const;
export type GeneroMedico = (typeof GENEROS_MEDICO)[number];

export const IDADE_MINIMA_MEDICO = 18;
export const IDADE_MAXIMA_MEDICO = 100;

/** Formato devolvido por GET/PATCH /api/medico/perfil. */
export type DadosPessoaisMedico = {
  /** "YYYY-MM-DD" (dia de calendário) ou null. */
  dataNascimento: string | null;
  genero: GeneroMedico | null;
  /** Normalizado por validarTelefone: "(11) 91234-5678"; "" = não informado. */
  telefone: string;
  /** Só dígitos (14); "" = não informado. */
  cnpj: string;
};

export function ehGeneroMedico(v: unknown): v is GeneroMedico {
  return typeof v === "string" && (GENEROS_MEDICO as readonly string[]).includes(v);
}

/** Só os dígitos de um CNPJ digitado (com ou sem máscara). */
export function digitosCnpj(v: string): string {
  return v.replace(/\D/g, "");
}

/**
 * Algoritmo oficial dos dígitos verificadores do CNPJ (módulo 11, pesos
 * 5..2,9..2 e 6..2,9..2). Recebe 14 dígitos; rejeita sequências repetidas.
 */
export function cnpjDigitosValidos(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    // n = quantidade de dígitos considerados (12 para o 1º DV, 13 para o 2º)
    let soma = 0;
    let peso = n - 7; // 5 (1º DV) ou 6 (2º DV)
    for (let i = 0; i < n; i++) {
      soma += Number(d[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/** 14 dígitos → "00.000.000/0000-00"; qualquer outra coisa → "". */
export function formatarCnpj(v: string | null | undefined): string {
  const d = digitosCnpj(v ?? "");
  if (d.length !== 14) return "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function iso(ano: number, mes: number, dia: number): string {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Limites do input de data (America/Sao_Paulo): `max` = quem faz 18 anos
 * hoje; `min` = o dia seguinte a quem fez 101 anos (idade ≤ 100).
 * O servidor revalida — isto é só conforto de UI.
 */
export function limitesDataNascimentoMedico(agora: Date = new Date()): { min: string; max: string } {
  const h = hojeEmSaoPaulo(agora);
  // 29/02 em ano não bissexto → 28/02 (max) / 01/03 (min), como idadeDeNascimento.
  const maxAno = h.ano - IDADE_MINIMA_MEDICO;
  const max = lerDataIso(iso(maxAno, h.mes, h.dia)) ? iso(maxAno, h.mes, h.dia) : iso(maxAno, 2, 28);
  const base = new Date(Date.UTC(h.ano - IDADE_MAXIMA_MEDICO - 1, h.mes - 1, h.dia));
  if (base.getUTCMonth() !== h.mes - 1) base.setUTCDate(0); // 29/02 → 28/02
  base.setUTCDate(base.getUTCDate() + 1);
  const min = iso(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
  return { min, max };
}
