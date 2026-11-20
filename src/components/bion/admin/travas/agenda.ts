/**
 * O que o código DIZ sobre as tarefas automáticas, e o que o vercel.json
 * declara. Esta lista não liga nada e não consulta o Supabase.
 * Se o vercel.json ganhar `crons`, o teste agenda.teste.ts quebra de propósito.
 */
export type TarefaAgenda = {
  rota: string;
  onde: string;
};

export const VERCEL_JSON_TEM_CRONS = false;

export const TAREFAS_AGENDA: TarefaAgenda[] = [
  { rota: "/api/cron/toque", onde: "O código descreve pg_cron no Supabase, a cada minuto." },
  { rota: "/api/cron/lembretes", onde: "O código descreve pg_cron no Supabase, a cada minuto." },
  { rota: "/api/cron/espera-medico", onde: "O código descreve pg_cron no Supabase, a cada minuto." },
  { rota: "/api/cron/fechar-repasses", onde: "O código descreve cron da Vercel às 23:30 em Brasília." },
  { rota: "/api/cron/descarte-retencao", onde: "O código descreve cron da Vercel às 03:00 em Brasília." },
  { rota: "/api/cron/lgpd-pendencias", onde: "O código descreve cron da Vercel às 04:00 em Brasília." },
  { rota: "/api/cron/reembolsos-stripe", onde: "O código descreve cron da Vercel, uma vez por dia, às 05:00 em Brasília." },
];
