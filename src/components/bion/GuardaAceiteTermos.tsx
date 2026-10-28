"use client";

import { useCallback, useEffect, useState } from "react";
import { AceiteTermos } from "@/components/bion/AceiteTermos";
import { TelaCarregando } from "@/components/bion/brand";
import { aceiteTermosPayload, type PerfilAceite } from "@/lib/aceite-termos";

/** Rota do re-aceite por perfil. PACIENTE ainda não tem rota ligada. */
export const ROTA_ACEITE_POR_PERFIL: Record<PerfilAceite, string> = {
  MEDICO: "/api/medico/aceite-termos",
  PACIENTE: "/api/paciente/aceite-termos",
};

type Estado = "carregando" | "pendente" | "ok" | "erro";

/**
 * Bloqueia a área do perfil até o aceite dos Termos de Uso do perfil
 * (VERSAO_TERMOS_POR_PERFIL[perfil]) e da Política de Privacidade vigentes.
 * Não desloga ninguém: logins de demonstração só veem esta tela.
 * Hoje ligado só para MEDICO.
 */
export function GuardaAceiteTermos({
  perfil,
  rota = ROTA_ACEITE_POR_PERFIL[perfil],
  children,
}: {
  perfil: PerfilAceite;
  rota?: string;
  children: React.ReactNode;
}) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [marcado, setMarcado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const consultar = useCallback(async () => {
    setEstado("carregando");
    try {
      const res = await fetch(rota, { cache: "no-store", credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as { pendente?: boolean } | null;
      if (!res.ok || !json) return setEstado("erro");
      setEstado(json.pendente ? "pendente" : "ok");
    } catch {
      setEstado("erro");
    }
  }, [rota]);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  async function aceitar() {
    if (!marcado || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(rota, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aceiteTermosPayload(perfil)),
      });
      const json = (await res.json().catch(() => null)) as { pendente?: boolean; erro?: string } | null;
      if (!res.ok) setErro(json?.erro ?? "Não foi possível registrar o aceite. Tente novamente.");
      else setEstado(json?.pendente ? "pendente" : "ok");
    } catch {
      setErro("Falha de conexão com o servidor.");
    } finally {
      setEnviando(false);
    }
  }

  if (estado === "ok") return <>{children}</>;
  if (estado === "carregando") return <TelaCarregando texto="Conferindo os termos…" />;

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-sm" role="dialog" aria-modal="true" aria-labelledby="titulo-aceite-termos">
        {estado === "erro" ? (
          <>
            <h1 id="titulo-aceite-termos" className="text-lg font-bold">Não foi possível conferir os termos</h1>
            <button type="button" onClick={() => void consultar()} className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground">
              Tentar de novo
            </button>
          </>
        ) : (
          <>
            <h1 id="titulo-aceite-termos" className="text-lg font-bold">Termos de Uso e Política de Privacidade</h1>
            <p className="text-sm text-muted-foreground">
              Para continuar usando o app, leia e aceite a versão atual dos Termos de Uso e da Política de Privacidade da BION.
            </p>
            <AceiteTermos perfil={perfil} aceitouTermos={marcado} onAceitouTermos={setMarcado} mostrarMarketing={false} disabled={enviando} />
            {erro ? <p role="alert" className="text-xs text-destructive">{erro}</p> : null}
            <button
              type="button"
              onClick={() => void aceitar()}
              disabled={!marcado || enviando}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {enviando ? "Registrando…" : "Aceitar e continuar"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
