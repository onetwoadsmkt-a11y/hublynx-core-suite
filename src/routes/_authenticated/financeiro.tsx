import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ensureDefaultCategories, runRecurringRollover } from "@/lib/finance/finance.functions";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Hublynx Core" }] }),
  validateSearch: (s: Record<string, unknown>): { month?: number; year?: number } => ({
    month: Number(s.month) || new Date().getMonth() + 1,
    year: Number(s.year) || new Date().getFullYear(),
  }),
  component: FinanceLayout,
});

const TABS = [
  { to: "/financeiro", label: "Dashboard" },
  { to: "/financeiro/receber", label: "Receber" },
  { to: "/financeiro/recebiveis", label: "Recebíveis (Clientes/Projetos)" },
  { to: "/financeiro/pagar", label: "Pagar" },
  { to: "/financeiro/calendario", label: "Calendário" },
  { to: "/financeiro/recorrencias", label: "Recorrências" },
  { to: "/financeiro/dre", label: "DRE + Lucratividade" },
  { to: "/financeiro/previsao", label: "Previsão" },
  { to: "/financeiro/categorias", label: "Categorias" },
] as const;

function FinanceLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const ensure = useServerFn(ensureDefaultCategories);
  const rollover = useServerFn(runRecurringRollover);
  const search = Route.useSearch();

  useEffect(() => {
    ensure().catch(() => {});
    rollover().catch(() => {});
  }, [ensure, rollover]);

  useEffect(() => {
    const ch = supabase
      .channel("finance-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "finances" }, () =>
        qc.invalidateQueries({ queryKey: ["finance"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "project_costs" }, () =>
        qc.invalidateQueries({ queryKey: ["finance"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Financeiro</h1>
        <p className="text-sm text-muted-foreground">
          Receitas, despesas, fluxo de caixa, lucratividade e previsões.
        </p>
      </div>
      <div className="border-b overflow-x-auto">
        <nav className="flex gap-1">
          {TABS.map((t) => {
            const active = pathname === t.to;
            return (
              <Link
                key={t.to}
                to={t.to}
                search={search}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
