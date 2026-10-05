/**
 * Testes das regras da tela de Repasses (funções puras).
 * Rodar: bun src/components/bion/admin/repasses/formatos.teste.ts  (também com TZ=UTC e TZ=Asia/Tokyo)
 * As mensagens abaixo são cópias literais de src/lib/server/repasse.ts (ERRO_*),
 * src/lib/server/http.ts (ERRO_JA_REPASSADO) e src/app/api/admin/repasses/[id]/route.ts.
 */
import {
  agruparPorCompetencia,
  confirmacoesNecessarias,
  explicarErroPagamento,
  formatarChavePix,
  formatarDocumento,
  podePagar,
  resumoFechamento,
  rotuloPixTipo,
  tamanhoArquivo,
  validarCompetencia,
  validarComprovante,
} from "./formatos";
import type { Recebimento } from "./tipos";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido).replace(/\u00a0/g, " ");
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.error(`✗ ${nome}\n   obtido:   ${a}\n   esperado: ${b}`);
  }
}

// Documentos e chaves
igual("cpf", formatarDocumento("12345678901"), "123.456.789-01");
igual("cnpj numérico", formatarDocumento("12345678000199"), "12.345.678/0001-99");
igual("cnpj alfanumérico", formatarDocumento("12abc34501de35"), "12.ABC.345/01DE-35");
igual("cnpj já formatado", formatarDocumento("12.345.678/0001-99"), "12.345.678/0001-99");
igual("documento estranho", formatarDocumento("abc"), "abc");
igual("documento vazio", formatarDocumento(null), "—");
igual("chave telefone", formatarChavePix("telefone", "+5511987654321"), "+55 (11) 98765-4321");
igual("chave cpf", formatarChavePix("cpf", "12345678901"), "123.456.789-01");
igual("chave email", formatarChavePix("email", "dra@exemplo.com"), "dra@exemplo.com");
igual("chave aleatória", formatarChavePix("aleatoria", "123e4567-e89b-12d3-a456-426614174000"), "123e4567-e89b-12d3-a456-426614174000");
igual("chave vazia", formatarChavePix("email", ""), "—");
igual("rótulo pix", [rotuloPixTipo("telefone"), rotuloPixTipo("aleatoria"), rotuloPixTipo(null)], ["Celular", "Chave aleatória", "Chave PIX"]);

// Pode pagar?
const rec = (extra: Partial<Recebimento> = {}): Recebimento => ({
  pixTipo: "email",
  pixChave: "dra@exemplo.com",
  titularTipo: "pf",
  titularNome: "Dra. Teste",
  titularDocumento: "12345678901",
  atualizadoEm: "2026-09-01T12:00:00.000Z",
  chaveTrocadaRecente: false,
  cnpjDivergente: false,
  ...extra,
});
igual("pode pagar ok", podePagar({ status: "fechado", liquidoCentavos: 100, recebimento: rec() }), { ok: true });
igual("pago não paga", podePagar({ status: "pago", liquidoCentavos: 100, recebimento: rec() }).ok, false);
igual("zerado não paga", podePagar({ status: "fechado", liquidoCentavos: 0, recebimento: rec() }).ok, false);
igual("sem pix não paga", podePagar({ status: "fechado", liquidoCentavos: 100, recebimento: null }), { ok: false, motivo: "O médico ainda não cadastrou a chave PIX." });
const div = podePagar({ status: "fechado", liquidoCentavos: 100, recebimento: rec({ cnpjDivergente: true, titularTipo: "pj" }) });
igual("cnpj divergente bloqueia", [div.ok, !div.ok && div.motivo.startsWith("CNPJ da conta PIX diferente")], [false, true]);
igual("chave trocada não bloqueia", podePagar({ status: "fechado", liquidoCentavos: 100, recebimento: rec({ chaveTrocadaRecente: true }) }).ok, true);

// Confirmações do passo 1
igual("confirmações normal", confirmacoesNecessarias(rec()), ["conferi"]);
igual("confirmações chave trocada", confirmacoesNecessarias(rec({ chaveTrocadaRecente: true })), ["conferi", "troca"]);
igual("confirmações sem pix", confirmacoesNecessarias(null), []);

// Comprovante
const MB = 1024 * 1024;
igual("comprovante pdf", validarComprovante({ size: MB, type: "application/pdf", name: "c.pdf" }), null);
igual("comprovante png", validarComprovante({ size: MB, type: "image/png", name: "c.png" }), null);
igual("comprovante jpg sem type (câmera)", validarComprovante({ size: MB, type: "", name: "IMG_1.JPG" }), null);
igual("comprovante 10 MB exatos", validarComprovante({ size: 10 * MB, type: "image/jpeg", name: "c.jpg" }), null);
igual("comprovante grande", validarComprovante({ size: 10 * MB + 1, type: "image/jpeg", name: "c.jpg" }), "O comprovante pode ter até 10 MB.");
igual("comprovante heic", validarComprovante({ size: MB, type: "image/heic", name: "c.heic" }), "O comprovante precisa ser PDF, PNG ou JPG.");
igual("comprovante vazio", validarComprovante({ size: 0, type: "image/png", name: "c.png" }), "Anexe o comprovante do PIX.");
igual("comprovante nulo", validarComprovante(null), "Anexe o comprovante do PIX.");
igual("tamanhos", [tamanhoArquivo(500), tamanhoArquivo(2048), tamanhoArquivo(3.5 * MB)], ["500 B", "2 KB", "3,5 MB"]);

