import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { sendTestEmail } from "@/lib/google/gmail-test.functions";

export function TestEmailCard() {
  const sendFn = useServerFn(sendTestEmail);
  const [to, setTo] = useState("");

  const m = useMutation({
    mutationFn: () => sendFn({ data: { to } }),
    onSuccess: (r) => toast.success(`E-mail de teste enviado para ${r.to}`),
    onError: (e: any) => toast.error(e?.message ?? "Erro ao enviar"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-4 w-4" /> Enviar e-mail de teste
        </CardTitle>
        <CardDescription>
          Envia um HTML com acentuação, símbolos e emoji para validar a codificação UTF-8 no Gmail.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="test-to">Destinatário</Label>
          <div className="flex gap-2">
            <Input
              id="test-to"
              type="email"
              placeholder="seu-email@exemplo.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <Button
              onClick={() => m.mutate()}
              disabled={!to || m.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {m.isPending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Enviado a partir de <strong>hublynx.dev@gmail.com</strong> via Gmail.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
