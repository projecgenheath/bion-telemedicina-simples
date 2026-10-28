/**
 * Testes das regras da anonimização LGPD do médico.
 * Rodar: bun src/lib/anonimizar-medico-logica.teste.ts
 */
import {
  DADOS_PERFIL_MEDICO_PSEUDONIMIZADO,
  SEM_PENDENCIAS_MEDICO,
  classificarConsultasAbertas,
  motivosBloqueioAnonimizacaoMedico,
  CAMPOS_MEDICO_PRESERVADOS,
  DADO_REMOVIDO_MEDICO,
  medicoPodeAtender,
  removerNumerosLongos,
  validarMotivoAnonimizacao,
} from "./anonimizar-medico-logica";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`FALHOU ${nome}: obtido ${a}, esperado ${b}`);
  }
}

const agora = new Date("2026-10-27T12:00:00Z");
const h = (horas: number) => new Date(agora.getTime() + horas * 3_600_000);

// Pendências
igual("sem pendências libera", motivosBloqueioAnonimizacaoMedico(SEM_PENDENCIAS_MEDICO), []);
for (const k of Object.keys(SEM_PENDENCIAS_MEDICO) as (keyof typeof SEM_PENDENCIAS_MEDICO)[]) {
  igual(`${k} bloqueia`, motivosBloqueioAnonimizacaoMedico({ ...SEM_PENDENCIAS_MEDICO, [k]: 1 }).length, 1);
}
igual("todas bloqueiam juntas", motivosBloqueioAnonimizacaoMedico({
  consultasFuturas: 1, consultasEmAndamento: 1, evolucoesPendentes: 1, repassesAbertos: 1,
  ajustesSemRepasse: 1, reembolsosPendentes: 1, renovacoesAbertas: 1, remarcacoesAbertas: 1,
}).length, 8);
igual("plural", motivosBloqueioAnonimizacaoMedico({ ...SEM_PENDENCIAS_MEDICO, consultasFuturas: 3 })[0].startsWith("3 consultas futuras"), true);
igual("singular", motivosBloqueioAnonimizacaoMedico({ ...SEM_PENDENCIAS_MEDICO, repassesAbertos: 1 })[0].startsWith("1 repasse ainda não pago"), true);

// Consultas
igual("futura x em andamento", classificarConsultasAbertas([
  { dataInicio: h(2), status: "confirmada" },
  { dataInicio: h(-1), status: "em_espera" },
  { dataInicio: h(-48), status: "aguardando_reagendamento" },
  { dataInicio: h(5), status: "cancelada" },
  { dataInicio: h(-5), status: "concluida" },
], agora), { futuras: 1, emAndamento: 2 });
igual("data inválida bloqueia como em andamento", classificarConsultasAbertas([{ dataInicio: new Date(NaN), status: "confirmada" }], agora), { futuras: 0, emAndamento: 1 });
igual("sem consultas", classificarConsultasAbertas([], agora), { futuras: 0, emAndamento: 0 });

// Motivo
igual("motivo vazio recusa", validarMotivoAnonimizacao("").ok, false);
igual("motivo curto recusa", validarMotivoAnonimizacao("  abc ").ok, false);
igual("motivo não string recusa", validarMotivoAnonimizacao(123).ok, false);
igual("motivo longo recusa", validarMotivoAnonimizacao("x".repeat(301)).ok, false);
igual("motivo ok com trim", validarMotivoAnonimizacao("  Pedido do titular  "), { ok: true, motivo: "Pedido do titular" });

// Pseudônimo e perfil
igual("nome e CRM preservados (CFM 1.638/2002)", [...CAMPOS_MEDICO_PRESERVADOS], ["nome", "crm"]);
igual("perfil não troca o CRM", "crm" in DADOS_PERFIL_MEDICO_PSEUDONIMIZADO, false);
igual("perfil não troca o nome", "nome" in DADOS_PERFIL_MEDICO_PSEUDONIMIZADO, false);
igual("marcador de dado removido", DADO_REMOVIDO_MEDICO, "[dado removido]");
igual("perfil sem bio/nascimento/gênero", [DADOS_PERFIL_MEDICO_PSEUDONIMIZADO.bio, DADOS_PERFIL_MEDICO_PSEUDONIMIZADO.dataNascimento, DADOS_PERFIL_MEDICO_PSEUDONIMIZADO.genero], ["", null, null]);
igual("perfil sai da busca", DADOS_PERFIL_MEDICO_PSEUDONIMIZADO.status, "suspenso");
igual("perfil sem horários", DADOS_PERFIL_MEDICO_PSEUDONIMIZADO.horariosDisponiveis, "[]");
igual("perfil sem telefone/cnpj/foto", [DADOS_PERFIL_MEDICO_PSEUDONIMIZADO.telefone, DADOS_PERFIL_MEDICO_PSEUDONIMIZADO.cnpj, DADOS_PERFIL_MEDICO_PSEUDONIMIZADO.foto], ["", "", null]);
igual("perfil não toca especialidade/valor", "especialidade" in DADOS_PERFIL_MEDICO_PSEUDONIMIZADO || "valor" in DADOS_PERFIL_MEDICO_PSEUDONIMIZADO, false);

// Motivo sem números longos (mesma regex de lgpd.ts)
igual("CPF sai do motivo", removerNumerosLongos("Ofício 123.456.789-09 do titular"), "Ofício [número removido] do titular");
igual("número curto fica", removerNumerosLongos("Processo 1234"), "Processo 1234");

// Médico pode receber agendamento (checado com FOR SHARE na transação)
const at = { userStatus: "ativo", perfilStatus: "ativo", email: "dra@x.com" };
igual("ativo atende", medicoPodeAtender(at), true);
igual("perfil suspenso não atende", medicoPodeAtender({ ...at, perfilStatus: "suspenso" }), false);
igual("perfil pendente não atende", medicoPodeAtender({ ...at, perfilStatus: "pendente" }), false);
igual("user inativo não atende", medicoPodeAtender({ ...at, userStatus: "inativo" }), false);
igual("anonimizado não atende", medicoPodeAtender({ ...at, email: "anon-med-abc@ANON.bion.app" }), false);
igual("sem perfil não atende", medicoPodeAtender(null), false);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
