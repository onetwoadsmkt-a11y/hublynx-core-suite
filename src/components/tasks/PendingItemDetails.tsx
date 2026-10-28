import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle, Building2, CalendarClock, ExternalLink, FolderKanban, Mail, MapPin, Pencil, Phone, User as UserIcon, Video,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PRIORITY_LABEL, PRIORITY_TONE, type Priority } from "@/components/tasks/TaskDrawer";
import { openLeadCard } from "@/components/pipeline/LeadCardHost";
import { LeadTaskNotes } from "@/components/pipeline/LeadTaskActions";
import { isOverdue } from "@/lib/tasks/pending";
import type { PendingItem } from "@/hooks/usePendingItems";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = { tarefa: "Tarefa", reuniao: "Reunião", call: "Ligação", follow_up: "Follow-up" };
const PROJECT_STATUS: Record<string, string> = {
  planejamento: "Planejamento", em_andamento: "Em andamento", aguardando: "Aguardando", concluido: "Concluído",
  cancelado: "Cancelado", ativo: "Ativo", aguardando_cliente: "Aguardando cliente", em_pausa: "Em pausa",
};

function whenLabel(item: PendingItem) {
  if (!item.due_date) return "Sem data";
  const d = parseISO(item.due_date);
  if (!isValid(d)) return "Sem data";
  const allDay = !item.leadTask && /T00:00(:00(\.0+)?)?(Z|\+00:?00)?$|^\d{4}-\d{2}-\d{2}$/.test(item.due_date);
  if (allDay) return format(parseISO(item.due_date.slice(0, 10)), "EEEE, d 'de' MMMM", { locale: ptBR });
  const mins = item.leadTask?.duration_minutes ?? null;
  const end = mins ? new Date(d.getTime() + mins * 60_000) : null;
  return `${format(d, "EEEE, d 'de' MMMM · HH:mm", { locale: ptBR })}${end ? ` – ${format(end, "HH:mm")}` : ""}`;
}

function stripHtml(html: string | null | undefined) {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

/** Bloco do lead vinculado, com botão para o cartão do Pipeline. */
function LeadBlock({ leadId }: { leadId: string }) {
  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead-mini", leadId],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, name, company, email, phone, city, state, value, stage_id, pipeline_stages(name)")
        .eq("id", leadId)
        .maybeSingle();
      return data as any;
    },
    staleTime: 60_000,
  });
  return (
    <section className="space-y-2 rounded-xl border bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <UserIcon className="h-3.5 w-3.5" /> Lead
      </p>
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : !lead ? (
        <p className="text-xs text-muted-foreground">Lead não encontrado ou sem acesso.</p>
      ) : (
        <>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{lead.name}</p>
            {lead.company && lead.company !== lead.name && <p className="truncate text-xs text-muted-foreground">{lead.company}</p>}
          </div>
          <div className="grid gap-1 text-xs text-muted-foreground">
            {lead.pipeline_stages?.name && <span>Etapa: <span className="font-medium text-foreground">{lead.pipeline_stages.name}</span></span>}
            {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 truncate hover:underline"><Mail className="h-3 w-3 shrink-0" />{lead.email}</a>}
            {lead.phone && <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 hover:underline"><Phone className="h-3 w-3 shrink-0" />{lead.phone}</a>}
            {(lead.city || lead.state) && <span className="flex items-center gap-1.5"><MapPin className="h-3 w-3 shrink-0" />{[lead.city, lead.state].filter(Boolean).join(" — ")}</span>}
          </div>
        </>
      )}
      <Button size="sm" className="w-full" onClick={() => openLeadCard(leadId)}>
        <UserIcon className="mr-1.5 h-4 w-4" /> Abrir cartão do lead
      </Button>
    </section>
  );
}

