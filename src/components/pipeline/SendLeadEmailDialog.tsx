import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendLeadEmail } from "@/lib/pipeline/lead-email.functions";

export function SendLeadEmailDialog({
  open,
  onOpenChange,
  leadId,
  leadName,
  defaultTo,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
  leadName: string;
  defaultTo?: string | null;
  onSent?: () => void;
}) {
  const sendFn = useServerFn(sendLeadEmail);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (open) {
      setTo(defaultTo ?? "");
      setSubject("");
      setBody(`Olá ${leadName.split(" ")[0] ?? ""},\n\n`);
    }
  }, [open, defaultTo, leadName]);

  const send = useMutation({
    mutationFn: () => {
      const toList = to.split(",").map((s) => s.trim()).filter(Boolean);
      if (toList.length === 0) throw new Error("Informe ao menos um destinatário.");
      return sendFn({ data: { leadId, to: toList, subject, body } });
    },
    onSuccess: () => {
      toast.success("E-mail enviado");
      onSent?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Enviar e-mail
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Para (separe por vírgula)</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="lead@email.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Assunto</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Mensagem</Label>
            <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={send.isPending || !subject.trim() || !body.trim() || !to.trim()}
            onClick={() => send.mutate()}
          >
            {send.isPending ? "Enviando..." : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
