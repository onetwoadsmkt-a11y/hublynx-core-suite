import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  getAccountPasswordStatus,
  verifyAccountPassword,
} from "@/lib/security/finance-lock.functions";
import { unlockValues } from "@/lib/security/value-lock";

export function FinanceLockScreen() {
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

  async function handleUnlock(e: React.FormEvent) {
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
        return;
      }
      const res = await verifyFn({ data: { password } });
      if (!res.ok) {
        toast.error("Senha incorreta.");
        return;
      }
      unlockValues();
    } finally {
      setBusy(false);
      setPassword("");
      setConfirm("");
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <form
        onSubmit={handleUnlock}
        className="w-full max-w-sm rounded-xl border bg-card p-8 text-center"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">Área protegida</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {needsSetup
            ? "Sua conta entra com Google e ainda não tem senha. Defina uma senha de acesso para liberar os valores."
            : "Informe a senha da sua conta para visualizar os valores financeiros."}
        </p>

        <div className="mt-5 space-y-3 text-left">
          <div className="space-y-1.5">
            <Label htmlFor="lock-password">{needsSetup ? "Nova senha" : "Senha da conta"}</Label>
            <Input
              id="lock-password"
              type="password"
              autoComplete={needsSetup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          {needsSetup && (
            <div className="space-y-1.5">
              <Label htmlFor="lock-confirm">Confirmar senha</Label>
              <Input
                id="lock-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          )}
        </div>

        <Button type="submit" className="mt-5 w-full" disabled={busy || !password}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          {needsSetup ? "Definir e desbloquear" : "Desbloquear valores"}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          O desbloqueio vale apenas para esta aba do navegador.
        </p>
      </form>
    </div>
  );
}
