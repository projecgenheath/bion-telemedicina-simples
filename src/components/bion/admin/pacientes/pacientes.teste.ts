/**
 * Testes das regras puras de Pacientes.
 * Rodar: bun --conditions react-server src/components/bion/admin/pacientes/pacientes.teste.ts
 * (também com TZ=UTC e TZ=Asia/Tokyo: o resultado não pode depender do fuso da máquina)
 */
import type { Consulta, Documento, PacienteRegistro, TicketSuporte } from "@/lib/bion-tipos";
import {
  camposAlteradosPaciente,
  chamadosDoPaciente,
  consultasDoPaciente,
  contarSituacoes,
  corpoCadastroPaciente,
  corpoDesfazerPaciente,
  corpoEdicaoPaciente,
  documentosDoPaciente,
  estadoPaciente,
  estaAnonimizado,
  explicarErroPaciente,
  filtrarPacientes,
  formatarCpf,
  formDoPaciente,
  FORM_PACIENTE_VAZIO,
  idadeExibida,
  situacaoDe,
  ultimaEProxima,
  validarFormPaciente,
} from "./pacientes";

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
// 04/10 às 23:30 em SP = 05/10 02:30 UTC = 05/10 11:30 em Tóquio.
const AGORA = t("2026-10-04T23:30:00-03:00");

const pac = (id: string, nome: string, extra: Partial<PacienteRegistro> = {}): PacienteRegistro => ({
  id,
  nome,
  email: `${id}@exemplo.com`,
  telefone: "(11) 90000-0000",
  cpf: "",
  idade: 40,
  dataNascimento: null,
  genero: "Feminino",
  convenio: "Particular",
  status: "ativo",
  desde: "Jan 2026",
  ...extra,
});
const pacientes = [
  pac("p1", "José da Silva", { cpf: "123.456.789-09" }),
  pac("p2", "Ângela Prado", { status: "inativo" }),
  pac("p3", "Paciente anonimizado", { email: "anon-p3@ANON.bion.app", status: "inativo" }),
  pac("p4", "José da Silva", { cpf: "98765432100" }), // homônimo
  pac("p5", "Bruna Costa", { email: "bruna@clinica.com.br" }),
];

// Situação
igual("anonimizado pelo domínio (sem caixa)", estaAnonimizado(pacientes[2]), true);
igual("não anonimizado", estaAnonimizado({ email: "x@anon.bion.app.com" }), false);
igual("situações", pacientes.map(situacaoDe), ["ativo", "inativo", "anonimizado", "ativo", "ativo"]);
igual("contagem", contarSituacoes(pacientes), { ativo: 3, inativo: 1, anonimizado: 1, todos: 5 });
igual("estado anonimizado", estadoPaciente("anonimizado"), { rotulo: "Anonimizado (LGPD)", tom: "neutro" });
igual("estado inativo", estadoPaciente("inativo").tom, "atencao");

// Filtros
const ids = (l: PacienteRegistro[]) => l.map((p) => p.id);
igual("ativos ordenados", ids(filtrarPacientes(pacientes, "", "ativo")), ["p5", "p1", "p4"]);
igual("todos", ids(filtrarPacientes(pacientes, "", "todos")), ["p2", "p5", "p1", "p4", "p3"]);
igual("busca sem acento", ids(filtrarPacientes(pacientes, "angela", "todos")), ["p2"]);
igual("busca por e-mail", ids(filtrarPacientes(pacientes, "clinica.com", "todos")), ["p5"]);
igual("busca CPF com pontuação", ids(filtrarPacientes(pacientes, "456.789", "todos")), ["p1"]);
igual("busca CPF só dígitos", ids(filtrarPacientes(pacientes, "98765", "ativo")), ["p4"]);
igual("CPF com menos de 3 dígitos não casa", ids(filtrarPacientes(pacientes, "12", "todos")), []);
igual("filtro inativo + busca", ids(filtrarPacientes(pacientes, "jose", "inativo")), []);
igual("formatarCpf", [formatarCpf("12345678909"), formatarCpf("123.456.789-09"), formatarCpf("123"), formatarCpf("")], ["123.456.789-09", "123.456.789-09", "123", "—"]);

// Idade pelo dia de hoje em SÃO PAULO (04/10), não pelo fuso da máquina
igual("aniversário amanhã em SP (já é 05/10 em UTC/Tóquio)", idadeExibida({ idade: 99, dataNascimento: "1990-10-05" }, AGORA), 35);
igual("aniversário hoje em SP", idadeExibida({ idade: 99, dataNascimento: "1990-10-04" }, AGORA), 36);
igual("sem data usa o campo", idadeExibida({ idade: 52, dataNascimento: null }, AGORA), 52);
igual("data inválida usa o campo", idadeExibida({ idade: 52, dataNascimento: "1990-02-31" }, AGORA), 52);
igual("data futura usa o campo", idadeExibida({ idade: 7, dataNascimento: "2026-10-05" }, AGORA), 7);

