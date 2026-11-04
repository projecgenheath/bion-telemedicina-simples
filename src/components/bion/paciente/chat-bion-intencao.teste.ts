/**
 * Testes da intenção de abertura do chat da BION IA (paciente).
 * Rodar: bun src/components/bion/paciente/chat-bion-intencao.teste.ts
 */
import {
  TEXTO_ENVIO_LAUDO,
  mostrarAcaoLaudo,
  mostrarCartaoLaudo,
  primeiraEhContextoLaudo,
  textoAberturaChat,
  textoSaudacaoGeral,
} from "./chat-bion-intencao";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else { falhas++; console.error(`FALHOU ${nome}\n  obtido:   ${a}\n  esperado: ${b}`); }
}

const msg = (texto: string) => ({ texto });
const saudacao = textoSaudacaoGeral("Marina");
const conversaAntiga = [msg(saudacao), msg("Quero remarcar minha consulta"), msg("Claro! Qual consulta?")];

// Abertura: modo laudo não usa a saudação genérica (nada de "agendar" em destaque)
igual("abertura laudo é a mensagem contextual", textoAberturaChat("laudo", "Marina"), TEXTO_ENVIO_LAUDO);
igual("abertura laudo não menciona agendamento", /agendar/i.test(textoAberturaChat("laudo", "Marina")), false);
igual("texto do laudo promete a conferência do nome", TEXTO_ENVIO_LAUDO.includes("nome no documento é o seu"), true);
igual("texto do laudo aponta onde o resultado aparece", TEXTO_ENVIO_LAUDO.includes("Exames laboratoriais"), true);

// Abertura: modo geral preserva a saudação histórica, com o primeiro nome
igual("abertura geral é a saudação histórica", textoAberturaChat("geral", "Marina"), saudacao);
igual("abertura sem intenção cai no geral", textoAberturaChat(undefined, "Marina"), saudacao);
igual("saudação usa o primeiro nome", saudacao.startsWith("Olá, Marina!"), true);
igual("saudação menciona a triagem opcional", saudacao.includes("triagem"), true);

// Detecção da mensagem contextual
igual("primeira é contexto: conversa nova no modo laudo", primeiraEhContextoLaudo([msg(TEXTO_ENVIO_LAUDO)]), true);
igual("primeira é contexto: conversa geral", primeiraEhContextoLaudo([msg(saudacao)]), false);
igual("primeira é contexto: sem mensagens", primeiraEhContextoLaudo([]), false);

// Cartão fixo: só no modo laudo com histórico que não abriu pela mensagem contextual
igual("cartão: laudo + histórico geral", mostrarCartaoLaudo("laudo", conversaAntiga), true);
igual("cartão: laudo + só a saudação genérica", mostrarCartaoLaudo("laudo", [msg(saudacao)]), true);
igual("cartão: laudo + abertura contextual (não duplica)", mostrarCartaoLaudo("laudo", [msg(TEXTO_ENVIO_LAUDO)]), false);
igual("cartão: laudo + conversa já em andamento pelo laudo", mostrarCartaoLaudo("laudo", [msg(TEXTO_ENVIO_LAUDO), msg("[Documento anexado] laudo.pdf")]), false);
igual("cartão: laudo sem mensagens", mostrarCartaoLaudo("laudo", []), false);
igual("cartão: geral nunca mostra", mostrarCartaoLaudo("geral", conversaAntiga), false);
igual("cartão: sem intenção nunca mostra", mostrarCartaoLaudo(undefined, conversaAntiga), false);

// Botão de ação: só sob a mensagem contextual solitária, no modo laudo
igual("ação: laudo + só a mensagem contextual", mostrarAcaoLaudo("laudo", [msg(TEXTO_ENVIO_LAUDO)]), true);
igual("ação: laudo depois da primeira interação some", mostrarAcaoLaudo("laudo", [msg(TEXTO_ENVIO_LAUDO), msg("Quero enviar um laudo de exame")]), false);
igual("ação: laudo + histórico geral é o cartão, não o botão", mostrarAcaoLaudo("laudo", conversaAntiga), false);
igual("ação: geral nunca mostra", mostrarAcaoLaudo("geral", [msg(TEXTO_ENVIO_LAUDO)]), false);
igual("ação: sem mensagens", mostrarAcaoLaudo("laudo", []), false);

// Cartão e botão nunca coexistem para a mesma conversa
for (const lista of [[], [msg(TEXTO_ENVIO_LAUDO)], [msg(saudacao)], conversaAntiga]) {
  igual(
    `cartão e ação exclusivos (${lista.length} mensagens)`,
    mostrarCartaoLaudo("laudo", lista) && mostrarAcaoLaudo("laudo", lista),
    false,
  );
}

console.log(`chat-bion-intencao: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
