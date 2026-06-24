import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  const { getVapidKeys } = await import("./push.server");
  const v = await getVapidKeys();
  return { publicKey: v.publicKey };
});

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendPushToUser } = await import("./push.server");
    return sendPushToUser(context.userId, {
      title: "Hublynx Tarefas",
      body: "Notificações funcionando! 🎉",
      url: "/app/hoje",
      tag: "hublynx-test",
    });
  });

export const saveSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          user_agent: data.userAgent ?? null,
        },
        { onConflict: "endpoint" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
