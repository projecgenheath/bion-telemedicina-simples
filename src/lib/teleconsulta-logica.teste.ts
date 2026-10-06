/**
 * Testes da lógica pura da teleconsulta (lib/teleconsulta-logica.ts).
 * Rodar: bun src/lib/teleconsulta-logica.teste.ts
 */
import {
  ATRASO_MAX_RECONEXAO_MS,
  ConjuntoLimitado,
  ESPERA_DESCONECTADO_MS,
  ESPERA_FORA_DA_JANELA_MS,
  POLL_PRESENCA_MS,
  POLL_RAPIDO_MS,
  QualidadeSuavizada,
  atrasoReconexao,
  chaveCandidato,
  classificarQualidade,
  ehCelular,
  esperaForaDaJanela,
  exibirForaDaJanela,
  intervaloPolling,
  lerForaDaJanela,
  mesmoForaDaJanela,
  limitesEnvio,
  medirAmostra,
  restricoesMidia,
  textoForaDaJanela,
} from "./teleconsulta-logica";

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

// ── Deduplicação de candidatos (Realtime + polling) ─────────────────────
const c1 = { candidate: "candidate:1 1 udp 2122260223 192.168.0.2 54321 typ host", sdpMid: "0", sdpMLineIndex: 0, usernameFragment: "abcd" };
const c1Copia = { ...c1 }; // mesmo candidato chegando pelo outro caminho
const c2 = { ...c1, sdpMid: "1", sdpMLineIndex: 1 };
igual("mesma chave para o mesmo candidato", chaveCandidato(c1), chaveCandidato(c1Copia));
igual("chave diferente para outra m-line", chaveCandidato(c1) === chaveCandidato(c2), false);
igual("candidato sem campos opcionais", chaveCandidato({ candidate: "x" }), "x|||");
const vistos = new ConjuntoLimitado(3);
igual("primeira vez é nova", vistos.adicionar(chaveCandidato(c1)), true);
igual("segunda vez (outro caminho) é repetida", vistos.adicionar(chaveCandidato(c1Copia)), false);
vistos.adicionar("b");
vistos.adicionar("c");
vistos.adicionar("d"); // passa do teto → descarta o mais antigo (c1)
igual("teto descarta o mais antigo", vistos.tem(chaveCandidato(c1)), false);
igual("teto mantém o tamanho", vistos.tamanho, 3);
igual("mais recente continua", vistos.tem("d"), true);

// ── Espera crescente da reconexão ───────────────────────────────────────
const semVariacao = () => 0.5; // variação zero
igual("1ª tentativa = 2,5 s", atrasoReconexao(0, semVariacao), ESPERA_DESCONECTADO_MS);
igual("2ª = 5 s", atrasoReconexao(1, semVariacao), 5_000);
igual("3ª = 10 s", atrasoReconexao(2, semVariacao), 10_000);
igual("4ª = 20 s", atrasoReconexao(3, semVariacao), 20_000);
igual("teto de 30 s", atrasoReconexao(10, semVariacao), ATRASO_MAX_RECONEXAO_MS);
igual("tentativa 50 continua no teto (ilimitado)", atrasoReconexao(50, semVariacao), ATRASO_MAX_RECONEXAO_MS);
igual("variação máxima +20%", atrasoReconexao(1, () => 1), 6_000);
igual("variação mínima −20%", atrasoReconexao(1, () => 0), 4_000);
igual("n negativo vira 0", atrasoReconexao(-3, semVariacao), ESPERA_DESCONECTADO_MS);

// ── Amostra de qualidade (getStats) ─────────────────────────────────────
const l0 = { t: 0, rttS: 0.05, recebidos: 1000, perdidos: 0, bytesRecebidos: 0 };
const l1 = { t: 2000, rttS: 0.08, recebidos: 1190, perdidos: 10, bytesRecebidos: 250_000 };
igual("amostra: rtt, perda 5%, 1000 kbps", medirAmostra(l0, l1), { rttMs: 80, perda: 0.05, kbps: 1000 });
igual("sem leitura anterior: só rtt", medirAmostra(null, l0), { rttMs: 50, perda: 0, kbps: 0 });
igual(
  "perda remota maior prevalece",
  medirAmostra(l0, { ...l1, perdidos: 0, recebidos: 1200, perdaRemota: 0.2 }).perda,
  0.2,
);
igual("contador que volta (PC nova) não dá negativo", medirAmostra(l1, { ...l0, t: 4000 }), { rttMs: 50, perda: 0, kbps: 0 });
igual("rtt ausente", medirAmostra(l0, { ...l1, rttS: null }).rttMs, null);

