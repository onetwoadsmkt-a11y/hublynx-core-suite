import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ensureDefaultCategories, runRecurringRollover } from "@/lib/finance/finance.functions";
import { FinanceLockScreen } from "@/components/finance/FinanceLockScreen";
import { useValuesUnlocked, lockValues } from "@/lib/security/value-lock";
import { Button } from "@/components/ui/button";
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

const TABS = [
  { to: "/financeiro", label: "Visão Geral" },
  { to: "/financeiro/previsao", label: "Previsão de Faturamento" },
  { to: "/financeiro/recebiveis", label: "Recebíveis" },
  { to: "/financeiro/pagar", label: "Contas a Pagar" },
  { to: "/financeiro/servicos", label: "Linhas de serviço" },
  { to: "/financeiro/conciliacao", label: "Conciliação" },
] as const;

const MORE_TABS = [
  { to: "/financeiro/receber", label: "Contas a Receber (lista)" },
  { to: "/financeiro/calendario", label: "Calendário" },
  { to: "/financeiro/recorrencias", label: "Recorrências" },
  { to: "/financeiro/dre", label: "DRE + Lucratividade" },
  { to: "/financeiro/categorias", label: "Categorias" },
] as const;


function FinanceLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();
  const ensure = useServerFn(ensureDefaultCategories);
  const rollover = useServerFn(runRecurringRollover);
  const search = Route.useSearch();
  const unlocked = useValuesUnlocked();

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

  const moreActive = MORE_TABS.some((t) => pathname === t.to);

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Previsão de faturamento, recebíveis e contas a pagar.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => lockValues()}>
          <Lock className="mr-2 h-4 w-4" /> Bloquear valores
        </Button>
      </div>
      <div className="border-b overflow-x-auto">
        <nav className="flex gap-1 items-center">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  moreActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Mais
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {MORE_TABS.map((t) => (
                <DropdownMenuItem key={t.to} asChild>
                  <Link to={t.to} search={search}>
                    {t.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
