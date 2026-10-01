import "server-only";
import crypto from "crypto";

/**
 * Auditoria admin (achado C2): contas criadas pela administração NÃO nascem
 * mais com uma senha fixa pública. Cada conta recebe uma senha temporária
 * aleatória (crypto.randomInt, sem viés), exibida UMA única vez ao admin na
 * resposta do cadastro e nunca persistida em texto puro nem em auditoria.
 * O flag `precisaTrocarSenha` continua obrigando a troca no primeiro acesso
 * (bloqueio no servidor em exigirSessao — ver lib/server/auth.ts).
 */

// Sem caracteres ambíguos (0/O, 1/l/I) para facilitar o repasse ao usuário.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Senha temporária forte (padrão 16 chars ≈ 93 bits), sempre com letras e números. */
export function gerarSenhaTemporaria(tamanho = 16): string {
  for (;;) {
    let s = "";
    for (let i = 0; i < tamanho; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)];
    if (/[A-Za-z]/.test(s) && /[0-9]/.test(s)) return s;
  }
}

/** Sufixo aleatório para e-mails gerados (impede adivinhar o login pelo nome). */
export function sufixoAleatorio(bytes = 4): string {
  return crypto.randomBytes(bytes).toString("hex");
}
