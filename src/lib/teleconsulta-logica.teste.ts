/**
 * Testes da lógica pura da teleconsulta (lib/teleconsulta-logica.ts).
 * Rodar: bun src/lib/teleconsulta-logica.teste.ts
 */
import {
  ATRASO_MAX_RECONEXAO_MS,
  ConjuntoLimitado,
  ESPERA_DESCONECTADO_MS,
  POLL_PRESENCA_MS,
  POLL_RAPIDO_MS,
  QualidadeSuavizada,
  atrasoReconexao,
  chaveCandidato,
  classificarQualidade,
  ehCelular,
  intervaloPolling,
  limitesEnvio,
  medirAmostra,
  restricoesMidia,
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

console.log(`teleconsulta-logica: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
