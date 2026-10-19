/**
 * Testes das respostas com motivo da rota chamada (lib/server/chamada-resposta.ts).
 * Rodar: bun --conditions=react-server src/lib/server/chamada-resposta.teste.ts
 */
import { bloqueioConsultaEncerrada, respostaComMotivo, MOTIVO_CONSULTA_ENCERRADA } from "./chamada-resposta";

let ok = 0;
let falhas = 0;
function igual(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) ok++;
  else {
    falhas++;
    console.log(`FALHA ${nome}: obtido ${a} — esperado ${b}`);
  }
}

async function main() {
  for (const st of ["cancelada", "concluida"]) {
    const r = bloqueioConsultaEncerrada(st);
    igual(`${st}: bloqueia`, r !== null, true);
    igual(`${st}: 409`, r?.status, 409);
    const corpo = (await r?.json()) as { erro?: string; motivo?: string };
    igual(`${st}: motivo no corpo`, corpo.motivo, "consulta_encerrada");
    igual(`${st}: erro no corpo`, typeof corpo.erro === "string" && corpo.erro.length > 0, true);
  }
  for (const st of ["confirmada", "em_espera", "pendente_anamnese", "aguardando_reagendamento", ""]) {
    igual(`${st || "(vazio)"}: segue`, bloqueioConsultaEncerrada(st), null);
  }
  const r = respostaComMotivo(409, "x", "evolucao_pendente");
  igual("respostaComMotivo: status", r.status, 409);
  igual("respostaComMotivo: corpo", await r.json(), { erro: "x", motivo: "evolucao_pendente" });
  igual("constante", MOTIVO_CONSULTA_ENCERRADA, "consulta_encerrada");

  console.log(`chamada-resposta: ${ok} ok, ${falhas} falha(s)`);
  if (falhas > 0) process.exit(1);
}
void main();
