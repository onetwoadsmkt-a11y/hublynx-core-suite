import { createFileRoute } from "@tanstack/react-router";

// Cron-triggered route. Finds tasks with due_date within the next 15 minutes
// (or already overdue in the last 60 min) and sends one push per (task, kind, user).
export const Route = createFileRoute("/api/public/hooks/run-reminders")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendPushToUser } = await import("@/lib/push/push.server");

        const now = new Date();
        const in15 = new Date(now.getTime() + 15 * 60 * 1000);
        const ago60 = new Date(now.getTime() - 60 * 60 * 1000);

        // Due soon: due_date in [now, now+15min], status != 'concluido'
        const { data: dueSoon, error: e1 } = await supabaseAdmin
          .from("tasks")
          .select("id, title, due_date, status, owner_id, assignee_id")
          .gte("due_date", now.toISOString())
          .lte("due_date", in15.toISOString())
          .neq("status", "concluido");
        if (e1) throw new Error(e1.message);

        // Overdue: due_date in [now-60, now), status != 'concluido'
        const { data: overdue, error: e2 } = await supabaseAdmin
          .from("tasks")
          .select("id, title, due_date, status, owner_id, assignee_id")
          .gte("due_date", ago60.toISOString())
          .lt("due_date", now.toISOString())
          .neq("status", "concluido");
        if (e2) throw new Error(e2.message);

        let totalSent = 0;
        const process = async (
          rows: typeof dueSoon,
          kind: "due_soon" | "overdue",
        ) => {
          for (const t of rows ?? []) {
            const recipients = new Set<string>();
            if (t.owner_id) recipients.add(t.owner_id);
            if (t.assignee_id) recipients.add(t.assignee_id);
            for (const userId of recipients) {
              const { data: existing } = await supabaseAdmin
                .from("task_push_log")
                .select("id")
                .eq("task_id", t.id)
                .eq("user_id", userId)
                .eq("kind", kind)
                .maybeSingle();
              if (existing) continue;

              const when = t.due_date ? new Date(t.due_date) : null;
              const hhmm = when
                ? when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                : "";
              const payload =
                kind === "due_soon"
                  ? { title: "⏰ Tarefa em breve", body: `${t.title} — ${hhmm}` }
                  : { title: "🚨 Tarefa atrasada", body: `${t.title} venceu às ${hhmm}` };

              try {
                const r = await sendPushToUser(userId, {
                  ...payload,
                  url: `/app/tarefas/${t.id}`,
                  tag: `task-${t.id}-${kind}`,
                });
                totalSent += r.sent;
                await supabaseAdmin
                  .from("task_push_log")
                  .insert({ task_id: t.id, user_id: userId, kind });
              } catch (err) {
                console.error("push fail", t.id, err);
              }
            }
          }
        };

        await process(dueSoon, "due_soon");
        await process(overdue, "overdue");

        return Response.json({
          ok: true,
          dueSoon: dueSoon?.length ?? 0,
          overdue: overdue?.length ?? 0,
          sent: totalSent,
          ranAt: now.toISOString(),
        });
      },
      GET: async () =>
        new Response("Use POST", { status: 405, headers: { allow: "POST" } }),
    },
  },
});
