import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Mail, PlugZap, Trash2 } from "lucide-react";
import {
  getMyMailAccount,
  saveMyMailAccount,
  testMyMailAccount,
  disconnectMyMailAccount,
} from "@/lib/mail/imap-smtp.functions";

type Security = "ssl" | "starttls" | "none";

type FormState = {
  displayName: string;
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: Security;
  imapUsername: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: Security;
  smtpUsername: string;
  smtpAuth: boolean;
};

const EMPTY: FormState = {
  displayName: "",
  email: "",
  password: "",
  imapHost: "",
  imapPort: 993,
  imapSecurity: "ssl",
  imapUsername: "",
  smtpHost: "",
  smtpPort: 465,
  smtpSecurity: "ssl",
  smtpUsername: "",
  smtpAuth: true,
};

const SECURITY_OPTIONS: { value: Security; label: string }[] = [
  { value: "ssl", label: "SSL/TLS" },
  { value: "starttls", label: "STARTTLS" },
  { value: "none", label: "Nenhuma (apenas se necessário)" },
];

function StatusBadge({ status }: { status: string | undefined }) {
  if (status === "conectado") return <Badge className="bg-emerald-600 text-white">Conectado</Badge>;
  if (status === "erro") return <Badge variant="destructive">Erro de conexão</Badge>;
  return <Badge variant="secondary">Não conectado</Badge>;
}

