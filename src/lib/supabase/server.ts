import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseServiceRoleKey, supabaseUrl } from "./env";

/** Cliente Supabase no servidor (cookies da sessão Auth). */
export async function createSupabaseServerClient() {
  const jar = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            jar.set(name, value, options);
          });
        } catch {
          /* set em Server Component / RSC — middleware cuida do refresh */
        }
      },
    },
  });
}

/**
 * Cliente com service role (só servidor). Bypass RLS — usar com cuidado
 * (sync User, Storage admin, Edge equivalentes no Next).
 */
export function createSupabaseAdminClient() {
  const key = supabaseServiceRoleKey();
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  }
  return createClient(supabaseUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
