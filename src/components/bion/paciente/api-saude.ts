"use client";

import { toast } from "sonner";

/** fetch JSON com toast de erro (mesmo padrão do bion-store). Devolve null em falha. */
export async function apiSaude<T>(url: string, init?: RequestInit, silencioso = false): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, cache: "no-store", ...init });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      if (!silencioso) toast.error((json as { erro?: string } | null)?.erro ?? "Não foi possível concluir a operação.");
      return null;
    }
    return json as T;
  } catch {
    if (!silencioso) toast.error("Falha de conexão com o servidor.");
    return null;
  }
}
