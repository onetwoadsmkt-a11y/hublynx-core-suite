import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

/**
 * Troca de senha da conta. `forced`: primeiro acesso com senha provisória — não fecha
 * até a pessoa criar a senha dela.
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
  forced = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  forced?: boolean;
}) {
  const qc = useQueryClient();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const weak = pw.length > 0 && (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return toast.error("Use pelo menos 8 caracteres, com letras e números.");
    if (pw !== pw2) return toast.error("As duas senhas não são iguais.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw, data: { must_change_password: false } });
    setSaving(false);
    if (error) {
      if (/different from the old/i.test(error.message)) return toast.error("A senha nova precisa ser diferente da provisória.");
      return toast.error(error.message);
    }
    toast.success("Senha atualizada");
    setPw("");
    setPw2("");
    qc.invalidateQueries({ queryKey: ["me"] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!forced) onOpenChange(v); }}>
      <DialogContent
        className="max-w-md"
        hideClose={forced}
        onInteractOutside={(e) => forced && e.preventDefault()}
        onEscapeKeyDown={(e) => forced && e.preventDefault()}
      >
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{forced ? "Crie a sua senha" : "Alterar senha"}</DialogTitle>
            <DialogDescription>
              {forced
                ? "Você entrou com a senha provisória enviada por e-mail. Crie agora a sua senha de acesso ao Core."
                : "A nova senha vale para os próximos acessos."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-pw">Nova senha</Label>
            <Input id="new-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
            <p className={`text-xs ${weak ? "text-rose-600" : "text-muted-foreground"}`}>Pelo menos 8 caracteres, com letras e números.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-pw2">Repita a nova senha</Label>
            <Input id="new-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />
          </div>
          <DialogFooter>
            {!forced && (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar senha"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
