import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, Check, ChevronRight } from "lucide-react";
import { format, isToday, isPast, parseISO } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/tarefas")({
  component: TarefasMobile,
});

type Filter = "hoje" | "atrasadas" | "pendentes" | "concluidas";

function TarefasMobile() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("hoje");
  const [q, setQ] = useState("");

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*").order("due_date", { ascending: true });
      return data ?? [];
    },
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects-mini"],
    queryFn: async () => (await supabase.from("projects").select("id,name")).data ?? [],
  });
  const projectsById = useMemo(() => new Map((projects as any[]).map((p) => [p.id, p])), [projects]);

  const filtered = useMemo(() => {
    return (tasks as any[]).filter((t) => {
      if (q && !t.title.toLowerCase().includes(q.toLowerCase())) return false;
      if (filter === "concluidas") return t.status === "concluido";
      if (filter === "hoje") return t.due_date && isToday(parseISO(t.due_date));
      if (filter === "atrasadas")
        return t.status !== "concluido" && t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date));
      if (filter === "pendentes") return t.status !== "concluido";
      return true;
    });
  }, [tasks, filter, q]);

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").update({ status: "concluido" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa concluída.");
    },
  });

  const chips: { key: Filter; label: string }[] = [
    { key: "hoje", label: "Hoje" },
    { key: "atrasadas", label: "Atrasadas" },
    { key: "pendentes", label: "Pendentes" },
    { key: "concluidas", label: "Concluídas" },
  ];

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Tarefas</h1>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar tarefa..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9 rounded-full h-11 bg-muted/40 border-0"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={cn(
              "shrink-0 px-4 h-9 rounded-full text-sm font-medium transition",
              filter === c.key
                ? "bg-[#00D084] text-white"
                : "bg-muted text-muted-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card className="p-8 text-center text-sm text-muted-foreground rounded-2xl">
            Nada por aqui.
          </Card>
        )}
        {filtered.map((t: any) => {
          const project = t.project_id ? projectsById.get(t.project_id) : null;
          const isOverdue =
            t.status !== "concluido" && t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date));
          return (
            <Card
              key={t.id}
              className="rounded-2xl p-4 cursor-pointer hover:bg-accent/40 transition"
              onClick={() => navigate({ to: "/app/tarefas/$id", params: { id: t.id } })}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={(e) => { e.stopPropagation(); complete.mutate(t.id); }}
                  className={cn(
                    "h-6 w-6 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0",
                    t.status === "concluido"
                      ? "bg-[#00D084] border-[#00D084] text-white"
                      : "border-muted-foreground/40",
                  )}
                  aria-label="Concluir"
                >
                  {t.status === "concluido" && <Check className="h-3.5 w-3.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn("font-medium", t.status === "concluido" && "line-through text-muted-foreground")}>
                    {t.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                    {project && <span className="truncate">{(project as any).name}</span>}
                    {t.due_date && (
                      <span className={cn(isOverdue && "text-rose-600 font-medium")}>
                        {format(parseISO(t.due_date), "dd/MM HH:mm")}
                      </span>
                    )}
                    {t.priority === "critica" && (
                      <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-medium">Urgente</span>
                    )}
                    {t.priority === "alta" && (
                      <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">Importante</span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
