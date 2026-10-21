import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "BION — Consulta médica por vídeo, sem sair de casa",
  description:
    "Agende, entre na sala e faça sua consulta por vídeo, sem sair de casa. Seu histórico de consultas em um só lugar.",
  keywords: ["telemedicina", "consulta online", "BION", "saúde", "médico online"],
  openGraph: {
    title: "BION — Consulta médica por vídeo, sem sair de casa",
    description:
      "Agende sua consulta, fale com o médico por vídeo e receba suas orientações pelo app.",
    type: "website",
    locale: "pt_BR",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

// Aplica o tema salvo ANTES da primeira pintura para evitar flash branco (FOUC)
// e permitir que landing/login também honrem o modo escuro.
const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("bion-tema");var e=t==="escuro"||(t===null&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(e){document.documentElement.classList.add("dark")}var d=localStorage.getItem("bion-densidade");if(d==="compacta"||d==="grande"||d==="confortavel"){document.documentElement.classList.add("densidade-"+d)}else{document.documentElement.classList.add("densidade-confortavel")}}catch(r){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className={`${inter.className} antialiased bg-background text-foreground`}>
        {/* FASE 2 (auditoria): BionProvider saiu daqui e agora envolve apenas
            /entrar + área autenticada — ver src/app/(bion)/layout.tsx. */}
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
