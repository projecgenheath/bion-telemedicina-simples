/**
 * Testes da chamada recebida (lib/chamada-recebida-logica.ts).
 * Rodar: bun src/lib/chamada-recebida-logica.teste.ts
 */
import {
  ESTADO_CHAMADA_INICIAL,
  TEXTO_EVOLUCAO_PENDENTE,
  consultaAbertaNaUrl,
  consultaEncerrada,
  modoChamadaRecebida,
  tentativaParaAtenderNaSala,
  respostaConsultaEncerrada,
  TEXTO_CONFIRMAR_TROCA,
  decidirAposAtender,
  decidirResposta,
  iniciaisContraparte,
  lerEventoChamada,
  lerPedidoResposta,
  reduzirChamada,
  type EstadoChamadaRecebida,
  type EventoChamada,
} from "./chamada-recebida-logica";

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

const AGORA = Date.parse("2026-10-19T14:00:00.000Z");
const EXPIRA = "2026-10-19T14:02:00.000Z";

// ── Leitura dos eventos (payload da rede) ───────────────────────────────
const toque = lerEventoChamada("chamada_tocando", {
  consultaId: "c1",
  contraparte: "Dr. Rafael Lima",
  especialidade: "Clínica Geral",
  expiraEm: EXPIRA,
  tentativa: 1,
});
igual("tocando válido", toque, {
  tipo: "chamada_tocando",
  consultaId: "c1",
  tentativa: 1,
  expiraEm: Date.parse(EXPIRA),
  contraparte: "Dr. Rafael Lima",
  especialidade: "Clínica Geral",
});
igual("tocando sem expiraEm", lerEventoChamada("chamada_tocando", { consultaId: "c1", tentativa: 1 }), null);
igual("id com lixo", lerEventoChamada("chamada_tocando", { consultaId: "../x", tentativa: 1, expiraEm: EXPIRA }), null);
igual("tentativa 0", lerEventoChamada("chamada_expirada", { consultaId: "c1", tentativa: 0 }), null);
igual("tentativa texto", lerEventoChamada("chamada_expirada", { consultaId: "c1", tentativa: "1" }), null);
igual("payload nulo", lerEventoChamada("chamada_tocando", null), null);
igual("evento desconhecido", lerEventoChamada("outro", { consultaId: "c1", tentativa: 1 }), null);
igual("atendida sem por", lerEventoChamada("chamada_atendida", { consultaId: "c1", tentativa: 1 }), null);
igual(
  "atendida",
  lerEventoChamada("chamada_atendida", { consultaId: "c1", tentativa: 1, por: "paciente", em: EXPIRA }),
  { tipo: "chamada_atendida", consultaId: "c1", tentativa: 1, por: "paciente" },
);
igual(
  "expirada última",
  lerEventoChamada("chamada_expirada", { consultaId: "c1", tentativa: 3, em: EXPIRA, ultima: true }),
  { tipo: "chamada_expirada", consultaId: "c1", tentativa: 3, ultima: true },
);
igual(
  "nome comprido é cortado",
  (lerEventoChamada("chamada_tocando", { consultaId: "c1", tentativa: 1, expiraEm: EXPIRA, contraparte: "x".repeat(200) }) as { contraparte: string }).contraparte.length,
  80,
);

// ── Reducer ─────────────────────────────────────────────────────────────
const ev = (e: EventoChamada, agora = AGORA) => ({ tipo: "evento", evento: e, agora }) as const;
const t1 = toque as EventoChamada;
let s: EstadoChamadaRecebida = reduzirChamada(ESTADO_CHAMADA_INICIAL, ev(t1));
igual("toca", s.atual?.consultaId, "c1");
igual("repetido não muda o estado", reduzirChamada(s, ev(t1)), s);
s = reduzirChamada(s, { tipo: "fechar" });
igual("fechar", s.atual, null);
igual("depois de fechar o mesmo toque não volta", reduzirChamada(s, ev(t1)).atual, null);
const t2 = { ...t1, tentativa: 2 } as EventoChamada;
igual("tentativa 2 toca de novo", reduzirChamada(s, ev(t2)).atual?.tentativa, 2);

igual("já expirado não toca", reduzirChamada(ESTADO_CHAMADA_INICIAL, ev(t1, Date.parse(EXPIRA) + 1)).atual, null);

