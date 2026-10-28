/**
 * Regras puras da anonimização LGPD de um MÉDICO pela administração
 * (servidor em src/lib/server/lgpd.ts → anonimizarMedicoCompleto).
 *
 * Nada clínico ou financeiro é apagado (FKs Restrict, #96): consultas,
 * evoluções, documentos (prontuário, 20 anos — Lei 13.787/2018) e repasses
 * (obrigação fiscal) continuam ligados ao `id`. Só os dados que identificam a
 * pessoa saem do cadastro (e vão cifrados para o cofre).
 *
 * Bloqueia se ainda houver algo em aberto com o médico. Testes em
 * anonimizar-medico-logica.teste.ts.
 */

/** Consultas nesses status já encerraram (não bloqueiam). */
export const STATUS_CONSULTA_ENCERRADA_MEDICO = ["cancelada", "concluida"] as const;
/** Evolução ainda não concluída. */
export const STATUS_EVOLUCAO_ABERTA = ["rascunho"] as const;
/** Repasse fechado mas ainda não pago ao médico. */
export const STATUS_REPASSE_ABERTO = ["fechado"] as const;
/** Reembolso ainda não resolvido (mesmo critério da exclusão do paciente). */
export const STATUS_REEMBOLSO_PENDENTE = ["em_analise", "solicitado", "aprovado", "falhou"] as const;
/** Pedido de renovação esperando o médico. */
export const STATUS_RENOVACAO_ABERTA_MEDICO = ["aguardando_pagamento", "pendente"] as const;
/** Remarcação com multa ainda em aberto. */
export const STATUS_REMARCACAO_ABERTA_MEDICO = ["pendente"] as const;

export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 300;

export type PendenciasMedico = {
  consultasFuturas: number;
  consultasEmAndamento: number;
  evolucoesPendentes: number;
  repassesAbertos: number;
  ajustesSemRepasse: number;
  reembolsosPendentes: number;
  renovacoesAbertas: number;
  remarcacoesAbertas: number;
};

export const SEM_PENDENCIAS_MEDICO: PendenciasMedico = {
  consultasFuturas: 0,
  consultasEmAndamento: 0,
  evolucoesPendentes: 0,
  repassesAbertos: 0,
  ajustesSemRepasse: 0,
  reembolsosPendentes: 0,
  renovacoesAbertas: 0,
  remarcacoesAbertas: 0,
};

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Motivos que impedem a anonimização (vazio = pode anonimizar). */
export function motivosBloqueioAnonimizacaoMedico(p: PendenciasMedico): string[] {
  const m: string[] = [];
  if (p.consultasFuturas > 0)
    m.push(`${plural(p.consultasFuturas, "consulta futura", "consultas futuras")}: cancele ou transfira antes.`);
  if (p.consultasEmAndamento > 0)
    m.push(`${plural(p.consultasEmAndamento, "consulta em andamento", "consultas em andamento")} (horário já passou, sem conclusão): conclua ou cancele.`);
  if (p.evolucoesPendentes > 0)
    m.push(`${plural(p.evolucoesPendentes, "evolução pendente", "evoluções pendentes")}: o médico precisa concluir.`);
  if (p.repassesAbertos > 0)
    m.push(`${plural(p.repassesAbertos, "repasse ainda não pago", "repasses ainda não pagos")}: pague antes.`);
  if (p.ajustesSemRepasse > 0)
    m.push(`${plural(p.ajustesSemRepasse, "ajuste de repasse em aberto", "ajustes de repasse em aberto")}: feche no próximo repasse.`);
  if (p.reembolsosPendentes > 0)
    m.push(`${plural(p.reembolsosPendentes, "reembolso pendente", "reembolsos pendentes")}: resolva antes.`);
  if (p.renovacoesAbertas > 0)
    m.push(`${plural(p.renovacoesAbertas, "pedido de renovação em aberto", "pedidos de renovação em aberto")}: responda ou cancele.`);
  if (p.remarcacoesAbertas > 0)
    m.push(`${plural(p.remarcacoesAbertas, "remarcação com multa pendente", "remarcações com multa pendentes")}: aguarde ou cancele.`);
  return m;
}

