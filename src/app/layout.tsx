import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "BION — Consulta médica online em minutos",
  description:
    "Agende, entre na sala e faça sua consulta por vídeo em minutos. Receitas, atestados e prontuário digital em um só lugar.",
  keywords: ["telemedicina", "consulta online", "BION", "saúde", "médico online"],
  openGraph: {
    title: "BION — Consulta médica online em minutos",
    description:
      "Telemedicina simples e humanizada: agendamento rápido, vídeo em HD e documentos com validade legal.",
    type: "website",
    locale: "pt_BR",
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

// Aplica o tema salvo ANTES da primeira pintura para evitar flash branco (FOUC)
// e permitir que landing/login também honrem o modo escuro.
const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("bion-tema");var e=t==="escuro"||(t===null&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(e){document.documentElement.classList.add("dark")}}catch(r){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="antialiased bg-background text-foreground">
        {/* FASE 2 (auditoria): BionProvider saiu daqui e agora envolve apenas
            /entrar + área autenticada — ver src/app/(bion)/layout.tsx. */}
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