const tocando = reduzirChamada(ESTADO_CHAMADA_INICIAL, ev(t1));
for (const tipo of ["chamada_atendida", "chamada_recusada"] as const) {
  igual(`${tipo} fecha`, reduzirChamada(tocando, ev({ tipo, consultaId: "c1", tentativa: 1, por: "paciente" })).atual, null);
  igual(
    `${tipo} de outra tentativa não fecha`,
    reduzirChamada(tocando, ev({ tipo, consultaId: "c1", tentativa: 2, por: "paciente" })).atual?.tentativa,
    1,
  );
}
igual("expirada fecha", reduzirChamada(tocando, ev({ tipo: "chamada_expirada", consultaId: "c1", tentativa: 1, ultima: false })).atual, null);
igual("expirada de outra consulta não fecha", reduzirChamada(tocando, ev({ tipo: "chamada_expirada", consultaId: "c2", tentativa: 1, ultima: false })).atual?.consultaId, "c1");
const atendidaAntes = reduzirChamada(ESTADO_CHAMADA_INICIAL, ev({ tipo: "chamada_atendida", consultaId: "c1", tentativa: 1, por: "paciente" }));
igual("atendida chegou antes do tocando: não toca", reduzirChamada(atendidaAntes, ev(t1)).atual, null);
igual("timer local expirou", reduzirChamada(tocando, { tipo: "expirou", consultaId: "c1", tentativa: 1, agora: Date.parse(EXPIRA) }).atual, null);
igual("timer de outra tentativa não fecha", reduzirChamada(tocando, { tipo: "expirou", consultaId: "c1", tentativa: 2, agora: Date.parse(EXPIRA) }).atual?.tentativa, 1);
const outra = { ...t1, consultaId: "c2" } as EventoChamada;
igual("outra consulta enquanto toca: mantém a atual", reduzirChamada(tocando, ev(outra)).atual?.consultaId, "c1");
let muitas: EstadoChamadaRecebida = ESTADO_CHAMADA_INICIAL;
for (let i = 1; i <= 60; i++) muitas = reduzirChamada(muitas, ev({ tipo: "chamada_expirada", consultaId: `c${i}`, tentativa: 1, ultima: false }));
igual("vistas limitadas a 50", muitas.vistas.length, 50);

// ── URL da sala ─────────────────────────────────────────────────────────
igual("na sala", consultaAbertaNaUrl("/consulta", "?consulta=c1"), "c1");
igual("na sala com barra", consultaAbertaNaUrl("/consulta/", "?consulta=c1"), "c1");
igual("outra página", consultaAbertaNaUrl("/paciente", "?consulta=c1"), null);
igual("id inválido", consultaAbertaNaUrl("/consulta", "?consulta=a%20b"), null);

// ── Rota: corpo e decisão ───────────────────────────────────────────────
igual("pedido atender", lerPedidoResposta({ acao: "atender", tentativa: 2 }), { acao: "atender", tentativa: 2 });
igual("pedido sem tentativa", lerPedidoResposta({ acao: "atender" }), null);
igual("pedido ação inválida", lerPedidoResposta({ acao: "apagar", tentativa: 1 }), null);
igual("pedido nulo", lerPedidoResposta(null), null);
igual("sem linha (antes do job): 200 sem gravar, avisa", decidirResposta("atender", null), { atualizarPara: null, de: [], avisar: true, status: "sem_registro" });
igual("tocando → atendida", decidirResposta("atender", { status: "tocando" }), { atualizarPara: "atendida", de: ["tocando", "expirada"], avisar: true, status: "atendida" });
igual("tocando → recusada", decidirResposta("recusar", { status: "tocando" }), { atualizarPara: "recusada", de: ["tocando"], avisar: true, status: "recusada" });
igual("atender NÃO exige tocando: expirada → atendida", decidirResposta("atender", { status: "expirada" }), { atualizarPara: "atendida", de: ["tocando", "expirada"], avisar: true, status: "atendida" });
igual("recusar depois de expirar: fica expirada", decidirResposta("recusar", { status: "expirada" }), { atualizarPara: null, de: [], avisar: false, status: "expirada" });
igual("já atendida: idempotente", decidirResposta("atender", { status: "atendida" }), { atualizarPara: null, de: [], avisar: false, status: "atendida" });
igual("recusar depois de atendida não muda", decidirResposta("recusar", { status: "atendida" }), { atualizarPara: null, de: [], avisar: false, status: "atendida" });
igual("atender depois de recusar: fica recusada", decidirResposta("atender", { status: "recusada" }), { atualizarPara: null, de: [], avisar: false, status: "recusada" });

