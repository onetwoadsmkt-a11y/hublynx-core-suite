import { listOrganizations } from "@/lib/platform/platform.functions";
import { ORG_MODULE_LABELS } from "@/lib/org/modules-map";
import type { NewSubscriberInput } from "@/lib/org/access-rules";
import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listSubscribers,
  upsertSubscription,
  createSubscriber,
  cancelSubscription,
} from "@/lib/subscriptions/subscriptions.functions";
import {
  ALL_CAPABILITIES,
  CAPABILITY_LABELS,
  SUBSCRIPTION_STATUSES,
  type Capability,
} from "@/lib/subscriptions/capabilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Users, Wallet, CircleCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/assinaturas")({
  head: () => ({
    meta: [
      { title: "Central de Assinaturas — Hublynx Core" },
      { name: "description", content: "Controle assinantes, planos, status e módulos liberados." },
      { property: "og:title", content: "Central de Assinaturas — Hublynx Core" },
      { property: "og:description", content: "Controle assinantes, planos, status e módulos liberados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!data) throw redirect({ to: "/dashboard" });
  },
  component: SubscriptionsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error instanceof Error ? error.message : String(error)}</div>,
  notFoundComponent: () => <div className="p-6">Não encontrado.</div>,
});

const STATUS_TONE: Record<string, string> = {
  ativo: "bg-emerald-500/15 text-emerald-600",
  trial: "bg-sky-500/15 text-sky-600",
  suspenso: "bg-amber-500/15 text-amber-600",
  cancelado: "bg-destructive/15 text-destructive",
};

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

function SubscriptionsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listSubscribers);
  const upsert = useServerFn(upsertSubscription);
  const create = useServerFn(createSubscriber);
  const setStatus = useServerFn(cancelSubscription);

  const { data, isLoading } = useQuery({ queryKey: ["subscribers"], queryFn: () => list() });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["subscribers"] });

  const saveMut = useMutation({
    mutationFn: (v: Parameters<typeof upsert>[0]["data"]) => upsert({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Assinatura atualizada"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const createMut = useMutation({
    mutationFn: (v: NewSubscriberInput) => create({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Assinante criado"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const statusMut = useMutation({
    mutationFn: (v: { userId: string; status: string }) => setStatus({ data: v }),
    onSuccess: () => { invalidate(); toast.success("Status atualizado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const subs = (data ?? []).filter((r) => r.subscription);
  const mrr = subs
    .filter((r) => r.subscription?.status === "ativo")
    .reduce((a, r) => a + Number(r.subscription?.price_monthly ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Central de Assinaturas</h1>
          <p className="mt-1 text-muted-foreground">
            Controle os assinantes, planos, status e as áreas liberadas de cada conta.
          </p>
        </div>
        <NewSubscriberDialog onCreate={(v) => createMut.mutateAsync(v)} pending={createMut.isPending} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Contas" value={String(data?.length ?? 0)} />
        <StatCard icon={CircleCheck} label="Assinaturas ativas"
          value={String(subs.filter((s) => s.subscription?.status === "ativo").length)} />
        <StatCard icon={Wallet} label="Receita recorrente" value={money(mrr)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Assinantes</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Áreas liberadas</TableHead>
                  <TableHead className="text-right">Mensalidade</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((r) => {
                  const s = r.subscription;
                  const caps = (s?.capabilities ?? []) as Capability[];
                  return (
                    <TableRow key={r.userId}>
                      <TableCell className="font-medium">
                        {s?.account_name || r.fullName || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.email}</TableCell>
                      <TableCell>{s?.plan ?? "—"}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_TONE[s?.status ?? "ativo"] ?? ""} variant="secondary">
                          {s?.status ?? "sem assinatura"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {caps.map((c) => (
                            <span key={c} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                              {CAPABILITY_LABELS[c] ?? c}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money(Number(s?.price_monthly ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.leads}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <EditDialog
                            row={r}
                            onSave={(v) => saveMut.mutate(v)}
                            pending={saveMut.isPending}
                          />
                          {s && s.status === "ativo" && (
                            <Button variant="ghost" size="sm"
                              onClick={() => statusMut.mutate({ userId: r.userId, status: "suspenso" })}>
                              Suspender
                            </Button>
                          )}
                          {s && s.status !== "ativo" && (
                            <Button variant="ghost" size="sm"
                              onClick={() => statusMut.mutate({ userId: r.userId, status: "ativo" })}>
                              Reativar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CapabilityPicker({
  value, onChange,
}: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {ALL_CAPABILITIES.map((c) => (
        <label key={c} className="flex items-center gap-2 rounded-md border p-2 text-sm">
          <Checkbox
            checked={value.includes(c)}
            onCheckedChange={(v) =>
              onChange(v ? [...value, c] : value.filter((x) => x !== c))
            }
          />
          {CAPABILITY_LABELS[c]}
        </label>
      ))}
    </div>
  );
}

function NewSubscriberDialog({
  onCreate, pending,
}: {
  onCreate: (v: NewSubscriberInput) => Promise<unknown>;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountName, setAccountName] = useState("");
  const [plan, setPlan] = useState("comercial");
  const [price, setPrice] = useState("0");
  const [caps, setCaps] = useState<NewSubscriberInput["capabilities"]>(["hub", "comercial", "configuracoes"]);
  const [organizationId, setOrganizationId] = useState("new");
  const [organizationName, setOrganizationName] = useState("");
  const [role, setRole] = useState<NewSubscriberInput["role"]>("user");
  const [moduleCodes, setModuleCodes] = useState<NewSubscriberInput["moduleCodes"]>([]);
  const organizationsFn = useServerFn(listOrganizations);
  const { data: companyData, isError: companyError } = useQuery({ queryKey: ["new-account-organizations"], queryFn: () => organizationsFn(), enabled: open, staleTime: 60_000 });
  const selected = companyData?.organizations.find((o) => o.id === organizationId);
  const available = (["crm", "tasks", "projects"] as const).filter((code) => organizationId === "new" || selected?.modules.includes(code));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> Novo assinante</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Novo assinante</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label>Empresa</Label>
          <Select value={organizationId} onValueChange={(v) => { setOrganizationId(v); setModuleCodes([]); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="new">Criar nova empresa</SelectItem>{companyData?.organizations.filter((o) => ["active", "trial"].includes(o.status)).map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
          </Select>
          {companyError && <p className="text-sm text-destructive">Não foi possível carregar empresas. Tente novamente.</p>}
          {organizationId === "new" && <Input aria-label="Nome da nova empresa" placeholder="Nome da nova empresa" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} />}
          <Label>Papel na empresa</Label>
          <Select value={role} onValueChange={(v) => { if (v === "user" || v === "org_admin" || v === "guest") setRole(v); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="user">Usuário</SelectItem><SelectItem value="org_admin">Administrador da empresa</SelectItem><SelectItem value="guest">Convidado</SelectItem></SelectContent></Select>
          <Label>{organizationId === "new" ? "Módulos da nova empresa" : "Módulos permitidos ao usuário"}</Label>
          <div className="flex flex-wrap gap-3">{available.map((code) => <label key={code} className="flex items-center gap-2 text-sm"><Checkbox checked={moduleCodes.includes(code)} onCheckedChange={(checked) => setModuleCodes(checked === true ? [...moduleCodes, code] : moduleCodes.filter((c) => c !== code))} />{ORG_MODULE_LABELS[code]}</label>)}</div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome da conta</Label>
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Senha</Label>
              <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Plano</Label>
              <Input value={plan} onChange={(e) => setPlan(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Mensalidade (R$)</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Áreas liberadas</Label>
            <CapabilityPicker value={caps} onChange={(values) => setCaps(values as NewSubscriberInput["capabilities"])} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !email || password.length < 6 || !accountName || (organizationId === "new" && !organizationName) || companyError}
            onClick={async () => {
              try {
                await onCreate({ email, password, accountName, plan, priceMonthly: Number(price) || 0, capabilities: caps,
                  ...(organizationId === "new" ? { organizationName } : { organizationId }), role, moduleCodes,
                });
                setPassword(""); setEmail(""); setOpen(false);
              } catch { /* Keep the form available on failure; mutation reports the error. */ }
            }}
          >
            Criar conta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Row = {
  userId: string;
  email: string;
  fullName: string | null;
  subscription: {
    account_name: string; plan: string; status: string; price_monthly: number;
    capabilities: string[]; current_period_end: string | null; notes: string | null;
  } | null;
};

function EditDialog({
  row, onSave, pending,
}: {
  row: Row;
  onSave: (v: {
    userId: string; accountName: string; plan: string; status: string;
    priceMonthly: number; capabilities: string[]; currentPeriodEnd?: string | null;
    notes?: string | null;
  }) => void;
  pending: boolean;
}) {
  const s = row.subscription;
  const [open, setOpen] = useState(false);
  const [accountName, setAccountName] = useState(s?.account_name || row.fullName || row.email);
  const [plan, setPlan] = useState(s?.plan ?? "basico");
  const [status, setStatus] = useState(s?.status ?? "ativo");
  const [price, setPrice] = useState(String(s?.price_monthly ?? 0));
  const [end, setEnd] = useState(s?.current_period_end ?? "");
  const [caps, setCaps] = useState<string[]>(s?.capabilities ?? []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Editar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{row.email}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome da conta</Label>
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Plano</Label>
              <Input value={plan} onChange={(e) => setPlan(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUBSCRIPTION_STATUSES.map((st) => (
                    <SelectItem key={st} value={st}>{st}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mensalidade</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Renovação</Label>
            <Input type="date" value={end ?? ""} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Áreas liberadas</Label>
            <CapabilityPicker value={caps} onChange={setCaps} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() => {
              onSave({
                userId: row.userId, accountName, plan, status,
                priceMonthly: Number(price) || 0, capabilities: caps,
                currentPeriodEnd: end || null,
              });
              setOpen(false);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
