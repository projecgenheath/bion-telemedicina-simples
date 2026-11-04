"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { useBion } from "@/lib/bion-store";
import {
  PREFIXO_FINALIDADE_TERMOS,
  URL_POLITICA_PRIVACIDADE,
  URL_TERMOS_POR_PERFIL,
  VERSAO_PRIVACIDADE,
  VERSAO_TERMOS_POR_PERFIL,
  type PerfilAceite,
} from "@/lib/aceite-termos";
import { ROTA_ACEITE_POR_PERFIL } from "./GuardaAceiteTermos";

/**
 * Seção "Termos de Uso" da página "Termos e privacidade" — antes a página
 * só tinha privacidade, apesar do nome. Mostra a versão vigente do
 * documento que o usuário aceita (fonte: lib/aceite-termos), o estado do
 * aceite (mesmo GET da GuardaAceiteTermos) e, quando o registro está na
 * lista de consentimentos, a versão/data do aceite. Os textos completos
 * ficam nas rotas públicas oficiais (/termos-de-uso, /termos-medico e
 * /politica-de-privacidade) — nada de texto jurídico duplicado aqui.
 */
export function SecaoTermosUso() {
  const { sessao, consentimentosVisiveis } = useBion();
  const perfil: PerfilAceite | null =
    sessao.role === "medico" ? "MEDICO" : sessao.role === "paciente" ? "PACIENTE" : null;
  const [estado, setEstado] = useState<"carregando" | "ok" | "pendente" | "erro">("carregando");

  useEffect(() => {
    if (!perfil) return;
    let vivo = true;
    fetch(ROTA_ACEITE_POR_PERFIL[perfil], { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => {
        const j = (await r.json().catch(() => null)) as { pendente?: boolean } | null;
        if (!vivo) return;
        if (!r.ok || !j) setEstado("erro");
        else setEstado(j.pendente ? "pendente" : "ok");
      })
      .catch(() => {
        if (vivo) setEstado("erro");
      });
    return () => {
      vivo = false;
    };
  }, [perfil]);

  if (!perfil) return null;
  const versaoTermos = VERSAO_TERMOS_POR_PERFIL[perfil];
  const urlTermos = URL_TERMOS_POR_PERFIL[perfil];

  // Registro do aceite na lista de consentimentos (finalidade
  // "Aceite dos Termos de Uso (versão X)"): a versão aceita pode ser
  // diferente da vigente quando há atualização pendente.
  const registro = consentimentosVisiveis.find(
    (c) => c.aceito && c.finalidade.startsWith(PREFIXO_FINALIDADE_TERMOS),
  );
  const versaoAceita = registro?.finalidade.match(/\(versão (.+)\)$/)?.[1] ?? null;

  const link =
    "min-h-11 px-4 rounded-full border-2 border-primary/40 text-primary text-sm font-bold inline-flex items-center gap-2";

  return (
    <section className="bg-card border rounded-3xl p-6 space-y-3" aria-labelledby="titulo-termos-uso">
      <h2 id="titulo-termos-uso" className="font-bold flex items-center gap-2">
        <ScrollText className="w-4 h-4 text-primary" /> Termos de Uso
      </h2>
      <p className="text-sm text-muted-foreground">
        Os Termos de Uso são o contrato entre você e a BION: como a teleconsulta funciona,
        agendamento, pagamento, cancelamento e as responsabilidades de cada parte. A Política de
        Privacidade — que trata dos seus dados — está resumida nesta página e completa no link abaixo.
      </p>
      <p className="text-sm" aria-live="polite">
        {estado === "carregando"
          ? "Carregando o estado do seu aceite…"
          : estado === "erro"
            ? "Não foi possível carregar o estado do seu aceite agora. Os textos completos estão nos links abaixo."
            : estado === "pendente"
              ? "Há uma versão atualizada dos Termos aguardando o seu aceite — o app pede a confirmação ao continuar."
              : "Você aceitou a versão atual dos Termos de Uso e da Política de Privacidade."}
      </p>
      {registro && versaoAceita ? (
        <p className="text-xs text-muted-foreground">
          Aceite registrado: versão {versaoAceita} · {registro.quando}.
          {versaoAceita !== versaoTermos ? ` A versão atual é ${versaoTermos}.` : ""}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Versão atual dos Termos: {versaoTermos} · Política de Privacidade: {VERSAO_PRIVACIDADE}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <a href={urlTermos} target="_blank" rel="noopener noreferrer" className={link}>
          Ler os Termos de Uso completos
        </a>
        <a href={URL_POLITICA_PRIVACIDADE} target="_blank" rel="noopener noreferrer" className={link}>
          Ler a Política de Privacidade completa
        </a>
      </div>
    </section>
  );
}