export function ImapSmtpCard() {
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["my-mail-account"],
    queryFn: () => getMyMailAccount(),
  });
  const account = data?.account ?? null;

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [userTouched, setUserTouched] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "off" | null>(null);

  useEffect(() => {
    if (!open) return;
    if (account) {
      setForm({
        displayName: account.displayName ?? "",
        email: account.email,
        password: "",
        imapHost: account.imapHost,
        imapPort: account.imapPort,
        imapSecurity: account.imapSecurity as Security,
        imapUsername: account.imapUsername,
        smtpHost: account.smtpHost,
        smtpPort: account.smtpPort,
        smtpSecurity: account.smtpSecurity as Security,
        smtpUsername: account.smtpUsername,
        smtpAuth: account.smtpAuth,
      });
      setUserTouched(true);
    } else {
      setForm(EMPTY);
      setUserTouched(false);
    }
  }, [open, account]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onEmailChange = (value: string) =>
    setForm((f) => ({
      ...f,
      email: value,
      imapUsername: userTouched ? f.imapUsername : value,
      smtpUsername: userTouched ? f.smtpUsername : value,
    }));

  const payload = () => ({
    displayName: form.displayName || null,
    email: form.email,
    imapHost: form.imapHost,
    imapPort: Number(form.imapPort),
    imapSecurity: form.imapSecurity,
    imapUsername: form.imapUsername || form.email,
    smtpHost: form.smtpHost,
    smtpPort: Number(form.smtpPort),
    smtpSecurity: form.smtpSecurity,
    smtpUsername: form.smtpAuth ? form.smtpUsername || form.imapUsername || form.email : form.email,
    smtpAuth: form.smtpAuth,
    password: form.password || null,
  });

  const runTest = async (fromDialog: boolean) => {
    setBusy("test");
    try {
      const source = fromDialog
        ? payload()
        : account && {
            displayName: account.displayName,
            email: account.email,
            imapHost: account.imapHost,
            imapPort: account.imapPort,
            imapSecurity: account.imapSecurity,
            imapUsername: account.imapUsername,
            smtpHost: account.smtpHost,
            smtpPort: account.smtpPort,
            smtpSecurity: account.smtpSecurity,
            smtpUsername: account.smtpUsername,
            smtpAuth: account.smtpAuth,
            password: null,
          };
      if (!source) return;
      const { results } = await testMyMailAccount({ data: source as never });
      for (const r of results) {
        if (r.ok) toast.success(r.message);
        else toast.error(r.message);
      }
      await refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      await saveMyMailAccount({ data: payload() as never });
      toast.success("Configuração salva");
      setOpen(false);
      await refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy("off");
    try {
      await disconnectMyMailAccount();
      toast.success("Conta de e-mail desconectada");
      await refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4" /> Outro provedor de e-mail
        </CardTitle>
        <CardDescription>
          Conecte contas que não usam Gmail/Google Workspace por IMAP e SMTP. As credenciais são
          guardadas criptografadas e usadas apenas pelo servidor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : account ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{account.email}</span>
              <StatusBadge status={account.status} />
              {account.displayName ? (
                <span className="text-sm text-muted-foreground">{account.displayName}</span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              IMAP {account.imapHost}:{account.imapPort} • SMTP {account.smtpHost}:
              {account.smtpPort}
              {account.lastTestedAt
                ? ` • último teste em ${new Date(account.lastTestedAt).toLocaleString("pt-BR")}`
                : ""}
            </p>
            {account.status === "erro" && account.lastError ? (
              <p className="text-xs text-destructive">{account.lastError}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => runTest(false)} disabled={busy !== null}>
                {busy === "test" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
                Testar conexão
              </Button>
              <Button variant="outline" onClick={() => setOpen(true)} disabled={busy !== null}>
                Editar configuração
              </Button>
              <Button variant="ghost" onClick={disconnect} disabled={busy !== null}>
                <Trash2 className="mr-2 h-4 w-4" /> Desconectar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status="nao_conectado" />
            <Button onClick={() => setOpen(true)}>Configurar IMAP/SMTP</Button>
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Outro provedor (IMAP/SMTP)</DialogTitle>
            <DialogDescription>
              Informe os dados fornecidos pelo seu provedor de e-mail. A senha é enviada direto ao
              servidor e nunca fica visível depois de salva.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="mail-name">Nome da conta (opcional)</Label>
              <Input
                id="mail-name"
                value={form.displayName}
                onChange={(e) => set("displayName", e.target.value)}
                placeholder="Comercial Valesafe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mail-email">E-mail</Label>
              <Input
                id="mail-email"
                type="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="contato@empresa.com.br"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mail-pass">Senha</Label>
              <Input
                id="mail-pass"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder={account?.hasPassword ? "•••••• (manter a atual)" : ""}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-semibold">IMAP (recebimento)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="imap-host">Servidor IMAP</Label>
              <Input id="imap-host" value={form.imapHost} onChange={(e) => set("imapHost", e.target.value)} placeholder="imap.empresa.com.br" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imap-port">Porta IMAP</Label>
              <Input id="imap-port" type="number" value={form.imapPort} onChange={(e) => set("imapPort", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Segurança IMAP</Label>
              <Select value={form.imapSecurity} onValueChange={(v) => set("imapSecurity", v as Security)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECURITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="imap-user">Usuário</Label>
              <Input
                id="imap-user"
                autoComplete="off"
                value={form.imapUsername}
                onChange={(e) => {
                  setUserTouched(true);
                  set("imapUsername", e.target.value);
                }}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-semibold">SMTP (envio)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-host">Servidor SMTP</Label>
              <Input id="smtp-host" value={form.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} placeholder="smtp.empresa.com.br" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-port">Porta SMTP</Label>
              <Input id="smtp-port" type="number" value={form.smtpPort} onChange={(e) => set("smtpPort", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Segurança SMTP</Label>
              <Select value={form.smtpSecurity} onValueChange={(v) => set("smtpSecurity", v as Security)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECURITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-user">Usuário SMTP</Label>
              <Input
                id="smtp-user"
                autoComplete="off"
                value={form.smtpUsername}
                onChange={(e) => set("smtpUsername", e.target.value)}
                disabled={!form.smtpAuth}
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                id="smtp-auth"
                checked={form.smtpAuth}
                onCheckedChange={(v) => {
                  const on = v === true;
                  setForm((f) => ({
                    ...f,
                    smtpAuth: on,
                    smtpUsername: on ? f.smtpUsername || f.imapUsername || f.email : f.smtpUsername,
                  }));
                }}
              />
              <Label htmlFor="smtp-auth" className="cursor-pointer font-normal">
                SMTP requer autenticação (usa o mesmo usuário e senha do IMAP)
              </Label>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => runTest(true)} disabled={busy !== null}>
              {busy === "test" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
              Testar conexão
            </Button>
            <Button onClick={save} disabled={busy !== null}>
              {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
