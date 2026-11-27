/**
 * Estado das travas de produção, só para leitura. Nunca devolve chave,
 * segredo nem liga cobrança. Testes: travas-admin.teste.ts.
 */
export type ClasseChave = "ausente" | "teste" | "live" | "outra";

export type EstadoTravas = {
  classeChave: ClasseChave;
  /** true = a chave é live e a cobrança com ela é recusada. */
  cobrancaLiveBloqueada: boolean;
  /** BION_PAGAMENTO_STRIPE=true e existe alguma chave. Não significa cobrança live. */
  stripeLigado: boolean;
  /** Valor reconhecido, "padrao_plataforma" se a variável está vazia (modelo 21/11), ou "nao_reconhecido". */
  modoCobranca: "plataforma" | "destino" | "direta" | "padrao_plataforma" | "nao_reconhecido";
  cronSecretConfigurado: boolean;
  comprovanteConfigurado: boolean;
};

type Env = Record<string, string | undefined>;

export function classeChaveStripe(chave: string | undefined): ClasseChave {
  const c = (chave ?? "").trim();
  if (!c) return "ausente";
  if (c.startsWith("sk_live_") || c.startsWith("rk_live_")) return "live";
  if (c.startsWith("sk_test_") || c.startsWith("rk_test_")) return "teste";
  return "outra";
}

export function estadoTravas(env: Env): EstadoTravas {
  const classeChave = classeChaveStripe(env.STRIPE_SECRET_KEY);
  const bruto = (env.STRIPE_MODO_COBRANCA ?? "").trim().toLowerCase();
  const modoCobranca =
    bruto === "plataforma" || bruto === "destino" || bruto === "direta"
      ? bruto
      : bruto
        ? "nao_reconhecido"
        : "padrao_plataforma";
  return {
    classeChave,
    cobrancaLiveBloqueada: classeChave === "live",
    stripeLigado: env.BION_PAGAMENTO_STRIPE === "true" && classeChave !== "ausente",
    modoCobranca,
    cronSecretConfigurado: !!env.CRON_SECRET?.trim(),
    comprovanteConfigurado: !!env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  };
}
