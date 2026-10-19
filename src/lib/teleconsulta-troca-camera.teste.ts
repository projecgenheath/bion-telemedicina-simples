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
function montar({
  celular,
  cameras,
  falharCom,
  segurar,
}: {
  celular: boolean;
  cameras: string[];
  falharCom?: (p: Pedido) => boolean;
  /** Segura o getUserMedia até a promessa resolver (simula a câmera demorando). */
  segurar?: Promise<void>;
}) {
  const pedidos: Pedido[] = [];
  const entregues: TrackFalsa[] = [];
  const md = {
    async getUserMedia(c: Pedido) {
      pedidos.push(c);
      if (segurar) await segurar;
      if (falharCom?.(c)) throw Object.assign(new Error("NotReadableError"), { name: "NotReadableError" });
      const v = c.video as MediaTrackConstraints;
      const id = (v.deviceId as { exact?: string } | undefined)?.exact ?? "";
      const nova = new TrackFalsa("video", id, String(v.facingMode ?? ""));
      entregues.push(nova);
      return new StreamFalso([nova]);
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
  return { chamada, local, pedidos, entregues, trocas, camInicial, mic, estado: () => estado };
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

// ── Fim/404 durante a troca: a câmera nova é solta (pararTracks) e não entra ──
for (const [nome, parar] of [
  ["404", (c: ChamadaTeleconsulta) => (c as unknown as { pararPorNaoEncontrada(): void }).pararPorNaoEncontrada()],
  ["sair", (c: ChamadaTeleconsulta) => c.sair()],
] as const) {
  let soltar = () => {};
  const segurar = new Promise<void>((r) => (soltar = r));
  const t = montar({ celular: true, cameras: ["f", "t"], segurar });
  const local = t.local.current;
  const troca = t.chamada.trocarCamera();
  await Promise.resolve();
  await Promise.resolve();
  parar(t.chamada);
  igual(`${nome} na troca: microfone parado pelo pararTracks`, t.mic.readyState, "ended");
  soltar();
  igual(`${nome} na troca: não trocou`, await troca, false);
  igual(`${nome} na troca: câmera nova parada (luz apaga)`, t.entregues.map((v) => v.readyState), ["ended"]);
  igual(`${nome} na troca: câmera nova fora do stream`, videoDe(local).filter((v) => v.readyState === "live").length, 0);
  igual(`${nome} na troca: sem replaceTrack`, t.trocas.length, 0);
}

// ── Fim da chamada depois da troca: a câmera trocada também para ────────
{
  const t = montar({ celular: true, cameras: ["f", "t"] });
  await t.chamada.trocarCamera();
  t.chamada.sair();
  igual("sair depois da troca: traseira parada", t.entregues.map((v) => v.readyState), ["ended"]);
}

// ── Virar + visibilitychange ao mesmo tempo: nenhuma câmera órfã ────────
const recapturar = (c: ChamadaTeleconsulta, tipo: "audio" | "video", motivo: string) =>
  (c as unknown as { recapturar(t: string, m: string): Promise<void> }).recapturar(tipo, motivo);
/** O que o aoVisibilidade faz com a mídia ao voltar para a aba. */
const voltarParaAba = (c: ChamadaTeleconsulta) => Promise.all([recapturar(c, "video", "visibilitychange"), recapturar(c, "audio", "visibilitychange")]);
/** Câmeras abertas ao vivo que não são a enviada ao médico (a última do replaceTrack). */
const orfas = (entregues: TrackFalsa[], trocas: TrackFalsa[]) =>
  entregues.filter((v) => v.readyState === "live" && v !== trocas[trocas.length - 1]).length;
{
  // Virar pediu a traseira (getUserMedia demorando) e a aba volta no meio.
  let soltar = () => {};
  const segurar = new Promise<void>((r) => (soltar = r));
  const t = montar({ celular: true, cameras: ["f", "t"], segurar });
  const troca = t.chamada.trocarCamera();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  const volta = voltarParaAba(t.chamada);
  const volta2 = voltarParaAba(t.chamada);
  soltar();
  igual("virar+visível: trocou", await troca, true);
  await Promise.all([volta, volta2]);
  igual("virar+visível: um único getUserMedia", t.pedidos.length, 1);
  igual("virar+visível: nenhuma track órfã ao vivo", orfas(t.entregues, t.trocas), 0);
  igual("virar+visível: 1 vídeo ao vivo, a traseira", videoDe(t.local.current).filter((v) => v.readyState === "live").map((v) => v.facingMode), ["environment"]);
  igual("virar+visível: microfone intacto", t.mic.readyState, "live");
  igual("virar+visível: um replaceTrack", t.trocas.length, 1);
}
{
  // A aba volta (câmera caiu em segundo plano) e o paciente toca Virar antes de a recaptura terminar.
  let soltar = () => {};
  const segurar = new Promise<void>((r) => (soltar = r));
  const t = montar({ celular: true, cameras: ["f", "t"], segurar });
  t.camInicial.readyState = "ended";
  const volta = voltarParaAba(t.chamada);
  await Promise.resolve();
  const troca = t.chamada.trocarCamera();
  igual("visível+virar: Virar espera a recaptura (sem 2º pedido)", t.pedidos.length, 1);
  soltar();
  await volta;
  igual("visível+virar: trocou", await troca, true);
  igual("visível+virar: frontal e depois traseira, em sequência", t.pedidos.map((p) => (p.video as MediaTrackConstraints).facingMode), ["user", "environment"]);
  igual("visível+virar: nenhuma track órfã ao vivo", orfas(t.entregues, t.trocas), 0);
  igual("visível+virar: só a traseira ao vivo", t.entregues.map((v) => [v.facingMode, v.readyState]), [["user", "ended"], ["environment", "live"]]);
  igual("visível+virar: estado traseira", t.estado().cameraTraseira, true);
}
{
  // Segurança: outra captura já pôs uma câmera ao vivo no stream enquanto a recaptura esperava.
  let soltar = () => {};
  const segurar = new Promise<void>((r) => (soltar = r));
  const t = montar({ celular: true, cameras: ["f", "t"], segurar });
  t.camInicial.readyState = "ended";
  const rec = recapturar(t.chamada, "video", "ended");
  await Promise.resolve();
  const jaViva = new TrackFalsa("video", "f", "user");
  t.local.current.addTrack(jaViva as unknown as MediaStreamTrack);
  soltar();
  await rec;
  igual("já ao vivo: recapturada parada", t.entregues.map((v) => v.readyState), ["ended"]);
  igual("já ao vivo: segue a que já estava", videoDe(t.local.current).filter((v) => v.readyState === "live"), [jaViva]);
  igual("já ao vivo: sem replaceTrack", t.trocas.length, 0);
}
{
  // A trava solta no fim: uma queda posterior recaptura de novo.
  const t = montar({ celular: true, cameras: ["f", "t"] });
  t.camInicial.readyState = "ended";
  await recapturar(t.chamada, "video", "ended");
  videoDe(t.local.current)[0].readyState = "ended";
  await recapturar(t.chamada, "video", "ended");
  igual("trava solta: duas quedas, dois pedidos", t.pedidos.length, 2);
  igual("trava solta: 1 vídeo ao vivo", videoDe(t.local.current).filter((v) => v.readyState === "live").length, 1);
}

console.log(`teleconsulta-troca-camera: ${ok} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
