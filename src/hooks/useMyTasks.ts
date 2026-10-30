import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyAssignedTasks, type MyTask } from "@/lib/tasks/my-tasks.functions";
import { dayKey, dueDayKey, isOverdue } from "@/lib/tasks/pending";


export function taskState(t: MyTask): "late" | "today" | "next" | "none" {
  if (!t.due_date) return "none";
  if (isOverdue({ due_date: t.due_date, status: (t as { status?: string | null }).status ?? null })) return "late";
  if (dueDayKey(t.due_date) === dayKey(new Date())) return "today";
  return "next";
}

/** Tarefas em aberto designadas a mim (mesma chave em todo o app). */
export function useMyTasks(enabled = true) {
  const fn = useServerFn(listMyAssignedTasks);
  const q = useQuery({
    queryKey: ["my-assigned-tasks"],
    queryFn: () => fn(),
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const list = q.data ?? [];
  const late = list.filter((t) => taskState(t) === "late").length;
  const today = list.filter((t) => taskState(t) === "today").length;
  return { ...q, list, late, today, open: list.length };
}
