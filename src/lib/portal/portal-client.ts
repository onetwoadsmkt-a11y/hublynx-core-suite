// Sessão própria do portal do cliente — separada do login do Core.
// Entrar/sair no portal não mexe na sessão da equipe (e vice-versa).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/env";

const STORAGE_KEY = "hublynx-portal-auth";

let _client: SupabaseClient | undefined;

export function portalAuth(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, {
      auth: {
        storageKey: STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

/** Token da sessão do portal (renova sozinho). Null = precisa entrar. */
export async function portalToken(): Promise<string | null> {
  const { data } = await portalAuth().auth.getSession();
  return data.session?.access_token ?? null;
}

/** Endereço da tela de entrada do portal, voltando para o projeto depois. */
export function portalLoginPath(projectRef?: string | null, email?: string | null) {
  const q = new URLSearchParams();
  if (projectRef) q.set("p", projectRef);
  if (email) q.set("e", email);
  const s = q.toString();
  return `/portal/entrar${s ? `?${s}` : ""}`;
}
