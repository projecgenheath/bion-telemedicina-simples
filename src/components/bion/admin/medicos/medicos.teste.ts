/**
 * Testes das regras puras de Médicos.
 * Rodar: bun --conditions react-server src/components/bion/admin/medicos/medicos.teste.ts
 * (também com TZ=UTC e TZ=Asia/Tokyo: o resultado não pode depender do fuso da máquina)
 */
import type { Avaliacao, AuditLog, Consulta, Medico } from "@/lib/bion-tipos";
import {
  abaDoStatus,
  acoesDoStatus,
  avaliacoesDoMedico,
  camposAlterados,
  confirmacaoConfere,
  consultas30d,
  contarPorAba,
  corpoCadastro,
  corpoDesfazerMedico,
  corpoEdicaoMedico,
  estadoMedicoAdmin,
  eventosDaEntidade,
  explicarErroMedico,
  filtrarMedicos,
  formDoMedico,
  FORM_VAZIO,
  horarioVedado,
  iniciais,
  lerAba,
  listaDeTexto,
  normalizarHorarios,
  proximasDoMedico,
  realizadasDoMedico,
  semTitulo,
  statusDe,
  validarFormMedico,
} from "./medicos";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = String(JSON.stringify(obtido)).replace(/\u00a0/g, " ");
  const b = String(JSON.stringify(esperado));
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`✗ ${nome}\n   obtido:   ${a}\n   esperado: ${b}`);
  }
}
const t = (iso: string) => Date.parse(iso);
const AGORA = t("2026-10-04T23:30:00-03:00"); // domingo 23:30 em SP (já é segunda em UTC e em Tóquio)

const med = (id: string, nome: string, status: string, extra: Partial<Medico> = {}): Medico =>
  ({
    id,
    nome,
    crm: `${id}0-SP`,
    especialidade: "Clínica Geral",
    subespecialidades: [],
    valor: 150,
    avaliacao: 4.5,
    numAvaliacoes: 2,
    formacao: "USP",
    experiencia: "10 anos",
    idiomas: ["Português"],
    bio: "",
    status,
    horariosDisponiveis: ["09:00", "14:00"],
    ...extra,
  }) as Medico;

const medicos = [
  med("m1", "Dra. Ângela Souza", "ativo", { especialidade: "Cardiologia", subespecialidades: ["Arritmia"] }),
  med("m2", "Dr. Bruno Lima", "pendente"),
  med("m3", "Dr. Carlos Dias", "suspenso"),
  med("m4", "Dra. Ana Prado", "arquivado"),
  med("m5", "Dr. Bruno Lima", "ativo"), // homônimo do m2
  med("m6", "Dra. Zélia", "estranho"), // status desconhecido cai em validação
];

// Status e abas
igual("statusDe conhecido", statusDe({ status: "suspenso" }), "suspenso");
igual("statusDe desconhecido → pendente", statusDe({ status: "xyz" }), "pendente");
igual("abaDoStatus", ["ativo", "pendente", "suspenso", "arquivado"].map((s) => abaDoStatus(s as never)), ["ativos", "validacao", "suspensos", "arquivados"]);
igual("lerAba válida", lerAba("validacao"), "validacao");
igual("lerAba inválida", [lerAba("usuarios"), lerAba(null)], [null, null]);
igual("contarPorAba", contarPorAba(medicos), { ativos: 2, validacao: 2, suspensos: 1, arquivados: 1 });
igual("estado suspenso", estadoMedicoAdmin("suspenso"), { rotulo: "Suspenso", tom: "critico" });
igual("estado pendente", estadoMedicoAdmin("pendente").rotulo, "Em validação");
igual("ações pendente", acoesDoStatus("pendente"), { aprovar: true, reativar: false, suspender: true, arquivar: true });
igual("ações suspenso", acoesDoStatus("suspenso"), { aprovar: false, reativar: true, suspender: false, arquivar: true });
igual("ações arquivado", acoesDoStatus("arquivado"), { aprovar: false, reativar: false, suspender: false, arquivar: false });

