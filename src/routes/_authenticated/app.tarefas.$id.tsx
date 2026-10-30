import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/tarefas/$id")({
  component: DetalheTarefa,
});

function DetalheTarefa() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: task } = useQuery({
    queryKey: ["task", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: project } = useQuery({
    queryKey: ["project-of-task", task?.project_id],
    enabled: !!task?.project_id,
    queryFn: async () => (await supabase.from("projects").select("id,name").eq("id", task!.project_id!).maybeSingle()).data,
  });

  const { data: checklists = [] } = useQuery({
    queryKey: ["task-checklist", id],
    queryFn: async () => (await supabase.from("task_checklists").select("*").eq("task_id", id).order("position")).data ?? [],
  });

  const toggleCheck = useMutation({
    mutationFn: async ({ cid, done }: { cid: string; done: boolean }) => {
      const { error } = await supabase.from("task_checklists").update({ done }).eq("id", cid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-checklist", id] }),
  });

  const complete = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tasks").update({ status: "concluido" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", id] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa concluída.");
      navigate({ to: "/app/tarefas" });
    },
  });

  if (!task) return <div className="p-6">Carregando…</div>;

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <button onClick={() => navigate({ to: "/app/tarefas" })} className="flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>

      <Card className="rounded-2xl p-4 grid grid-cols-2 gap-3 text-sm">
        <Info label="Status" value={task.status} />
        <Info label="Prioridade" value={task.priority} />
        <Info label="Prazo" value={task.due_date ? format(parseISO(task.due_date), "dd/MM/yyyy HH:mm") : "—"} />
        <Info label="Projeto" value={project?.name ?? "—"} />
      </Card>

      {task.description && (
        <Card className="rounded-2xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Descrição</p>
          <p className="text-sm whitespace-pre-wrap">{task.description}</p>
        </Card>
      )}

      <Card className="rounded-2xl p-4 space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">Checklist</p>
        {checklists.length === 0 && <p className="text-sm text-muted-foreground">Sem itens.</p>}
        {checklists.map((c: any) => (
          <label key={c.id} className="flex items-center gap-3 text-sm cursor-pointer">
            <button
              onClick={() => toggleCheck.mutate({ cid: c.id, done: !c.done })}
              className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 ${
                c.done ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
              }`}
            >
              {c.done && <Check className="h-3 w-3" />}
            </button>
            <span className={c.done ? "line-through text-muted-foreground" : ""}>{c.label}</span>
          </label>
        ))}
      </Card>

      {task.status !== "concluido" && (
        <Button
          onClick={() => complete.mutate()}
          className="w-full h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-base"
        >
          <Check className="h-5 w-5 mr-2" /> Concluir tarefa
        </Button>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="font-medium mt-0.5 capitalize">{value}</p>
    </div>
  );
}
