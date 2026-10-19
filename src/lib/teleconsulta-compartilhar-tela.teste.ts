/**
 * Testes do compartilharTela() da ChamadaTeleconsulta com getDisplayMedia,
 * stream e RTCPeerConnection falsos. Não abre rede (iniciar() não é chamado).
 * Caso principal: a chamada acaba enquanto o seletor de tela está aberto.
 * Rodar: bun src/lib/teleconsulta-compartilhar-tela.teste.ts
 */
import { ChamadaTeleconsulta, ESTADO_INICIAL, type EstadoChamada } from "./teleconsulta-chamada";

console.info = console.warn = console.error = () => {};

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

let seq = 0;
class TrackFalsa {
  id = `t${++seq}`;
  readyState: "live" | "ended" = "live";
  enabled = true;
  contentHint = "";
  constructor(public kind: "audio" | "video") {}
  stop() {
    this.readyState = "ended";
  }
  addEventListener() {}
}
class StreamFalso {
  constructor(private tracks: TrackFalsa[]) {}
  getTracks() {
    return [...this.tracks];
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }
}

function montar(segurar?: Promise<void>) {
  const telas: TrackFalsa[] = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      maxTouchPoints: 0,
      mediaDevices: {
        async getDisplayMedia() {
          if (segurar) await segurar;
          // Tela com vídeo e áudio da aba: todas as tracks precisam parar.
          const v = new TrackFalsa("video");
          const a = new TrackFalsa("audio");
          telas.push(v, a);
          return new StreamFalso([v, a]);
        },
      },
    },
  });
  const local = { current: new StreamFalso([new TrackFalsa("audio"), new TrackFalsa("video")]) as unknown as MediaStream };
  let estado: EstadoChamada = { ...ESTADO_INICIAL };
  const chamada = new ChamadaTeleconsulta("c1", local, { current: null }, (e) => (estado = e));
  const trocas: unknown[] = [];
  const sender = { replaceTrack: async (t: unknown) => void trocas.push(t), getParameters: () => ({ encodings: [] }), setParameters: async () => {} };
  (chamada as unknown as { pc: unknown }).pc = {
    getTransceivers: () => [{ receiver: { track: { kind: "video" } }, sender }],
    getSenders: () => [sender],
    close() {},
  };
  return { chamada, telas, trocas, estado: () => estado, display: () => (chamada as unknown as { displayStream: unknown }).displayStream };
}

// ── Controle: sala de pé, a tela entra no sender ────────────────────────
{
  const t = montar();
  await t.chamada.compartilharTela();
  igual("normal: replaceTrack com a tela", t.trocas.length, 1);
  igual("normal: compartilhando", t.estado().compartilhando, true);
  igual("normal: tracks da tela ao vivo", t.telas.map((x) => x.readyState), ["live", "live"]);
}

// ── A chamada acaba com o seletor aberto: tela solta, sem replaceTrack ──
const fins: [string, (c: ChamadaTeleconsulta) => void][] = [
  ["paciente saiu", (c) => c.sair()],
  ["médico encerrou", (c) => c.encerrar()],
  ["404", (c) => (c as unknown as { pararPorNaoEncontrada(): void }).pararPorNaoEncontrada()],
  ["desmontou", (c) => ((c as unknown as { vivo: boolean }).vivo = false)],
];
for (const [nome, acabar] of fins) {
  let soltar = () => {};
  const t = montar(new Promise<void>((r) => (soltar = r)));
  const pedido = t.chamada.compartilharTela();
  await Promise.resolve();
  acabar(t.chamada);
  const trocasAntes = t.trocas.length;
  soltar();
  let erro = "";
  await pedido.catch((e: Error) => (erro = e.name));
  igual(`${nome} no seletor: rejeita (quem chamou não audita como iniciado)`, erro, "AbortError");
  igual(`${nome} no seletor: todas as tracks da tela paradas`, t.telas.map((x) => x.readyState), ["ended", "ended"]);
  igual(`${nome} no seletor: sem replaceTrack`, t.trocas.length - trocasAntes, 0);
  igual(`${nome} no seletor: não ficou compartilhando`, t.estado().compartilhando, false);
  igual(`${nome} no seletor: sem displayStream guardado`, t.display(), null);
}

console.log(`teleconsulta-compartilhar-tela: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
