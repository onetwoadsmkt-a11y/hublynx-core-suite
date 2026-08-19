import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Money } from "@/components/finance/Money";
import {
  getServiceLines,
  moveContractToServico,
  upsertServico,
} from "@/lib/finance/servicos.functions";

export const Route = createFileRoute("/_authenticated/financeiro/servicos")({
  head: () => ({
    meta: [
      { title: "Linhas de Serviço — Hublynx Core" },
      {
        name: "description",
        content:
          "Receita, fee recorrente, mídia sob gestão e margem por linha de serviço, com contratos agrupados.",
      },
      { property: "og:title", content: "Linhas de Serviço — Hublynx Core" },
      {
        property: "og:description",
        content: "Camada de serviços entre clientes, projetos e o financeiro do Hublynx.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServicosPage,
});

const UNASSIGNED = "__none__";

function pctText(m: number | null) {
  return m === null ? "—" : `${m.toFixed(1).replace(".", ",")}%`;
}

function ServicosPage() {
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [novo, setNovo] = useState("");

  const fn = useServerFn(getServiceLines);
  const { data, isLoading } = useQuery({
    queryKey: ["finance", "service-lines", year],
    queryFn: () => fn({ data: { year } }),
  });

  const moveFn = useServerFn(moveContractToServico);
  const move = useMutation({
    mutationFn: (v: { projectId: string; servicoId: string | null }) => moveFn({ data: v }),
    onSuccess: () => {
      toast.success("Contrato movido de linha");
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createFn = useServerFn(upsertServico);
  const create = useMutation({
    mutationFn: (nome: string) => createFn({ data: { nome, cor: "#22C55E", ativo: true } }),
    onSuccess: () => {
      setNovo("");
      toast.success("Linha criada");
      qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lines = data?.lines ?? [];
  const options = useMemo(() => lines.filter((l) => l.id), [lines]);

  const grouped = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>["contracts"]>();
    for (const c of data?.contracts ?? []) {
      const k = c.servico_id ?? UNASSIGNED;
      const arr = map.get(k) ?? [];
      arr.push(c);
      map.set(k, arr);
    }
    return map;
  }, [data]);

  const groupLabel = (key: string) =>
    key === UNASSIGNED ? "Sem linha de serviço" : (lines.find((l) => l.id === key)?.nome ?? "Linha");

  const groupKeys = useMemo(() => {
    const keys = [...grouped.keys()];
    return keys.sort((a, b) => groupLabel(a).localeCompare(groupLabel(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, lines]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-16 text-center text-sm font-semibold">{year}</span>
          <Button variant="outline" size="icon" onClick={() => setYear((y) => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Input
            placeholder="Nova linha de serviço…"
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            className="h-9 w-56"
          />
          <Button
            size="sm"
            disabled={!novo.trim() || create.isPending}
            onClick={() => create.mutate(novo.trim())}
          >
            <Plus className="mr-1 h-4 w-4" /> Criar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lines.map((l) => (
          <Card
            key={l.id ?? UNASSIGNED}
            className="rounded-[14px] p-4"
            style={{ borderTop: `3px solid ${l.cor}` }}
          >
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{l.nome}</p>
            <p className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.03em]">
              <Money value={l.receita_ano} zeroDash={false} />
            </p>
            <p className="text-[12.2px] text-muted-foreground">receita de {year} · competência</p>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.2px]">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Clientes</dt>
                <dd className="font-mono tabular-nums">{l.clientes}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Fee recorrente</dt>
                <dd><Money value={l.fee_recorrente} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Recebido</dt>
                <dd className="text-emerald-600"><Money value={l.recebido} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Em atraso</dt>
                <dd className={l.em_atraso > 0 ? "text-red-600" : ""}>
                  <Money value={l.em_atraso} />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Mídia sob gestão</dt>
                <dd><Money value={l.midia_sob_gestao} /></dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Custo direto</dt>
                <dd><Money value={l.custo_direto} /></dd>
              </div>
            </dl>

            <div className="mt-3 flex items-center justify-between border-t pt-2 text-[12.2px]">
              <span className="text-muted-foreground">Margem da linha</span>
              <span
                className={`font-mono text-[14.5px] font-semibold tabular-nums ${
                  l.margem !== null && l.margem < 0 ? "text-red-600" : "text-foreground"
                }`}
              >
                {pctText(l.margem)}
              </span>
            </div>
          </Card>
        ))}
        {lines.length === 0 && (
          <Card className="rounded-[14px] p-6 text-center text-sm text-muted-foreground">
            {isLoading ? "Carregando…" : "Nenhuma linha de serviço cadastrada."}
          </Card>
        )}
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
          Contratos por linha de serviço
        </h2>
        <p className="text-[12.2px] text-muted-foreground">
          Mover um contrato leva junto os recebíveis e as despesas dele.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/60">
                <th className="px-2 py-2 text-left font-semibold">Cliente</th>
                <th className="px-2 py-2 text-left font-semibold">Contrato</th>
                <th className="px-2 py-2 text-right font-semibold">Valor mensal</th>
                <th className="px-2 py-2 text-right font-semibold">Receita {year}</th>
                <th className="px-2 py-2 text-left font-semibold">Linha de serviço</th>
              </tr>
            </thead>
            <tbody>
              {groupKeys.map((key) => (
                <Fragment key={key}>
                  <tr className="bg-muted/30">
                    <td colSpan={5} className="px-2 py-1.5 text-[12.2px] font-semibold">
                      {groupLabel(key)}
                    </td>
                  </tr>
                  {(grouped.get(key) ?? []).map((c) => (
                    <tr key={c.id} className="border-b hover:bg-muted/40">
                      <td className="px-2 py-1.5 font-medium">{c.client ?? "—"}</td>
                      <td className="px-2 py-1.5 text-[12.2px] text-muted-foreground">{c.name}</td>
                      <td className="px-2 py-1.5 text-right"><Money value={c.valor_mensal} /></td>
                      <td className="px-2 py-1.5 text-right text-[14.5px] font-semibold">
                        <Money value={c.receita_ano} />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          className="h-8 w-56 rounded-md border bg-background px-2 text-xs"
                          value={c.servico_id ?? ""}
                          onChange={(e) =>
                            move.mutate({
                              projectId: c.id,
                              servicoId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">Sem linha</option>
                          {options.map((o) => (
                            <option key={o.id!} value={o.id!}>
                              {o.nome}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {groupKeys.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    {isLoading ? "Carregando…" : "Nenhum contrato cadastrado."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
