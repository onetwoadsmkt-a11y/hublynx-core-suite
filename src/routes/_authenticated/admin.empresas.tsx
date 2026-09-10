import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  listOrganizations,
  saveOrganization,
  setOrganizationModule,
  listOrgMembers,
  addOrgMemberByEmail,
  setUserModulePermission,
  setOrgMembership,
  type AdminOrg,
  type ModuleRow,
} from "@/lib/platform/platform.functions";

export const Route = createFileRoute("/_authenticated/admin/empresas")({
  head: () => ({
    meta: [
      { title: "Empresas — Central Administrativa Hublynx" },
      { name: "description", content: "Cadastre empresas, defina status, usuários contratados e módulos liberados." },
      { property: "og:title", content: "Empresas — Central Administrativa Hublynx" },
      { property: "og:description", content: "Gestão de empresas e módulos da plataforma Hublynx." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminCompanies,
});

const STATUS: Record<string, string> = {
  active: "Ativa",
  trial: "Teste",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

function AdminCompanies() {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrganizations);
  const saveFn = useServerFn(saveOrganization);
  const moduleFn = useServerFn(setOrganizationModule);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminOrg | null>(null);

  const q = useQuery({ queryKey: ["admin-orgs"], queryFn: () => listFn(), staleTime: 30_000 });
  const orgs = q.data?.organizations ?? [];
  const modules: ModuleRow[] = q.data?.modules ?? [];

  const modMut = useMutation({
    mutationFn: (v: { organization_id: string; module_id: string; enabled: boolean }) =>
      moduleFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      qc.invalidateQueries({ queryKey: ["my-org-access"] });
      toast.success("Módulos atualizados");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Empresas</h1>
          <p className="text-sm text-muted-foreground">
            Cada empresa tem seus próprios dados, usuários e módulos liberados.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Nova empresa
        </Button>
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="space-y-3">
          {orgs.map((o) => (
            <Card key={o.id} className="rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{o.name}</p>
                    <Badge variant="secondary">{STATUS[o.status] ?? o.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {o.members} usuário(s) ativo(s) · {o.contracted_users} contratado(s) ·{" "}
                    {o.storage_mb.toFixed(1)} MB em arquivos
                  </p>
                  {(o.responsible_name || o.email) && (
                    <p className="text-xs text-muted-foreground">
                      {[o.responsible_name, o.email, o.phone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Editar empresa"
                  onClick={() => { setEditing(o); setOpen(true); }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-4 border-t pt-3">
                {modules.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={o.modules.includes(m.code)}
                      onCheckedChange={(v) =>
                        modMut.mutate({ organization_id: o.id, module_id: m.id, enabled: v })
                      }
                    />
                    {m.name}
                  </label>
                ))}
              </div>

              <OrgMembers org={o} modules={modules} />
            </Card>
          ))}
        </div>
      )}

      <OrgDialog
        open={open}
        onOpenChange={setOpen}
        org={editing}
        onSaved={() => {
          setOpen(false);
          qc.invalidateQueries({ queryKey: ["admin-orgs"] });
        }}
        save={(payload) => saveFn({ data: payload })}
      />
    </div>
  );
}

/** Usuários da empresa e liberação individual de módulos. */
function OrgMembers({ org, modules }: { org: AdminOrg; modules: ModuleRow[] }) {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");

  const listFn = useServerFn(listOrgMembers);
  const addFn = useServerFn(addOrgMemberByEmail);
  const permFn = useServerFn(setUserModulePermission);
  const memberFn = useServerFn(setOrgMembership);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["admin-org-members", org.id],
    queryFn: () => listFn({ data: { organization_id: org.id } }),
    enabled: show,
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-org-members", org.id] });

  const addMut = useMutation({
    mutationFn: (e: string) =>
      addFn({ data: { organization_id: org.id, email: e, role: "user" } }),
    onSuccess: () => { setEmail(""); invalidate(); toast.success("Usuário vinculado à empresa"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const permMut = useMutation({
    mutationFn: (v: { user_id: string; module_id: string; can_access: boolean }) =>
      permFn({ data: { organization_id: org.id, ...v } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (user_id: string) =>
      memberFn({ data: { organization_id: org.id, user_id, role: "user", status: "inactive" } }),
    onSuccess: () => { invalidate(); toast.success("Acesso removido"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const contracted = modules.filter((m) => org.modules.includes(m.code));

  return (
    <div className="border-t pt-3">
      <Button variant="ghost" size="sm" className="gap-2" onClick={() => setShow((s) => !s)}>
        <Users className="h-4 w-4" />
        {show ? "Ocultar usuários" : "Usuários da empresa"}
      </Button>

      {show && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e-mail do usuário já cadastrado"
              className="max-w-xs"
            />
            <Button
              size="sm"
              disabled={!email.trim() || addMut.isPending}
              onClick={() => addMut.mutate(email.trim())}
            >
              Vincular
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando usuários…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum usuário vinculado.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.user_id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.email ?? m.user_id}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.role} • {m.status}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remover acesso"
                      onClick={() => removeMut.mutate(m.user_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-3">
                    {contracted.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        Nenhum módulo contratado pela empresa.
                      </span>
                    ) : (
                      contracted.map((mod) => (
                        <label key={mod.id} className="flex items-center gap-2 text-xs">
                          <Switch
                            checked={m.module_ids.includes(mod.id)}
                            onCheckedChange={(v) =>
                              permMut.mutate({
                                user_id: m.user_id,
                                module_id: mod.id,
                                can_access: v,
                              })
                            }
                          />
                          {mod.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function OrgDialog({
  open, onOpenChange, org, onSaved, save,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  org: AdminOrg | null;
  onSaved: () => void;
  save: (payload: any) => Promise<any>;
}) {
  const [form, setForm] = useState({
    name: "", slug: "", document: "", responsible_name: "", email: "", phone: "",
    status: "active", contracted_users: 3,
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: org?.name ?? "",
      slug: org?.slug ?? "",
      document: org?.document ?? "",
      responsible_name: org?.responsible_name ?? "",
      email: org?.email ?? "",
      phone: org?.phone ?? "",
      status: org?.status ?? "active",
      contracted_users: org?.contracted_users ?? 3,
    });
  }, [open, org]);

  const m = useMutation({
    mutationFn: () =>
      save({
        ...(org ? { id: org.id } : {}),
        name: form.name.trim(),
        slug: form.slug.trim() || null,
        document: form.document.trim() || null,
        responsible_name: form.responsible_name.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        status: form.status,
        contracted_users: Number(form.contracted_users) || 1,
      }),
    onSuccess: () => { toast.success("Empresa salva"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const field = (k: keyof typeof form, label: string, placeholder = "") => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={String(form[k] ?? "")}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{org ? "Editar empresa" : "Nova empresa"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{field("name", "Nome", "Ex.: Valesafe Expansão")}</div>
          {field("slug", "Identificador", "valesafe")}
          {field("document", "CNPJ/CPF")}
          {field("responsible_name", "Responsável")}
          {field("email", "E-mail")}
          {field("phone", "Telefone")}
          <div className="space-y-1.5">
            <Label>Usuários contratados</Label>
            <Input
              type="number"
              min={1}
              value={form.contracted_users}
              onChange={(e) => setForm((f) => ({ ...f, contracted_users: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Situação</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={m.isPending}
            onClick={() => {
              if (!form.name.trim()) return toast.error("Informe o nome da empresa");
              m.mutate();
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