/** Separa consultas abertas (não encerradas) em futuras x em andamento. */
export function classificarConsultasAbertas(
  consultas: { dataInicio: Date; status: string }[],
  agora: Date,
): { futuras: number; emAndamento: number } {
  let futuras = 0;
  let emAndamento = 0;
  for (const c of consultas) {
    if ((STATUS_CONSULTA_ENCERRADA_MEDICO as readonly string[]).includes(c.status)) continue;
    const t = c.dataInicio instanceof Date ? c.dataInicio.getTime() : Number.NaN;
    // Data inválida conta como em andamento (na dúvida, bloqueia).
    if (Number.isFinite(t) && t > agora.getTime()) futuras++;
    else emAndamento++;
  }
  return { futuras, emAndamento };
}

/** Motivo obrigatório, 5–300 caracteres (depois do trim). */
export function validarMotivoAnonimizacao(motivo: unknown): { ok: true; motivo: string } | { ok: false; erro: string } {
  const t = typeof motivo === "string" ? motivo.trim() : "";
  if (t.length < MOTIVO_MIN || t.length > MOTIVO_MAX) {
    return { ok: false, erro: `Informe o motivo (pedido do titular, ofício etc.), entre ${MOTIVO_MIN} e ${MOTIVO_MAX} caracteres.` };
  }
  return { ok: true, motivo: t };
}

/** Marcador que substitui e-mail/telefone/CNPJ/CPF/PIX em textos livres. */
export const DADO_REMOVIDO_MEDICO = "[dado removido]";

/**
 * Campos que NÃO são anonimizados no User/PerfilMedico: nome e CRM ficam por
 * 20 anos (Res. CFM 1.638/2002, Lei 13.787/2018) — prontuário, receitas e
 * atestados precisam mostrar quem atendeu.
 */
export const CAMPOS_MEDICO_PRESERVADOS = ["nome", "crm"] as const;

/**
 * Campos do PerfilMedico zerados: dados pessoais e de vitrine. Especialidade,
 * valor e avaliações ficam (são do histórico de atendimento, não da pessoa).
 * Nome e CRM NÃO entram aqui (ver CAMPOS_MEDICO_PRESERVADOS).
 */
export const DADOS_PERFIL_MEDICO_PSEUDONIMIZADO = {
  foto: null,
  bio: "",
  formacao: "",
  experiencia: "",
  telefone: "",
  cnpj: "",
  dataNascimento: null,
  genero: null,
  status: "suspenso",
  horariosDisponiveis: "[]",
} as const;

/**
 * Tira de um texto livre (ex.: motivo da auditoria) sequências de 8+ dígitos,
 * mesmo separadas por ponto, traço ou espaço — CPF, telefone, cartão etc.
 */
export function removerNumerosLongos(texto: string): string {
  return texto.replace(/\d(?:[.\-\s]*\d){7,}/g, "[número removido]");
}

/** Domínio dos e-mails de contas anonimizadas (mesmo de lgpd.ts). */
export const DOMINIO_EMAIL_ANON_MEDICO = "anon.bion.app";
export const ERRO_MEDICO_INDISPONIVEL = "Este médico não está atendendo no momento. Escolha outro profissional.";

/**
 * O médico pode receber agendamento/remarcação/renovação? Só com o usuário e o
 * perfil "ativo" e sem conta anonimizada (suspenso, inativo ou sem perfil: não).
 */
export function medicoPodeAtender(m: { userStatus: string | null; perfilStatus: string | null; email: string | null } | null): boolean {
  if (!m) return false;
  if (m.userStatus !== "ativo" || m.perfilStatus !== "ativo") return false;
  return !(m.email ?? "").toLowerCase().endsWith(`@${DOMINIO_EMAIL_ANON_MEDICO}`);
}

/**
 * CNPJ mostrado num repasse: o do perfil; se o perfil foi limpo (médico
 * anonimizado), o documento do titular que o repasse pago copiou, quando é
 * um CNPJ (14 caracteres alfanuméricos). Sem nenhum dos dois: null.
 */
export function cnpjDoRepasse(cnpjPerfil: string | null | undefined, pixTitularDocumento: string | null | undefined): string | null {
  if (cnpjPerfil && cnpjPerfil.trim()) return cnpjPerfil;
  const doc = (pixTitularDocumento ?? "").replace(/[^0-9A-Za-z]/g, "");
  return doc.length === 14 ? (pixTitularDocumento as string) : null;
}
