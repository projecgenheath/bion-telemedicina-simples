/**
 * Contexto da BION IA para o PACIENTE (montado no servidor, nunca do cliente).
 *
 * LGPD / M6: nome, e-mail, CPF, telefone, CEP e data de nascimento NÃO entram
 * (o texto ainda passa pela anonimização da rota). Vão só dados clínicos
 * mínimos, cobertos pelo aceite da IA (Termos/Privacidade vigentes + aviso
 * NVIDIA): idade, sexo, alergias, medicamentos, condições, consultas, exames
 * e triagens (só a queixa, curta). Sem aceite, a rota nem chega aqui (403).
 */
import { db } from "@/lib/db";
import { quandoClinica } from "@/lib/server/fuso";
import { nomesMedicamentosEmUso } from "@/lib/server/medicamentos-legado";
import { dataNascimentoParaIso, idadeDeNascimento } from "@/lib/idade";

export type DadosContextoPaciente = {
  idade: number | null;
  genero: string;
  alergias: string[];
  medicamentos: string[];
  condicoes: string[];
  proximas: { especialidade: string; medico: string; quando: string }[];
  anteriores: { especialidade: string; quando: string; motivo: string | null }[];
  exames: { titulo: string; quando: string }[];
  triagens: { especialidade: string; queixa: string }[];
  medicosDisponiveis: { especialidade: string; medico: string }[];
};

const curto = (t: string, n = 120) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const lista = (v: string | null | undefined): string[] => {
  try {
    const j = JSON.parse(v || "[]");
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => curto(x.trim(), 60)) : [];
  } catch {
    return [];
  }
};

/** Texto do contexto (puro, testável). Vazio quando não há nada. */
export function resumoPacienteTexto(d: DadosContextoPaciente): string {
  const l: string[] = [];
  const perfil = [d.idade != null && d.idade > 0 ? `${d.idade} anos` : "", d.genero].filter(Boolean).join(", ");
  if (perfil) l.push(`Perfil: ${perfil}.`);
  l.push(`Alergias: ${d.alergias.length ? d.alergias.join(", ") : "nenhuma informada"}.`);
  l.push(`Medicamentos em uso: ${d.medicamentos.length ? d.medicamentos.join(", ") : "nenhum informado"}.`);
  if (d.condicoes.length) l.push(`Condições/comorbidades: ${d.condicoes.join(", ")}.`);
  if (d.proximas.length) l.push(`Próximas consultas: ${d.proximas.map((c) => `${c.especialidade} com ${c.medico} em ${c.quando}`).join("; ")}.`);
  if (d.anteriores.length)
    l.push(`Consultas anteriores: ${d.anteriores.map((c) => `${c.especialidade} em ${c.quando}${c.motivo ? ` (motivo: ${c.motivo})` : ""}`).join("; ")}.`);
  if (d.exames.length) l.push(`Exames/laudos enviados: ${d.exames.map((e) => `${e.titulo} (${e.quando})`).join("; ")}.`);
  if (d.triagens.length) l.push(`Triagens feitas: ${d.triagens.map((t) => `${t.especialidade}: ${t.queixa}`).join("; ")}.`);
  if (d.medicosDisponiveis.length)
    l.push(`Médicos do BION disponíveis: ${d.medicosDisponiveis.map((m) => `${m.medico} (${m.especialidade})`).join("; ")}.`);
  return l.join("\n");
}

