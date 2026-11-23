import assert from "node:assert/strict";
import { instanteFusoClinica, type Mensagem } from "@/lib/bion-tipos";
import type { PacienteDoMedico } from "../metricas";
import { chaveDia, conversasDoMedico, filtrarConversas, horaCurta, rotuloDia } from "./mensagens-dados";

const P = (id: string, nome: string, semId = false): PacienteDoMedico => ({ chave: semId ? `nome:${nome}` : id, pacienteId: semId ? undefined : id, nome, consultas: [] });
const M = (id: string, deId: string, paraId: string, ts: number): Mensagem => ({ id, deId, paraId, de: "", para: "", texto: id, lida: false, minha: deId === "med", quando: "", ts });
const agora = instanteFusoClinica(2026, 10, 25, 9, 32);
const pacs = [P("a", "Ana"), P("b", "Bruno"), P("c", "Célia"), P("x", "Legado", true)];
const msgs = [M("1", "a", "med", agora - 3_600_000), M("2", "med", "b", agora - 60_000), M("3", "a", "outro-medico", agora)];
const lista = conversasDoMedico(pacs, msgs, "med", new Map([["a", 2]]));
// Só quem tem conversa com ESTE médico; a mais recente primeiro; legado fora.
assert.deepEqual(lista.map((i) => i.paciente.nome), ["Bruno", "Ana"]);
assert.equal(lista[1].naoLidas, 2);
assert.equal(lista[1].ultima?.id, "1");
// O paciente aberto aparece mesmo sem mensagens (no topo, como conversa nova).
assert.deepEqual(conversasDoMedico(pacs, msgs, "med", new Map(), "c").map((i) => i.paciente.nome), ["Célia", "Bruno", "Ana"]);
assert.deepEqual(filtrarConversas(lista, "", true).map((i) => i.paciente.nome), ["Ana"]);
assert.deepEqual(filtrarConversas(lista, "bru", false).map((i) => i.paciente.nome), ["Bruno"]);
assert.equal(horaCurta(agora - 60_000, agora), "09:31");
assert.equal(horaCurta(agora - 86_400_000, agora), "Ontem");
assert.equal(horaCurta(instanteFusoClinica(2026, 10, 2, 10), agora), "02/11");
assert.equal(rotuloDia(agora, agora), "Hoje");
assert.equal(rotuloDia(instanteFusoClinica(2026, 10, 12, 10), agora), "12 de novembro");
assert.equal(chaveDia(instanteFusoClinica(2026, 10, 25, 0, 5)), chaveDia(instanteFusoClinica(2026, 10, 25, 23, 50)));
console.log("mensagens-dados: ok");

// Termos em destaque: só nomes que vieram do paciente
{
  const { nomeFarmaco, termosMedicamentos, destacarTermos } = await import("./mensagens-dados");
  const eq = (a: unknown, b: unknown, n: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${n}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
  eq(nomeFarmaco("Amitriptilina 25 mg (controlado)"), "Amitriptilina", "nome com dose");
  eq(nomeFarmaco("Dipirona sódica 1 g"), "Dipirona sódica", "nome composto");
  eq(nomeFarmaco("AAS"), "", "curto demais");
  eq(termosMedicamentos(["Ibuprofeno 400 mg", "ibuprofeno", null, "Losartana 50 mg"]), ["Ibuprofeno", "Losartana"], "sem repetir");
  const t = destacarTermos("Tomo a amitriptilina e o Ibuprofeno; ibuprofenos não.", ["Amitriptilina", "Ibuprofeno"]);
  eq(t.filter((x) => x.destaque).map((x) => x.texto), ["amitriptilina", "Ibuprofeno"], "destaca palavra inteira, mantém o texto original");
  eq(t.map((x) => x.texto).join(""), "Tomo a amitriptilina e o Ibuprofeno; ibuprofenos não.", "texto intacto");
  eq(destacarTermos("Olá", []), [{ texto: "Olá", destaque: false }], "sem termos");
  eq(destacarTermos("losartána", ["Losartana"]).some((x) => x.destaque), true, "sem acento");
  console.log("termos: ok");
}
