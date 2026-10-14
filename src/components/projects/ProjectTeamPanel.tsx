import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Lock, Mail, Plus, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  listOrgTeam,
  removeProjectMember,
  revokeProjectClient,
  setProjectMember,
  setProjectsRestricted,
  updateProjectMemberRole,
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
        onDone={refresh}
      />
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
}: {
  m: ProjectMemberRow;
  canManage: boolean;
  onRemove: () => void;
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
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  existing: ProjectMemberRow[];
  onDone: () => void;
}) {
  const listFn = useServerFn(listOrgTeam);
  const addFn = useServerFn(setProjectMember);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<(typeof STAFF_ROLES)[number]>("editor");
  const [label, setLabel] = useState("");
  const teamQ = useQuery({
    queryKey: ["org-team", projectId],
    queryFn: () => listFn({ data: { projectId } }),
    enabled: open,
  });
  const taken = new Set(existing.map((m) => m.user_id).filter(Boolean));
  const options = (teamQ.data ?? []).filter((u) => !taken.has(u.user_id));
  const add = useMutation({
    mutationFn: () =>
      addFn({ data: { projectId, userId, accessRole: role, label: label.trim() || null } }),
    onSuccess: () => {
      toast.success("Pessoa adicionada ao projeto");
      setUserId("");
      setLabel("");
      setRole("editor");
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar pessoa da equipe</DialogTitle>
          <DialogDescription>
            Escolha um usuário da empresa e o papel dele neste projeto.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
            {!teamQ.isLoading && options.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Todos os usuários da empresa já estão no projeto. Novos usuários são criados em
                Administração → Usuários.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Papel no projeto</Label>
            <Select value={role} onValueChange={(v) => setRole(v as (typeof STAFF_ROLES)[number])}>
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!userId || add.isPending} onClick={() => add.mutate()}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InviteClientDialog({
  open,
  onOpenChange,
  projectId,
  defaultClient,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  defaultClient?: { name?: string | null; email?: string | null } | null;
  onDone?: () => void;
}) {
  const inviteFn = useServerFn(inviteProjectClient);
  const [name, setName] = useState(defaultClient?.name ?? "");
  const [email, setEmail] = useState(defaultClient?.email ?? "");
  const [result, setResult] = useState<{ link: string | null; emailSent: boolean } | null>(null);
  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { projectId, name: name.trim(), email: email.trim() } }),
    onSuccess: (r) => {
      setResult({ link: r.link, emailSent: r.emailSent });
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
          <DialogTitle>Convidar cliente para o portal</DialogTitle>
          <DialogDescription>
            O cliente vê o roadmap, conclui as tarefas marcadas como dele e comenta. Não vê valores,
            leads nem tarefas internas.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-3 text-sm">
            <p>
              {result.emailSent
                ? "Convite enviado por e-mail."
                : "Acesso criado. O e-mail não pôde ser enviado automaticamente."}{" "}
              Você também pode mandar o link abaixo pelo WhatsApp (vale por pouco tempo e uma única
              vez).
            </p>
            {result.link && (
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={result.link}
                  className="text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Copiar link"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(result.link!)
                      .then(() => toast.success("Link copiado"));
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
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
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => close(false)}>
                Cancelar
              </Button>
              <Button
                disabled={!name.trim() || !email.trim() || invite.isPending}
                onClick={() => invite.mutate()}
              >
                <Mail className="h-4 w-4" /> {invite.isPending ? "Enviando…" : "Enviar convite"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
