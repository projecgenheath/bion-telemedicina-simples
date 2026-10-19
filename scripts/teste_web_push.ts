/**
 * Teste do Web Push sem dependência (src/lib/server/web-push.ts):
 *  - criptografia aes128gcm contra os vetores do RFC 8291 (apêndice A),
 *    valor intermediário por valor intermediário, e ida e volta (decifrar
 *    com a chave do aparelho);
 *  - JWT VAPID ES256 verificável com a chave pública;
 *  - envs: sem chaves → push desligado (null), sem chamar a rede;
 *  - cabeçalhos da requisição (TTL, Urgency, Content-Encoding, vapid t=,k=);
 *  - validação da inscrição (https, host de push, tamanho, chaves).
 * Não usa banco nem rede.
 *   bun --conditions react-server scripts/teste_web_push.ts
 */
import crypto from "node:crypto";
import {
  b64url,
  cifrarAes128gcm,
  configVapid,
  deB64url,
  enviarPush,
  jwtVapid,
  MAX_ENDPOINT,
  montarRequisicaoPush,
  validarEndpoint,
  validarInscricao,
} from "@/lib/server/web-push";

let okN = 0;
let falhaN = 0;
function verifica(cond: unknown, nome: string, extra?: unknown) {
  if (cond) { okN++; console.log("ok    " + nome); } else { falhaN++; console.log("FALHA " + nome, extra ?? ""); }
}
const igualB64 = (b: Buffer, esperado: string, nome: string) => verifica(b64url(b) === esperado.replace(/\s+/g, ""), nome, b64url(b));

/* ---------------- RFC 8291, apêndice A ---------------- */
const V = {
  texto: "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  ecdhSecret: "kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs",
  prkKey: "Snr3JMxaHVDXHWJn5wdC52WjpCtd2EIEGBykDcZW32k",
  keyInfo: `V2ViUHVzaDogaW5mbwAEJXGyvs3942BVGq8e0PTNNmwRzr5VX4m8t7GGpTM5FzFo7OLr4BhZe9MEebhuPI-OztV3
            ylkYfpJGmQ22ggCLDgT-M_SrDepxkU21WCP3O1SUj0EwbZIHMtu5pZpTKGSCIA5Zent7wmC6HCJ5mFgJkuk5cwAvMBKiiujwa7t45ewP`,
  ikm: "S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg",
  prk: "09_eUZGrsvxChDCGRCdkLiDXrReGOEVeSCdCcPBSJSc",
  cek: "oIhVW04MRdy2XN9CiKLxTg",
  nonce: "4h_95klXJ5E_qnoN",
  cabecalho: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  cifrado: "8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ",
  // RFC 8291 §5 (mensagem final)
  final:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};
const r = cifrarAes128gcm({
  uaPublic: deB64url(V.uaPublic),
  authSecret: deB64url(V.auth),
  texto: deB64url(V.texto),
  salt: deB64url(V.salt),
  chaveServidor: deB64url(V.asPrivate),
});
const im = r.intermediarios;
igualB64(im.ecdhSecret, V.ecdhSecret, "RFC 8291: ecdh_secret");
igualB64(im.prkKey, V.prkKey, "RFC 8291: PRK_key");
igualB64(im.keyInfo, V.keyInfo, "RFC 8291: key_info");
igualB64(im.ikm, V.ikm, "RFC 8291: IKM");
igualB64(im.prk, V.prk, "RFC 8291: PRK");
igualB64(im.cek, V.cek, "RFC 8291: CEK");
igualB64(im.nonce, V.nonce, "RFC 8291: NONCE");
igualB64(im.cabecalho, V.cabecalho, "RFC 8291: cabeçalho de 86 bytes (salt, rs=4096, keyid=as_public)");
verifica(im.cabecalho.length === 86, "cabeçalho tem 86 bytes");
igualB64(im.cifrado, V.cifrado, "RFC 8291: texto cifrado");
igualB64(r.corpo, V.final, "RFC 8291 §5: mensagem completa");

