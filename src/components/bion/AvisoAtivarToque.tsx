"use client";
import { useEffect, useState } from "react";
import { BellRing, Smartphone, X } from "lucide-react";
import { chaveDispensa, tipoAviso, type TipoAviso } from "@/lib/push-cliente-logica";
import { ativarPush, chavePublica, permissaoAtual, sincronizarPush, suportePush } from "@/lib/push-cliente";

/**
 * Aviso do toque da consulta (PACIENTE e MEDICO). Montado em
 * paciente/PacienteApp.tsx e, no médico, em medico/telas/TelaInicio.tsx
 * (coluna central: não mexe no layout de 3 colunas da tela larga).
 * - "ativar": permissão default; requestPermission só no clique.
 * - "instalar": iOS fora da PWA; só orienta (dispensável, sem pedir permissão).
 * A chave VAPID é buscada ao montar: sem chave (servidor ativo:false), nenhum aviso.
 */
export function AvisoAtivarToque({ role, usuarioId, className = "" }: { role: string | null | undefined; usuarioId?: string; className?: string }) {
  const [tipo, setTipo] = useState<TipoAviso>(null);
  const [chave, setChave] = useState<string | null>(null);
  const [estado, setEstado] = useState<"ocioso" | "ativando" | "erro">("ocioso");

  useEffect(() => {
    let vivo = true;
    const permissao = permissaoAtual();
    if (permissao === "granted") void sincronizarPush(usuarioId);
    void chavePublica().then((c) => {
      if (!vivo) return;
      let dispensadoEm: string | null = null;
      try {
        dispensadoEm = localStorage.getItem(chaveDispensa(usuarioId));
      } catch {}
      setChave(c);
      setTipo(tipoAviso({ role, suporte: suportePush(), permissao, dispensadoEm, agora: Date.now(), temChave: c !== null }));
    });
    return () => {
      vivo = false;
    };
  }, [role, usuarioId]);

  if (!tipo) return null;

  const dispensar = () => {
    try {
      localStorage.setItem(chaveDispensa(usuarioId), String(Date.now()));
    } catch {}
    setTipo(null);
  };
  const ativar = async () => {
    if (!chave) return;
    setEstado("ativando");
    const r = await ativarPush(usuarioId, chave);
    if (r === "ativado" || r === "negado" || r === "sem_suporte") setTipo(null);
    else setEstado("erro");
  };

  const instalar = tipo === "instalar";
  const Icone = instalar ? Smartphone : BellRing;
  return (
    <div role="region" aria-label={instalar ? "Receber o toque da consulta" : "Ativar toque da consulta"}
      className={`flex items-start gap-3 rounded-2xl border border-bion-ink/10 bg-white/80 p-4 text-bion-ink shadow-sm dark:border-bion-paper/15 dark:bg-white/5 dark:text-bion-paper ${className}`}>
      <Icone className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {instalar ? (
          <>
            <p className="font-bold">Adicione o Bion à tela de início para receber o toque</p>
            <p className="mt-0.5 text-sm opacity-75">No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p>
          </>
        ) : (
          <>
            <p className="font-bold">Ativar toque da consulta</p>
            <p className="mt-0.5 text-sm opacity-75">
              {estado === "erro" ? "Não deu para ativar agora. Tente de novo." : "Seu celular toca quando a consulta for começar."}
            </p>
            <button type="button" onClick={ativar} disabled={estado === "ativando"}
              className="mt-3 rounded-full bg-bion-ink px-4 py-2 text-sm font-bold text-bion-paper disabled:opacity-60 dark:bg-bion-paper dark:text-bion-ink">
              {estado === "ativando" ? "Ativando…" : "Ativar"}
            </button>
          </>
        )}
      </div>
      <button type="button" onClick={dispensar} aria-label="Agora não" className="rounded-full p-1 opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
