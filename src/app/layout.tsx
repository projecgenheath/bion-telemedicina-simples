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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
