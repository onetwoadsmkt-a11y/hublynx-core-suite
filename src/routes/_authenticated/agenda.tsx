import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, CalendarDays, Video, ExternalLink,
  CheckCircle2, RefreshCw, Plus, Briefcase, User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { ScheduleMeetingDialog } from "@/components/tasks/ScheduleMeetingDialog";
import {
  getAgendaEvents, rescheduleTask, completeTask,
} from "@/lib/agenda/agenda.functions";
import type { AgendaEvent, AgendaSource } from "@/lib/agenda/types";

type View = "day" | "week" | "month";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Hublynx Core" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    view: (s.view === "day" || s.view === "week" || s.view === "month" ? s.view : "week") as View,
    date: typeof s.date === "string" ? s.date : undefined,
    sources: typeof s.sources === "string" ? s.sources : "task,meeting,gcal",
    clientId: typeof s.clientId === "string" ? s.clientId : undefined,
  }),
  component: AgendaPage,
});

const SOURCE_META: Record<AgendaSource, { label: string; dot: string; bg: string; ring: string }> = {
  task: { label: "Tarefa", dot: "bg-primary", bg: "bg-primary/10 text-primary", ring: "ring-primary/20" },
  meeting: { label: "Reunião", dot: "bg-emerald-500", bg: "bg-emerald-500/10 text-emerald-700", ring: "ring-emerald-500/20" },
  gcal: { label: "Google", dot: "bg-blue-500", bg: "bg-blue-500/10 text-blue-700", ring: "ring-blue-500/20" },
};

// ───────── helpers de data ─────────
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const startOfWeek = (d: Date) => { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; };
const startOfMonth = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth(), 1); return x; };
const endOfMonth = (d: Date) => { const x = new Date(d.getFullYear(), d.getMonth()+1, 0); x.setHours(23,59,59,999); return x; };
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", opts).format(d);

