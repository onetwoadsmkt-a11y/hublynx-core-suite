import { createFileRoute } from "@tanstack/react-router";

function html(payload: { ok: boolean; message: string }) {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Google</title></head>
<body style="font-family:system-ui;padding:24px;color:#0f172a">
<p>${payload.ok ? "Conta conectada. Você pode fechar esta janela." : payload.message}</p>
<script>
  var payload = ${json};
  try { if (window.opener) { window.opener.postMessage({ type: "google-oauth-result", ...payload }, "*"); } } catch (e) {}
  if (window.opener) { setTimeout(function () { window.close(); }, payload.ok ? 300 : 4000); }
</script>
</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/google/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const {
          consumeState,
          readConfig,
          exchangeCode,
          fetchUserEmail,
          upsertConnection,
          logEvent,
          explainGoogleError,
        } = await import("@/server/googleOAuth.server");

        const url = new URL(request.url);
        const err = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        const st = state ? await consumeState(state) : null;
        if (!st) {
          return html({
            ok: false,
            message: "Sessão de autorização inválida ou expirada. Tente conectar novamente.",
          });
        }

        if (err || !code) {
          const message = explainGoogleError(err ?? "authorization_code_missing");
          await logEvent({
            userId: st.user_id,
            connectorId: "google",
            action: "connect_complete",
            status: "error",
            message,
            meta: { redirect_uri: st.redirect_uri, google_error: err },
          });
          return html({ ok: false, message });
        }

        try {
          const cfg = await readConfig();
          if (!cfg.client_id || !cfg.client_secret) {
            throw new Error("Credenciais OAuth não configuradas.");
          }
          const tokens = await exchangeCode({
            code,
            redirectUri: st.redirect_uri,
            clientId: cfg.client_id,
            clientSecret: cfg.client_secret,
          });
          const email = await fetchUserEmail(tokens.access_token);
          const expiresAt = new Date(
            Date.now() + (tokens.expires_in ?? 3600) * 1000,
          ).toISOString();

          if (!tokens.refresh_token) {
            const message =
              "O Google não devolveu refresh_token. Revogue o acesso em myaccount.google.com/permissions e conecte novamente.";
            await upsertConnection({
              userId: st.user_id,
              googleEmail: email,
              scopes: st.scopes,
              accessToken: tokens.access_token,
              expiresAt,
              status: "error",
              lastError: message,
            });
            await logEvent({
              userId: st.user_id,
              connectorId: "google",
              action: "connect_complete",
              status: "error",
              message,
              accountEmail: email,
            });
            return html({ ok: false, message });
          }

          await upsertConnection({
            userId: st.user_id,
            googleEmail: email,
            scopes: st.scopes,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt,
            status: "connected",
            lastError: null,
          });
          await logEvent({
            userId: st.user_id,
            connectorId: "google",
            action: "connect_complete",
            status: "success",
            message: "Conta conectada",
            accountEmail: email,
          });
          return html({ ok: true, message: "Conta conectada." });
        } catch (e) {
          const message = (e as Error).message;
          await logEvent({
            userId: st.user_id,
            connectorId: "google",
            action: "connect_complete",
            status: "error",
            message,
            meta: { redirect_uri: st.redirect_uri },
          });
          return html({ ok: false, message });
        }
      },
    },
  },
});
