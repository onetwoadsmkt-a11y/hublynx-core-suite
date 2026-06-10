import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Users } from "lucide-react";
import { listClients, type ClientRow } from "@/lib/clients/clients.functions";
import { ClientCard } from "@/components/clients/ClientCard";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog";
import { ClientDrawer } from "@/components/clients/ClientDrawer";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  status: fallback(z.enum(["todos", "ativo", "prospecto", "inadimplente", "inativo"]), "todos").default("todos"),
  service: fallback(z.string(), "todos").default("todos"),
  sort: fallback(z.enum(["recent", "name", "value"]), "recent").default("recent"),
  view: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [{ title: "Clientes — Hublynx Core" }] }),
  validateSearch: zodValidator(searchSchema),
  component: ClientesPage,
});

function ClientesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/clientes" });
  const listFn = useServerFn(listClients);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listFn(),
  });
  const all = data?.clients ?? [];

  const services = useMemo(() => {
    const set = new Set<string>();
    all.forEach((c) => c.service && set.add(c.service));
    return Array.from(set).sort();
  }, [all]);

  const filtered = useMemo(() => {
    const q = search.q.trim().toLowerCase();
    let rows = all.filter((c) => {
      if (search.status !== "todos" && c.status !== search.status) return false;
      if (search.service !== "todos" && c.service !== search.service) return false;
      if (q) {
        const hay = `${c.name} ${c.company ?? ""} ${c.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (search.sort === "name") rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    else if (search.sort === "value")
      rows = [...rows].sort((a, b) => (b.monthly_value ?? 0) - (a.monthly_value ?? 0));
    return rows;
  }, [all, search]);

  const viewing = useMemo(
    () => (search.view ? all.find((c) => c.id === search.view) ?? null : null),
    [all, search.view],
  );

  function setParam<K extends keyof typeof search>(key: K, value: (typeof search)[K]) {
    navigate({ search: (prev) => ({ ...prev, [key]: value }) });
  }

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" /> Clientes
            </h1>
            <p className="text-sm text-muted-foreground">
              Cadastro, contratos e histórico de cada cliente.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo cliente
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search.q}
              onChange={(e) => setParam("q", e.target.value)}
              placeholder="Buscar nome, empresa, e-mail…"
              className="pl-8"
            />
          </div>
          <Select value={search.status} onValueChange={(v) => setParam("status", v as typeof search.status)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="prospecto">Prospecto</SelectItem>
              <SelectItem value="inadimplente">Inadimplente</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={search.service} onValueChange={(v) => setParam("service", v)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Serviço" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os serviços</SelectItem>
              {services.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={search.sort} onValueChange={(v) => setParam("sort", v as typeof search.sort)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="name">Nome (A–Z)</SelectItem>
              <SelectItem value="value">Maior valor mensal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando clientes…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <Users className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {all.length === 0
                ? "Nenhum cliente cadastrado ainda."
                : "Nenhum cliente corresponde aos filtros."}
            </p>
            {all.length === 0 && (
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro cliente
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <ClientCard
                key={c.id}
                client={c}
                onView={() => setParam("view", c.id)}
                onEdit={() => setEditing(c)}
              />
            ))}
          </div>
        )}
      </div>

      <ClientFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ClientFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        client={editing}
      />
      <ClientDrawer
        client={viewing}
        open={!!viewing}
        onOpenChange={(o) => !o && setParam("view", undefined as never)}
      />
    </AppShell>
  );
}