function parseDate(s?: string): Date {
  if (!s) return new Date();
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

function getRange(view: View, anchor: Date): { from: Date; to: Date } {
  if (view === "day") return { from: startOfDay(anchor), to: endOfDay(anchor) };
  if (view === "week") {
    const from = startOfWeek(anchor);
    return { from, to: endOfDay(addDays(from, 6)) };
  }
  // month — incluir semanas adjacentes
  const mStart = startOfMonth(anchor);
  const mEnd = endOfMonth(anchor);
  return { from: startOfWeek(mStart), to: endOfDay(addDays(startOfWeek(mEnd), 41)) };
}

function AgendaPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = Route.useSearch();
  const view = search.view;
  const anchor = useMemo(() => parseDate(search.date), [search.date]);
  const activeSources = useMemo(
    () => new Set(search.sources.split(",").filter(Boolean) as AgendaSource[]),
    [search.sources]
  );

  const range = useMemo(() => getRange(view, anchor), [view, anchor]);
  const queryKey = useMemo(
    () => ["agenda", range.from.toISOString(), range.to.toISOString()],
    [range.from, range.to]
  );

  const fetchEvents = useServerFn(getAgendaEvents);
  const { data, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchEvents({ data: { from: range.from.toISOString(), to: range.to.toISOString() } }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Realtime: invalida ao mudar tasks ou meetings
  useEffect(() => {
    const ch = supabase
      .channel("agenda-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["agenda"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "task_communications" }, () => {
        qc.invalidateQueries({ queryKey: ["agenda"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Clientes (filtro)
  const { data: clients = [] } = useQuery({
    queryKey: ["agenda-clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const allEvents = (data?.events ?? []) as AgendaEvent[];
  const events = useMemo(() => allEvents.filter((e) => {
    if (!activeSources.has(e.source)) return false;
    if (search.clientId && e.clientId !== search.clientId) return false;
    return true;
  }), [allEvents, activeSources, search.clientId]);

  const setView = (v: View) =>
    navigate({ to: "/agenda", search: (p: typeof search) => ({ ...p, view: v }), replace: true });
  const setAnchor = (d: Date) =>
    navigate({ to: "/agenda", search: (p: typeof search) => ({ ...p, date: d.toISOString() }), replace: true });
  const toggleSource = (s: AgendaSource) => {
    const next = new Set(activeSources);
    if (next.has(s)) next.delete(s); else next.add(s);
    navigate({ to: "/agenda", search: (p: typeof search) => ({ ...p, sources: Array.from(next).join(",") || "task" }), replace: true });
  };
  const setClient = (id: string) =>
    navigate({ to: "/agenda", search: (p: typeof search) => ({ ...p, clientId: id === "all" ? undefined : id }), replace: true });

  const goPrev = () => setAnchor(view === "day" ? addDays(anchor, -1) : view === "week" ? addDays(anchor, -7) : new Date(anchor.getFullYear(), anchor.getMonth()-1, 1));
  const goNext = () => setAnchor(view === "day" ? addDays(anchor, 1) : view === "week" ? addDays(anchor, 7) : new Date(anchor.getFullYear(), anchor.getMonth()+1, 1));
  const goToday = () => setAnchor(new Date());

  const periodLabel = useMemo(() => {
    if (view === "day") return fmt(anchor, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    if (view === "week") {
      const ws = startOfWeek(anchor); const we = addDays(ws, 6);
      return `${fmt(ws, { day: "2-digit", month: "short" })} – ${fmt(we, { day: "2-digit", month: "short", year: "numeric" })}`;
    }
    return fmt(anchor, { month: "long", year: "numeric" });
  }, [view, anchor]);

  const [meetingOpen, setMeetingOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1600px] px-4 py-4 space-y-3">
        {/* Header estilo Google Calendar */}
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 mr-1">
            <div className="rounded-xl bg-primary/10 p-2">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Agenda</h1>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={goToday}
            className="rounded-full px-4 h-9 border-border/70"
          >
            Hoje
          </Button>

          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={goPrev}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={goNext}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          <h2 className="text-xl font-normal text-foreground capitalize">{periodLabel}</h2>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>

            <div className="flex items-center gap-1 rounded-full border border-border/70 bg-card p-0.5">
              {(["day","week","month"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 h-8 rounded-full text-xs font-medium transition-colors ${
                    view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
                </button>
              ))}
            </div>

            <Button size="sm" className="h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setMeetingOpen(true)}>
              <Video className="h-4 w-4 mr-1.5" /> Reunião
            </Button>
            <Button asChild size="sm" className="h-9 rounded-full">
              <Link to="/tarefas" search={{ task: undefined }}>
                <Plus className="h-4 w-4 mr-1" /> Criar
              </Link>
            </Button>
          </div>
        </header>

        {/* Filtros leves */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            {(Object.keys(SOURCE_META) as AgendaSource[]).map((s) => {
              const active = activeSources.has(s);
              const meta = SOURCE_META[s];
              return (
                <button
                  key={s}
                  onClick={() => toggleSource(s)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 h-7 text-xs transition-all ${
                    active ? "border-border bg-card text-foreground" : "border-transparent bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                  {meta.label}
                </button>
              );
            })}
          </div>
          <Select value={search.clientId ?? "all"} onValueChange={setClient}>
            <SelectTrigger className="h-7 w-[180px] text-xs rounded-full"><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Grid */}
        {view === "day" && <DayView anchor={anchor} events={events} />}
        {view === "week" && <WeekView anchor={anchor} events={events} onPickDay={(d) => { setAnchor(d); setView("day"); }} />}
        {view === "month" && <MonthView anchor={anchor} events={events} onPickDay={(d) => { setAnchor(d); setView("day"); }} />}
      </div>

      <ScheduleMeetingStandalone open={meetingOpen} onClose={() => setMeetingOpen(false)} />
    </div>
  );
}

// ───────── Day View ─────────
function DayView({ anchor, events }: { anchor: Date; events: AgendaEvent[] }) {
  const dayStart = startOfDay(anchor);
  const dayEnd = endOfDay(anchor);
  const inDay = events.filter((e) => {
    const s = new Date(e.start);
    return s >= dayStart && s <= dayEnd;
  });
  const allDay = inDay.filter((e) => e.allDay);
  const timed = inDay.filter((e) => !e.allDay);
  const hours = Array.from({ length: 17 }, (_, i) => i + 6); // 6h–22h

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
        {allDay.length > 0 && (
          <div className="border-b border-border/60 p-3 space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Sem horário</div>
            <div className="flex flex-wrap gap-1.5">
              {allDay.map((e) => <EventChip key={e.id} event={e} />)}
            </div>
          </div>
        )}
        <div className="grid grid-cols-[56px_1fr]">
          {hours.map((h) => (
            <div key={h} className="contents">
              <div className="border-b border-border/40 px-2 py-3 text-[11px] text-muted-foreground text-right">
                {String(h).padStart(2, "0")}:00
              </div>
              <div className="relative border-b border-border/40 min-h-[64px] p-1.5 space-y-1">
                {timed.filter((e) => new Date(e.start).getHours() === h).map((e) => (
                  <EventChip key={e.id} event={e} expanded />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="rounded-2xl border-border/60 shadow-sm p-4 space-y-3 h-fit">
        <div className="text-sm font-medium">Resumo do dia</div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(SOURCE_META) as AgendaSource[]).map((s) => {
            const count = inDay.filter((e) => e.source === s).length;
            return (
              <div key={s} className="rounded-xl border border-border/60 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${SOURCE_META[s].dot}`} />
                  {SOURCE_META[s].label}
                </div>
                <div className="text-2xl font-semibold tabular-nums">{count}</div>
              </div>
            );
          })}
        </div>
        {inDay.length === 0 && (
          <p className="text-xs text-muted-foreground">Nada agendado para este dia.</p>
        )}
      </Card>
    </div>
  );
}

// ───────── Week View ─────────
function WeekView({ anchor, events, onPickDay }: { anchor: Date; events: AgendaEvent[]; onPickDay: (d: Date) => void }) {
  const ws = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const today = new Date();

// ───────── Week View (estilo Google Calendar) ─────────
function WeekView({ anchor, events, onPickDay }: { anchor: Date; events: AgendaEvent[]; onPickDay: (d: Date) => void }) {
  const ws = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const today = new Date();

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border/60">
        {days.map((d) => {
          const isToday = sameDay(d, today);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onPickDay(d)}
              className="px-3 py-3 text-center border-r border-border/40 last:border-r-0 hover:bg-muted/30 transition-colors"
            >
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                {fmt(d, { weekday: "short" }).replace(".", "")}.
              </div>
              <div className={`mt-1 inline-flex items-center justify-center h-8 w-8 rounded-full text-base font-normal ${isToday ? "bg-primary text-primary-foreground font-semibold" : "text-foreground"}`}>
                {d.getDate()}
              </div>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-7 min-h-[560px]">
        {days.map((d) => {
          const dayEvents = events
            .filter((e) => sameDay(new Date(e.start), d))
            .sort((a, b) => a.start.localeCompare(b.start));
          return (
            <div key={d.toISOString()} className="border-r border-border/40 last:border-r-0 p-1.5 space-y-1">
              {dayEvents.map((e) => <EventRow key={e.id} event={e} />)}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ───────── Month View (estilo Google Calendar) ─────────
function MonthView({ anchor, events, onPickDay }: { anchor: Date; events: AgendaEvent[]; onPickDay: (d: Date) => void }) {
  const mStart = startOfMonth(anchor);
  const gridStart = startOfWeek(mStart);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();
  const weekdays = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

  return (
    <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border/60">
        {weekdays.map((w) => (
          <div key={w} className="px-2 py-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground text-center font-medium border-r border-border/40 last:border-r-0">
            {w}.
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {cells.map((d) => {
          const inMonth = d.getMonth() === anchor.getMonth();
          const dayEvents = events
            .filter((e) => sameDay(new Date(e.start), d))
            .sort((a, b) => a.start.localeCompare(b.start));
          const isToday = sameDay(d, today);
          const isFirstOfMonth = d.getDate() === 1;
          return (
            <button
              key={d.toISOString()}
              onClick={() => onPickDay(d)}
              className={`text-left border-r border-b border-border/40 p-1.5 min-h-[112px] hover:bg-muted/30 transition-colors flex flex-col ${inMonth ? "" : "bg-muted/10"}`}
            >
              <div className="flex items-center justify-center mb-1">
                <span className={`inline-flex items-center justify-center h-7 min-w-[28px] px-1.5 rounded-full text-xs font-medium ${
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : inMonth ? "text-foreground" : "text-muted-foreground/60"
                }`}>
                  {isFirstOfMonth ? `${d.getDate()} ${fmt(d, { month: "short" }).replace(".", "")}.` : d.getDate()}
                </span>
              </div>
              <div className="space-y-0.5 flex-1 overflow-hidden">
                {dayEvents.slice(0, 3).map((e) => <EventRow key={e.id} event={e} compact />)}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1.5">+{dayEvents.length - 3} mais</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ───────── Event Chip + Popover ─────────
function EventChip({ event, expanded }: { event: AgendaEvent; expanded?: boolean }) {
  const meta = SOURCE_META[event.source];
  const time = event.allDay
    ? "dia inteiro"
    : fmt(new Date(event.start), { hour: "2-digit", minute: "2-digit" });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`w-full text-left rounded-lg px-2 py-1.5 text-[11px] ring-1 ${meta.bg} ${meta.ring} hover:brightness-95 transition`}
        >
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} flex-shrink-0`} />
            <span className="font-medium tabular-nums">{time}</span>
            <span className="truncate flex-1">{event.title}</span>
          </div>
          {expanded && event.clientName && (
            <div className="mt-0.5 text-[10px] opacity-70 truncate pl-3">
              <UserIcon className="inline h-2.5 w-2.5 mr-1" />{event.clientName}
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 overflow-hidden">
        <EventDetails event={event} />
      </PopoverContent>
    </Popover>
  );
}

function EventDetails({ event }: { event: AgendaEvent }) {
  const qc = useQueryClient();
  const completeFn = useServerFn(completeTask);
  const rescheduleFn = useServerFn(rescheduleTask);
  const meta = SOURCE_META[event.source];

  const complete = useMutation({
    mutationFn: () => completeFn({ data: { taskId: event.taskId! } }),
    onSuccess: () => { toast.success("Tarefa concluída"); qc.invalidateQueries({ queryKey: ["agenda"] }); },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });
  const reschedule = useMutation({
    mutationFn: (iso: string) => rescheduleFn({ data: { taskId: event.taskId!, dueDate: iso } }),
    onSuccess: () => { toast.success("Tarefa reagendada"); qc.invalidateQueries({ queryKey: ["agenda"] }); },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  return (
    <div className="text-sm">
      <div className={`px-3 py-2 ${meta.bg} flex items-center gap-2`}>
        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
        <span className="text-[11px] uppercase tracking-wider font-medium">{meta.label}</span>
      </div>
      <div className="p-3 space-y-2">
        <div className="font-medium leading-snug">{event.title}</div>
        <div className="text-xs text-muted-foreground">
          {event.allDay ? "Dia inteiro" : fmt(new Date(event.start), { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
        </div>
        {event.clientName && (
          <Badge variant="secondary" className="text-[10px]"><UserIcon className="h-3 w-3 mr-1" />{event.clientName}</Badge>
        )}
        {event.projectName && (
          <Badge variant="secondary" className="text-[10px] ml-1"><Briefcase className="h-3 w-3 mr-1" />{event.projectName}</Badge>
        )}
        {event.description && (
          <p className="text-xs text-muted-foreground line-clamp-3">{event.description}</p>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {event.source === "task" && event.taskId && (
            <>
              <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                <Link to="/tarefas" search={{ task: event.taskId }}>Abrir tarefa</Link>
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => complete.mutate()}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Concluir
              </Button>
              <input
                type="datetime-local"
                className="h-7 text-xs rounded border border-border bg-background px-1.5"
                defaultValue={new Date(event.start).toISOString().slice(0,16)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) reschedule.mutate(new Date(v).toISOString());
                }}
              />
            </>
          )}
          {event.source === "meeting" && event.meetLink && (
            <Button asChild size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white">
              <a href={event.meetLink} target="_blank" rel="noreferrer"><Video className="h-3 w-3 mr-1" /> Entrar no Meet</a>
            </Button>
          )}
          {event.source === "meeting" && event.taskId && (
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <Link to="/tarefas" search={{ task: event.taskId }}>Tarefa</Link>
            </Button>
          )}
          {event.source === "gcal" && event.htmlLink && (
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <a href={event.htmlLink} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 mr-1" /> Google Calendar</a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────── Agendar reunião sem task pré-selecionada ─────────
function ScheduleMeetingStandalone({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [taskId, setTaskId] = useState<string>("");
  const { data: tasks = [] } = useQuery({
    queryKey: ["agenda-tasks-pick"],
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("id, title").order("created_at", { ascending: false }).limit(100);
      return (data ?? []) as { id: string; title: string }[];
    },
    enabled: open,
  });

  if (!open) return null;
  if (!taskId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
        <Card className="w-full max-w-md p-5 space-y-3 rounded-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="text-base font-semibold">Selecionar tarefa</div>
          <p className="text-xs text-muted-foreground">A reunião será vinculada à tarefa escolhida.</p>
          <Select value="" onValueChange={setTaskId}>
            <SelectTrigger><SelectValue placeholder="Escolha uma tarefa" /></SelectTrigger>
            <SelectContent>
              {tasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </div>
        </Card>
      </div>
    );
  }
  return (
    <ScheduleMeetingDialog
      open={open}
      onClose={() => { setTaskId(""); onClose(); }}
      taskId={taskId}
      taskTitle={tasks.find((t) => t.id === taskId)?.title ?? "Reunião"}
    />
  );
}
