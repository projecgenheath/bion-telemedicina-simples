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
    // checkout.stripe.com: o pagamento (cartão, modo da conta Stripe) abre DENTRO do app.
    // Sem isso o Capacitor mandava o Checkout para o Chrome; a volta (success_url)
    // caía no navegador, sem a sessão do app, e o paciente ficava sem a confirmação.
    allowNavigation: ["bion-telemedicina-simples.vercel.app", "checkout.stripe.com"],
    cleartext: false,
  },
  android: {
    // Android 15+ (targetSdk 35) força a tela de ponta a ponta: sem margens, o topo
    // do app ficava sob a barra de status e os botões de baixo sob a barra de gestos
    // (a WebView não informa env(safe-area-inset-*) de forma confiável). "auto" só
    // aplica as margens quando o sistema força o edge-to-edge.
    adjustMarginsForEdgeToEdge: "auto",
  },
};

export default config;