// ── Depois de "Atender": 409 da trava e outros ──────────────────────────
const trava = { status: 409, corpo: { motivo: "evolucao_pendente", consultaId: "c0" } };
igual("409 evolucao_pendente do /sala bloqueia", decidirAposAtender(trava, null), { tipo: "bloqueado", mensagem: TEXTO_EVOLUCAO_PENDENTE });
igual("409 evolucao_pendente da rota chamada bloqueia", decidirAposAtender({ status: 200 }, trava), { tipo: "bloqueado", mensagem: TEXTO_EVOLUCAO_PENDENTE });
igual("409 de janela do /sala espiar não bloqueia (a sala trata)", decidirAposAtender({ status: 409, corpo: { motivo: "antes" } }, { status: 200 }), { tipo: "entrar" });
igual(
  "409 de janela da rota chamada bloqueia com o texto do servidor",
  decidirAposAtender({ status: 200 }, { status: 409, corpo: { erro: "A sala já fechou." } }),
  { tipo: "bloqueado", mensagem: "A sala já fechou." },
);
igual("403 bloqueia", decidirAposAtender(null, { status: 403 }).tipo, "bloqueado");
igual("tudo 200 entra", decidirAposAtender({ status: 200 }, { status: 200 }), { tipo: "entrar" });
igual("falha de rede entra (a sala tem o próprio tratamento)", decidirAposAtender(null, null), { tipo: "entrar" });
igual("500 entra", decidirAposAtender({ status: 500 }, { status: 500 }), { tipo: "entrar" });

// ── Iniciais ────────────────────────────────────────────────────────────
igual("ignora Dr.", iniciaisContraparte("Dr. Rafael Lima"), "RL");
igual("ignora Dra", iniciaisContraparte("Dra Ana Paula Souza"), "AS");
igual("um nome", iniciaisContraparte("Maria"), "M");
igual("vazio", iniciaisContraparte(""), "?");

// ── Fim dos toques: expiraEm local, +15 min do início, consulta encerrada ──
const MIN = 60_000;
const tocarEm = (e: EstadoChamadaRecebida, tentativa: number, agora: number, inicioConsulta: number | null = null) =>
  reduzirChamada(e, {
    tipo: "evento",
    evento: { ...(t1 as Extract<EventoChamada, { tipo: "chamada_tocando" }>), tentativa, expiraEm: agora + 2 * MIN },
    agora,
    inicioConsulta,
  });
// Timer local fecha sem esperar chamada_expirada; a próxima tentativa (antes de 15 min) toca.
let f = tocarEm(ESTADO_CHAMADA_INICIAL, 1, AGORA);
f = reduzirChamada(f, { tipo: "expirou", consultaId: "c1", tentativa: 1, agora: AGORA + 2 * MIN });
igual("expiraEm local fecha sozinho", f.atual, null);
igual("expiraEm local antes de 15 min não finaliza", f.finalizadas, []);
f = tocarEm(f, 2, AGORA + 5 * MIN);
igual("tentativa 2 toca (5 min)", f.atual?.tentativa, 2);
// Expiração depois de 15 min do início (1º toque) sem ultima:true → final.
let g = tocarEm(ESTADO_CHAMADA_INICIAL, 1, AGORA);
g = reduzirChamada(g, { tipo: "evento", evento: { tipo: "chamada_expirada", consultaId: "c1", tentativa: 3, ultima: false }, agora: AGORA + 16 * MIN });
igual("expirada após 15 min sem ultima → final", g.finalizadas, ["c1"]);
igual("depois do final não toca mais", tocarEm(g, 4, AGORA + 17 * MIN).atual, null);
// Com o horário da consulta conhecido (store): conta do início da consulta.
const inicioConsulta = AGORA - 14 * MIN;
let h = tocarEm(ESTADO_CHAMADA_INICIAL, 1, AGORA, inicioConsulta);
igual("toca aos 14 min da consulta", h.atual?.tentativa, 1);
h = reduzirChamada(h, { tipo: "expirou", consultaId: "c1", tentativa: 1, agora: AGORA + 2 * MIN });
igual("timer local aos 16 min da consulta → final", h.finalizadas, ["c1"]);
igual("toque que chega depois de 15 min do início não toca", tocarEm(ESTADO_CHAMADA_INICIAL, 1, AGORA, AGORA - 15 * MIN).atual, null);
igual("ultima:true antes de 15 min também é final",
  reduzirChamada(tocarEm(ESTADO_CHAMADA_INICIAL, 1, AGORA), { tipo: "evento", evento: { tipo: "chamada_expirada", consultaId: "c1", tentativa: 1, ultima: true }, agora: AGORA + MIN }).finalizadas,
  ["c1"]);
