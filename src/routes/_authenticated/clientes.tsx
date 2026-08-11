import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Users, Pencil, Eye } from "lucide-react";
import { listClients, type ClientRow } from "@/lib/clients/clients.functions";
import { listProjects } from "@/lib/projects/projects.functions";
import { ClientFormDialog } from "@/components/clients/ClientFormDialog";
import { ClientDrawer } from "@/components/clients/ClientDrawer";

const STATUS_TONE: Record<ClientRow["status"], string> = {
  ativo: "bg-emerald-100 text-emerald-700 border-emerald-200",
  prospecto: "bg-blue-100 text-blue-700 border-blue-200",
  inadimplente: "bg-rose-100 text-rose-700 border-rose-200",
  inativo: "bg-muted text-muted-foreground border-border",
};
const STATUS_LABEL: Record<ClientRow["status"], string> = {
  ativo: "Ativo",
  prospecto: "Prospecto",
  inadimplente: "Inadimplente",
  inativo: "Inativo",
};

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const searchSchema = z.object({
  q: z.string().catch("").default(""),
  status: z.enum(["todos", "ativo", "prospecto", "inadimplente", "inativo"]).catch("todos").default("todos"),
  sort: z.enum(["recent", "name"]).catch("recent").default("recent"),
  view: z.string().uuid().optional(),
});
type ClientesSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({ meta: [{ title: "LEADS — Hublynx Core" }] }),
  validateSearch: (s: Record<string, unknown>): Partial<ClientesSearch> => searchSchema.parse(s),
  component: ClientesPage,
});

function ClientesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/clientes" });
  const listFn = useServerFn(listClients);
  const listProjectsFn = useServerFn(listProjects);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: () => listFn(),
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjectsFn(),
  });
  const all = data?.clients ?? [];

  const projectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (projectsData?.projects ?? []).forEach((p: any) => {
      if (p.client_id) counts[p.client_id] = (counts[p.client_id] ?? 0) + 1;
    });
    return counts;
  }, [projectsData]);

  const filtered = useMemo(() => {
    const q = (search.q ?? "").trim().toLowerCase();
    let rows = all.filter((c) => {
      if (search.status && search.status !== "todos" && c.status !== search.status) return false;
      if (q) {
        const hay = `${c.name} ${c.company ?? ""} ${c.email ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (search.sort === "name") rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [all, search]);

  const viewing = useMemo(
    () => (search.view ? all.find((c) => c.id === search.view) ?? null : null),
    [all, search.view],
  );

  function setParam<K extends keyof ClientesSearch>(key: K, value: ClientesSearch[K]) {
    navigate({ to: "/clientes", search: (prev: Partial<ClientesSearch>) => ({ ...prev, [key]: value }) });
  }

  return (
    <>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" /> LEADS
            </h1>
            <p className="text-sm text-muted-foreground">
              Cadastro e histórico de cada lead.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo lead
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search.q ?? ""}
              onChange={(e) => setParam("q", e.target.value)}
              placeholder="Buscar nome, empresa, e-mail…"
              className="pl-8"
            />
          </div>
          <Select value={search.status ?? "todos"} onValueChange={(v) => setParam("status", v as NonNullable<ClientesSearch["status"]>)}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="ativo">Ativo</SelectItem>
              <SelectItem value="prospecto">Prospecto</SelectItem>
              <SelectItem value="inadimplente">Inadimplente</SelectItem>
              <SelectItem value="inativo">Inativo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={search.sort ?? "recent"} onValueChange={(v) => setParam("sort", v as NonNullable<ClientesSearch["sort"]>)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Mais recentes</SelectItem>
              <SelectItem value="name">Nome (A–Z)</SelectItem>
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
          <div className="border rounded-lg overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Status</TableHead>
                  <TableHead className="hidden md:table-cell">Contato</TableHead>
                  <TableHead className="text-right">Projetos</TableHead>
                  <TableHead className="w-[120px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => setParam("view", c.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                            {initials(c.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{c.name}</p>
                          {c.company && (
                            <p className="text-xs text-muted-foreground truncate">{c.company}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="outline" className={STATUS_TONE[c.status]}>
                        {STATUS_LABEL[c.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      <div className="truncate max-w-[200px]">{c.email || "—"}</div>
                      {(c.phone || c.whatsapp) && (
                        <div className="text-xs">{c.phone || c.whatsapp}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="font-medium">
                        {projectCounts[c.id] ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setParam("view", c.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
    </>
  );
}
