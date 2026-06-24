import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isPast, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, CalendarClock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/hoje")({
  component: HojePage,
});

function HojePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["me-profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("full_name").eq("id", u.user.id).maybeSingle();
      return data;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("due_date", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });

  const today = useMemo(() => tasks.filter((t) => t.due_date && isToday(parseISO(t.due_date))), [tasks]);
  const overdue = useMemo(
    () => tasks.filter((t) => t.status !== "concluido" && t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date))),
    [tasks],
  );
  const pending = today.filter((t) => t.status !== "concluido");
  const done = today.filter((t) => t.status === "concluido");
  const next = pending[0];

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").update({ status: "concluido" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa concluída.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  };

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <header>
        <p className="text-sm text-muted-foreground capitalize">
          {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </p>
        <h1 className="text-2xl font-bold tracking-tight mt-1">
          {greeting()}, {profile?.full_name?.split(" ")[0] ?? "você"} 👋
        </h1>
      </header>

      {next && (
        <Card
          className="rounded-3xl p-5 bg-gradient-to-br from-[#00D084] to-[#00b873] text-white border-0 cursor-pointer"
          onClick={() => navigate({ to: "/app/tarefas/$id", params: { id: next.id } })}
        >
          <p className="text-xs uppercase tracking-wider opacity-80 flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" /> Próxima tarefa
          </p>
          <h2 className="text-xl font-semibold mt-2 leading-tight">{next.title}</h2>
          {next.due_date && (
            <p className="text-sm opacity-90 mt-2">
              {format(parseISO(next.due_date), "HH:mm")}
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <Button
              size="sm"
              variant="secondary"
              className="rounded-full"
              onClick={(e) => { e.stopPropagation(); complete.mutate(next.id); }}
            >
              <Check className="h-4 w-4 mr-1" /> Concluir
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full text-white hover:bg-white/15 hover:text-white"
            >
              Ver tarefa <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Pendentes" value={pending.length} tone="text-amber-600" icon={CalendarClock} />
        <StatCard label="Atrasadas" value={overdue.length} tone="text-rose-600" icon={AlertTriangle} />
        <StatCard label="Concluídas" value={done.length} tone="text-emerald-600" icon={CheckCircle2} />
      </div>

      <section>
        <h3 className="text-sm font-semibold mb-3 px-1">Tarefas de hoje</h3>
        <div className="space-y-2">
          {today.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground rounded-2xl">
              Nenhuma tarefa para hoje. Aproveite! 🌿
            </Card>
          )}
          {today.map((t) => (
            <Card
              key={t.id}
              className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer hover:bg-accent/40 transition"
              onClick={() => navigate({ to: "/app/tarefas/$id", params: { id: t.id } })}
            >
              <button
                onClick={(e) => { e.stopPropagation(); complete.mutate(t.id); }}
                aria-label="Concluir"
                className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                  t.status === "concluido"
                    ? "bg-[#00D084] border-[#00D084] text-white"
                    : "border-muted-foreground/40"
                }`}
              >
                {t.status === "concluido" && <Check className="h-3.5 w-3.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${t.status === "concluido" ? "line-through text-muted-foreground" : ""}`}>
                  {t.title}
                </p>
                {t.due_date && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(parseISO(t.due_date), "HH:mm")}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Card>
          ))}
        </div>
        {today.length > 0 && (
          <Link to="/app/tarefas" className="block text-center text-sm text-[#00D084] font-medium mt-3">
            Ver todas as tarefas
          </Link>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, tone, icon: Icon }: { label: string; value: number; tone: string; icon: any }) {
  return (
    <Card className="rounded-2xl p-3 flex flex-col items-start gap-1">
      <Icon className={`h-4 w-4 ${tone}`} />
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </Card>
  );
}
