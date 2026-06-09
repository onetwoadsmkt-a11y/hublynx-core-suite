import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckSquare, FolderKanban, DollarSign, Calendar as CalIcon, Users } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Hublynx Core" }] }),
  component: Dashboard,
});

const KPI = [
  { title: "Tarefas para hoje", value: "8", sub: "3 em atraso", subTone: "text-destructive", icon: CheckSquare, color: "bg-primary/10 text-primary" },
  { title: "Projetos ativos", value: "5", sub: "2 em atraso", subTone: "text-destructive", icon: FolderKanban, color: "bg-success/10 text-success" },
  { title: "A receber (7 dias)", value: "R$ 4.850,00", sub: "2 recebimentos", subTone: "text-success", icon: DollarSign, color: "bg-[#7C3AED]/10 text-[#7C3AED]" },
  { title: "Reuniões hoje", value: "2", sub: "Próxima: 15:00", subTone: "text-muted-foreground", icon: CalIcon, color: "bg-warning/15 text-warning-foreground" },
  { title: "Clientes ativos", value: "12", sub: "1 inadimplente", subTone: "text-destructive", icon: Users, color: "bg-primary/10 text-primary" },
];

const TODAY_TASKS = [
  { t: "Criar post sobre expansão das franquias", c: "ValeSafe Franquias", p: "Conteúdo Junho", prio: "Alta", time: "09:00", color: "bg-destructive" },
  { t: "Revisar campanha Google Ads", c: "ValeSafe Franquias", p: "Tráfego Pago", prio: "Média", time: "11:00", color: "bg-warning" },
  { t: "Enviar proposta comercial", c: "Tigs Segurança", p: "Proposta", prio: "Alta", time: "14:00", color: "bg-destructive" },
  { t: "Reunião estratégia de crescimento", c: "W12 Engenharia", p: "Reunião", prio: "Reunião", time: "15:00", color: "bg-primary" },
  { t: "Analisar métricas da campanha", c: "ValeSafe Franquias", p: "Tráfego Pago", prio: "Baixa", time: "16:30", color: "bg-success" },
];

const PROJECTS = [
  { name: "Conteúdo Junho", client: "ValeSafe Franquias", pct: 70, color: "bg-primary" },
  { name: "Campanha Franquias", client: "ValeSafe Franquias", pct: 45, color: "bg-success" },
  { name: "Landing Page", client: "Tigs Segurança", pct: 80, color: "bg-warning" },
  { name: "Tráfego Pago", client: "W12 Engenharia", pct: 30, color: "bg-[#7C3AED]" },
  { name: "Redesign Site", client: "Hublynx", pct: 10, color: "bg-muted-foreground" },
];

const EVENTS = [
  { d: "27", m: "MAI", t: "Reunião com ValeSafe", time: "15:00 - 16:00", type: "Reunião", tone: "bg-primary/10 text-primary" },
  { d: "28", m: "MAI", t: "Revisão de Campanha", time: "10:00 - 11:00", type: "Call", tone: "bg-success/10 text-success" },
  { d: "29", m: "MAI", t: "Entrega de Relatório", time: "09:00 - 10:00", type: "Entrega", tone: "bg-warning/15 text-warning-foreground" },
  { d: "30", m: "MAI", t: "Planejamento Mensal", time: "14:00 - 15:30", type: "Reunião", tone: "bg-[#7C3AED]/10 text-[#7C3AED]" },
];

const seriesA = [3,4,3.5,4.5,4,4.8,4.85].map((v,i)=>({i,v}));
const seriesB = [1,1.2,1,1.4,1.1,1.3,1.24].map((v,i)=>({i,v}));
const seriesC = [2,2.8,2.5,3.1,2.9,3.4,3.61].map((v,i)=>({i,v}));

function Dashboard() {
  const { data: me } = useQuery({
    queryKey: ["me-dash"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", u.user!.id).maybeSingle();
      return p?.full_name?.split(" ")[0] ?? "por aí";
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Bom dia, {me ?? "..."}! 👋</h1>
        <p className="text-muted-foreground mt-1">Aqui está o resumo da sua operação hoje.</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {KPI.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.title} className="border-border/60 shadow-[var(--shadow-soft)]">
              <CardContent className="p-5">
                <div className={`h-10 w-10 rounded-lg ${k.color} flex items-center justify-center`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{k.title}</p>
                <p className="mt-1 text-2xl font-semibold">{k.value}</p>
                <p className={`mt-1 text-xs ${k.subTone}`}>{k.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tarefas do dia */}
        <Card className="shadow-[var(--shadow-soft)]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Tarefas do dia</CardTitle>
            <Button variant="outline" size="sm">Ver todas</Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {TODAY_TASKS.map((t) => (
              <div key={t.t} className="flex items-center gap-3 py-2 group">
                <div className={`w-1 h-10 rounded-full ${t.color}`} />
                <Checkbox />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.t}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.c} • {t.p}</p>
                </div>
                <Badge variant="secondary" className="font-normal">{t.prio}</Badge>
                <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{t.time}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Financeiro */}
        <Card className="shadow-[var(--shadow-soft)]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Financeiro</CardTitle>
            <Button variant="outline" size="sm">Ver relatório</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <FinanceRow label="Receber esta semana" value="R$ 4.850,00" color="#00D084" data={seriesA} />
            <FinanceRow label="Pagar esta semana" value="R$ 1.240,00" color="#EF4444" data={seriesB} />
            <FinanceRow label="Saldo previsto" value="R$ 3.610,00" color="#2563EB" data={seriesC} />
          </CardContent>
        </Card>

        {/* Projetos em andamento */}
        <Card className="shadow-[var(--shadow-soft)]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Projetos em andamento</CardTitle>
            <Button variant="outline" size="sm">Ver todos</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {PROJECTS.map((p) => (
              <div key={p.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.client}</p>
                  </div>
                  <span className="text-xs font-medium tabular-nums">{p.pct}%</span>
                </div>
                <Progress value={p.pct} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Próximos eventos */}
        <Card className="shadow-[var(--shadow-soft)]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Próximos eventos</CardTitle>
            <Button variant="outline" size="sm">Ver agenda</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {EVENTS.map((e) => (
              <div key={e.t} className="flex items-center gap-4">
                <div className="w-12 text-center rounded-lg bg-muted py-2">
                  <div className="text-lg font-semibold leading-none text-primary">{e.d}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{e.m}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{e.t}</p>
                  <p className="text-xs text-muted-foreground">{e.time}</p>
                </div>
                <Badge className={`${e.tone} border-0 font-normal`} variant="secondary">{e.type}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FinanceRow({ label, value, color, data }: { label: string; value: string; color: string; data: { i: number; v: number }[] }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-44 shrink-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold" style={{ color }}>{value}</p>
      </div>
      <div className="flex-1 h-12">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