// Erros do PATCH (mensagens literais do servidor)
const e = (s: number, m: string | null) => {
  const x = explicarErroPagamento(s, m);
  return [x.titulo, x.acao, x.bloqueia];
};
igual("409 chave mudou", e(409, "A chave PIX do médico mudou desde que a tela foi aberta. Confira a chave nova antes de pagar."), ["A chave PIX mudou", "reconferir", false]);
igual(
  "409 cnpj divergente",
  e(409, "A conta PIX é de pessoa jurídica, mas o CNPJ dela não é mais o CNPJ do perfil do médico. Peça para o médico atualizar o recebimento antes de pagar."),
  ["CNPJ divergente: pagamento bloqueado", "recarregar", true],
);
igual("409 sem chave", e(409, "O médico ainda não cadastrou a chave PIX."), ["Médico sem chave PIX", "recarregar", true]);
igual("409 não aberto", e(409, "Esse repasse não existe ou já foi marcado como pago."), ["Esse repasse já não está a pagar", "recarregar", true]);
igual("409 zerado", e(409, "Esse repasse não tem valor a pagar."), ["Repasse sem valor a pagar", "recarregar", true]);
igual("409 já repassado", e(409, "Esse registro já entrou num repasse e não pode ser alterado."), ["Registro já repassado", "recarregar", true]);
igual("409 desconhecido mostra o texto", explicarErroPagamento(409, "Outra coisa.").texto, "Outra coisa.");
igual("400 anexe", e(400, "Anexe o comprovante do PIX."), ["Confira o comprovante", "comprovante", false]);
igual("400 10 MB", e(400, "O comprovante pode ter até 10 MB."), ["Confira o comprovante", "comprovante", false]);
igual("400 tipo", e(400, "O comprovante precisa ser PDF, PNG ou JPG."), ["Confira o comprovante", "comprovante", false]);
igual("400 confira chave", e(400, "Confira a chave PIX antes de marcar como pago."), ["Não foi possível pagar", "reconferir", false]);
igual("404", e(404, "Repasse não encontrado."), ["Repasse não encontrado", "recarregar", true]);
igual("403", e(403, "Sem permissão."), ["Sem permissão", "nenhuma", true]);
igual("503", e(503, "O envio de comprovantes não está configurado no servidor."), ["Envio de comprovantes indisponível", "nenhuma", false]);
igual("503 texto do servidor", explicarErroPagamento(503, "O envio de comprovantes não está configurado no servidor.").texto, "O envio de comprovantes não está configurado no servidor.");
igual("sem conexão", e(0, "Sem conexão com o servidor."), ["Sem conexão", "nenhuma", false]);
igual("500", explicarErroPagamento(500, null).texto, "O servidor respondeu 500. Nada foi alterado.");

// Fechar agora (mesma regra do servidor)
igual("competência ontem", validarCompetencia("2026-10-03", "2026-10-04", 14), null);
igual("competência hoje antes das 23", validarCompetencia("2026-10-04", "2026-10-04", 22), "O dia de hoje só pode ser fechado a partir das 23:00.");
igual("competência hoje às 23", validarCompetencia("2026-10-04", "2026-10-04", 23), null);
igual("competência futura", validarCompetencia("2026-10-05", "2026-10-04", 23), "Não dá para fechar um dia que ainda não chegou.");
igual("competência inválida", validarCompetencia("2026-13-40", "2026-10-04", 10), "Use uma data real.");
igual("competência vazia", validarCompetencia("", "2026-10-04", 10), "Use uma data real.");
igual(
  "resumo fechamento",
  resumoFechamento([
    { medicoId: "a", situacao: "fechado", liquidoCentavos: 1000, itens: 2 },
    { medicoId: "b", situacao: "fechado", liquidoCentavos: 500, itens: 1 },
    { medicoId: "c", situacao: "ja_fechado", repasseId: "r" },
    { medicoId: "d", situacao: "sem_itens" },
    { medicoId: "e", situacao: "erro", erro: "falhou" },
  ]),
  { fechado: 2, ja_fechado: 1, sem_itens: 1, erro: 1, liquidoCentavos: 1500 },
);
igual(
  "agrupar por competência",
  agruparPorCompetencia([
    { id: 1, competencia: "2026-10-02" },
    { id: 2, competencia: "2026-10-03" },
    { id: 3, competencia: "2026-10-02" },
  ]).map((g) => [g.competencia, g.itens.map((i) => i.id)]),
  [
    ["2026-10-02", [1, 3]],
    ["2026-10-03", [2]],
  ],
);

console.log(`${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