// ── Classificação ──────────────────────────────────────────────────────
igual("boa", classificarQualidade({ rttMs: 80, perda: 0.01, kbps: 900 }), "boa");
igual("fraca por rtt", classificarQualidade({ rttMs: 350, perda: 0, kbps: 900 }), "fraca");
igual("fraca por perda", classificarQualidade({ rttMs: 50, perda: 0.04, kbps: 900 }), "fraca");
igual("ruim por rtt", classificarQualidade({ rttMs: 900, perda: 0, kbps: 900 }), "ruim");
igual("ruim por perda", classificarQualidade({ rttMs: 50, perda: 0.15, kbps: 900 }), "ruim");
igual("bitrate baixo sozinho não piora (câmera desligada)", classificarQualidade({ rttMs: 50, perda: 0, kbps: 20 }), "boa");
igual("rtt desconhecido + sem perda = boa", classificarQualidade({ rttMs: null, perda: 0, kbps: 0 }), "boa");

// ── Suavização ─────────────────────────────────────────────────────────
const q = new QualidadeSuavizada();
igual("1 amostra ruim não muda", q.registrar("ruim"), "boa");
igual("2 seguidas pioram", q.registrar("ruim"), "ruim");
igual("1 boa não melhora", q.registrar("boa"), "ruim");
igual("2 boas não melhoram", q.registrar("boa"), "ruim");
igual("3 boas melhoram", q.registrar("boa"), "boa");
q.registrar("fraca");
igual("amostra alternada zera a sequência", q.registrar("ruim"), "boa");
q.zerar();
igual("zerar volta para boa", q.valor, "boa");