igual("expirada antes de 15 min sem ultima não é final",
  reduzirChamada(tocarEm(ESTADO_CHAMADA_INICIAL, 1, AGORA), { tipo: "evento", evento: { tipo: "chamada_expirada", consultaId: "c1", tentativa: 1, ultima: false }, agora: AGORA + 2 * MIN }).finalizadas,
  []);
// Consulta cancelada/concluída: para na hora e não toca mais.
let k = tocarEm(ESTADO_CHAMADA_INICIAL, 1, AGORA);
k = reduzirChamada(k, { tipo: "consulta_encerrada", consultaId: "c1" });
igual("consulta encerrada para o toque", k.atual, null);
igual("consulta encerrada não toca de novo", tocarEm(k, 2, AGORA + 5 * MIN).atual, null);
igual("encerrar outra consulta não mexe na atual", reduzirChamada(tocarEm(ESTADO_CHAMADA_INICIAL, 1, AGORA), { tipo: "consulta_encerrada", consultaId: "c2" }).atual?.consultaId, "c1");
const semMudar = tocarEm(ESTADO_CHAMADA_INICIAL, 1, AGORA);
const jaFinal = reduzirChamada(semMudar, { tipo: "consulta_encerrada", consultaId: "c2" });
igual("encerrar de novo devolve o mesmo estado", reduzirChamada(jaFinal, { tipo: "consulta_encerrada", consultaId: "c2" }) === jaFinal, true);
igual("cancelada é final", consultaEncerrada("cancelada"), true);
igual("concluida é final", consultaEncerrada("concluida"), true);
igual("confirmada não é final", consultaEncerrada("confirmada"), false);
igual("em_espera não é final", consultaEncerrada("em_espera"), false);
igual("sem status não é final", consultaEncerrada(undefined), false);

// ── inicioEm do payload (Admin): prioridade sobre dataISO e 1º toque ──
const base = { consultaId: "c1", contraparte: "Dr. X", especialidade: "", expiraEm: EXPIRA, tentativa: 1 };
const comInicio = lerEventoChamada("chamada_tocando", { ...base, inicioEm: "2026-10-19T13:50:00.000Z" });
igual("inicioEm presente é lido em ms", (comInicio as { inicioEm?: number }).inicioEm, Date.parse("2026-10-19T13:50:00.000Z"));
igual("inicioEm ausente: campo não existe", "inicioEm" in (lerEventoChamada("chamada_tocando", base) as object), false);
for (const ruim of ["ontem", "", 123, null, { a: 1 }]) {
  const e = lerEventoChamada("chamada_tocando", { ...base, inicioEm: ruim });
  igual(`inicioEm inválido (${JSON.stringify(ruim)}) é ignorado e o toque vale`, e !== null && !("inicioEm" in e), true);
}
const tocarCom = (e: EstadoChamadaRecebida, tentativa: number, agora: number, inicioEm: number | undefined, inicioConsulta: number | null) =>
  reduzirChamada(e, {
    tipo: "evento",
    evento: { ...(t1 as Extract<EventoChamada, { tipo: "chamada_tocando" }>), tentativa, expiraEm: agora + 2 * MIN, ...(inicioEm !== undefined ? { inicioEm } : {}) },
    agora,
    inicioConsulta,
  });
