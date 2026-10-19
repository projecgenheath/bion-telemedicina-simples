/**
 * Gera um par NOVO de chaves VAPID (P-256) para o Web Push e imprime as
 * envs. NÃO comite a saída: cadastre só na Vercel (Production).
 *   bun scripts/gerar_vapid.ts
 * Trocar as chaves invalida todas as inscrições existentes (o app pede de novo).
 */
import crypto from "node:crypto";

const ecdh = crypto.createECDH("prime256v1");
ecdh.generateKeys();
const publica = ecdh.getPublicKey().toString("base64url"); // 65 bytes, não comprimida
const privada = ecdh.getPrivateKey().toString("base64url"); // 32 bytes

console.log(`VAPID_PUBLIC_KEY=${publica}`);
console.log(`VAPID_PRIVATE_KEY=${privada}`);
console.log(`VAPID_SUBJECT=mailto:<email de contato da BION>`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publica}`);
