"use client";
import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { DISPENSA_CHAVE, deveMostrarAviso } from "@/lib/push-cliente-logica";
import { ativarPush, permissaoAtual, sincronizarPush, suportePush } from "@/lib/push-cliente";

/** Aviso "Ativar toque da consulta" (PACIENTE e MEDICO). requestPermission só no clique. */
export function AvisoAtivarToque({ role, usuarioId, className = "" }: { role: string | null | undefined; usuarioId?: string; className?: string }) {
  const [visivel, setVisivel] = useState(false);
  const [estado, setEstado] = useState<"ocioso" | "ativando" | "erro">("ocioso");

  useEffect(() => {
    let dispensadoEm: string | null = null;
    try {
      dispensadoEm = localStorage.getItem(DISPENSA_CHAVE);
    } catch {}
    const permissao = permissaoAtual();
    const mostrar = deveMostrarAviso({ role, suporte: suportePush(), permissao, dispensadoEm, agora: Date.now() });
    // Lido só no cliente (localStorage/Notification): aplica fora do corpo do efeito.
    const t = window.setTimeout(() => setVisivel(mostrar), 0);
    if (permissao === "granted") void sincronizarPush(usuarioId);
    return () => window.clearTimeout(t);
  }, [role, usuarioId]);

  if (!visivel) return null;

  const dispensar = () => {
    try {
      localStorage.setItem(DISPENSA_CHAVE, String(Date.now()));
    } catch {}
    setVisivel(false);
  };
  const ativar = async () => {
    setEstado("ativando");
    const r = await ativarPush(usuarioId);
    if (r === "ativado" || r === "negado") setVisivel(false);
    else setEstado("erro");
  };

  return (
    <div role="region" aria-label="Ativar toque da consulta"
      className={`flex items-start gap-3 rounded-2xl border border-bion-ink/10 bg-white/80 p-4 text-bion-ink shadow-sm dark:border-bion-paper/15 dark:bg-white/5 dark:text-bion-paper ${className}`}>
      <BellRing className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-bold">Ativar toque da consulta</p>
        <p className="mt-0.5 text-sm opacity-75">
          {estado === "erro" ? "Não deu para ativar agora. Tente de novo." : "Seu celular toca quando a consulta for começar."}
        </p>
        <button type="button" onClick={ativar} disabled={estado === "ativando"}
          className="mt-3 rounded-full bg-bion-ink px-4 py-2 text-sm font-bold text-bion-paper disabled:opacity-60 dark:bg-bion-paper dark:text-bion-ink">
          {estado === "ativando" ? "Ativando…" : "Ativar"}
        </button>
      </div>
      <button type="button" onClick={dispensar} aria-label="Agora não" className="rounded-full p-1 opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
