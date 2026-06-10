import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Video, ExternalLink, Copy } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function TaskCommunicationsTab({ taskId }: { taskId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["task-communications", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_communications")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        Nenhuma comunicação registrada. Use os botões do card para enviar e-mails ou agendar reuniões.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((c: any) => (
        <div key={c.id} className="rounded-xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className={`rounded-lg p-2 ${c.kind === "email" ? "bg-blue-50 text-blue-600" : "bg-violet-50 text-violet-600"}`}>
              {c.kind === "email" ? <Mail className="h-4 w-4" /> : <Video className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{c.subject ?? (c.kind === "email" ? "E-mail" : "Reunião")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {c.kind === "email" ? "Para " : "Convidados: "}
                {(c.recipients ?? []).join(", ") || "—"}
              </p>
              {c.body_snippet && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.body_snippet}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground tabular-nums">
                <span>
                  {format(new Date(c.start_at ?? c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
                {c.meet_link && (
                  <>
                    <Button
                      variant="ghost" size="sm" className="h-6 px-2 text-[11px]"
                      onClick={() => window.open(c.meet_link, "_blank")}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" /> Abrir Meet
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-6 px-2 text-[11px]"
                      onClick={() => {
                        navigator.clipboard.writeText(c.meet_link);
                        toast.success("Link copiado");
                      }}
                    >
                      <Copy className="h-3 w-3 mr-1" /> Copiar link
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
