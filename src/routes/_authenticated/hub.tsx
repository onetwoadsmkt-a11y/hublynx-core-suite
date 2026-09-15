import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Calendar, CheckSquare, FolderKanban, Users, DollarSign,
  FolderArchive, Sparkles, ArrowRight, Clock,
} from "lucide-react";
import hubDarkBg from "@/assets/hub-dark-bg.png.asset.json";
import hubLightBg from "@/assets/hub-light-bg.png.asset.json";
import { maskBRL } from "@/lib/security/value-lock";

export const Route = createFileRoute("/_authenticated/hub")({
  head: () => ({ meta: [{ title: "Hub Central — Hublynx Core" }] }),
  component: HubCentral,
});

const QUOTES = [
  "A disciplina é a ponte entre metas e conquistas.",
  "Pequenos passos consistentes constroem grandes resultados.",
  "Foco no essencial. O resto é ruído.",
  "Excelência não é um ato, é um hábito.",
  "Hoje é o melhor dia para começar.",
  "Clareza vence complexidade.",
  "Construa algo do qual você terá orgulho amanhã.",
  "A simplicidade é a sofisticação suprema.",
];

const fmtBRL = (n: number) => maskBRL(n, { maximumFractionDigits: 0 });

function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

function HubCentral() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const quote = useMemo(
    () => QUOTES[Math.floor((now.getDate() + now.getHours()) % QUOTES.length)],
    [now],
  );

  const { data: me } = useQuery({
    queryKey: ["hub-me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: p } = await supabase
        .from("profiles").select("full_name").eq("id", u.user!.id).maybeSingle();
      return p?.full_name?.split(" ")[0] ?? "por aí";
    },
  });

  const { data } = useQuery({
    queryKey: ["hub-central"],
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const weekStart = new Date(start); weekStart.setDate(start.getDate() - 7);
      const in14 = new Date(start); in14.setDate(start.getDate() + 14);

      const [tasksDone, projectsActive, clientsActive, proposals,
        nextEvent, nextTask,
        weekTasks, weekProjects, weekClients, weekEvents,
      ] = await Promise.all([
        supabase.from("tasks").select("id", { count: "exact", head: true })
          .eq("status", "concluido").gte("completed_at", weekStart.toISOString()),
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "ativo"),
        supabase.from("clients").select("id", { count: "exact", head: true }).eq("status", "ativo"),
        supabase.from("finances").select("amount")
          .eq("kind", "receber").eq("status", "aberto"),
        supabase.from("events").select("id,title,start_at,clients(name)")
          .gte("start_at", now.toISOString()).lte("start_at", in14.toISOString())
          .order("start_at").limit(1).maybeSingle(),
        supabase.from("tasks").select("id,title,due_date,clients(name)")
          .neq("status", "concluido").gte("due_date", now.toISOString())
          .order("due_date").limit(1).maybeSingle(),
        supabase.from("tasks").select("id", { count: "exact", head: true })
          .eq("status", "concluido").gte("completed_at", weekStart.toISOString()),
        supabase.from("projects").select("id", { count: "exact", head: true })
          .gte("created_at", weekStart.toISOString()),
        supabase.from("clients").select("id", { count: "exact", head: true })
          .gte("created_at", weekStart.toISOString()),
        supabase.from("events").select("id", { count: "exact", head: true })
          .gte("start_at", weekStart.toISOString()).lte("start_at", start.toISOString()),
      ]);

      const proposalsTotal = (proposals.data ?? []).reduce(
        (s, r: any) => s + Number(r.amount || 0), 0,
      );

      return {
        tasksDone: tasksDone.count ?? 0,
        projectsActive: projectsActive.count ?? 0,
        clientsActive: clientsActive.count ?? 0,
        proposalsTotal,
        nextEvent: nextEvent.data,
        nextTask: nextTask.data,
        week: {
          tasks: weekTasks.count ?? 0,
          projects: weekProjects.count ?? 0,
          clients: weekClients.count ?? 0,
          events: weekEvents.count ?? 0,
        },
      };
    },
  });

  const insight = useMemo(() => {
    if (!data) return "Carregando seus dados...";
    if (data.tasksDone >= 10)
      return `Você concluiu ${data.tasksDone} tarefas esta semana. Excelente ritmo.`;
    if (data.projectsActive > 0)
      return `${data.projectsActive} projeto${data.projectsActive > 1 ? "s" : ""} em andamento. Mantenha o foco.`;
    if (data.clientsActive > 0)
      return `${data.clientsActive} cliente${data.clientsActive > 1 ? "s" : ""} ativo${data.clientsActive > 1 ? "s" : ""}. Cuide bem de cada relação.`;
    return "Hoje é um ótimo dia para construir algo novo.";
  }, [data]);

  const dateStr = now.toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const nextAction = data?.nextEvent
    ? {
        icon: Calendar,
        title: data.nextEvent.title,
        subtitle: (data.nextEvent as any).clients?.name ?? "Sem cliente",
        when: new Date(data.nextEvent.start_at).toLocaleString("pt-BR", {
          weekday: "short", day: "2-digit", month: "short",
          hour: "2-digit", minute: "2-digit",
        }),
        to: "/agenda" as const,
        cta: "Ver Agenda",
      }
    : data?.nextTask
    ? {
        icon: CheckSquare,
        title: data.nextTask.title,
        subtitle: (data.nextTask as any).clients?.name ?? "Sem cliente",
        when: data.nextTask.due_date
          ? new Date(data.nextTask.due_date).toLocaleString("pt-BR", {
              weekday: "short", day: "2-digit", month: "short",
              hour: "2-digit", minute: "2-digit",
            })
          : "Sem prazo",
        to: "/tarefas" as const,
        cta: "Ver Tarefas",
      }
    : null;

  const quickLinks = [
    { to: "/projetos", label: "Projetos", icon: FolderKanban },
    { to: "/clientes", label: "Clientes", icon: Users },
    { to: "/agenda", label: "Agenda", icon: Calendar },
    { to: "/financeiro", label: "Financeiro", icon: DollarSign },
    { to: "/arquivos", label: "Arquivos", icon: FolderArchive },
    { to: "/tarefas", label: "Tarefas", icon: CheckSquare },
  ] as const;

  const summary = [
    { emoji: "🔥", text: `${data?.tasksDone ?? 0} tarefas concluídas esta semana` },
    { emoji: "🚀", text: `${data?.projectsActive ?? 0} projetos em andamento` },
    { emoji: "👥", text: `${data?.clientsActive ?? 0} clientes ativos` },
    { emoji: "💰", text: `${fmtBRL(data?.proposalsTotal ?? 0)} em propostas abertas` },
  ];

  const timeline = [
    { label: "Tarefas concluídas", value: data?.week.tasks ?? 0 },
    { label: "Projetos iniciados", value: data?.week.projects ?? 0 },
    { label: "Novos clientes", value: data?.week.clients ?? 0 },
    { label: "Reuniões realizadas", value: data?.week.events ?? 0 },
  ];

  return (
    <div className="relative -m-6 min-h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Light gradient + grid background image */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 dark:hidden"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(244,247,251,0.78) 0%, rgba(232,238,247,0.90) 100%), url(${hubLightBg.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />
      {/* Dark gradient + circuit background image */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 hidden dark:block"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(7,26,61,0.82) 0%, rgba(5,15,36,0.92) 100%), url(${hubDarkBg.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:24px_24px] text-[#071A3D] dark:text-white" />

      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-24 text-[#071A3D] dark:text-white">
        {/* SEÇÃO 1 — Saudação */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-3"
        >
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">
            {greeting()}, {me ?? "..."} <span className="inline-block">👋</span>
          </h1>
          <p className="text-lg text-[#071A3D]/70 dark:text-white/70 italic">"{quote}"</p>
          <p className="flex items-center gap-2 text-sm text-[#071A3D]/55 dark:text-white/50 capitalize">
            <Clock className="h-3.5 w-3.5" />
            {dateStr} · {timeStr}
          </p>
        </motion.section>

        {/* SEÇÃO 2 — Resumo executivo (inline) */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-sm text-[#071A3D]/85 dark:text-white/80"
        >
          {summary.map((s) => (
            <span key={s.text} className="inline-flex items-center gap-2">
              <span className="text-base">{s.emoji}</span>
              {s.text}
            </span>
          ))}
        </motion.section>

        {/* SEÇÃO 3 — Seu dia */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-14"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-[#00A86A] dark:text-[#00D084]/80 mb-4">
            Seu dia
          </p>

          <div className="rounded-2xl border border-[#071A3D]/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] p-6 backdrop-blur-sm">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Vencidas", value: overdue.length, danger: overdue.length > 0 },
                { label: "Hoje", value: todayTasks.length, danger: false },
                { label: "Próximos 7 dias", value: upcoming.length, danger: false },
              ].map((s) => (
                <div key={s.label}>
                  <p
                    className={`text-3xl font-semibold tabular-nums ${
                      s.danger ? "text-rose-600 dark:text-rose-400" : ""
                    }`}
                  >
                    {s.value}
                  </p>
                  <p className="mt-1 text-xs text-[#071A3D]/55 dark:text-white/50">{s.label}</p>
                </div>
              ))}
            </div>

            {topTasks.length > 0 ? (
              <ul className="mt-6 space-y-3 border-t border-[#071A3D]/10 dark:border-white/10 pt-5">
                {topTasks.map((t) => (
                  <li key={t.id} className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-[#071A3D]/55 dark:text-white/50 truncate">
                        {[t.project_name, t.client_name].filter(Boolean).join(" · ") ||
                          "Sem projeto ou cliente"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[#071A3D]/60 dark:text-white/55 tabular-nums">
                      {new Date(t.due_date).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-6 border-t border-[#071A3D]/10 dark:border-white/10 pt-5 text-sm text-[#071A3D]/60 dark:text-white/60">
                Tudo em dia. Nada pendente por agora.
              </p>
            )}

            <Link
              to="/tarefas"
              className="mt-5 inline-flex items-center gap-1.5 text-sm text-[#00A86A] dark:text-[#00D084] hover:underline"
            >
              Ver todas as tarefas <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </motion.section>


        {/* SEÇÃO 4 — Insight Hublynx */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-14 flex items-start gap-3"
        >
          <Sparkles className="h-5 w-5 shrink-0 text-[#00A86A] dark:text-[#00D084] mt-0.5" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#071A3D]/55 dark:text-white/50 mb-1">
              Insight Hublynx
            </p>
            <p className="text-base text-[#071A3D]/90 dark:text-white/85">{insight}</p>
          </div>
        </motion.section>

        {/* SEÇÃO 5 — Acesso rápido */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-14"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-[#071A3D]/55 dark:text-white/50 mb-4">
            Acesso rápido
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {quickLinks.map((q) => {
              const Icon = q.icon;
              return (
                <Link
                  key={q.to}
                  to={q.to}
                  className="group flex items-center gap-3 rounded-xl border border-[#071A3D]/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] px-5 py-4 text-sm font-medium text-[#071A3D]/90 dark:text-white/85 backdrop-blur-sm transition-all hover:border-[#00D084]/40 hover:bg-white dark:hover:bg-white/[0.06]"
                >
                  <Icon className="h-4 w-4 text-[#00A86A] dark:text-[#00D084] transition-transform group-hover:scale-110" />
                  {q.label}
                </Link>
              );
            })}
          </div>
        </motion.section>

        {/* SEÇÃO 6 — Resumo da semana (timeline) */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-14"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-[#071A3D]/55 dark:text-white/50 mb-5">
            Resumo da semana
          </p>
          <ul className="relative space-y-4 border-l border-[#071A3D]/10 dark:border-white/10 pl-5">
            {timeline.map((t) => (
              <li key={t.label} className="relative">
                <span className="absolute -left-[26px] top-1.5 h-2 w-2 rounded-full bg-[#00D084] shadow-[0_0_0_4px_rgba(0,208,132,0.15)]" />
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-[#071A3D]/75 dark:text-white/75">{t.label}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {t.value}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </motion.section>

        {/* SEÇÃO 7 — Mensagem final */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="mt-20 border-t border-[#071A3D]/10 dark:border-white/10 pt-8 text-center"
        >
          <p className="text-sm text-[#071A3D]/70 dark:text-white/65">
            Hoje você avançou mais um passo em direção aos seus objetivos.
          </p>
          <p className="mt-1 text-sm text-[#071A3D]/70 dark:text-white/65">Continue construindo.</p>
          <p className="mt-4 text-xs uppercase tracking-[0.3em] text-[#00A86A] dark:text-[#00D084]/80">
            Hublynx · Digital Business Ecosystem
          </p>
        </motion.section>
      </div>
    </div>
  );
}
