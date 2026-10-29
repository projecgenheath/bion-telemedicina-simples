/**
 * Testes de previaCancelamentoMudou (usePreviaCancelamento.ts) — a
 * comparação que protege o cancelamento de prévia vencida (A5): se a
 * prévia refeita ao confirmar difere da exibida no que o paciente vê ou
 * no desfecho, a folha NÃO cancela e pede nova confirmação.
 * Rodar: bun src/components/bion/paciente/usePreviaCancelamento.teste.ts
 */
import { previaCancelamentoMudou, type PreviaCancelamento } from "./usePreviaCancelamento";

let ok = 0;
let falhas = 0;
function eq(nome: string, a: unknown, b: unknown) {
  if (JSON.stringify(a) === JSON.stringify(b)) ok++;
  else {
    falhas++;
    console.error(`FALHOU: ${nome}\n  obtido:   ${JSON.stringify(a)}\n  esperado: ${JSON.stringify(b)}`);
  }
}

function base(): PreviaCancelamento {
  const acao = {
    multaCentavos: 0,
    reembolsoCentavos: 15000,
    valorCentavos: 15000,
    pago: true,
    dataOriginal: "2026-11-10T12:00:00.000Z",
    semMultaAte: "2026-11-09T12:00:00.000Z",
    semMultaAteTexto: "09/11 às 09:00",
    isencao: "fora_da_janela" as const,
  };
  return {
    regra: { multaPct: 50, janelaHoras: 24 },
    status: "confirmada",
    podeCancelar: true,
    podeRemarcar: true,
    cancelar: { ...acao },
    remarcar: { ...acao },
    reembolso: null,
  };
}
const clone = (p: PreviaCancelamento): PreviaCancelamento => JSON.parse(JSON.stringify(p)) as PreviaCancelamento;

/* Sem mudança nenhuma → confirma direto. */
eq("prévias idênticas", previaCancelamentoMudou(base(), base()), false);

/* O cenário do A5: a janela virou e a multa de 50% passou a valer. */
{
  const fresca = clone(base());
  fresca.cancelar.multaCentavos = 7500;
  fresca.cancelar.reembolsoCentavos = 7500;
  fresca.cancelar.isencao = null;
  eq("janela virou: multa 0 → 50%", previaCancelamentoMudou(base(), fresca), true);
}

/* Cada campo exibido/decisivo, um a um. */
{
  const fresca = clone(base());
  fresca.cancelar.reembolsoCentavos = 14000;
  eq("só o reembolso mudou", previaCancelamentoMudou(base(), fresca), true);
}
{
  const fresca = clone(base());
  fresca.cancelar.semMultaAte = "2026-11-08T12:00:00.000Z";
  eq("só o semMultaAte mudou", previaCancelamentoMudou(base(), fresca), true);
}
{
  const fresca = clone(base());
  fresca.cancelar.pago = false;
  eq("só o pago mudou", previaCancelamentoMudou(base(), fresca), true);
}
{
  const fresca = clone(base());
  fresca.podeCancelar = false;
  eq("podeCancelar virou false", previaCancelamentoMudou(base(), fresca), true);
}
{
  const fresca = clone(base());
  fresca.status = "cancelada";
  eq("status mudou", previaCancelamentoMudou(base(), fresca), true);
}

/* Fora do escopo da confirmação do cancelamento → não bloqueia. */
{
  const fresca = clone(base());
  fresca.remarcar.multaCentavos = 7500;
  eq("só a prévia de REMARCAR mudou", previaCancelamentoMudou(base(), fresca), false);
}
{
  const fresca = clone(base());
  fresca.cancelar.semMultaAteTexto = "08/11 às 09:00";
  eq("só o texto derivado mudou", previaCancelamentoMudou(base(), fresca), false);
}

console.log(`usePreviaCancelamento: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
