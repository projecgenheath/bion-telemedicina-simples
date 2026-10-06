/**
 * Testes das regras puras dos Chamados (Torre BION).
 * Rodar: bun --conditions react-server src/components/bion/admin/suporte/chamados.teste.ts
 * (também com TZ=UTC e TZ=Asia/Tokyo: o resultado não pode depender do fuso da máquina)
 */
import type { TicketSuporte } from "@/lib/bion-tipos";
import {
  FILTROS_CHAMADO_VAZIOS,
  contarChamados,
  duracaoCurta,
  esperaMaisAntiga,
  estadoEspera,
  filtrarChamados,
  filtrosChamadoAtivos,
  outrosDaPessoa,
  pessoaDoChamado,
  rotuloCategoriaChamado,
  tsDoChamado,
  validarResposta,
} from "./chamados";
import { destinoEntidade } from "../auditoria/trilha";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`✗ ${nome}\n   obtido:   ${a}\n   esperado: ${b}`);
  }
}
const sp = (s: string) => Date.parse(`${s}-03:00`);
const agora = sp("2026-10-06T10:00:00");
const H = 3_600_000;

/* ---------------- data do chamado (fuso da clínica) ---------------- */
igual("hoje", tsDoChamado("Hoje às 08:30", agora), sp("2026-10-06T08:30:00"));
igual("ontem", tsDoChamado("Ontem às 23:59", agora), sp("2026-10-05T23:59:00"));
igual("data completa", tsDoChamado("03/10/2026 às 18:05", agora), sp("2026-10-03T18:05:00"));
igual("virada de ano", tsDoChamado("Ontem às 22:00", sp("2027-01-01T01:00:00")), sp("2026-12-31T22:00:00"));
igual("ilegível", tsDoChamado("—", agora), null);
igual("vazio", tsDoChamado(undefined, agora), null);
// 00:30 em SP é 03:30 UTC (outro dia em Tóquio): "Hoje" continua sendo o dia de SP.
igual("madrugada em SP", tsDoChamado("Hoje às 00:10", sp("2026-10-06T00:30:00")), sp("2026-10-06T00:10:00"));

/* ---------------- filtro e ordem ---------------- */
const t = (id: string, status: TicketSuporte["status"], data: string, extra: Partial<TicketSuporte> = {}): TicketSuporte => ({
  id,
  usuario: "Paulo Exemplo",
  perfil: "paciente",
  assunto: `Assunto ${id}`,
  categoria: "tecnico",
  mensagem: "Não consigo entrar na videochamada",
  data,
  status,
  ...extra,
});
const tickets: TicketSuporte[] = [
  t("r1", "resolvido", "Ontem às 10:00", { resposta: "Feito: limpe o cache" }),
  t("a1", "aberto", "Hoje às 09:00"),
  t("e1", "em_andamento", "Hoje às 07:00", { perfil: "medico", usuario: "Dra. Ana Lima", categoria: "pagamento" }),
  t("a2", "aberto", "04/10/2026 às 08:00", { assunto: "Reembolso não caiu", categoria: "pagamento", mensagem: "Pix de devolução" }),
  t("r2", "resolvido", "Hoje às 08:00"),
  t("x1", "aberto", "—"),
];
const ids = (l: TicketSuporte[]) => l.map((x) => x.id);
igual("ordem: pendentes (mais antigo primeiro), depois resolvidos (mais recente)", ids(filtrarChamados(tickets, FILTROS_CHAMADO_VAZIOS, agora)), ["a2", "a1", "x1", "e1", "r2", "r1"]);
igual("status aberto", ids(filtrarChamados(tickets, { ...FILTROS_CHAMADO_VAZIOS, status: "aberto" }, agora)), ["a2", "a1", "x1"]);
igual("perfil médico", ids(filtrarChamados(tickets, { ...FILTROS_CHAMADO_VAZIOS, perfil: "medico" }, agora)), ["e1"]);
igual("categoria", ids(filtrarChamados(tickets, { ...FILTROS_CHAMADO_VAZIOS, categoria: "pagamento" }, agora)), ["a2", "e1"]);
igual("busca sem acento (mensagem)", ids(filtrarChamados(tickets, { ...FILTROS_CHAMADO_VAZIOS, busca: "devolucao" }, agora)), ["a2"]);
igual("busca pela resposta", ids(filtrarChamados(tickets, { ...FILTROS_CHAMADO_VAZIOS, busca: "CACHE" }, agora)), ["r1"]);
igual("busca pelo usuário", ids(filtrarChamados(tickets, { ...FILTROS_CHAMADO_VAZIOS, busca: "ana lima" }, agora)), ["e1"]);
igual("busca pela categoria legível", ids(filtrarChamados(tickets, { ...FILTROS_CHAMADO_VAZIOS, busca: "reembolso", status: "em_andamento" }, agora)), ["e1"]);
igual("filtros ativos", [filtrosChamadoAtivos(FILTROS_CHAMADO_VAZIOS), filtrosChamadoAtivos({ ...FILTROS_CHAMADO_VAZIOS, busca: " x " })], [false, true]);
igual("contagem", contarChamados(tickets), { todos: 6, aberto: 3, em_andamento: 1, resolvido: 2 });

