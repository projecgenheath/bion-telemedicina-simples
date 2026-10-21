import type { CapacitorConfig } from "@capacitor/cli";

// Troque aqui se o identificador do app mudar (precisa ser único nas lojas).
export const APP_ID = "br.com.bion.app";
export const PROD_URL = "https://bion-telemedicina-simples.vercel.app";
// O app abre direto no login; com sessão salva, /entrar redireciona para a home do perfil.
export const APP_START_URL = `${PROD_URL}/entrar`;

const config: CapacitorConfig = {
  appId: APP_ID,
  appName: "BION",
  // Pasta mínima exigida pelo Capacitor; o app real é carregado de server.url.
  webDir: "cap-www",
  server: {
    url: APP_START_URL,
    androidScheme: "https",
    allowNavigation: ["bion-telemedicina-simples.vercel.app"],
    cleartext: false,
  },
};

export default config;