// ── Mídia ──────────────────────────────────────────────────────────────
igual("Android é celular", ehCelular("Mozilla/5.0 (Linux; Android 14) Mobile Safari"), true);
igual("iPhone é celular", ehCelular("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), true);
igual("iPadOS (Mac com toque) é celular", ehCelular("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5), true);
igual("Mac de mesa não é celular", ehCelular("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0), false);
igual("Windows não é celular", ehCelular("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), false);
const rc = restricoesMidia(false) as { video: MediaTrackConstraints; audio: MediaTrackConstraints };
igual("computador 1280x720", [rc.video.width, rc.video.height], [{ ideal: 1280 }, { ideal: 720 }]);
igual("até 30 fps e câmera frontal", [rc.video.frameRate, rc.video.facingMode], [{ ideal: 30, max: 30 }, "user"]);
igual("áudio tratado", rc.audio, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
const rm = restricoesMidia(true) as { video: MediaTrackConstraints };
igual("celular 960x540", [rm.video.width, rm.video.height], [{ ideal: 960 }, { ideal: 540 }]);
igual("teto de vídeo computador 1,2 Mbps", limitesEnvio(false).videoMaxBitrate, 1_200_000);
igual("teto de vídeo celular 600 kbps", limitesEnvio(true).videoMaxBitrate, 600_000);

// ── Polling ────────────────────────────────────────────────────────────
igual("handshake sem Realtime = 700 ms", intervaloPolling({ conectado: false, realtimeConfirmado: false, outroNaSala: true }), POLL_RAPIDO_MS);
igual("conectado com Realtime = 10 s", intervaloPolling({ conectado: true, realtimeConfirmado: true, outroNaSala: true }), POLL_PRESENCA_MS);
igual("conectado sem Realtime = 3 s", intervaloPolling({ conectado: true, realtimeConfirmado: false, outroNaSala: true }), 3_000);
igual("handshake com Realtime = 2 s", intervaloPolling({ conectado: false, realtimeConfirmado: true, outroNaSala: true }), 2_000);
igual("sozinho sem Realtime = 1,5 s", intervaloPolling({ conectado: false, realtimeConfirmado: false, outroNaSala: false }), 1_500);
igual("sozinho com Realtime = 3 s", intervaloPolling({ conectado: false, realtimeConfirmado: true, outroNaSala: false }), 3_000);

// ── Fora da janela (409 do GET /sala) ──────────────────────────────────
const ABRE = "2026-10-06T16:30:00.000Z"; // 13:30 em São Paulo
const FECHOU = "2026-10-06T19:00:00.000Z"; // 16:00 em São Paulo
const AGORA = Date.parse("2026-10-06T15:00:00.000Z"); // 12:00 SP, mesmo dia
igual("409 antes com abreEm", lerForaDaJanela({ erro: "x", motivo: "antes", abreEm: ABRE }), { motivo: "antes", abreEm: ABRE });
igual("409 depois com fechouEm", lerForaDaJanela({ erro: "x", motivo: "depois", fechouEm: FECHOU }), { motivo: "depois", fechouEm: FECHOU });
igual("só abreEm (sem motivo) = antes", lerForaDaJanela({ abreEm: ABRE }), { motivo: "antes", abreEm: ABRE });
igual("só fechouEm (sem motivo) = depois", lerForaDaJanela({ fechouEm: FECHOU }), { motivo: "depois", fechouEm: FECHOU });
igual("servidor antigo: 'ainda não abriu' = antes", lerForaDaJanela({ erro: "A sala ainda não abriu: ela abre 30 min antes do horário." }), { motivo: "antes" });
igual("servidor antigo: 'já fechou' = depois", lerForaDaJanela({ erro: "A sala já fechou: ela fica aberta até 2 h depois do horário." }), { motivo: "depois" });
igual("corpo inválido = depois", lerForaDaJanela(null), { motivo: "depois" });
igual("data inválida é descartada", lerForaDaJanela({ motivo: "antes", abreEm: "amanhã" }), { motivo: "antes" });
igual("mesmo conteúdo", mesmoForaDaJanela({ motivo: "antes", abreEm: ABRE }, { motivo: "antes", abreEm: ABRE }), true);
igual("conteúdo diferente", mesmoForaDaJanela({ motivo: "antes", abreEm: ABRE }, { motivo: "depois" }), false);
igual("null × null", mesmoForaDaJanela(null, null), true);
igual("null × preenchido", mesmoForaDaJanela(null, { motivo: "depois" }), false);

igual("espera longe da abertura = 30 s", esperaForaDaJanela({ motivo: "antes", abreEm: ABRE }, AGORA), ESPERA_FORA_DA_JANELA_MS);
igual("abre em 10 s = tenta 11 s depois", esperaForaDaJanela({ motivo: "antes", abreEm: ABRE }, Date.parse(ABRE) - 10_000), 11_000);
igual("já passou da abertura = 1 s", esperaForaDaJanela({ motivo: "antes", abreEm: ABRE }, Date.parse(ABRE) + 60_000), 1_000);
igual("antes sem horário = 30 s", esperaForaDaJanela({ motivo: "antes" }, AGORA), 30_000);
igual("depois = 30 s", esperaForaDaJanela({ motivo: "depois", fechouEm: FECHOU }, AGORA), 30_000);

igual("abre hoje: HH:MM de São Paulo", textoForaDaJanela({ motivo: "antes", abreEm: ABRE }, AGORA).titulo, "A sala abre às 13:30");
igual(
  "abre em outro dia: com a data",
  textoForaDaJanela({ motivo: "antes", abreEm: "2026-10-08T12:00:00.000Z" }, AGORA).titulo,
  "A sala abre em 08/10 às 09:00",
);
// 01:30 UTC do dia 07 = 22:30 do dia 06 em São Paulo: ainda é "hoje" para quem está no Brasil.
igual(
  "dia pelo fuso de São Paulo, não UTC",
  textoForaDaJanela({ motivo: "antes", abreEm: "2026-10-07T01:30:00.000Z" }, AGORA).titulo,
  "A sala abre às 22:30",
);
igual("antes sem horário", textoForaDaJanela({ motivo: "antes" }, AGORA).titulo, "A sala ainda não abriu");
igual("já fechou", textoForaDaJanela({ motivo: "depois", fechouEm: FECHOU }, AGORA).titulo, "A sala já fechou");
igual("detalhe do antes cita 30 minutos", /30 minutos antes/.test(textoForaDaJanela({ motivo: "antes" }, AGORA).detalhe), true);
igual("detalhe do depois cita 2 horas", /2 horas depois/.test(textoForaDaJanela({ motivo: "depois" }, AGORA).detalhe), true);

igual("exibe na espera (conectando)", exibirForaDaJanela({ motivo: "antes" }, "conectando"), true);
igual("exibe na espera (aguardando)", exibirForaDaJanela({ motivo: "depois" }, "aguardando"), true);
igual("não exibe com a chamada conectada", exibirForaDaJanela({ motivo: "depois" }, "conectado"), false);
igual("não exibe reconectando", exibirForaDaJanela({ motivo: "depois" }, "instavel"), false);
igual("não exibe negociando", exibirForaDaJanela({ motivo: "depois" }, "conectando-p2p"), false);
igual("não exibe encerrada", exibirForaDaJanela({ motivo: "depois" }, "encerrada"), false);
igual("não exibe sem 409", exibirForaDaJanela(null, "aguardando"), false);

console.log(`teleconsulta-logica: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
