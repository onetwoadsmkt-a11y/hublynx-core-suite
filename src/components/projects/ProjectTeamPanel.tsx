import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Lock, Mail, Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getProjectAccess,
  inviteProjectClient,
  inviteTeamMember,
  listOrgTeam,
  removeProjectMember,
  revokeProjectClient,
  setProjectMember,
  setProjectsRestricted,
  updateProjectMemberRole,
  updatePortalSlug,
  type ProjectMemberRow,
} from "@/lib/projects/access.functions";

export const ROLE_INFO: Record<string, { label: string; desc: string; tone: string }> = {
  gestor: {
    label: "Gestor",
    desc: "Tudo no projeto, inclusive equipe, cliente e custos",
    tone: "bg-violet-50 text-violet-700 border-violet-200",
  },
  editor: {
    label: "Editor",
    desc: "Etapas, tarefas, arquivos, notas e custos",
    tone: "bg-blue-50 text-blue-700 border-blue-200",
  },
  executor: {
    label: "Executor",
    desc: "Vê o projeto e atualiza só as tarefas atribuídas a ele",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  visualizador: {
    label: "Visualizador",
    desc: "Somente leitura",
    tone: "bg-slate-100 text-slate-700 border-slate-200",
  },
  cliente: {
    label: "Cliente",
    desc: "Portal do cliente: vê o andamento e conclui as tarefas dele",
    tone: "bg-amber-50 text-amber-800 border-amber-200",
  },
};
const STAFF_ROLES = ["gestor", "editor", "executor", "visualizador"] as const;

export function useProjectAccess(projectId: string) {
  const fn = useServerFn(getProjectAccess);
  return useQuery({
    queryKey: ["project-access", projectId],
    queryFn: () => fn({ data: { projectId } }),
    staleTime: 30_000,
  });
}

export function ProjectTeamPanel({
  projectId,
  defaultClient,
}: {
  projectId: string;
  defaultClient?: { name?: string | null; email?: string | null } | null;
}) {
  const qc = useQueryClient();
  const accessQ = useProjectAccess(projectId);
  const setRoleFn = useServerFn(updateProjectMemberRole);
  const removeFn = useServerFn(removeProjectMember);
  const revokeFn = useServerFn(revokeProjectClient);
  const restrictFn = useServerFn(setProjectsRestricted);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editClient, setEditClient] = useState<ProjectMemberRow | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["project-access", projectId] });
    qc.invalidateQueries({ queryKey: ["project-dashboard", projectId] });
  };

  const roleM = useMutation({
    mutationFn: (v: { id: string; accessRole: (typeof STAFF_ROLES)[number] }) =>
      setRoleFn({ data: v }),
    onSuccess: () => {
      toast.success("Papel atualizado");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeM = useMutation({
    mutationFn: (m: ProjectMemberRow) =>
      m.access_role === "cliente"
        ? revokeFn({ data: { id: m.id } })
        : removeFn({ data: { id: m.id } }),
    onSuccess: () => {
      toast.success("Acesso removido");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const restrictM = useMutation({
    mutationFn: (restricted: boolean) =>
      restrictFn({ data: { organizationId: accessQ.data!.organizationId, restricted } }),
    onSuccess: (_r, restricted) => {
      toast.success(
        restricted
          ? "Cada projeto agora é visto só pela sua equipe"
          : "Toda a equipe da empresa vê todos os projetos",
      );
      refresh();
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (accessQ.isLoading) return <p className="text-sm text-muted-foreground">Carregando equipe…</p>;
  if (accessQ.isError || !accessQ.data) {
    return (
      <p className="text-sm text-rose-600">Não foi possível carregar a equipe deste projeto.</p>
    );
  }
  const a = accessQ.data;
  const clients = a.members.filter((m) => m.access_role === "cliente");
  const staff = a.members.filter((m) => m.access_role !== "cliente");

  return (
    <div className="space-y-5 pb-4">
      {a.isOrgAdmin && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Cada projeto visível só para a sua equipe</p>
              <p className="text-xs text-muted-foreground">
                Ligado: usuários comuns só veem os projetos em que foram adicionados.
                Administradores veem todos. Vale para todos os projetos da empresa.
              </p>
            </div>
          </div>
          <Switch
            checked={a.restricted}
            disabled={restrictM.isPending}
            onCheckedChange={(v) => restrictM.mutate(v)}
            aria-label="Restringir projetos à equipe de cada projeto"
          />
        </Card>
      )}

      <PortalLinkCard
        projectId={projectId}
        url={a.portalUrl}
        slug={a.portalSlug}
        number={a.projectNumber}
        canManage={a.canManage}
        onSaved={refresh}
      />

      {/* Cliente */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4" /> Cliente no portal
          </h3>
          {a.canManage && (
            <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
              <Mail className="h-4 w-4" /> Convidar cliente
            </Button>
          )}
        </div>
        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum cliente com acesso. Convide o cliente para ele acompanhar o projeto e concluir as
            tarefas dele pelo portal.
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {clients.map((m) => (
              <MemberCard
                key={m.id}
                m={m}
                canManage={a.canManage}
                onRemove={() => removeM.mutate(m)}
                onEdit={() => setEditClient(m)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Equipe */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" /> Equipe do projeto
          </h3>
          {a.canManage && (
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" /> Adicionar pessoa
            </Button>
          )}
        </div>
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém adicionado ainda.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {staff.map((m) => (
              <MemberCard
                key={m.id}
                m={m}
                canManage={a.canManage}
                onRemove={() => removeM.mutate(m)}
                onRole={(r) => roleM.mutate({ id: m.id, accessRole: r })}
              />
            ))}
          </div>
        )}
      </section>

      <details className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium text-foreground">
          O que cada papel pode fazer
        </summary>
        <ul className="mt-2 space-y-1">
          {Object.entries(ROLE_INFO).map(([k, v]) => (
            <li key={k}>
              <strong className="text-foreground">{v.label}:</strong> {v.desc}
            </li>
          ))}
        </ul>
      </details>

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        existing={a.members}
        isOrgAdmin={a.isOrgAdmin}
        onDone={refresh}
      />
      {editClient && (
        <InviteClientDialog
          key={editClient.id}
          open
          onOpenChange={(v) => !v && setEditClient(null)}
          projectId={projectId}
          editId={editClient.id}
          defaultClient={{ name: editClient.name, email: editClient.email }}
          onDone={refresh}
        />
      )}
      <InviteClientDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        projectId={projectId}
        defaultClient={defaultClient}
        onDone={refresh}
      />
    </div>
  );
}

function MemberCard({
  m,
  canManage,
  onRemove,
  onRole,
  onEdit,
}: {
  m: ProjectMemberRow;
  canManage: boolean;
  onRemove: () => void;
  onEdit?: () => void;
  onRole?: (r: (typeof STAFF_ROLES)[number]) => void;
}) {
  const info = ROLE_INFO[m.access_role] ?? ROLE_INFO.editor;
  const name = m.name || m.email || "Sem nome";
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {name.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {m.email ?? (m.user_id ? "" : "sem login no sistema")}
          {m.role && m.access_role !== "cliente" ? ` · ${m.role}` : ""}
        </p>
        {m.access_role === "cliente" && m.invited_at && (
          <p className="text-[11px] text-muted-foreground">
            Convidado em {new Date(m.invited_at).toLocaleDateString("pt-BR")}
          </p>
        )}
      </div>
      {canManage && onRole && m.user_id ? (
        <Select
          value={m.access_role}
          onValueChange={(v) => onRole(v as (typeof STAFF_ROLES)[number])}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STAFF_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_INFO[r].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Badge variant="outline" className={`shrink-0 text-[10px] ${info.tone}`}>
          {info.label}
        </Badge>
      )}
      {canManage && onEdit && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          aria-label="Editar nome e e-mail / reenviar acesso"
          title="Editar nome e e-mail / reenviar acesso"
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}
      {canManage && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-rose-600"
          aria-label="Remover acesso"
          onClick={() => {
            if (confirm(`Remover o acesso de ${name} a este projeto?`)) onRemove();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function AddMemberDialog({
  open,
  onOpenChange,
  projectId,
  existing,
  isOrgAdmin,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  existing: ProjectMemberRow[];
  isOrgAdmin: boolean;
  onDone: () => void;
}) {
  const listFn = useServerFn(listOrgTeam);
  const addFn = useServerFn(setProjectMember);
  const inviteFn = useServerFn(inviteTeamMember);
  const [mode, setMode] = useState<"equipe" | "nova">("equipe");
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof STAFF_ROLES)[number]>("editor");
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<TeamInviteResult | null>(null);
  const teamQ = useQuery({
    queryKey: ["org-team", projectId],
    queryFn: () => listFn({ data: { projectId } }),
    enabled: open,
  });
  const taken = new Set(existing.map((m) => m.user_id).filter(Boolean));
  const options = (teamQ.data ?? []).filter((u) => !taken.has(u.user_id));
  const nobodyLeft = !teamQ.isLoading && options.length === 0;
  const effectiveMode = isOrgAdmin && (mode === "nova" || nobodyLeft) ? "nova" : "equipe";

  function reset() {
    setUserId("");
    setName("");
    setEmail("");
    setLabel("");
    setRole("editor");
    setResult(null);
    setMode("equipe");
  }
  function close(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }
  const add = useMutation({
    mutationFn: () =>
      addFn({ data: { projectId, userId, accessRole: role, label: label.trim() || null } }),
    onSuccess: () => {
      toast.success("Pessoa adicionada ao projeto");
      close(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const invite = useMutation({
    mutationFn: () =>
      inviteFn({
        data: {
          projectId,
          name: name.trim(),
          email: email.trim(),
          accessRole: role,
          label: label.trim() || null,
        },
      }),
    onSuccess: (r) => {
      setResult(r);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const teamMessage = (r: TeamInviteResult) =>
    [
      `Olá, ${name.trim().split(/\s+/)[0]}! Seu acesso à equipe do projeto no Core:`,
      "",
      `Link: ${r.portalUrl}`,
      `E-mail: ${r.email}`,
      r.password ? `Senha: ${r.password}` : "Senha: a mesma que você já usa no Core",
    ].join("\n");

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar pessoa ao projeto</DialogTitle>
          <DialogDescription>
            Escolha alguém da equipe da empresa ou convide uma pessoa nova por e-mail.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 text-sm">
            {result.emailSent ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                Pessoa adicionada. Convite enviado de <strong>{result.sentFrom}</strong> para{" "}
                <strong>{result.email}</strong>.
              </p>
            ) : (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                Pessoa adicionada, mas o e-mail não foi enviado: {result.emailError}
              </p>
            )}
            <Label>Dados de acesso (para enviar por WhatsApp)</Label>
            <Textarea readOnly rows={5} value={teamMessage(result)} className="text-xs" />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(teamMessage(result))
                  .then(() => toast.success("Mensagem copiada"))
              }
            >
              <Copy className="h-4 w-4" /> Copiar mensagem
            </Button>
            {!result.password && (
              <p className="text-xs text-muted-foreground">
                Este e-mail já tinha conta no Core; a senha não foi alterada.
              </p>
            )}
            <DialogFooter>
              <Button onClick={() => close(false)}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            {isOrgAdmin && (
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
                {(
                  [
                    ["equipe", "Da equipe"],
                    ["nova", "Pessoa nova"],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setMode(k)}
                    className={`rounded-md px-3 py-1.5 font-medium transition ${
                      effectiveMode === k
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-3">
              {effectiveMode === "equipe" ? (
                <div className="space-y-1.5">
                  <Label>Pessoa</Label>
                  <Select value={userId} onValueChange={setUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder={teamQ.isLoading ? "Carregando…" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((u) => (
                        <SelectItem key={u.user_id} value={u.user_id}>
                          {u.name}
                          {u.email && u.email !== u.name ? ` — ${u.email}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {nobodyLeft && (
                    <p className="text-xs text-muted-foreground">
                      Todos da equipe da empresa já estão no projeto. Peça ao administrador da
                      empresa para convidar uma pessoa nova.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {nobodyLeft && (
                    <p className="text-xs text-muted-foreground">
                      Todos da equipe já estão no projeto. Convide uma pessoa nova: ela recebe
                      e-mail e senha de acesso e passa a ser usuária da empresa no Core.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <Label>Nome</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="pessoa@empresa.com"
                    />
                  </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label>Papel no projeto</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as (typeof STAFF_ROLES)[number])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_INFO[r].label} — {ROLE_INFO[r].desc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Função (opcional)</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ex.: Compras, Arquitetura, Implantação"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => close(false)}>
                Cancelar
              </Button>
              {effectiveMode === "equipe" ? (
                <Button disabled={!userId || add.isPending} onClick={() => add.mutate()}>
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              ) : (
                <Button
                  disabled={!name.trim() || !email.trim() || invite.isPending}
                  onClick={() => invite.mutate()}
                >
                  <Mail className="h-4 w-4" />{" "}
                  {invite.isPending ? "Enviando…" : "Adicionar e enviar convite"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

type TeamInviteResult = Awaited<ReturnType<typeof inviteTeamMember>>;

type InviteResult = Awaited<ReturnType<typeof inviteProjectClient>>;

function accessMessage(r: InviteResult, name: string) {
  const first = name.trim().split(/\s+/)[0] || "";
  return [
    `Olá${first ? `, ${first}` : ""}! Seu acesso ao portal do projeto:`,
    "",
    `Link: ${r.portalUrl}`,
    `E-mail: ${r.email}`,
    r.password ? `Senha: ${r.password}` : "Senha: a mesma que você já usa no Core",
    "",
    r.password ? "No primeiro acesso, troque a senha em “Alterar senha”." : "",
  ]
    .join("\n")
    .trim();
}

export function InviteClientDialog({
  open,
  onOpenChange,
  projectId,
  defaultClient,
  editId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  defaultClient?: { name?: string | null; email?: string | null } | null;
  /** editar um cliente já convidado (nome/e-mail) */
  editId?: string;
  onDone?: () => void;
}) {
  const inviteFn = useServerFn(inviteProjectClient);
  const [name, setName] = useState(defaultClient?.name ?? "");
  const [email, setEmail] = useState(defaultClient?.email ?? "");
  const [result, setResult] = useState<InviteResult | null>(null);
  const invite = useMutation({
    mutationFn: () =>
      inviteFn({
        data: { projectId, name: name.trim(), email: email.trim(), replaceId: editId },
      }),
    onSuccess: (r) => {
      setResult(r);
      onDone?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  function close(v: boolean) {
    if (!v) setResult(null);
    onOpenChange(v);
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editId ? "Editar cliente do portal" : "Convidar cliente para o portal"}
          </DialogTitle>
          <DialogDescription>
            O cliente vê o roadmap, conclui as tarefas marcadas como dele e comenta. Não vê valores,
            leads nem tarefas internas.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 text-sm">
            {result.emailSent ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                {editId ? "Dados atualizados. " : ""}Convite enviado de{" "}
                <strong>{result.sentFrom}</strong> para <strong>{result.email}</strong>.
              </p>
            ) : (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                {editId ? "Dados atualizados e acesso criado" : "Acesso criado"}, mas o e-mail não
                foi enviado: {result.emailError}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Dados de acesso (para enviar por WhatsApp)</Label>
              <Textarea
                readOnly
                rows={6}
                value={accessMessage(result, name)}
                className="text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(accessMessage(result, name))
                    .then(() => toast.success("Mensagem copiada"));
                }}
              >
                <Copy className="h-4 w-4" /> Copiar mensagem
              </Button>
              {!result.password && (
                <p className="text-xs text-muted-foreground">
                  Este e-mail já tem conta de equipe no Core; a senha dele não foi alterada.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => close(false)}>Concluir</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome do cliente</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail de acesso</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@empresa.com"
                />
              </div>
              {editId && (
                <p className="text-xs text-muted-foreground">
                  Ao salvar, o cliente recebe um novo acesso no e-mail informado. Se trocar o
                  e-mail, o acesso do e-mail antigo a este projeto é removido.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => close(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!name.trim() || !email.trim() || invite.isPending}
                onClick={() => invite.mutate()}
              >
                <Mail className="h-4 w-4" />{" "}
                {invite.isPending
                  ? "Enviando…"
                  : editId
                    ? "Salvar e enviar acesso"
                    : "Enviar convite"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PortalLinkCard({
  projectId,
  url,
  slug,
  number,
  canManage,
  onSaved,
}: {
  projectId: string;
  url: string;
  slug: string | null;
  number: number | null;
  canManage: boolean;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(updatePortalSlug);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(slug ?? "");
  const save = useMutation({
    mutationFn: (v: string) => saveFn({ data: { projectId, slug: v } }),
    onSuccess: (r) => {
      toast.success("Link do portal atualizado");
      setValue(r.slug);
      setEditing(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Link do projeto para o cliente
          {number ? <span className="text-muted-foreground"> · Projeto nº {number}</span> : null}
        </p>
        {canManage && !editing && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => {
              setValue(slug ?? "");
              setEditing(true);
            }}
          >
            Personalizar
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">/portal/</span>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="numero-cliente-empresa"
              className="h-8 text-sm"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Padrão: número do projeto, nome do cliente e empresa (ex.:
            12-joao-silva-valesafe-expansao). Deixe em branco para voltar ao padrão.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate(value)}>
              Salvar link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={url}
            className="h-8 text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            aria-label="Copiar link"
            onClick={() =>
              navigator.clipboard?.writeText(url).then(() => toast.success("Link copiado"))
            }
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        O cliente precisa estar convidado (abaixo). Sem login, o link pede para entrar e depois abre
        o projeto.
      </p>
    </Card>
  );
}
