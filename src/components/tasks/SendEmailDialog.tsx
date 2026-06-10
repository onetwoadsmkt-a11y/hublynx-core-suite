import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { sendTaskEmail } from "@/lib/google/gmail.functions";
import { createInstantMeet } from "@/lib/google/calendar.functions";

type Props = {
  open: boolean;
  onClose: () => void;
  taskId: string;
  taskTitle: string;
  defaultTo?: string | null;
  clientName?: string | null;
};

export function SendEmailDialog({ open, onClose, taskId, taskTitle, defaultTo, clientName }: Props) {
  const qc = useQueryClient();
  const sendFn = useServerFn(sendTaskEmail);
  const meetFn = useServerFn(createInstantMeet);

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [includeMeet, setIncludeMeet] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(defaultTo ?? "");
      setSubject(taskTitle ?? "");
      setBody(clientName ? `Olá ${clientName},\n\n` : "Olá,\n\n");
      setIncludeMeet(false);
    }
  }, [open, defaultTo, taskTitle, clientName]);

  const send = useMutation({
    mutationFn: async () => {
      const toList = to.split(",").map((s) => s.trim()).filter(Boolean);
      if (toList.length === 0) throw new Error("Informe ao menos um destinatário.");

      let meetLink: string | undefined;
      if (includeMeet) {
        const evt = await meetFn({
          data: { taskId, summary: subject || taskTitle, durationMinutes: 30 },
        });
        meetLink = evt.meetLink ?? undefined;
      }

      return sendFn({
        data: { taskId, to: toList, subject, body, meetLink },
      });
    },
    onSuccess: () => {
      toast.success("E-mail enviado.");
      qc.invalidateQueries({ queryKey: ["task-communications", taskId] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao enviar"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Enviar e-mail
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Para</Label>
            <Input
              placeholder="email@cliente.com (separe múltiplos por vírgula)"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Assunto</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox checked={includeMeet} onCheckedChange={(v) => setIncludeMeet(!!v)} />
            Incluir link do Google Meet (cria reunião instantânea)
          </label>
          <p className="text-xs text-muted-foreground">
            Enviado a partir de <strong>hublynx.dev@gmail.com</strong> via Gmail.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => send.mutate()}
            disabled={send.isPending || !to || !subject || !body}
            className="bg-[#00D084] hover:bg-[#00b873] text-white"
          >
            {send.isPending ? "Enviando..." : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
