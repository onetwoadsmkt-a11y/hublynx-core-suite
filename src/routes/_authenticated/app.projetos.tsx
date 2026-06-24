import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { FolderKanban, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { isPast, isToday, parseISO } from "date-fns";

export const Route = createFileRoute("/_authenticated/app/projetos")({
  component: ProjetosMobile,
});

function ProjetosMobile() {
  const navigate = useNavigate();
  const { data: projects = [] } = useQuery({
    queryKey: ["projects-list"],
    queryFn: async () => (await supabase.from("projects").select("id,name,status").order("name")).data ?? [],
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await supabase.from("tasks").select("*")).data ?? [],
  });

  const stats = useMemo(() => {
    const m = new Map<string, { open: number; done: number; overdue: number }>();
    (tasks as any[]).forEach((t) => {
      if (!t.project_id) return;
      const s = m.get(t.project_id) ?? { open: 0, done: 0, overdue: 0 };
      if (t.status === "concluido") s.done++;
      else {
        s.open++;
        if (t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))) s.overdue++;
      }
      m.set(t.project_id, s);
    });
    return m;
  }, [tasks]);

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Projetos</h1>

      <div className="space-y-3">
        {(projects as any[]).map((p) => {
          const s = stats.get(p.id) ?? { open: 0, done: 0, overdue: 0 };
          return (
            <Card
              key={p.id}
              className="rounded-2xl p-4 cursor-pointer hover:bg-accent/40 transition"
              onClick={() => navigate({ to: "/projetos/$id", params: { id: p.id } })}
            >
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-[#00D084]/10 text-[#00D084] flex items-center justify-center">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  <div className="flex gap-3 mt-1 text-xs">
                    <span className="text-muted-foreground">{s.open} abertas</span>
                    <span className="text-emerald-600">{s.done} concluídas</span>
                    {s.overdue > 0 && <span className="text-rose-600 font-medium">{s.overdue} atrasadas</span>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Card>
          );
        })}
        {projects.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground rounded-2xl">
            Nenhum projeto ainda.
          </Card>
        )}
      </div>
    </div>
  );
}
