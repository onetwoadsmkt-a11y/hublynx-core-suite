import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ensureDefaultCategories, runRecurringRollover } from "@/lib/finance/finance.functions";
import { FinanceLockScreen } from "@/components/finance/FinanceLockScreen";
import { useValuesUnlocked, lockValues } from "@/lib/security/value-lock";
import { Button } from "@/components/ui/button";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — Hublynx Core" }] }),
  validateSearch: (s: Record<string, unknown>): { month?: number; year?: number } => ({
    month: Number(s.month) || new Date().getMonth() + 1,
    year: Number(s.year) || new Date().getFullYear(),
  }),
  component: FinanceLayout,
});

type SubTab = { to: string; label: string };
type Tab = { to: string; label: string; sub?: SubTab[] };

/** Financeiro enxuto: dashboard, receber, pagar, previsão, serviços e categorias. */
const TABS: Tab[] = [
  { to: "/financeiro", label: "Dashboard" },
  { to: "/financeiro/receber", label: "Contas a receber" },
  { to: "/financeiro/pagar", label: "Contas a pagar" },
  { to: "/financeiro/previsao", label: "Previsão de faturamento" },
  { to: "/financeiro/servicos", label: "Serviços" },
  { to: "/financeiro/categorias", label: "Categorias" },
];



function FinanceLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const ensure = useServerFn(ensureDefaultCategories);
  const rollover = useServerFn(runRecurringRollover);
  const search = Route.useSearch();
  const unlocked = useValuesUnlocked();
  const org = useOrgAccess();
  const tabs: Tab[] = org.hasModule("fiscal") ? [...TABS, { to: "/financeiro/fiscal", label: "Fiscal" }] : TABS;

  useEffect(() => {
    if (!unlocked) return;
    ensure().catch(() => {});
    rollover().catch(() => {});
  }, [ensure, rollover, unlocked]);

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

  if (!unlocked) {
    return (
      <div className="container mx-auto px-4 py-6">
        <FinanceLockScreen />
      </div>
    );
  }

  const isActive = (t: Tab) =>
    pathname === t.to || (t.sub ?? []).some((s) => pathname === s.to);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Contas a receber e a pagar, previsão de faturamento, serviços e categorias.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => lockValues()}>
          <Lock className="mr-2 h-4 w-4" /> Bloquear valores
        </Button>
      </div>
      <div className="border-b overflow-x-auto">
        <nav className="flex gap-1 items-center">
          {tabs.map((t) => {
            const active = isActive(t);
            const cls = `px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`;
            if (!t.sub) {
              return (
                <Link key={t.to} to={t.to as "/financeiro"} search={search} className={cls}>
                  {t.label}
                </Link>
              );
            }
            const current = t.sub.find((s) => s.to === pathname);
            return (
              <DropdownMenu key={t.to}>
                <DropdownMenuTrigger asChild>
                  <button className={`${cls} inline-flex items-center gap-1`}>
                    {t.label}
                    {current && current.to !== t.to ? (
                      <span className="text-muted-foreground">· {current.label}</span>
                    ) : null}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {t.sub.map((s) => (
                    <DropdownMenuItem key={s.to} asChild>
                      <Link to={s.to as "/financeiro"} search={search}>
                        {s.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </nav>
      </div>

      <Outlet />
    </div>
  );
}