// Presente: vence o dataISO do store (store diz começo agora; inicioEm diz 16 min atrás → já passou).
igual("inicioEm presente vence dataISO", tocarCom(ESTADO_CHAMADA_INICIAL, 1, AGORA, AGORA - 16 * MIN, AGORA).atual, null);
igual("inicioEm presente fica como início (prioridade 2)", tocarCom(ESTADO_CHAMADA_INICIAL, 1, AGORA, AGORA - 5 * MIN, AGORA).inicios, [["c1", AGORA - 5 * MIN, 2]]);
// Presente: vence o 1º toque visto (sem store).
let p1 = tocarCom(ESTADO_CHAMADA_INICIAL, 1, AGORA, AGORA - 14 * MIN, null);
igual("toca aos 14 min pelo inicioEm", p1.atual?.tentativa, 1);
p1 = reduzirChamada(p1, { tipo: "expirou", consultaId: "c1", tentativa: 1, agora: AGORA + 2 * MIN });
igual("expira aos 16 min pelo inicioEm → final (o 1º toque diria só 2 min)", p1.finalizadas, ["c1"]);
// Chega depois: inicioEm na tentativa 2 substitui o 1º toque visto.
let p2 = tocarCom(ESTADO_CHAMADA_INICIAL, 1, AGORA, undefined, null);
p2 = reduzirChamada(p2, { tipo: "fechar" });
p2 = tocarCom(p2, 2, AGORA + 5 * MIN, AGORA - 20 * MIN, null);
igual("inicioEm tardio substitui o 1º toque e encerra", [p2.atual, p2.finalizadas], [null, ["c1"]]);
// Ausente: cai no dataISO do store; depois um toque sem nada não rebaixa a fonte.
let p3 = tocarCom(ESTADO_CHAMADA_INICIAL, 1, AGORA, AGORA - 3 * MIN, null);
p3 = reduzirChamada(p3, { tipo: "fechar" });
p3 = tocarCom(p3, 2, AGORA + 5 * MIN, undefined, AGORA - 30 * MIN);
igual("dataISO não sobrescreve inicioEm já conhecido", [p3.atual?.tentativa, p3.inicios], [2, [["c1", AGORA - 3 * MIN, 2]]]);
igual("ausente: usa dataISO (prioridade 1)", tocarCom(ESTADO_CHAMADA_INICIAL, 1, AGORA, undefined, AGORA - 2 * MIN).inicios, [["c1", AGORA - 2 * MIN, 1]]);
igual("ausente e sem store: 1º toque (prioridade 0)", tocarCom(ESTADO_CHAMADA_INICIAL, 1, AGORA, undefined, null).inicios, [["c1", AGORA, 0]]);
// Inválido no payload → equivale a ausente (cai no dataISO).
const invalido = lerEventoChamada("chamada_tocando", { ...base, inicioEm: "xx" }) as EventoChamada;
igual("inválido: cai no dataISO", reduzirChamada(ESTADO_CHAMADA_INICIAL, { tipo: "evento", evento: invalido, agora: AGORA, inicioConsulta: AGORA - MIN }).inicios, [["c1", AGORA - MIN, 1]]);

// ── Tela cheia vs aviso compacto vs nada ────────────────────────────────
igual("fora de /consulta: tela cheia", modoChamadaRecebida("c1", "/paciente", ""), "tela");
igual("início: tela cheia", modoChamadaRecebida("c1", "/", "?consulta=c1"), "tela");
igual("rota parecida não conta: tela", modoChamadaRecebida("c1", "/consultas", "?consulta=c2"), "tela");
igual("em OUTRA consulta: aviso", modoChamadaRecebida("c1", "/consulta", "?consulta=c2"), "aviso");
igual("em /consulta sem id: aviso", modoChamadaRecebida("c1", "/consulta", ""), "aviso");
igual("em /consulta com id inválido: aviso", modoChamadaRecebida("c1", "/consulta", "?consulta=a%20b"), "aviso");
igual("em /consulta/ (barra) de outra: aviso", modoChamadaRecebida("c1", "/consulta/", "?consulta=c2"), "aviso");
igual("na MESMA consulta: nada", modoChamadaRecebida("c1", "/consulta", "?consulta=c1"), "nada");
igual("na mesma consulta com outros parâmetros: nada", modoChamadaRecebida("c1", "/consulta", "?x=1&consulta=c1"), "nada");
// Expiração e dedupe valem igual no aviso: o reducer não depende do modo.
let mAviso = reduzirChamada(ESTADO_CHAMADA_INICIAL, ev(t1, AGORA));
igual("em outra consulta o toque entra no estado (vira aviso)", mAviso.atual?.consultaId, "c1");
mAviso = reduzirChamada(mAviso, { tipo: "expirou", consultaId: "c1", tentativa: 1, agora: Date.parse(EXPIRA) });
igual("aviso some no expiraEm", mAviso.atual, null);
igual("aviso não volta para o mesmo toque", reduzirChamada(mAviso, ev(t1, AGORA)).atual, null);
igual("texto da confirmação", TEXTO_CONFIRMAR_TROCA, "Sair da chamada atual e atender?");

