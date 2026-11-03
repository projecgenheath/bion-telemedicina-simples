/**
 * Testes da exibição da espera do médico (paciente).
 * Rodar: bun src/components/bion/paciente/espera-medico-ui.teste.ts
 */
import { contagemFalada, formatarContagem, mensagemErroEspera, mostrarPainelEspera, podeRemarcarComOutroMedico, segundosAte, TEXTO_ERRO_RETORNO_GRATIS, textoDiferenca, type EsperaWire } from "./espera-medico-ui";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else { falhas++; console.error(`FALHOU ${nome}\n  obtido:   ${a}\n  esperado: ${b}`); }
}

const T0 = Date.parse("2026-10-20T18:00:00.000Z");
igual("segundosAte 10 min", segundosAte("2026-10-20T18:10:00.000Z", T0), 600);
igual("segundosAte arredonda para cima", segundosAte("2026-10-20T18:00:00.400Z", T0), 1);
igual("segundosAte passado", segundosAte("2026-10-20T17:59:00.000Z", T0), 0);
igual("segundosAte null", segundosAte(null, T0), 0);
igual("segundosAte inválido", segundosAte("x", T0), 0);

igual("contagem 10:00", formatarContagem(600), "10:00");
igual("contagem 09:05", formatarContagem(545), "09:05");
igual("contagem negativa", formatarContagem(-3), "00:00");
igual("falada", contagemFalada(545), "9 minutos e 5 segundos");
igual("falada 1 min", contagemFalada(60), "1 minuto");
igual("falada só s", contagemFalada(1), "1 segundo");

igual("diferença cobra", textoDiferenca(5000).acao, "cobrar");
igual("diferença devolve", textoDiferenca(-2550).acao, "devolver");
igual("diferença zero", textoDiferenca(0).curto, "Mesmo valor");
igual("cobra com cartão, sem Pix", [textoDiferenca(5000).detalhe.includes("cartão"), /pix/i.test(textoDiferenca(5000).detalhe)], [true, false]);
igual("devolve sem sinal negativo no valor", /−\s?-/.test(textoDiferenca(-2550).curto), false);

const base: EsperaWire = {
  consultaId: "c1", status: "aguardando", iniciadaEm: "", expiraEm: "", segundosRestantes: 600,
  reservaExpiraEm: null, podeEscolher: false, consultaNovaId: null, diferencaCentavos: null, resolvidoEm: null,
};
igual("painel sem espera", mostrarPainelEspera(null, false), false);
igual("painel aguardando", mostrarPainelEspera(base, false), true);
igual("painel some com médico conectado", mostrarPainelEspera(base, true), false);
igual("painel some medico_entrou", mostrarPainelEspera({ ...base, status: "medico_entrou" }, false), false);
igual("painel remarcando", mostrarPainelEspera({ ...base, status: "remarcando" }, false), true);

igual("erro conhecido", mensagemErroEspera("medico_indisponivel"), "Esse médico não está mais livre agora. Escolha outro.");
igual("erro código cru não vaza", mensagemErroEspera(undefined, "preco_mudou_x"), "Não foi possível concluir agora. Tente de novo.");
igual("erro texto do servidor", mensagemErroEspera(undefined, "Consulta não encontrada."), "Consulta não encontrada.");

// B43: retorno grátis não remarca com outro médico; erro tem texto próprio
igual("remarcar: pago pode", podeRemarcarComOutroMedico(15000), true);
igual("remarcar: valor 0 não pode", podeRemarcarComOutroMedico(0), false);
igual("remarcar: sem valor não pode", podeRemarcarComOutroMedico(null), false);
igual("erro retorno_gratis", mensagemErroEspera("retorno_gratis"), TEXTO_ERRO_RETORNO_GRATIS);
igual(
  "erro nao_pago de retorno grátis (texto do servidor) não vira 'sem pagamento'",
  mensagemErroEspera("nao_pago", "Este retorno é gratuito e não pode ser remarcado com outro médico. Cancele, e o seu direito ao retorno grátis volta."),
  TEXTO_ERRO_RETORNO_GRATIS,
);
igual("erro nao_pago comum segue o de antes", mensagemErroEspera("nao_pago", "Só dá para remarcar uma consulta paga. Escolha cancelar."), "Esta consulta não tem pagamento confirmado.");

console.log(`espera-medico-ui: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
