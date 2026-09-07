import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SUPABASE_URL as CFG_URL, SUPABASE_PUBLISHABLE_KEY as CFG_KEY } from "@/integrations/supabase/env";

/** Informa se a conta possui senha própria (provider "email"). */
export const getAccountPasswordStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ hasPassword: boolean; email: string | null }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const identities = data?.user?.identities ?? [];
    return {
      hasPassword: identities.some((i) => i.provider === "email"),
      email: data?.user?.email ?? null,
    };
  });

/** Revalida a senha da conta. Nunca devolve nada além de ok/false. */
export const verifyAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const email = (context.claims as { email?: string } | undefined)?.email;
    if (!email) return { ok: false };

    const url = CFG_URL;
    const key = CFG_KEY;
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { error } = await client.auth.signInWithPassword({ email, password: data.password });
    if (error) return { ok: false };
    await client.auth.signOut();
    return { ok: true };
  });
