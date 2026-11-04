import { dueHasTime } from "@/lib/tasks/pending";

/**
 * Lembretes no celular (push): "em breve" (vence nos próximos 15 min) e "atrasada"
 * (venceu na última hora). Só para prazos com horário marcado — tarefa "só com dia"
 * não tem hora para lembrar. Canceladas (excluídas) e concluídas ficam de fora.
 * Agendamentos de lead entram quando a migração 37 estiver aplicada.
 * Horário do texto sempre em Brasília (o servidor roda em UTC).
 */
const TZ = "America/Sao_Paulo";
const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

type Kind = "due_soon" | "overdue";

export async function runTaskReminders(admin: any, now: Date = new Date()) {
  const { sendPushToUser } = await import("@/lib/push/push.server");
  const in15 = new Date(now.getTime() + 15 * 60_000).toISOString();
  const ago60 = new Date(now.getTime() - 60 * 60_000).toISOString();
  const nowIso = now.toISOString();
  let sent = 0;

  const payloadFor = (kind: Kind, title: string, due: string) =>
    kind === "due_soon"
      ? { title: "⏰ Tarefa em breve", body: `${title} — ${hhmm(due)}` }
      : { title: "🚨 Tarefa atrasada", body: `${title} venceu às ${hhmm(due)}` };

  // ---- tarefas
  const taskWindow = async (kind: Kind) => {
    let q = admin
      .from("tasks")
      .select("id, title, due_date, status, owner_id, assignee_id")
      .not("status", "in", "(concluido,cancelado)");
    q = kind === "due_soon" ? q.gte("due_date", nowIso).lte("due_date", in15) : q.gte("due_date", ago60).lt("due_date", nowIso);
    const { data, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).filter((t) => dueHasTime(t.due_date));
  };
  for (const kind of ["due_soon", "overdue"] as Kind[]) {
    for (const t of await taskWindow(kind)) {
      // quem criou e o responsável (como antes)
      for (const userId of new Set([t.owner_id, t.assignee_id].filter(Boolean) as string[])) {
      const { data: existing } = await admin
        .from("task_push_log")
        .select("id")
        .eq("task_id", t.id)
        .eq("user_id", userId)
        .eq("kind", kind)
        .maybeSingle();
      if (existing) continue;
      try {
        const r = await sendPushToUser(userId, { ...payloadFor(kind, t.title, t.due_date), url: `/app/tarefas/${t.id}`, tag: `task-${t.id}-${kind}` });
        sent += r.sent;
        await admin.from("task_push_log").insert({ task_id: t.id, user_id: userId, kind });
      } catch (err) {
        console.error("push fail", t.id, err);
      }
      }
    }
  }

  // ---- agendamentos de lead (precisa da migração 37)
  let leadReady = true;
  const probe = await admin.from("lead_task_push_log").select("id").limit(1);
  if (probe.error) leadReady = false;
  if (leadReady) {
    for (const kind of ["due_soon", "overdue"] as Kind[]) {
      let q = admin.from("lead_tasks").select("id, title, due_at, done, owner_id, leads(name)").eq("done", false);
      q = kind === "due_soon" ? q.gte("due_at", nowIso).lte("due_at", in15) : q.gte("due_at", ago60).lt("due_at", nowIso);
      const { data } = await q.limit(500);
      for (const t of ((data ?? []) as any[]).filter((x) => x.owner_id && dueHasTime(x.due_at))) {
        const { data: existing } = await admin
          .from("lead_task_push_log")
          .select("id")
          .eq("lead_task_id", t.id)
          .eq("user_id", t.owner_id)
          .eq("kind", kind)
          .maybeSingle();
        if (existing) continue;
        const title = t.leads?.name ? `${t.leads.name} — ${t.title}` : t.title;
        try {
          const r = await sendPushToUser(t.owner_id, { ...payloadFor(kind, title, t.due_at), url: `/tarefas?task=lead:${t.id}&view=lista`, tag: `lead-task-${t.id}-${kind}` });
          sent += r.sent;
          await admin.from("lead_task_push_log").insert({ lead_task_id: t.id, user_id: t.owner_id, kind });
        } catch (err) {
          console.error("push fail lead", t.id, err);
        }
      }
    }
  }

  return { ok: true as const, sent, leadReminders: leadReady, ranAt: nowIso };
}