/** Bloco do projeto vinculado, com botão para abrir o projeto. */
function ProjectBlock({ projectId, taskId, onNavigate }: { projectId: string; taskId?: string; onNavigate?: () => void }) {
  const { data: project } = useQuery({
    queryKey: ["project-mini", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id, name, status, progress, due_date").eq("id", projectId).maybeSingle();
      return data as any;
    },
    staleTime: 60_000,
  });
  if (!project) return null;
  return (
    <section className="space-y-2 rounded-xl border bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <FolderKanban className="h-3.5 w-3.5" /> Projeto
      </p>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold">{project.name}</p>
        <span className="shrink-0 text-xs font-semibold text-primary">{project.progress ?? 0}%</span>
      </div>
      <Progress value={project.progress ?? 0} className="h-1.5" />
      <p className="text-xs text-muted-foreground">
        {PROJECT_STATUS[project.status] ?? project.status}
        {project.due_date ? ` · Prazo ${format(parseISO(project.due_date), "dd/MM/yyyy")}` : ""}
      </p>
      <Button asChild size="sm" variant="outline" className="w-full">
        <Link
          to="/projetos/$id"
          params={{ id: project.id }}
          search={(taskId ? { aba: "etapas", tarefa: taskId } : {}) as any}
          onClick={onNavigate}
        >
          <ExternalLink className="mr-1.5 h-4 w-4" /> {taskId ? "Abrir a tarefa na etapa do projeto" : "Abrir projeto"}
        </Link>
      </Button>
    </section>
  );
}

function ClientLine({ clientId }: { clientId: string }) {
  const { data: client } = useQuery({
    queryKey: ["client-mini", clientId],
    queryFn: async () => (await supabase.from("clients").select("id, name").eq("id", clientId).maybeSingle()).data as any,
    staleTime: 60_000,
  });
  if (!client) return null;
  return <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Building2 className="h-3.5 w-3.5" /> Cliente: <span className="font-medium text-foreground">{client.name}</span></p>;
}

/**
 * Detalhe de uma tarefa ou agendamento dentro do dia, no estilo do Google Agenda:
 * horário, Meet, observações e o lead e/ou projeto vinculados, com botões para abrir.
 */
export function PendingItemDetails({
  item, onEdit, onNavigate, className,
}: { item: PendingItem; onEdit?: () => void; onNavigate?: () => void; className?: string }) {
  const lead = item.leadTask;
  const overdue = isOverdue(item);
  const kind = lead?.kind ?? (item.briefing?.type === "reuniao" ? "reuniao" : "tarefa");
  const meet = lead?.meet_link ?? null;
  const description = lead ? null : stripHtml(item.description);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-start gap-2">
        <span className={cn("mt-1.5 h-3 w-3 shrink-0 rounded", overdue ? "bg-destructive" : lead ? "bg-amber-500" : "bg-primary")} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-base font-semibold leading-snug", overdue && "text-destructive")}>{item.title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" /> {whenLabel(item)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-[10px]">{KIND_LABEL[kind] ?? kind}</Badge>
        <Badge variant="outline" className={cn("text-[10px]", PRIORITY_TONE[item.priority as Priority])}>{PRIORITY_LABEL[item.priority as Priority]}</Badge>
        {overdue && <Badge className="bg-destructive text-[10px] text-destructive-foreground"><AlertTriangle className="mr-1 h-3 w-3" />Atrasada</Badge>}
        {(item.status === "concluido") && <Badge variant="secondary" className="text-[10px]">Concluída</Badge>}
      </div>

      {meet && (
        <Button asChild size="sm" className="w-full bg-blue-600 text-white hover:bg-blue-700">
          <a href={meet} target="_blank" rel="noreferrer"><Video className="mr-1.5 h-4 w-4" /> Entrar com o Google Meet</a>
        </Button>
      )}

      {lead ? <LeadTaskNotes notes={lead.notes} /> : description ? (
        <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{description}</p>
      ) : null}

      {lead && <LeadBlock leadId={lead.lead_id} />}
      {item.project_id && <ProjectBlock projectId={item.project_id} taskId={lead ? undefined : item.id} onNavigate={onNavigate} />}
      {!lead && item.client_id && <ClientLine clientId={item.client_id} />}

      {onEdit && (
        <Button variant="outline" size="sm" className="w-full" onClick={onEdit}>
          <Pencil className="mr-1.5 h-4 w-4" /> {lead ? "Abrir agendamento (observação, concluir, próxima ação)" : "Abrir tarefa"}
        </Button>
      )}
    </div>
  );
}
