import type { Metadata } from "next";

/**
 * /verificar/* é página pública de conferência de vias: nunca deve entrar
 * em buscador (o header X-Robots-Tag também vem do next.config).
 */
export const metadata: Metadata = {
  title: "Verificação de documento · BION",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function VerificarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
