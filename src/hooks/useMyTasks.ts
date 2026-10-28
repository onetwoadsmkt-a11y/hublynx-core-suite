import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyAssignedTasks, type MyTask } from "@/lib/tasks/my-tasks.functions";

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function taskState(t: MyTask): "late" | "today" | "next" | "none" {
  if (!t.due_date) return "none";
  const due = new Date(t.due_date).getTime();
  const s = startOfToday();
  if (due < s) return "late";
  if (due < s + 86_400_000) return "today";
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