// ── 409 consulta_encerrada: fecha sem navegar ───────────────────────────
const encerrada = { status: 409, corpo: { erro: "Esta consulta foi cancelada ou já foi concluída.", motivo: "consulta_encerrada" } };
igual("409 consulta_encerrada da rota chamada: fecha", decidirAposAtender({ status: 200 }, encerrada), { tipo: "fechar" });
igual("409 consulta_encerrada vindo da sala: fecha", decidirAposAtender(encerrada, null), { tipo: "fechar" });
igual("evolucao_pendente tem prioridade sobre consulta_encerrada", decidirAposAtender({ status: 409, corpo: { motivo: "evolucao_pendente" } }, encerrada).tipo, "bloqueado");
igual("409 sem motivo continua bloqueando", decidirAposAtender({ status: 200 }, { status: 409, corpo: { erro: "fora" } }), { tipo: "bloqueado", mensagem: "fora" });
igual("respostaConsultaEncerrada: sim", respostaConsultaEncerrada(encerrada), true);
igual("respostaConsultaEncerrada: 200 não", respostaConsultaEncerrada({ status: 200, corpo: { motivo: "consulta_encerrada" } }), false);
igual("respostaConsultaEncerrada: outro motivo não", respostaConsultaEncerrada({ status: 409, corpo: { motivo: "evolucao_pendente" } }), false);
igual("respostaConsultaEncerrada: rede não", respostaConsultaEncerrada(null), false);

// ── Já na sala da MESMA consulta: atende em segundo plano, uma vez ─────
{
  const naSala = modoChamadaRecebida("c1", "/consulta", "?consulta=c1");
  let e = reduzirChamada(ESTADO_CHAMADA_INICIAL, ev(t1));
  igual("toque da consulta aberta entra no estado (UI não mostra)", [e.atual?.consultaId, naSala], ["c1", "nada"]);
  const alvo = tentativaParaAtenderNaSala(e.atual, naSala, AGORA);
  igual("na mesma sala: dispara atender da tentativa", alvo, { consultaId: "c1", tentativa: 1 });
  e = reduzirChamada(e, { tipo: "fechar_tentativa", consultaId: "c1", tentativa: 1 });
  igual("depois de fechar_tentativa não dispara de novo", tentativaParaAtenderNaSala(e.atual, naSala, AGORA), null);
  igual("reenvio do mesmo toque não volta (dispara uma vez só)", tentativaParaAtenderNaSala(reduzirChamada(e, ev(t1)).atual, naSala, AGORA), null);
  igual("próxima tentativa na mesma sala dispara de novo (é outra)", tentativaParaAtenderNaSala(reduzirChamada(e, ev(t2)).atual, naSala, AGORA), { consultaId: "c1", tentativa: 2 });
  const tocandoC1 = reduzirChamada(ESTADO_CHAMADA_INICIAL, ev(t1));
  igual("tentativa expirada não dispara", tentativaParaAtenderNaSala(tocandoC1.atual, naSala, Date.parse(EXPIRA)), null);
  const respondida = reduzirChamada(tocandoC1, ev({ tipo: "chamada_atendida", consultaId: "c1", tentativa: 1, por: "paciente" }));
  igual("tentativa respondida (outro aparelho) não dispara", tentativaParaAtenderNaSala(respondida.atual, naSala, AGORA), null);
  const recusada = reduzirChamada(tocandoC1, ev({ tipo: "chamada_recusada", consultaId: "c1", tentativa: 1, por: "medico" }));
  igual("tentativa recusada não dispara", tentativaParaAtenderNaSala(recusada.atual, naSala, AGORA), null);
  igual("em OUTRA consulta (aviso) não dispara", tentativaParaAtenderNaSala(tocandoC1.atual, modoChamadaRecebida("c1", "/consulta", "?consulta=c2"), AGORA), null);
  igual("fora de /consulta (tela) não dispara", tentativaParaAtenderNaSala(tocandoC1.atual, modoChamadaRecebida("c1", "/paciente", ""), AGORA), null);
  igual("sem chamada não dispara", tentativaParaAtenderNaSala(null, naSala, AGORA), null);
  igual("fechar_tentativa de outra tentativa não fecha", reduzirChamada(tocandoC1, { tipo: "fechar_tentativa", consultaId: "c1", tentativa: 2 }) === tocandoC1, true);
}

console.log(`chamada-recebida-logica: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
