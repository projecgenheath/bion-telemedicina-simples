"use client";

import { useBion } from "@/lib/bion-store";
import { Notificacoes } from "@/components/bion/Notificacoes";
import { NotificacoesModulo } from "@/components/bion/admin/conta/NotificacoesModulo";

export default function PaginaNotificacoes() {
  const { sessao } = useBion();
  // Admin: Notificações no visual Torre BION.
  if (sessao.role === "admin") return <NotificacoesModulo />;
  return <Notificacoes />;
}