/** Prompt do sistema do PACIENTE: papel no app, regras e a ação de agendar. */
export function promptPaciente(contexto: string): string {
  return [
    "Você é a BION IA, assistente do app de telemedicina BION, falando com a PACIENTE/o PACIENTE em PT-BR, tratando por \"você\".",
    "No app você pode: tirar dúvidas de saúde, explicar exames/laudos que a pessoa enviou, e ajudar a AGENDAR consulta com um médico do BION. A triagem completa é opcional e fica no card da consulta, não aqui.",
    "Use o contexto clínico abaixo (alergias, remédios, condições, consultas, exames e triagens) para personalizar. Não diga que não tem acesso ao histórico. Não invente dados que não estão nele.",
    "Quando a pessoa relatar um SINTOMA: acolha em 1 frase; faça no máximo 2 perguntas básicas (desde quando, intensidade 0-10, febre ou outro sintoma) levando em conta o histórico; cite sinais de alarme só se pertinentes; e OFEREÇA marcar consulta com um médico do BION. Ao oferecer, termine a resposta com a linha [[AGENDAR: <especialidade>]] usando uma especialidade da lista de médicos disponíveis (ou [[AGENDAR]] se nenhuma servir). Também use o marcador quando a pessoa pedir para marcar/agendar.",
    "Pedido administrativo (receita, documento, remarcar) recebe o caminho prático no app, sem interrogatório de sintomas.",
    "Não prescreva nem dê diagnóstico fechado. Sinais de emergência (dor no peito, falta de ar, desmaio, fraqueza de um lado, rigidez de nuca com febre, sangramento intenso): oriente ligar já para o SAMU 192 ou ir ao pronto-socorro. Urgência: SAMU 192.",
    "Respostas curtas: 2 a 5 frases.",
    contexto ? `\nContexto da paciente/do paciente no BION (sem identificadores):\n${contexto}` : "",
  ].join("\n");
}

/** Carrega do banco (só o necessário, com limites). */
export async function carregarContextoPaciente(userId: string): Promise<DadosContextoPaciente> {
  const agora = new Date();
  const [perfil, proximas, anteriores, exames, triagens, medicos] = await Promise.all([
    db.perfilPaciente.findUnique({
      where: { userId },
      select: { idade: true, dataNascimento: true, genero: true, alergias: true, medicamentos: true, comorbidades: true },
    }),
    db.consulta.findMany({
      where: { pacienteId: userId, status: "confirmada", dataInicio: { gte: agora } },
      select: { especialidade: true, dataInicio: true, medico: { select: { nome: true } } },
      orderBy: { dataInicio: "asc" },
      take: 3,
    }),
    db.consulta.findMany({
      where: { pacienteId: userId, status: "concluida" },
      select: { especialidade: true, dataInicio: true, motivoConsulta: true },
      orderBy: { dataInicio: "desc" },
      take: 3,
    }),
    db.exameLaboratorial.findMany({
      where: { usuarioId: userId },
      select: { titulo: true, dataColeta: true },
      orderBy: { dataColeta: "desc" },
      take: 5,
    }),
    db.anamnese.findMany({
      where: { usuarioId: userId, status: "concluida" },
      select: { coleta: true, consulta: { select: { especialidade: true } } },
      orderBy: { updatedAt: "desc" },
      take: 2,
    }),
    db.perfilMedico.findMany({
      where: { status: "ativo", user: { status: "ativo" } },
      select: { especialidade: true, user: { select: { nome: true } } },
      take: 8,
    }).catch(() => [] as { especialidade: string; user: { nome: string } }[]),
  ]);
  const iso = dataNascimentoParaIso(perfil?.dataNascimento);
  const idade = iso ? idadeDeNascimento(iso, agora) : perfil?.idade || null;
  return {
    idade: idade ?? null,
    genero: perfil?.genero ?? "",
    alergias: lista(perfil?.alergias),
    medicamentos: perfil ? (await nomesMedicamentosEmUso(userId, perfil.medicamentos)).map((m) => curto(m, 60)) : [],
    condicoes: lista(perfil?.comorbidades),
    proximas: proximas.map((c) => ({ especialidade: c.especialidade, medico: c.medico.nome, quando: quandoClinica(c.dataInicio) })),
    anteriores: anteriores.map((c) => ({
      especialidade: c.especialidade,
      quando: quandoClinica(c.dataInicio),
      motivo: c.motivoConsulta ? curto(c.motivoConsulta, 80) : null,
    })),
    exames: exames.map((e) => ({ titulo: curto(e.titulo, 60), quando: quandoClinica(e.dataColeta) })),
    triagens: triagens
      .map((t) => {
        let queixa = "";
        try {
          const c = JSON.parse(t.coleta || "{}") as { queixa?: { relato?: unknown } };
          queixa = typeof c.queixa?.relato === "string" ? c.queixa.relato : "";
        } catch {
          queixa = "";
        }
        return { especialidade: t.consulta.especialidade, queixa: curto(queixa.trim(), 100) };
      })
      .filter((t) => t.queixa && t.queixa !== "não informado"),
    medicosDisponiveis: medicos.map((m) => ({ especialidade: m.especialidade, medico: m.user.nome })),
  };
}
