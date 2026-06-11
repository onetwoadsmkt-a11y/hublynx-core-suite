import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getDRE, getProfitabilityByClient, getProfitabilityByProject } from "@/lib/finance/finance.functions";
import { MonthYearPicker } from "@/components/finance/MonthYearPicker";
import { brl } from "@/components/finance/KpiCard";

export const Route = createFileRoute("/_authenticated/financeiro/dre")({
  component: DREPage,
});

function DREPage() {
  const navigate = useNavigate();
  const { month, year } = Route.useSearch();
  const dreFn = useServerFn(getDRE);
  const profitClientFn = useServerFn(getProfitabilityByClient);
  const profitProjectFn = useServerFn(getProfitabilityByProject);

  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  const { data: dre } = useQuery({ queryKey: ["finance", "dre", month, year], queryFn: () => dreFn({ data: { month, year } }) });
  const { data: byClient } = useQuery({ queryKey: ["finance", "profit-client", from, to], queryFn: () => profitClientFn({ data: { from, to } }) });
  const { data: byProject } = useQuery({ queryKey: ["finance", "profit-project", from, to], queryFn: () => profitProjectFn({ data: { from, to } }) });

  return (
    <div className="space-y-4">
      <MonthYearPicker
        month={month} year={year}
        onChange={(m, y) => navigate({ to: "/financeiro/dre", search: { month: m, year: y } })}
      />
      <Card className="p-4">
        <h3 className="font-semibold mb-3">DRE Simplificada</h3>
        <Table>
          <TableBody>
            <TableRow><TableCell>Receita Bruta</TableCell><TableCell className="text-right tabular-nums">{brl(dre?.receita_bruta ?? 0)}</TableCell></TableRow>
            <TableRow><TableCell>(−) Custos Operacionais</TableCell><TableCell className="text-right tabular-nums text-red-600">−{brl(dre?.custos_operacionais ?? 0)}</TableCell></TableRow>
            <TableRow><TableCell>(−) Despesas</TableCell><TableCell className="text-right tabular-nums text-red-600">−{brl(dre?.despesas ?? 0)}</TableCell></TableRow>
            <TableRow className="font-semibold border-t-2"><TableCell>= Lucro Líquido</TableCell><TableCell className={`text-right tabular-nums ${(dre?.lucro_liquido ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>{brl(dre?.lucro_liquido ?? 0)}</TableCell></TableRow>
          </TableBody>
        </Table>
      </Card>

      <Tabs defaultValue="cliente">
        <TabsList>
          <TabsTrigger value="cliente">Por Cliente</TabsTrigger>
          <TabsTrigger value="projeto">Por Projeto</TabsTrigger>
        </TabsList>
        <TabsContent value="cliente">
          <ProfitTable rows={byClient ?? []} />
        </TabsContent>
        <TabsContent value="projeto">
          <ProfitTable rows={byProject ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfitTable({ rows }: { rows: Array<{ id: string; name: string; receita: number; custos: number; lucro: number; margem: number }> }) {
  return (
    <Card className="p-0 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead className="text-right">Receita</TableHead>
            <TableHead className="text-right">Custos</TableHead>
            <TableHead className="text-right">Lucro</TableHead>
            <TableHead className="text-right">Margem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sem dados.</TableCell></TableRow>}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="text-right tabular-nums">{brl(r.receita)}</TableCell>
              <TableCell className="text-right tabular-nums">{brl(r.custos)}</TableCell>
              <TableCell className={`text-right tabular-nums ${r.lucro >= 0 ? "text-emerald-600" : "text-red-600"}`}>{brl(r.lucro)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.margem.toFixed(1)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
