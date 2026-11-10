/**
 * Testes de retorno-stripe.ts. Rodar: bun src/components/bion/paciente/retorno-stripe.teste.ts
 */
import { textoRetornoStripe } from "./retorno-stripe";

let ok = 0;
let falhas = 0;
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome}\n  obtido:   ${JSON.stringify(a)}\n  esperado: ${JSON.stringify(b)}`);
  }
}

// O bug original: sem consultaId e sem tipo → "Confirmando pagamento…" eterno.
const semParams = textoRetornoStripe({ consultaId: "", tipo: null, volta: "sucesso", pago: false, esgotou: false });
eq("sem parâmetros: NÃO é 'Confirmando pagamento…'", semParams.titulo, "Não conseguimos acompanhar esse pagamento");
eq("sem parâmetros: aponta Minhas consultas", semParams.texto.includes("Minhas consultas"), true);
eq("sem parâmetros: aponta o suporte", semParams.texto.includes("Perfil → Suporte"), true);

// Sem parâmetros mesmo com polling "esgotado" continua no estado de erro.
eq(
  "sem parâmetros + esgotou: continua no erro",
  textoRetornoStripe({ consultaId: "", tipo: null, volta: "sucesso", pago: false, esgotou: true }).titulo,
  "Não conseguimos acompanhar esse pagamento",
);

// Com tipo (renovação/multa): comportamento histórico preservado.
eq(
  "tipo renovacao, sucesso",
  textoRetornoStripe({ consultaId: "", tipo: "renovacao", volta: "sucesso", pago: false, esgotou: false }).titulo,
  "Pagamento enviado",
);
eq(
  "tipo multa, cancelado",
  textoRetornoStripe({ consultaId: "", tipo: "multa", volta: "cancelado", pago: false, esgotou: false }).titulo,
  "Pagamento não concluído",
);

// Com consulta: fluxo normal de polling.
eq(
  "consulta paga",
  textoRetornoStripe({ consultaId: "c1", tipo: null, volta: "sucesso", pago: true, esgotou: false }).titulo,
  "Pagamento confirmado",
);
eq(
  "consulta cancelada",
  textoRetornoStripe({ consultaId: "c1", tipo: null, volta: "cancelado", pago: false, esgotou: false }).titulo,
  "Pagamento não concluído",
);
eq(
  "consulta aguardando (polling)",
  textoRetornoStripe({ consultaId: "c1", tipo: null, volta: "sucesso", pago: false, esgotou: false }).titulo,
  "Confirmando pagamento…",
);
eq(
  "consulta esgotou",
  textoRetornoStripe({ consultaId: "c1", tipo: null, volta: "sucesso", pago: false, esgotou: true }).titulo,
  "Ainda aguardando a confirmação",
);

console.log(`retorno-stripe: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
