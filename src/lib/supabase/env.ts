/** Variáveis públicas do Supabase (browser + server). */
export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL não configurada.");
  return url;
}

export function supabaseAnonKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY não configurada.");
  return key;
}

export function supabaseServiceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

export function supabaseConfigurado(): boolean {
  try {
    supabaseUrl();
    supabaseAnonKey();
    return true;
  } catch {
    return false;
  }
}