// Filtros
const ids = (l: Medico[]) => l.map((m) => m.id);
igual("ativos por nome", ids(filtrarMedicos(medicos, { aba: "ativos", busca: "", especialidade: "" })), ["m1", "m5"]); // Ângela antes de Bruno (ignora o título Dr./Dra.)
igual("busca sem acento", ids(filtrarMedicos(medicos, { aba: "ativos", busca: "angela", especialidade: "" })), ["m1"]);
igual("busca por subespecialidade", ids(filtrarMedicos(medicos, { aba: "ativos", busca: "arritmia", especialidade: "" })), ["m1"]);
igual("busca por CRM", ids(filtrarMedicos(medicos, { aba: "validacao", busca: "m20", especialidade: "" })), ["m2"]);
igual("especialidade", ids(filtrarMedicos(medicos, { aba: "ativos", busca: "", especialidade: "Cardiologia" })), ["m1"]);
igual("validação inclui desconhecido", ids(filtrarMedicos(medicos, { aba: "validacao", busca: "", especialidade: "" })), ["m2", "m6"]);
igual("semTitulo", ["Dra. Ana", "dr Beto", "Prof. Caio", "Drauzio"].map(semTitulo), ["Ana", "Beto", "Caio", "Drauzio"]);
igual("iniciais", [iniciais("Dra. Ângela Souza"), iniciais("Dr. Bruno de Lima"), iniciais("Zélia"), iniciais("")], ["ÂS", "BL", "Z", "?"]);

// Consultas (por id, com "agora" fixo, igual em qualquer fuso)
let n = 0;
const c = (iso: string, extra: Partial<Consulta> = {}): Consulta => ({
  id: `c${++n}`,
  medico: "Dra. Ângela Souza",
  medicoId: "m1",
  especialidade: "Cardiologia",
  paciente: "José",
  pacienteId: "p1",
  data: "",
  hora: "",
  status: "confirmada",
  ts: t(iso),
  ...extra,
});
const consultas = [
  c("2026-10-04T09:00:00-03:00", { status: "concluida" }), // hoje cedo
  c("2026-09-05T00:00:00-03:00", { status: "concluida" }), // 29d23h30 atrás → dentro
  c("2026-09-04T23:00:00-03:00", { status: "concluida" }), // 30d00h30 atrás → fora
  c("2026-10-01T10:00:00-03:00", { status: "cancelada" }), // cancelada não conta
  c("2026-10-04T23:45:00-03:00"), // daqui 15 min (ainda domingo em SP)
  c("2026-10-06T10:00:00-03:00", { status: "aguardando_pagamento" as Consulta["status"] }),
  c("2026-10-05T08:00:00-03:00", { medicoId: "m2", medico: "Dr. Bruno Lima" }),
  c("2026-10-07T08:00:00-03:00", { status: "cancelada" }),
];
igual("consultas30d", consultas30d(consultas, "m1", AGORA), 2);
igual("consultas30d outro médico", consultas30d(consultas, "m2", AGORA), 0);
igual("próximas (ordem, sem canceladas)", proximasDoMedico(consultas, "m1", AGORA).map((x) => x.id), ["c5", "c6"]);
igual("próximas com limite", proximasDoMedico(consultas, "m1", AGORA, 1).map((x) => x.id), ["c5"]);
igual("realizadas (mais recente primeiro)", realizadasDoMedico(consultas, "m1").map((x) => x.id), ["c1", "c2", "c3"]);

// Avaliações por nome com aviso de homônimo
const av = (id: string, medico: string, ts: number): Avaliacao => ({ id, paciente: "P", medico, especialidade: "", nota: 5, ts }) as Avaliacao;
const avaliacoes = [av("a1", "Dr. Bruno Lima", 1), av("a2", "dr. bruno lima", 3), av("a3", "Dra. Ângela Souza", 2)];
igual("avaliações homônimo", avaliacoesDoMedico(avaliacoes, medicos[1], medicos), { lista: [avaliacoes[1], avaliacoes[0]], homonimo: true });
igual("avaliações sem homônimo (sem acento)", avaliacoesDoMedico([av("a4", "Dra. Angela Souza", 1)], medicos[0], medicos).homonimo, false);
igual("avaliações sem homônimo (lista)", avaliacoesDoMedico([av("a4", "Dra. Angela Souza", 1)], medicos[0], medicos).lista.length, 1);

// Auditoria
const log = (id: string, ts: number, entidade: string | undefined, entidadeId: string): AuditLog =>
  ({ id, ts, acao: "x", categoria: "admin", severidade: "info", usuario: "a", role: "admin", entidade, entidadeId }) as AuditLog;
igual(
  "eventos da entidade",
  eventosDaEntidade([log("l1", 1, "Medico", "m1"), log("l2", 3, undefined, "m1"), log("l3", 2, "paciente", "m1"), log("l4", 4, "medico", "m2")], "medico", "m1").map((l) => l.id),
  ["l2", "l1"],
);

