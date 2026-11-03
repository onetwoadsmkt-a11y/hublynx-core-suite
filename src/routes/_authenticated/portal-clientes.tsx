import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy, ExternalLink, FolderKanban, Globe, Search, ShieldAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { useWorkspace } from "@/hooks/useWorkspace";

export const Route = createFileRoute("/_authenticated/portal-clientes")({
  head: () => ({ meta: [{ title: "Portal do cliente — Core Suite" }] }),
  component: PortalClientesPage,
});

type Row = {
  id: string;
  name: string;
  project_number: number | null;
  portal_slug: string | null;
  status: string | null;
  client: string | null;
  clients: number;
};

const STATUS: Record<string, string> = {
  planejamento: "Planejamento",
  em_andamento: "Em andamento",
  pausado: "Pausado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

/** Acesso ao portal do cliente (só administradores): o link de cada projeto, para abrir ou enviar. */
function PortalClientesPage() {
  const { isAdmin, isLoading } = useIsAdmin();
  const org = useOrgAccess();
  const { activeOrganization } = useWorkspace();
  const allowed = isAdmin || org.isOrgAdmin;
  const orgId = activeOrganization?.id ?? null;
  const [q, setQ] = useState("");
  const [onlyWithClient, setOnlyWithClient] = useState(false);

  const projectsQ = useQuery({
    queryKey: ["portal-clientes", orgId],
    enabled: allowed && !!orgId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase as any)
        .from("projects")
        .select("id, name, project_number, portal_slug, status, clients(name, company)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const list = (data ?? []) as any[];
      const counts = new Map<string, number>();
      if (list.length) {
        const { data: m } = await (supabase as any)
          .from("project_members")
          .select("project_id")
          .in("project_id", list.map((p) => p.id))
          .eq("access_role", "cliente")
          .eq("status", "active");
        for (const r of (m ?? []) as any[]) counts.set(r.project_id, (counts.get(r.project_id) ?? 0) + 1);
      }
      return list.map((p) => ({
        id: p.id,
        name: p.name,
        project_number: p.project_number ?? null,
        portal_slug: p.portal_slug ?? null,
        status: p.status ?? null,
        client: p.clients?.name ?? p.clients?.company ?? null,
        clients: counts.get(p.id) ?? 0,
      }));
    },
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (projectsQ.data ?? []).filter(
      (r) =>
        (!onlyWithClient || r.clients > 0) &&
        (!term || `${r.project_number ?? ""} ${r.name} ${r.client ?? ""}`.toLowerCase().includes(term)),
    );
  }, [projectsQ.data, q, onlyWithClient]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const linkOf = (r: Row) => `${origin}/portal/${r.portal_slug || r.id}`;

  if (isLoading || org.isLoading) return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  if (!allowed)
    return (
      <Card className="mx-auto mt-8 max-w-lg space-y-2 rounded-2xl p-6 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-4 w-4" /> Somente administradores
        </p>
        <p className="text-muted-foreground">O acesso ao portal do cliente pelo menu é exclusivo dos administradores da empresa.</p>
      </Card>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Globe className="h-6 w-6" /> Portal do cliente
          </h1>
          <p className="text-sm text-muted-foreground">
            O link do portal de cada projeto: abra para conferir ou copie para enviar ao cliente. O cliente entra com o
            e-mail e a senha dele.
          </p>
        </div>
        <Button asChild>
          <a href="/portal/entrar" target="_blank" rel="noopener">
            <ExternalLink className="h-4 w-4" /> Abrir tela de entrada do portal
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-md flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar projeto ou cliente…" className="bg-card pl-8" />
        </div>
        <Button variant={onlyWithClient ? "default" : "outline"} className={onlyWithClient ? "" : "bg-card"} onClick={() => setOnlyWithClient((v) => !v)}>
          <Users className="h-4 w-4" /> Só com cliente liberado
        </Button>
      </div>

      {projectsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando projetos…</p>
      ) : rows.length === 0 ? (
        <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">Nenhum projeto encontrado.</Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {r.project_number ? <span className="text-muted-foreground">Nº {r.project_number} · </span> : null}
                  {r.name}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {r.client && <span>{r.client}</span>}
                  {r.status && <Badge variant="outline">{STATUS[r.status] ?? r.status}</Badge>}
                  <span className={r.clients ? "font-semibold text-emerald-700" : ""}>
                    {r.clients ? `${r.clients} cliente(s) com acesso` : "Nenhum cliente com acesso ainda"}
                  </span>
                </p>
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{linkOf(r)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(linkOf(r)).then(
                      () => toast.success("Link do portal copiado"),
                      () => toast.error("Não foi possível copiar"),
                    );
                  }}
                >
                  <Copy className="h-4 w-4" /> Copiar link
                </Button>
                <Button size="sm" asChild>
                  <a href={linkOf(r)} target="_blank" rel="noopener">
                    <ExternalLink className="h-4 w-4" /> Abrir portal
                  </a>
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/projetos/$id" params={{ id: r.id }} search={{ aba: "equipe" } as any}>
                    <FolderKanban className="h-4 w-4" /> Acessos
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
