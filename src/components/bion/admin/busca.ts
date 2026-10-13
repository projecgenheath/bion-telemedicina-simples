/**
 * Busca global do admin (Ctrl K / ⌘K no lançador). Funções puras:
 * módulos (nome + palavras-chave), atalhos para telas e filtros, e dados
 * já carregados no app (médicos, pacientes, consultas e chamados).
 * Sem acento e por palavras (todas precisam aparecer). CPF: busca pelos
 * dígitos, mas nunca mostra o CPF no resultado.
 * Testes: admin.teste.ts não muda; ver busca.teste.ts.
 */
import type { Consulta, Medico, PacienteRegistro, TicketSuporte } from "@/lib/bion-tipos";

export type TipoResultado = "atalho" | "medico" | "paciente" | "consulta" | "chamado";
/** `id` é o destino no formato da navegação do admin ("view" ou "view?param=..."). */
export type ResultadoBusca = { chave: string; id: string; tipo: TipoResultado; rotulo: string; detalhe?: string };

export const ROTULO_TIPO: Record<TipoResultado, string> = {
  atalho: "Atalhos",
  medico: "Médicos",
  paciente: "Pacientes",
  consulta: "Consultas",
  chamado: "Chamados",
};

export const normalizarBusca = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Todas as palavras do termo aparecem no texto (sem acento, sem caixa). */
export function casa(termo: string, ...campos: (string | null | undefined)[]): boolean {
  const t = normalizarBusca(termo);
  if (!t) return true;
  const alvo = normalizarBusca(campos.filter(Boolean).join(" "));
  return t.split(" ").every((p) => alvo.includes(p));
}

/** Atalhos para telas e filtros (todos levam a telas que já existem). */
export const ATALHOS: { id: string; rotulo: string; detalhe: string; palavras: string }[] = [
  { id: "suporte?status=aberto", rotulo: "Chamados abertos", detalhe: "Chamados · responder", palavras: "suporte ticket pendente responder atendimento" },
  { id: "admin-medicos?aba=validacao", rotulo: "Médicos em validação", detalhe: "Médicos · aprovar", palavras: "aprovar crm cadastro pendente" },
  { id: "admin-agendamentos?aba=reembolsos", rotulo: "Reembolsos em análise", detalhe: "Agendamentos · reembolsos", palavras: "reembolso devolver estorno dinheiro" },
  { id: "admin-repasses", rotulo: "Repasses a pagar", detalhe: "Repasses · PIX", palavras: "pagar pix repasse dinheiro fechar" },
  { id: "privacidade?secao=lgpd-pacientes", rotulo: "Anonimizar paciente", detalhe: "Privacidade & LGPD", palavras: "lgpd excluir apagar dados titular arquivar" },
  { id: "privacidade?secao=lgpd-cofre", rotulo: "Busca no cofre (ordem judicial)", detalhe: "Privacidade & LGPD", palavras: "lgpd cofre reidentificar judicial oficio cpf" },
  { id: "privacidade?secao=lgpd-consentimentos", rotulo: "Consentimentos", detalhe: "Privacidade & LGPD", palavras: "lgpd consentimento autorizacao acesso documentos" },
  { id: "auditoria", rotulo: "Exportar auditoria (CSV ou PDF)", detalhe: "Auditoria", palavras: "csv pdf exportar trilha logs eventos" },
  { id: "relatorios", rotulo: "Gerar relatório (PDF ou CSV)", detalhe: "Relatórios", palavras: "pdf csv exportar indicadores satisfacao cancelamento" },
  { id: "llm-monitor", rotulo: "Saúde da BION IA", detalhe: "Monitor LLM", palavras: "ia llm modelo latencia falhas" },
  { id: "notificacoes", rotulo: "Notificações", detalhe: "Sua conta", palavras: "avisos sino alertas" },
  { id: "lembretes", rotulo: "Lembretes", detalhe: "Sua conta", palavras: "lembrete agenda" },
  { id: "ajuda", rotulo: "Ajuda", detalhe: "Sua conta", palavras: "duvidas faq como" },
];

const enc = encodeURIComponent;

/**
 * Resultados para o termo (mínimo 2 caracteres), no máximo `porTipo` de cada
 * tipo, na ordem: atalhos, médicos, pacientes, consultas, chamados.
 */
export function buscarGlobal(
  termo: string,
  d: { medicos: Medico[]; pacientes: PacienteRegistro[]; consultas: Consulta[]; tickets: TicketSuporte[] },
  porTipo = 5,
): ResultadoBusca[] {
  const t = normalizarBusca(termo);
  if (t.length < 2) return [];
  const digitos = t.replace(/\D/g, "");
  const out: ResultadoBusca[] = [];
  const empurrar = (lista: ResultadoBusca[]) => out.push(...lista.slice(0, porTipo));

  empurrar(ATALHOS.filter((a) => casa(t, a.rotulo, a.detalhe, a.palavras)).map((a) => ({ chave: `atalho-${a.id}`, id: a.id, tipo: "atalho", rotulo: a.rotulo, detalhe: a.detalhe })));
  empurrar(
    d.medicos
      .filter((m) => casa(t, m.nome, m.crm, m.especialidade))
      .map((m) => ({ chave: `medico-${m.id}`, id: `admin-medicos?medico=${enc(m.id)}`, tipo: "medico", rotulo: m.nome, detalhe: [m.especialidade, m.crm].filter(Boolean).join(" · ") })),
  );
  empurrar(
    d.pacientes
      .filter((p) => casa(t, p.nome, p.email) || (digitos.length >= 4 && digitos === t.replace(/[\s.\-/]/g, "") && String(p.cpf ?? "").replace(/\D/g, "").includes(digitos)))
      .map((p) => ({ chave: `paciente-${p.id}`, id: `admin-pacientes?paciente=${enc(p.id)}`, tipo: "paciente", rotulo: p.nome, detalhe: p.email || undefined })),
  );
  empurrar(
    [...d.consultas]
      .sort((a, b) => b.ts - a.ts)
      .filter((c) => casa(t, c.paciente, c.medico, c.especialidade))
      .map((c) => ({ chave: `consulta-${c.id}`, id: `admin-agendamentos?consulta=${enc(c.id)}`, tipo: "consulta", rotulo: `${c.paciente} · ${c.medico}`, detalhe: `${c.data} às ${c.hora} · ${c.especialidade}` })),
  );
  empurrar(
    d.tickets
      .filter((x) => casa(t, x.assunto, x.usuario))
      .map((x) => ({ chave: `chamado-${x.id}`, id: `suporte?chamado=${enc(x.id)}`, tipo: "chamado", rotulo: x.assunto || "Chamado sem assunto", detalhe: `${x.usuario} · ${x.data}` })),
  );
  return out;
}