/* ---------------- espera ---------------- */
igual("espera do pendente mais antigo", esperaMaisAntiga(tickets, agora), agora - sp("2026-10-04T08:00:00"));
igual("sem pendentes", esperaMaisAntiga([tickets[0]], agora), null);
igual("duração curta", [duracaoCurta(20_000), duracaoCurta(35 * 60_000), duracaoCurta(3 * H), duracaoCurta(26 * H), duracaoCurta(50 * H)], ["agora", "35 min", "3 h", "1 dia", "2 dias"]);
igual("tom da espera", [estadoEspera(H)?.tom, estadoEspera(5 * H)?.tom, estadoEspera(25 * H)?.tom, estadoEspera(null)], ["neutro", "atencao", "critico", null]);
igual("rótulo da espera", estadoEspera(2 * H)?.rotulo, "Esperando há 2 h");

/* ---------------- resposta ---------------- */
igual("resposta vazia", validarResposta("   ").ok, false);
igual("resposta curta", validarResposta("ok").erro, "A resposta está curta demais.");
igual("resposta ok", validarResposta("Resolvido, pode tentar de novo.").ok, true);
igual("resposta longa", validarResposta("x".repeat(4001)).ok, false);

/* ---------------- pessoa do chamado (só por nome → homônimo) ---------------- */
const medicos = [
  { id: "m1", nome: "Dra. Ana Lima" },
  { id: "m2", nome: "Dr. Beto" },
  { id: "m3", nome: "Dr. Beto" },
];
const pacientes = [{ id: "p/1", nome: "Paulo Exemplo" }];
igual("médico único", pessoaDoChamado(tickets[2], medicos, pacientes), { destino: "admin-medicos?medico=m1", homonimo: false });
igual("paciente (id codificado)", pessoaDoChamado(tickets[1], medicos, pacientes), { destino: "admin-pacientes?paciente=p%2F1", homonimo: false });
igual("homônimo não liga", pessoaDoChamado({ usuario: "dr. beto", perfil: "medico" }, medicos, pacientes), { destino: null, homonimo: true });
igual("ninguém", pessoaDoChamado({ usuario: "Fulano", perfil: "paciente" }, medicos, pacientes), { destino: null, homonimo: false });
igual("outros da pessoa (mesmo perfil)", ids(outrosDaPessoa(tickets, tickets[1])), ["r1", "a2", "r2", "x1"]);
igual("rótulo de categoria", [rotuloCategoriaChamado("pagamento"), rotuloCategoriaChamado("novo")], ["Pagamento e reembolso", "Novo"]);

/* ---------------- auditoria → chamado ---------------- */
igual("evento de ticket abre o chamado", destinoEntidade({ entidade: "ticket", entidadeId: "t 1" }), { view: "suporte?chamado=t%201", rotulo: "Abrir chamado" });
igual("evento de ticket sem id abre a lista", destinoEntidade({ entidade: "ticket" }), { view: "suporte", rotulo: "Abrir chamados" });

console.log(`chamados: ${ok} ok, ${falhas} falha(s) [TZ=${process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone}]`);
if (falhas) process.exit(1);
