import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  getAccountPasswordStatus,
  verifyAccountPassword,
} from "@/lib/security/finance-lock.functions";
import { lockValues, unlockValues, useValuesUnlocked } from "@/lib/security/value-lock";

/**
 * Botão do cabeçalho que mostra ou oculta os valores (negócios, contratos).
 * Antes o desbloqueio só existia dentro do Financeiro; como ele saiu do CRM,
 * a mesma verificação de senha da conta passa a ficar aqui.
 */
export function ValuesLockToggle() {
  const unlocked = useValuesUnlocked();
  const [open, setOpen] = useState(false);

  if (unlocked) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => lockValues()}
        aria-label="Ocultar valores"
        title="Ocultar valores"
      >
        <Eye className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Mostrar valores"
        title="Mostrar valores"
      >
        <EyeOff className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mostrar valores</DialogTitle>
            <DialogDescription>
              Os valores dos negócios ficam ocultos por segurança. Confirme a senha da sua conta
              para exibi-los nesta aba do navegador.
            </DialogDescription>
          </DialogHeader>
          <UnlockForm onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function UnlockForm({ onDone }: { onDone: () => void }) {
  const statusFn = useServerFn(getAccountPasswordStatus);
  const verifyFn = useServerFn(verifyAccountPassword);
  const { data: status } = useQuery({
    queryKey: ["account-password-status"],
    queryFn: () => statusFn(),
    staleTime: 5 * 60_000,
  });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const needsSetup = status ? !status.hasPassword : false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    try {
      if (needsSetup) {
        if (password.length < 8) {
          toast.error("A senha precisa ter ao menos 8 caracteres.");
          return;
        }
        if (password !== confirm) {
          toast.error("As senhas não conferem.");
          return;
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Senha de acesso definida.");
        unlockValues();
        onDone();
        return;
      }
      const res = await verifyFn({ data: { password } });
      if (!res.ok) {
        toast.error("Senha incorreta.");
        return;
      }
      unlockValues();
      onDone();
    } finally {
      setBusy(false);
      setPassword("");
      setConfirm("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {needsSetup && (
        <p className="text-sm text-muted-foreground">
          Sua conta entra com Google e ainda não tem senha. Defina uma senha de acesso.
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="values-password">{needsSetup ? "Nova senha" : "Senha da conta"}</Label>
        <Input
          id="values-password"
          type="password"
          autoComplete={needsSetup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoFocus
        />
      </div>
      {needsSetup && (
        <div className="space-y-1.5">
          <Label htmlFor="values-confirm">Confirmar senha</Label>
          <Input
            id="values-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
          />
        </div>
      )}
      <Button type="submit" className="w-full" disabled={busy || !password}>
        <ShieldCheck className="mr-2 h-4 w-4" />
        {needsSetup ? "Definir e mostrar" : "Mostrar valores"}
      </Button>
    </form>
  );
}
