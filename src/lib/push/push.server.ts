// Server-only helpers for Web Push (VAPID).
import webpush from "web-push";

let cachedVapid: { publicKey: string; privateKey: string; subject: string } | null = null;

export async function getVapidKeys() {
  if (cachedVapid) return cachedVapid;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_config")
    .select("value")
    .eq("key", "vapid")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("VAPID keys not configured");
  cachedVapid = data.value as typeof cachedVapid;
  return cachedVapid!;
}

export async function configureWebPush() {
  const v = await getVapidKeys();
  webpush.setVapidDetails(v.subject, v.publicKey, v.privateKey);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPushToUser(userId: string, payload: PushPayload) {
  await configureWebPush();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!subs || subs.length === 0) return { sent: 0, removed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let removed = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      );
      sent++;
    } catch (e: any) {
      const status = e?.statusCode;
      if (status === 404 || status === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
        removed++;
      } else {
        console.error("push send failed", status, e?.body);
      }
    }
  }
  return { sent, removed };
}
