/**
 * Testes do item ativo da navegação do paciente (redesign, etapa 1).
 * Rodar: bun src/components/bion/paciente/inicio/destino.teste.ts
 */
import { destinoAtivoPaciente, destinoBarraPaciente, gavetaPaciente } from "./destino";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${JSON.stringify(obtido)} — esperado ${JSON.stringify(esperado)}`);
  }
}

igual("início", destinoAtivoPaciente({ painel: 1, secao: 0 }), "inicio");
igual("saúde", destinoAtivoPaciente({ painel: 1, secao: 1 }), "saude");
igual("exames", destinoAtivoPaciente({ painel: 1, secao: 2 }), "exames");
igual("perfil", destinoAtivoPaciente({ painel: 0, secao: 2 }), "perfil");
igual("documentos", destinoAtivoPaciente({ painel: 2, secao: 0 }), "documentos");
igual("mensagens", destinoAtivoPaciente({ painel: 2, secao: 0, emMensagens: true }), "mensagens");
igual("chat por cima", destinoAtivoPaciente({ painel: 2, secao: 0, chatAberto: true }), "agendar");
igual("página ajuda", destinoAtivoPaciente({ painel: 1, secao: 0, pagina: "ajuda" }), "ajuda");
igual("chat > página", destinoAtivoPaciente({ painel: 1, secao: 0, pagina: "ajuda", chatAberto: true }), "agendar");

igual("barra início", destinoBarraPaciente("inicio"), "inicio");
igual("barra saúde", destinoBarraPaciente("saude"), "saude");
igual("barra exames", destinoBarraPaciente("exames"), "exames");
igual("barra documentos", destinoBarraPaciente("documentos"), "documentos");
igual("barra mensagens → documentos", destinoBarraPaciente("mensagens"), "documentos");
igual("barra perfil", destinoBarraPaciente("perfil"), null);
igual("barra ajuda", destinoBarraPaciente("ajuda"), null);
igual("barra agendar (+ aceso na agenda)", destinoBarraPaciente("agendar"), "agendar");
igual("agenda própria", destinoAtivoPaciente({ painel: 1, secao: 2, agendaAberta: true }), "agendar");
igual("agenda > painel", destinoAtivoPaciente({ painel: 2, secao: 0, emMensagens: true, agendaAberta: true }), "agendar");

igual("gaveta documentos", gavetaPaciente(2, false), "documentos");
igual("gaveta perfil", gavetaPaciente(0, false), "perfil");
igual("gaveta início", gavetaPaciente(1, false), undefined);
igual("agenda cobre documentos", gavetaPaciente(2, true), undefined);
igual("agenda cobre perfil", gavetaPaciente(0, true), undefined);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
