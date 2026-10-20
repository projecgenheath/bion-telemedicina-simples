/**
 * Ajuda do admin (Torre BION): perguntas frequentes com os nomes atuais dos
 * módulos. Regras puras (sem React) para testar a busca: ajuda.teste.ts.
 */
import type { View } from "@/lib/rotas";

export type FaqAdmin = { pergunta: string; resposta: string; categoria: string; destino?: View };

export const FAQ_ADMIN: FaqAdmin[] = [
  {
    categoria: "Centro de Comando",
    pergunta: "O que aparece na Fila do Início?",
    resposta:
      "A Fila junta o que precisa de você: médicos em validação, chamados abertos, eventos críticos da auditoria, repasses e reembolsos pendentes, pacientes esperando o médico, evoluções pendentes e pedidos de renovação parados há mais de 24 h. Toque no item para ir direto ao lugar certo.",
    destino: "dashboard",
  },
  {
    categoria: "Médicos",
    pergunta: "Como aprovo o cadastro de um novo médico?",
    resposta: "Abra Médicos › Em validação, confira CRM e documentos na ficha e toque em Aprovar. Na mesma ficha você pode suspender ou reativar a conta.",
    destino: "admin-medicos",
  },
  {
    categoria: "Financeiro",
    pergunta: "Quando o repasse dos médicos é fechado?",
    resposta:
      "Todo dia às 23:30 (horário de Brasília) o sistema fecha o repasse do dia: 90% do valor de cada consulta com desfecho vai para o médico. Consultas sem desfecho ficam de fora e entram no primeiro fechamento depois de ganharem desfecho. Renovações e retornos gratuitos (valor zero) não entram no repasse.",
    destino: "admin-repasses",
  },
  {
    categoria: "Financeiro",
    pergunta: "O que acontece quando o médico não entra na consulta?",
    resposta:
      "O paciente espera até 10 minutos. Depois disso escolhe cancelar com reembolso integral ou remarcar com outro médico; na remarcação o valor vai para o novo médico e a diferença de preço é cobrada ou devolvida ao paciente.",
    destino: "admin-repasses",
  },
  {
    categoria: "Agendamentos",
    pergunta: "Onde vejo e corrijo as consultas?",
    resposta: "Em Agendamentos você filtra por dia, médico e status, abre a consulta e vê o tipo de atendimento (incluindo retorno e renovação) e a consulta de origem.",
    destino: "admin-agendamentos",
  },
  {
    categoria: "Auditoria",
    pergunta: "Como encontro um evento na auditoria?",
    resposta: "Em Auditoria use a busca, os chips de severidade e categoria e o botão Filtros (ação, perfil, usuário, entidade e período). As exportações CSV e PDF respeitam os filtros.",
    destino: "auditoria",
  },
  {
    categoria: "Relatórios",
    pergunta: "Como exporto os relatórios de métricas?",
    resposta: "Em Relatórios escolha o período, a especialidade e o médico e use Exportar CSV ou Exportar PDF.",
    destino: "relatorios",
  },
  {
    categoria: "Suporte",
    pergunta: "Como respondo um chamado?",
    resposta: "Em Chamados abra a conversa, responda e mude o status. O usuário é avisado a cada resposta.",
    destino: "suporte",
  },
  {
    categoria: "Privacidade",
    pergunta: "Como atendo um pedido de LGPD?",
    resposta:
      "Em Privacidade & LGPD busque o paciente, exporte os dados ou anonimize a conta. O prontuário é preservado pelo prazo legal e a identificação mínima fica cifrada no cofre. Toda ação fica registrada na Auditoria.",
    destino: "privacidade",
  },
  {
    categoria: "Conta",
    pergunta: "Para que servem Notificações e Lembretes?",
    resposta: "Notificações reúne os avisos do app para a sua conta (o sino no topo). Lembretes são alarmes pessoais que você cria com horário e frequência.",
    destino: "notificacoes",
  },
];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Busca sem acento e sem diferenciar maiúsculas, em pergunta, resposta e categoria; todas as palavras precisam aparecer. */
export function buscarFaq(faqs: FaqAdmin[], termo: string): FaqAdmin[] {
  const palavras = norm(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return faqs;
  return faqs.filter((f) => {
    const texto = norm(`${f.pergunta} ${f.resposta} ${f.categoria}`);
    return palavras.every((p) => texto.includes(p));
  });
}