// Consultas (por id)
let n = 0;
const c = (iso: string, extra: Partial<Consulta> = {}): Consulta => ({
  id: `c${++n}`,
  medico: "Dra. Ana",
  medicoId: "m1",
  especialidade: "Clínica",
  paciente: "José da Silva",
  pacienteId: "p1",
  data: "",
  hora: "",
  status: "confirmada",
  ts: t(iso),
  ...extra,
});
const consultas = [
  c("2026-10-04T09:00:00-03:00", { status: "concluida" }),
  c("2026-09-20T09:00:00-03:00", { status: "concluida" }),
  c("2026-10-04T23:00:00-03:00", { status: "cancelada" }),
  c("2026-10-04T23:45:00-03:00"), // próxima: daqui 15 min, ainda dia 04 em SP
  c("2026-10-08T10:00:00-03:00"),
  c("2026-10-05T08:00:00-03:00", { pacienteId: "p4" }), // homônimo, outro id
  c("2026-10-04T23:40:00-03:00", { status: "cancelada" }),
];
igual("consultas do paciente (recente primeiro)", consultasDoPaciente(consultas, "p1").map((x) => x.id), ["c5", "c4", "c7", "c3", "c1", "c2"]);
const up = ultimaEProxima(consultas, "p1", AGORA);
igual("última e próxima", [up.ultima?.id, up.proxima?.id], ["c1", "c4"]);
const up4 = ultimaEProxima(consultas, "p4", AGORA);
igual("homônimo por id", [up4.ultima, up4.proxima?.id], [null, "c6"]);
igual("sem consultas", ultimaEProxima(consultas, "p9", AGORA), { ultima: null, proxima: null });

// Documentos e chamados por nome (aviso de homônimo)
const docs = [{ id: "d1", paciente: "José da Silva" }, { id: "d2", paciente: "jose da silva" }, { id: "d3", paciente: "Bruna Costa" }] as Documento[];
const dJose = documentosDoPaciente(docs, pacientes[0], pacientes);
igual("documentos homônimo", [dJose.lista.map((d) => d.id), dJose.homonimo], [["d1", "d2"], true]);
const dBruna = documentosDoPaciente(docs, pacientes[4], pacientes);
igual("documentos sem homônimo", [dBruna.lista.map((d) => d.id), dBruna.homonimo], [["d3"], false]);
const tickets = [
  { id: "t1", usuario: "Bruna Costa", perfil: "paciente" },
  { id: "t2", usuario: "Bruna Costa", perfil: "medico" },
] as TicketSuporte[];
igual("chamados só de paciente", chamadosDoPaciente(tickets, pacientes[4], pacientes).lista.map((x) => x.id), ["t1"]);

// Formulário
igual("cadastro exige e-mail", Object.keys(validarFormPaciente(FORM_PACIENTE_VAZIO, true)).sort(), ["email", "nome"]);
igual("edição não exige e-mail", validarFormPaciente({ ...FORM_PACIENTE_VAZIO, nome: "A" }, false), {});
igual("idade fora sem data", validarFormPaciente({ ...FORM_PACIENTE_VAZIO, nome: "A", idade: 131 }, false).idade, "Idade entre 0 e 130.");
igual("idade ignorada com data", validarFormPaciente({ ...FORM_PACIENTE_VAZIO, nome: "A", idade: 131, dataNascimento: "1990-01-01" }, false), {});
igual(
  "corpo de cadastro",
  corpoCadastroPaciente({ ...FORM_PACIENTE_VAZIO, nome: " Nova ", email: " n@x.com " }),
  { nome: "Nova", email: "n@x.com", telefone: "", cpf: "", idade: 30, genero: "Feminino", convenio: "Particular", status: "ativo" },
);
igual("cadastro com data", corpoCadastroPaciente({ ...FORM_PACIENTE_VAZIO, dataNascimento: "1990-10-05" }).dataNascimento, "1990-10-05");

// Edição: só o que mudou; Desfazer devolve os valores de antes
const p1 = pacientes[0];
const f1 = formDoPaciente(p1);
igual("sem mudança → null", corpoEdicaoPaciente(p1, f1), null);
igual("e-mail não vai na edição", corpoEdicaoPaciente(p1, { ...f1, email: "outro@x.com" }), null);
const corpo = corpoEdicaoPaciente(p1, { ...f1, convenio: "Unimed", status: "inativo", nome: " José da Silva " });
igual("edição parcial (nome aparado não conta)", corpo, { convenio: "Unimed", status: "inativo" });
igual("desfazer edição", corpoDesfazerPaciente(p1, corpo!), { convenio: "Particular", status: "ativo" });
igual("campos alterados", camposAlteradosPaciente(corpo!), "convênio e situação da conta");
const comData = corpoEdicaoPaciente(p1, { ...f1, dataNascimento: "1990-10-05", idade: 35 });
igual("data nova manda idade também", comData, { idade: 35, dataNascimento: "1990-10-05" });
igual("desfazer data devolve idade e limpa a data", corpoDesfazerPaciente(p1, { dataNascimento: "1990-10-05" }), { dataNascimento: null, idade: 40 });
const p6 = pac("p6", "Com Data", { dataNascimento: "1990-10-05", idade: 35 });
igual("com data, mudar só a idade não envia idade", corpoEdicaoPaciente(p6, { ...formDoPaciente(p6), idade: 50 }), null);
igual("limpar data → null", corpoEdicaoPaciente(p6, { ...formDoPaciente(p6), dataNascimento: "" }), { dataNascimento: null });

// Erros
igual("erro sem conexão", explicarErroPaciente(0, null), "Sem conexão com o servidor. Nada foi alterado; tente de novo.");
igual("erro 409 com texto", explicarErroPaciente(409, "CPF já cadastrado."), "CPF já cadastrado.");
igual("erro 404 sem texto", explicarErroPaciente(404, null), "Paciente não encontrado. Atualize a tela.");
igual("erro 401", explicarErroPaciente(401, "x"), "Sem permissão. Entre de novo com uma conta de administrador.");

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
