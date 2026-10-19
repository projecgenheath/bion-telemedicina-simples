/**
 * Testes do trocarCamera() da ChamadaTeleconsulta (botão "Virar"), com
 * câmera, stream e RTCPeerConnection falsos. Não abre rede: a sala não é
 * iniciada (iniciar() não é chamado).
 * Rodar: bun src/lib/teleconsulta-troca-camera.teste.ts
 */
import { ChamadaTeleconsulta, ESTADO_INICIAL, type EstadoChamada } from "./teleconsulta-chamada";

// Logs da classe ([teleconsulta] …) ficam fora da saída do teste.
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

// ── Falsos mínimos ───────────────────────────────────────────────────────
let seq = 0;
class TrackFalsa {
  id = `t${++seq}`;
  readyState: "live" | "ended" = "live";
  enabled = true;
  contentHint = "";
  constructor(
    public kind: "audio" | "video",
    public deviceId = "",
    public facingMode = "",
  ) {}
  stop() {
    this.readyState = "ended";
  }
  getSettings() {
    return { deviceId: this.deviceId, facingMode: this.facingMode };
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
  addTrack(t: TrackFalsa) {
    this.tracks.push(t);
  }
  removeTrack(t: TrackFalsa) {
    this.tracks = this.tracks.filter((x) => x !== t);
  }
}

type Pedido = MediaStreamConstraints;
function montar({ celular, cameras, falharCom }: { celular: boolean; cameras: string[]; falharCom?: (p: Pedido) => boolean }) {
  const pedidos: Pedido[] = [];
  const md = {
    async getUserMedia(c: Pedido) {
      pedidos.push(c);
      if (falharCom?.(c)) throw Object.assign(new Error("NotReadableError"), { name: "NotReadableError" });
      const v = c.video as MediaTrackConstraints;
      const id = (v.deviceId as { exact?: string } | undefined)?.exact ?? "";
      return new StreamFalso([new TrackFalsa("video", id, String(v.facingMode ?? ""))]);
    },
    async enumerateDevices() {
      return cameras.map((deviceId) => ({ kind: "videoinput", deviceId }));
    },
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent: celular ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile" : "Mozilla/5.0 (X11; Linux x86_64)",
      maxTouchPoints: celular ? 5 : 0,
      mediaDevices: md,
    },
  });
  const camInicial = new TrackFalsa("video", cameras[0] ?? "", "user");
  const mic = new TrackFalsa("audio");
  const local = { current: new StreamFalso([mic, camInicial]) as unknown as MediaStream };
  const remoto = { current: null as MediaStream | null };
  let estado: EstadoChamada = { ...ESTADO_INICIAL };
  const chamada = new ChamadaTeleconsulta("c1", local, remoto, (e) => (estado = e));
  // Sender de vídeo falso no lugar do RTCPeerConnection (só o que recapturar usa).
  const trocas: TrackFalsa[] = [];
  const sender = { replaceTrack: async (t: TrackFalsa) => void trocas.push(t) };
  (chamada as unknown as { pc: unknown }).pc = {
    getTransceivers: () => [{ receiver: { track: { kind: "video" } }, sender }],
  };
  return { chamada, local, pedidos, trocas, camInicial, mic, estado: () => estado };
}
const videoDe = (s: MediaStream) => s.getVideoTracks() as unknown as TrackFalsa[];

// ── Celular: frontal → traseira → frontal ───────────────────────────────
{
  const t = montar({ celular: true, cameras: ["f", "t1", "t2"] });
  const trocou = await t.chamada.trocarCamera();
  igual("celular: trocou", trocou, true);
  igual("celular: pediu a traseira", (t.pedidos[0].video as MediaTrackConstraints).facingMode, "environment");
  igual("celular: só vídeo na recaptura", t.pedidos[0].audio, false);
  igual("celular: câmera anterior parada", t.camInicial.readyState, "ended");
  igual("celular: stream com 1 vídeo novo ao vivo", videoDe(t.local.current).map((v) => [v.facingMode, v.readyState]), [["environment", "live"]]);
  igual("celular: microfone intacto", t.local.current.getAudioTracks().length, 1);
  igual("celular: replaceTrack no sender de vídeo", t.trocas.length, 1);
  igual("celular: estado cameraTraseira", t.estado().cameraTraseira, true);
  await t.chamada.trocarCamera();
  igual("celular: volta para a frontal", (t.pedidos[1].video as MediaTrackConstraints).facingMode, "user");
  igual("celular: estado frontal", t.estado().cameraTraseira, false);
}

// ── Câmera desligada: troca mantém desligada ────────────────────────────
{
  const t = montar({ celular: true, cameras: ["f", "t"] });
  t.chamada.toggleCam();
  await t.chamada.trocarCamera();
  igual("cam desligada: track nova continua desligada", videoDe(t.local.current)[0]?.enabled, false);
}

// ── Computador: percorre as câmeras por deviceId ────────────────────────
{
  const t = montar({ celular: false, cameras: ["a", "b"] });
  await t.chamada.trocarCamera();
  igual("computador: pediu a câmera b", (t.pedidos[0].video as MediaTrackConstraints).deviceId, { exact: "b" });
  igual("computador: continua espelhada (não é traseira)", t.estado().cameraTraseira, false);
  await t.chamada.trocarCamera();
  igual("computador: volta para a a", (t.pedidos[1].video as MediaTrackConstraints).deviceId, { exact: "a" });
}

// ── A outra câmera não abre: volta para a anterior ──────────────────────
{
  const t = montar({
    celular: true,
    cameras: ["f", "t"],
    falharCom: (p) => (p.video as MediaTrackConstraints).facingMode === "environment",
  });
  const trocou = await t.chamada.trocarCamera();
  igual("falha: devolve false", trocou, false);
  igual("falha: tentou a traseira e depois a frontal", t.pedidos.map((p) => (p.video as MediaTrackConstraints).facingMode), ["environment", "user"]);
  igual("falha: segue com a frontal ao vivo", videoDe(t.local.current).map((v) => [v.facingMode, v.readyState]), [["user", "live"]]);
  igual("falha: estado frontal", t.estado().cameraTraseira, false);
}

// ── Sem vídeo, chamada encerrada ou dois toques seguidos ────────────────
{
  const t = montar({ celular: true, cameras: ["f", "t"] });
  t.local.current.removeTrack(t.camInicial as unknown as MediaStreamTrack);
  igual("só áudio: não troca", await t.chamada.trocarCamera(), false);
  igual("só áudio: não pede câmera", t.pedidos.length, 0);
}
{
  const t = montar({ celular: true, cameras: ["f", "t"] });
  (t.chamada as unknown as { encerrada: boolean }).encerrada = true;
  igual("encerrada: não troca", await t.chamada.trocarCamera(), false);
}
{
  const t = montar({ celular: true, cameras: ["f", "t"] });
  const [a, b] = await Promise.all([t.chamada.trocarCamera(), t.chamada.trocarCamera()]);
  igual("toque duplo: só a primeira troca", [a, b], [true, false]);
  igual("toque duplo: um getUserMedia", t.pedidos.length, 1);
}

console.log(`teleconsulta-troca-camera: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
