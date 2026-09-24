/**
 * Configuração ICE da sala de teleconsulta — montada NO SERVIDOR (item 9).
 *
 * Por que no servidor:
 *  - Credenciais de TURN nunca vão no bundle do cliente (repo público, LGPD).
 *  - A lista só chega a quem tem sessão de PACIENTE ou MÉDICO da consulta
 *    (GET /api/telemedicina/[consultaId]/sala já autoriza antes de responder).
 *
 * Composição (ordem de prioridade):
 *  1. STUN público (Google) — sempre incluído; resolve a maioria dos NATs de
 *     residência, sem credencial.
 *  2. TURN da própria infraestrutura — BION_TURN_URLS (separadas por vírgula),
 *     BION_TURN_USERNAME e BION_TURN_CREDENTIAL. Compatível com Cloudflare
 *     Calls TURN, Metered, Twilio NTS, Xirsys ou coturn próprio.
 *  3. Sem TURN configurado, entra o OpenRelay (comunidade, gratuito) como
 *     RESERVA — o navegador só o aciona quando o caminho direto/STUN falha
 *     (NAT simétrico, firewall corporativo, CGNAT). Transforma a falha dura de
 *     conexão em chamada estabelecida, sem nenhuma configuração.
 */

export type IceServerConfig = { urls: string[]; username?: string; credential?: string };

const STUN_PUBLICO: IceServerConfig = {
  urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
};

const OPENRELAY_RESERVA: IceServerConfig = {
  urls: [
    "turn:openrelay.metered.ca:80",
    "turn:openrelay.metered.ca:443",
    "turn:openrelay.metered.ca:443?transport=tcp",
  ],
  username: "openrelayproject",
  credential: "openrelayproject",
};

let cache: IceServerConfig[] | null = null;

/** Resolvedor estático: env não muda durante o runtime — resolve uma vez. */
export function resolverIceServers(): IceServerConfig[] {
  if (cache) return cache;

  const urls = (process.env.BION_TURN_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const username = process.env.BION_TURN_USERNAME?.trim();
  const credential = process.env.BION_TURN_CREDENTIAL?.trim();

  const lista: IceServerConfig[] = [{ ...STUN_PUBLICO }];

  if (urls.length > 0) {
    // Operador configurou o próprio TURN — respeita mesmo sem credencial
    // (alguns provedores embutem autenticação temporária nas próprias URLs).
    lista.push({
      urls,
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {}),
    });
  } else {
    lista.push({ ...OPENRELAY_RESERVA });
  }

  cache = lista;
  return lista;
}
