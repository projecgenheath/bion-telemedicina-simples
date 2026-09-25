import { BionProvider } from "@/lib/bion-store";

/**
 * FASE 2 (auditoria front-end): o BionProvider agora vive NESTE grupo de
 * rotas — e não mais no RootLayout. A landing (/) deixa de montar o store
 * inteiro (17 estados + fetch de sessão) e o grupo abrange /entrar e a área
 * autenticada (app), então o login → app NÃO remonta o provider (sem
 * bootstrap duplicado nem flash de carregamento pós-login).
 */
export default function LayoutComBion({ children }: { children: React.ReactNode }) {
  return <BionProvider>{children}</BionProvider>;
}
