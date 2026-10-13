/**
 * Testes da escolha de ICE servers (lib/server/ice.ts), com fetch simulado.
 * Rodar: bun --conditions=react-server src/lib/server/ice.teste.ts
 */
import { cloudflareConfigurada, filtrarPorta53, gerarIceServers, iceServersEstaticos, TTL_CLOUDFLARE_S } from "./ice";

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

const ENV_CF = { CLOUDFLARE_TURN_KEY_ID: "chave123", CLOUDFLARE_TURN_KEY_API_TOKEN: "tok-secreto" };
const RESPOSTA_CF = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
    {
      urls: [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:53?transport=udp",
        "turn:turn.cloudflare.com:3478?transport=tcp",
        "turn:turn.cloudflare.com:80?transport=tcp",
        "turns:turn.cloudflare.com:5349?transport=tcp",
        "turns:turn.cloudflare.com:443?transport=tcp",
      ],
      username: "usr",
      credential: "cred",
    },
  ],
};

type Chamada = { url: string; init: RequestInit };
function fetchFalso(resposta: () => Response, chamadas: Chamada[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    return resposta();
  }) as typeof fetch;
}

const silenciar = console.error;

async function main() {
  // ── filtro da porta 53 ─────────────────────────────────────────────────
  igual(
    "porta 53 sai, 5349 e 3478 ficam",
    filtrarPorta53([{ urls: ["turn:x:53?transport=udp", "turns:x:5349?transport=tcp", "stun:x:53", "stun:x:3478"] }]),
    [{ urls: ["turns:x:5349?transport=tcp", "stun:x:3478"] }],
  );
  igual("servidor que fica sem URL some", filtrarPorta53([{ urls: ["stun:x:53"] }]), []);

  // ── configuração ───────────────────────────────────────────────────────
  igual("cloudflare configurada", cloudflareConfigurada(ENV_CF), true);
  igual("faltando o token", cloudflareConfigurada({ CLOUDFLARE_TURN_KEY_ID: "x" }), false);
  igual("variáveis em branco", cloudflareConfigurada({ CLOUDFLARE_TURN_KEY_ID: " ", CLOUDFLARE_TURN_KEY_API_TOKEN: " " }), false);

  // ── estático: sem nada = só STUN (sem OpenRelay) ───────────────────────
  const soStun = iceServersEstaticos({});
  igual("sem variáveis: fonte stun", soStun.fonte, "stun");
  igual("sem variáveis: nenhum TURN", soStun.iceServers.some((s) => s.urls.some((u) => u.startsWith("turn"))), false);
  igual("sem OpenRelay", JSON.stringify(soStun).includes("openrelay"), false);
  igual("STUN do Google e da Cloudflare", soStun.iceServers[0].urls.some((u) => u.includes("cloudflare")) && soStun.iceServers[0].urls.some((u) => u.includes("google")), true);

  const proprio = iceServersEstaticos({ BION_TURN_URLS: "turn:a:3478, turns:a:443", BION_TURN_USERNAME: "u", BION_TURN_CREDENTIAL: "p" });
  igual("TURN próprio: fonte", proprio.fonte, "turn_proprio");
  igual("TURN próprio: entrada", proprio.iceServers[1], { urls: ["turn:a:3478", "turns:a:443"], username: "u", credential: "p" });

  // ── Cloudflare OK ──────────────────────────────────────────────────────
  const chamadas: Chamada[] = [];
  const r = await gerarIceServers(
    ENV_CF,
    fetchFalso(() => new Response(JSON.stringify(RESPOSTA_CF), { status: 201 }), chamadas),
    () => 1_000_000,
  );
  igual("uma chamada à Cloudflare", chamadas.length, 1);
  igual(
    "URL da Cloudflare com o key id",
    chamadas[0].url,
    "https://rtc.live.cloudflare.com/v1/turn/keys/chave123/credentials/generate-ice-servers",
  );
  igual("POST", chamadas[0].init.method, "POST");
  igual("Bearer com o token", (chamadas[0].init.headers as Record<string, string>).Authorization, "Bearer tok-secreto");
  igual("corpo com ttl 14400", chamadas[0].init.body, JSON.stringify({ ttl: 14_400 }));
  igual("fonte cloudflare", r.fonte, "cloudflare");
  igual("expira em agora + ttl", r.expiraEm, 1_000_000 + TTL_CLOUDFLARE_S * 1000);
  igual("nenhuma URL da porta 53", r.iceServers.some((s) => s.urls.some((u) => /:53(\?|$)/.test(u))), false);
  igual("TURN com credencial mantido", r.iceServers[1], {
    urls: [
      "turn:turn.cloudflare.com:3478?transport=udp",
      "turn:turn.cloudflare.com:3478?transport=tcp",
      "turn:turn.cloudflare.com:80?transport=tcp",
      "turns:turn.cloudflare.com:5349?transport=tcp",
      "turns:turn.cloudflare.com:443?transport=tcp",
    ],
    username: "usr",
    credential: "cred",
  });
  igual("token não vaza na resposta", JSON.stringify(r).includes("tok-secreto"), false);

  // ── Cloudflare falha → estático ────────────────────────────────────────
  console.error = () => {};
  const r401 = await gerarIceServers(
    { ...ENV_CF, BION_TURN_URLS: "turn:reserva:3478", BION_TURN_USERNAME: "u", BION_TURN_CREDENTIAL: "p" },
    fetchFalso(() => new Response("unauthorized", { status: 401 }), []),
  );
  igual("401 cai no TURN próprio", r401.fonte, "turn_proprio");
  const rRede = await gerarIceServers(
    ENV_CF,
    (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch,
  );
  igual("erro de rede cai no STUN", rRede.fonte, "stun");
  const rSemTurn = await gerarIceServers(
    ENV_CF,
    fetchFalso(() => new Response(JSON.stringify({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] }), { status: 201 }), []),
  );
  igual("resposta sem TURN cai no estático", rSemTurn.fonte, "stun");
  const rLixo = await gerarIceServers(ENV_CF, fetchFalso(() => new Response("{nao é json", { status: 201 }), []));
  igual("JSON inválido cai no estático", rLixo.fonte, "stun");
  console.error = silenciar;

  // ── Sem Cloudflare: não chama a rede ───────────────────────────────────
  const semCf: Chamada[] = [];
  const rSem = await gerarIceServers({}, fetchFalso(() => new Response("{}"), semCf));
  igual("sem variáveis: não chama a Cloudflare", semCf.length, 0);
  igual("sem variáveis: só STUN", rSem.fonte, "stun");

  console.log(`ice: ${ok} ok, ${falhas} falha(s)`);
  if (falhas > 0) process.exit(1);
}

void main();