// Formulário
igual("listaDeTexto", listaDeTexto(" Inglês, , Português ,Inglês"), ["Inglês", "Português"]);
igual("normalizarHorarios", normalizarHorarios(["14:00", "9:00", "09:00", "24:00", " 08:30 ", "14:00"]), ["08:30", "09:00", "14:00"]);
igual("horarioVedado", ["22:00", "22:30", "22:31", "23:00", "23:59", "00:00", "abc"].map(horarioVedado), [false, false, true, true, true, false, false]);
igual("form vazio inválido", Object.keys(validarFormMedico(FORM_VAZIO, true)).sort(), ["crm", "especialidade", "nome"]);
const formOk = { ...FORM_VAZIO, nome: "Dra. Nova", crm: "123-SP", especialidade: "Pediatria" };
igual("form válido", validarFormMedico(formOk, true), {});
igual("e-mail inválido só no cadastro", [validarFormMedico({ ...formOk, email: "x@" }, true).email, validarFormMedico({ ...formOk, email: "x@" }, false).email], ["E-mail inválido.", undefined]);
igual("valor fora", validarFormMedico({ ...formOk, valor: "5000,01" }, false).valor, "O valor deve ficar entre R$ 1 e R$ 5000.");
igual("valor com vírgula ok", validarFormMedico({ ...formOk, valor: "199,90" }, false).valor, undefined);
igual("horário vedado no form", validarFormMedico({ ...formOk, horarios: ["09:00", "22:45"] }, false).horarios, "Sem consultas entre 23:00 e 00:00: tire 22:45.");
igual("grade vazia", validarFormMedico({ ...formOk, horarios: [] }, false).horarios, "Deixe pelo menos um horário na grade.");
igual("cadastro sem e-mail", "email" in corpoCadastro(formOk), false);
igual("cadastro com e-mail", corpoCadastro({ ...formOk, email: " a@b.co ", valor: "180,5", subespecialidades: "A, B" }), {
  nome: "Dra. Nova",
  email: "a@b.co",
  crm: "123-SP",
  especialidade: "Pediatria",
  subespecialidades: ["A", "B"],
  valor: 180.5,
  formacao: "",
  experiencia: "",
  idiomas: ["Português"],
  bio: "",
  horariosDisponiveis: ["09:00", "10:00", "14:00", "15:00"],
  status: "pendente",
});

// Edição: só o que mudou, sem status; Desfazer devolve os valores de antes
const m1 = medicos[0];
const f1 = formDoMedico(m1);
igual("sem mudança → null", corpoEdicaoMedico(m1, f1), null);
igual("mudar status no form não vai ao servidor", corpoEdicaoMedico(m1, { ...f1, status: "pendente" }), null);
const corpo = corpoEdicaoMedico(m1, { ...f1, valor: "200", horarios: ["14:00", "09:00", "10:00"], idiomas: "Português, Inglês" });
igual("edição parcial", corpo, { acao: "atualizar", valor: 200, idiomas: ["Português", "Inglês"], horariosDisponiveis: ["09:00", "10:00", "14:00"] });
igual("desfazer edição", corpoDesfazerMedico(m1, corpo!), { acao: "atualizar", valor: 150, idiomas: ["Português"], horariosDisponiveis: ["09:00", "14:00"] });
igual("campos alterados", camposAlterados(corpo!), "valor, idiomas e horários");
igual("campo único", camposAlterados({ acao: "atualizar", crm: "x" }), "CRM");

// Confirmação digitada (arquivar)
igual("confirmação exata", confirmacaoConfere("Dra. Ângela Souza", "Dra. Ângela Souza"), true);
igual("confirmação sem acento/caixa/espaços", confirmacaoConfere("  dra.  angela   souza ", "Dra. Ângela Souza"), true);
igual("confirmação parcial", confirmacaoConfere("Dra. Ângela", "Dra. Ângela Souza"), false);
igual("confirmação vazia", confirmacaoConfere("", ""), false);

// Erros
igual("erro sem conexão", explicarErroMedico(0, null), "Sem conexão com o servidor. Nada foi alterado; tente de novo.");
igual("erro 403", explicarErroMedico(403, "Proibido"), "Sem permissão. Entre de novo com uma conta de administrador.");
igual("erro 400 com texto", explicarErroMedico(400, "Valor deve estar entre 1 e 5000"), "Valor deve estar entre 1 e 5000");
igual("erro 404 sem texto", explicarErroMedico(404, ""), "Médico não encontrado. Atualize a tela.");
igual("erro 500 sem texto", explicarErroMedico(500, undefined), "O servidor respondeu 500. Nada foi alterado.");

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
