import type { NextConfig } from "next";

/**
 * P1 (2026-09) — Headers de segurança globais.
 *
 * - X-Frame-Options DENY + CSP frame-ancestors 'none': fecha o vetor de
 *   clickjacking (a teleconsulta/paneis não podem mais ser embutidas em
 *   iframes de terceiros).
 * - Permissions-Policy: câmera e microfone só para a própria origem
 *   (necessário ao WebRTC da teleconsulta); geolocalização e afins bloqueados.
 * - CSP: Next.js em dev exige 'unsafe-eval' (react-refresh) e a UI usa
 *   estilos inline ('unsafe-inline'); em build de produção o 'unsafe-eval'
 *   pode ser removido. connect-src cobre ws/wss para o sinalizador WebRTC
 *   e media-src 'blob:' para os fluxos de vídeo.
 * - HSTS: efetivo quando servido por HTTPS (Vercel/preview público).
 */
const cabecalhosSeguranca = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: cabecalhosSeguranca,
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
