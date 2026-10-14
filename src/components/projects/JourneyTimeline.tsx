import { useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  FileX,
  Flag,
  MessageCircle,
  MessageSquare,
  PencilLine,
  PlusCircle,
  RotateCcw,
  Send,
  UserRound,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Evento do histórico (mesmo formato no portal e no Core). */
export type JourneyItem = {
  at: string;
  kind: string;
  task_id: string | null;
  task: string | null;
  stage: string | null;
  detail: string | null;
  old: string | null;
  actor: string;
  actor_kind: "cliente" | "equipe" | "sistema";
  mine: boolean;
};

const STATUS: Record<string, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

type Filter = "tudo" | "mensagens" | "arquivos" | "tarefas";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "tudo", label: "Tudo" },
  { id: "mensagens", label: "Mensagens" },
  { id: "arquivos", label: "Arquivos" },
  { id: "tarefas", label: "Tarefas e etapas" },
];

function group(kind: string): Filter {
  if (kind === "message" || kind === "comment_added") return "mensagens";
  if (kind === "file_uploaded" || kind === "file_deleted") return "arquivos";
  return "tarefas";
}

function describe(e: JourneyItem) {
  const task = e.task ? `“${e.task}”` : "uma tarefa";
  switch (e.kind) {
    case "status_changed":
      if (e.detail === "concluido")
        return { icon: CheckCircle2, tone: "done", text: `concluiu ${task}` };
      if (e.old === "concluido") return { icon: RotateCcw, tone: "warn", text: `reabriu ${task}` };
      return {
        icon: PencilLine,
        tone: "info",
        text: `mudou ${task} para ${STATUS[e.detail ?? ""] ?? e.detail ?? "—"}`,
      };
    case "comment_added":
      return { icon: MessageSquare, tone: "info", text: `comentou em ${task}`, quote: e.detail };
    case "file_uploaded":
      return { icon: FileText, tone: "file", text: `anexou “${e.detail ?? "arquivo"}” em ${task}` };
    case "file_deleted":
      return { icon: FileX, tone: "warn", text: `removeu “${e.detail ?? "arquivo"}” de ${task}` };
    case "message":
      return { icon: MessageCircle, tone: "info", text: "enviou uma mensagem", quote: e.detail };
    case "stage_done":
      return { icon: Flag, tone: "done", text: `Etapa “${e.stage ?? ""}” concluída`, system: true };
    case "stage_reopened":
      return {
        icon: RotateCcw,
        tone: "warn",
        text: `Etapa “${e.stage ?? ""}” reaberta`,
        system: true,
      };
    case "task_created":
      return { icon: PlusCircle, tone: "info", text: `criou ${task}` };
    case "task_edited":
      return {
        icon: PencilLine,
        tone: "info",
        text: `renomeou “${e.old ?? ""}” para “${e.detail ?? ""}”`,
      };
    case "due_date_changed":
      return {
        icon: CalendarClock,
        tone: "info",
        text: `mudou o prazo de ${task}${e.detail ? ` para ${new Date(e.detail).toLocaleDateString("pt-BR")}` : ""}`,
      };
    case "assignee_changed":
      return { icon: UserRound, tone: "info", text: `mudou o responsável de ${task}` };
    default:
      return { icon: PencilLine, tone: "info", text: e.kind };
  }
}

const TONE: Record<string, string> = {
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  file: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  info: "bg-muted text-muted-foreground",
};

function dayLabel(d: Date) {
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function JourneyTimeline({
  events,
  loading,
  onSend,
  sending,
  placeholder = "Escreva uma mensagem…",
  audience,
}: {
  events: JourneyItem[];
  loading?: boolean;
  onSend?: (body: string) => Promise<unknown> | void;
  sending?: boolean;
  placeholder?: string;
  /** "cliente": fala "Você"/"Equipe"; "equipe": mostra quem é cliente */
  audience: "cliente" | "equipe";
}) {
  const [filter, setFilter] = useState<Filter>("tudo");
  const [body, setBody] = useState("");
  const days = useMemo(() => {
    const list = events.filter((e) => filter === "tudo" || group(e.kind) === filter);
    const out: { label: string; items: JourneyItem[] }[] = [];
    for (const e of list) {
      const label = dayLabel(new Date(e.at));
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [events, filter]);

  async function send() {
    const text = body.trim();
    if (!text || !onSend) return;
    await onSend(text);
    setBody("");
  }

  return (
    <div className="space-y-4">
      {onSend && (
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={placeholder}
            className="min-h-[64px] text-sm"
            maxLength={4000}
          />
          <Button
            type="button"
            disabled={!body.trim() || sending}
            onClick={send}
            className="h-11 shrink-0 gap-1.5"
          >
            <Send className="h-4 w-4" /> Enviar
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar histórico">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              "min-h-9 rounded-full border px-3 text-xs font-medium transition",
              filter === f.id
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando histórico…</p>
      ) : days.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Nada registrado aqui ainda.
        </p>
      ) : (
        <div className="space-y-5">
          {days.map((d) => (
            <div key={d.label}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {d.label}
              </p>
              <ol className="relative space-y-3 border-l pl-5">
                {d.items.map((e, i) => {
                  const info = describe(e);
                  const Icon = info.icon;
                  const who = info.system
                    ? null
                    : audience === "cliente"
                      ? e.mine
                        ? "Você"
                        : e.actor_kind === "cliente"
                          ? e.actor
                          : `${e.actor} (equipe)`
                      : e.actor_kind === "cliente"
                        ? `${e.actor} (cliente)`
                        : e.mine
                          ? "Você"
                          : e.actor;
                  return (
                    <li key={`${e.at}-${i}`} className="relative">
                      <span
                        className={cn(
                          "absolute -left-[31px] top-0 grid h-6 w-6 place-items-center rounded-full ring-4 ring-background",
                          TONE[info.tone],
                        )}
                        aria-hidden="true"
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <p className="text-sm leading-snug">
                        {who && <span className="font-semibold">{who} </span>}
                        <span className={cn(info.system && "font-semibold")}>{info.text}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(e.at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {e.stage && !info.system ? ` · ${e.stage}` : ""}
                      </p>
                      {info.quote && (
                        <p
                          className={cn(
                            "mt-1.5 whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                            e.actor_kind === "cliente"
                              ? "bg-amber-50 dark:bg-amber-500/10"
                              : "bg-muted",
                          )}
                        >
                          {info.quote}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