/* Ida e volta: o aparelho (ua_private) decifra o que mandamos com chave aleatória. */
function decifrar(corpo: Buffer, uaPrivate: Buffer, uaPublic: Buffer, auth: Buffer): Buffer {
  const salt = corpo.subarray(0, 16);
  const idlen = corpo[20];
  const asPublic = corpo.subarray(21, 21 + idlen);
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivate);
  const segredo = ecdh.computeSecret(asPublic);
  const h = (k: Buffer, d: Buffer) => crypto.createHmac("sha256", k).update(d).digest();
  const prkKey = h(auth, segredo);
  const ikm = h(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = h(salt, ikm);
  const cek = h(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = h(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const dados = corpo.subarray(21 + idlen);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(dados.subarray(dados.length - 16));
  const claro = Buffer.concat([d.update(dados.subarray(0, dados.length - 16)), d.final()]);
  return claro.subarray(0, claro.lastIndexOf(2));
}
const aparelho = crypto.createECDH("prime256v1");
aparelho.generateKeys();
const authAparelho = crypto.randomBytes(16);
const msg = Buffer.from(JSON.stringify({ tipo: "chamada_tocando", consultaId: "c1" }));
const c1 = cifrarAes128gcm({ uaPublic: aparelho.getPublicKey(), authSecret: authAparelho, texto: msg }).corpo;
const c2 = cifrarAes128gcm({ uaPublic: aparelho.getPublicKey(), authSecret: authAparelho, texto: msg }).corpo;
verifica(decifrar(c1, aparelho.getPrivateKey(), aparelho.getPublicKey(), authAparelho).equals(msg), "ida e volta: o aparelho decifra a mensagem");
verifica(!c1.equals(c2), "salt e chave efêmera mudam a cada envio");
let grande = false;
try { cifrarAes128gcm({ uaPublic: aparelho.getPublicKey(), authSecret: authAparelho, texto: Buffer.alloc(4000) }); } catch { grande = true; }
verifica(grande, "payload acima de um registro de 4096 bytes é recusado");

/* ---------------- VAPID ---------------- */
const par = crypto.createECDH("prime256v1");
par.generateKeys();
const env = { VAPID_PUBLIC_KEY: b64url(par.getPublicKey()), VAPID_PRIVATE_KEY: b64url(par.getPrivateKey()), VAPID_SUBJECT: "mailto:suporte@bion.example" };
const cfg = configVapid(env)!;
verifica(cfg !== null, "configVapid: chaves válidas ligam o push");
verifica(configVapid({}) === null, "configVapid: sem envs → push desligado");
verifica(configVapid({ ...env, VAPID_SUBJECT: "suporte@bion" }) === null, "configVapid: subject sem mailto:/https → desligado");
verifica(configVapid({ ...env, VAPID_PRIVATE_KEY: "abc" }) === null, "configVapid: chave privada inválida → desligado");

const agoraS = Math.floor(Date.now() / 1000);
const jwt = jwtVapid("https://fcm.googleapis.com/fcm/send/abc", cfg, agoraS);
const [cab, corpo, ass] = jwt.split(".");
verifica(JSON.parse(deB64url(cab).toString()).alg === "ES256", "JWT: alg ES256");
const claims = JSON.parse(deB64url(corpo).toString());
verifica(claims.aud === "https://fcm.googleapis.com", "JWT: aud = origem do endpoint");
verifica(claims.sub === env.VAPID_SUBJECT, "JWT: sub = VAPID_SUBJECT");
verifica(claims.exp > agoraS && claims.exp <= agoraS + 24 * 3600, "JWT: exp no futuro e até 24 h (RFC 8292)");
verifica(deB64url(ass).length === 64, "JWT: assinatura r||s de 64 bytes");
const pubKey = crypto.createPublicKey({
  key: { kty: "EC", crv: "P-256", x: b64url(par.getPublicKey().subarray(1, 33)), y: b64url(par.getPublicKey().subarray(33)) },
  format: "jwk",
});
verifica(
  crypto.verify("sha256", Buffer.from(`${cab}.${corpo}`), { key: pubKey, dsaEncoding: "ieee-p1363" }, deB64url(ass)),
  "JWT: assinatura confere com a chave pública VAPID",
);
verifica(
  !crypto.verify("sha256", Buffer.from(`${cab}.${corpo}x`), { key: pubKey, dsaEncoding: "ieee-p1363" }, deB64url(ass)),
  "JWT: conteúdo alterado não confere",
);

const insc = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: b64url(aparelho.getPublicKey()), auth: b64url(authAparelho) };
const req = montarRequisicaoPush(insc, { tipo: "chamada_tocando" }, { ttl: 95.7, urgencia: "high" }, cfg);
verifica(req.init.headers.TTL === "95", "requisição: TTL em segundos inteiros");
verifica(req.init.headers.Urgency === "high", "requisição: Urgency");
verifica(req.init.headers["Content-Encoding"] === "aes128gcm", "requisição: Content-Encoding aes128gcm");
verifica(req.init.headers.Authorization.startsWith("vapid t=") && req.init.headers.Authorization.endsWith(`, k=${cfg.publica}`), "requisição: Authorization vapid t=…, k=…");
verifica(
  JSON.parse(decifrar(Buffer.from(req.init.body), aparelho.getPrivateKey(), aparelho.getPublicKey(), authAparelho).toString()).tipo === "chamada_tocando",
  "requisição: corpo decifrável pelo aparelho",
);
verifica(montarRequisicaoPush(insc, {}, { ttl: -5 }, cfg).init.headers.TTL === "0", "requisição: TTL negativo vira 0");

let chamou = false;
const desligado = await enviarPush(insc, {}, { ttl: 60 }, { cfg: null, fetch: async () => { chamou = true; return { status: 201 }; } });
verifica(desligado === null && !chamou, "enviarPush sem VAPID: null e não chama a rede");

/* ---------------- Validação da inscrição ---------------- */
const keys = { p256dh: insc.p256dh, auth: insc.auth };
verifica(validarInscricao({ endpoint: insc.endpoint, keys }).ok, "inscrição FCM válida");
verifica(validarInscricao({ endpoint: "https://web.push.apple.com/QGx", keys, plataforma: "ios_pwa" }).ok, "inscrição Apple válida");
verifica(validarInscricao({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/x", keys }).ok, "inscrição Mozilla válida");
verifica(!validarEndpoint("http://fcm.googleapis.com/fcm/send/abc"), "endpoint http recusado");
verifica(!validarEndpoint("https://evil.example/fcm"), "endpoint fora dos serviços de push recusado (SSRF)");
verifica(!validarEndpoint("https://fcm.googleapis.com.evil.example/x"), "host que só começa com o do FCM é recusado");
verifica(!validarEndpoint("https://169.254.169.254/latest"), "IP interno recusado");
verifica(!validarEndpoint("https://fcm.googleapis.com:8443/x"), "porta diferente de 443 recusada");
verifica(!validarEndpoint("https://fcm.googleapis.com/" + "a".repeat(MAX_ENDPOINT)), "endpoint grande demais recusado");
verifica(!validarInscricao({ endpoint: insc.endpoint, keys: { p256dh: "AAAA", auth: insc.auth } }).ok, "p256dh curto recusado");
verifica(!validarInscricao({ endpoint: insc.endpoint, keys: { p256dh: insc.p256dh, auth: "AAAA" } }).ok, "auth com tamanho errado recusado");
verifica(!validarInscricao({ endpoint: insc.endpoint }).ok, "sem keys recusado");
const v = validarInscricao({ endpoint: insc.endpoint, keys, plataforma: "geladeira" });
verifica(v.ok && v.plataforma === null, "plataforma desconhecida vira null");

console.log(`\n${okN} ok, ${falhaN} falha(s)`);
if (falhaN) process.exit(1);
