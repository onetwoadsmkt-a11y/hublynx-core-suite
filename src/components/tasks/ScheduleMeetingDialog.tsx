import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Video } from "lucide-react";
import { scheduleMeeting } from "@/lib/google/calendar.functions";

type Props = {
  open: boolean;
  onClose: () => void;
  taskId: string;
  taskTitle: string;
  defaultAttendee?: string | null;
};

function defaultStart() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  // local datetime-local string
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleMeetingDialog({ open, onClose, taskId, taskTitle, defaultAttendee }: Props) {
  const qc = useQueryClient();
  const fn = useServerFn(scheduleMeeting);

  const [summary, setSummary] = useState("");
  const [startAt, setStartAt] = useState(defaultStart());
  const [duration, setDuration] = useState("30");
  const [attendees, setAttendees] = useState("");
  const [description, setDescription] = useState("");
  const [sendInvites, setSendInvites] = useState(true);

  useEffect(() => {
    if (open) {
      setSummary(taskTitle);
      setStartAt(defaultStart());
      setDuration("30");
      setAttendees(defaultAttendee ?? "");
      setDescription("");
      setSendInvites(true);
    }
  }, [open, taskTitle, defaultAttendee]);

  const save = useMutation({
    mutationFn: async () => {
      const att = attendees.split(",").map((s) => s.trim()).filter(Boolean);
      const iso = new Date(startAt).toISOString();
      return fn({
        data: {
          taskId,
          summary,
          description: description || undefined,
          startAt: iso,
          durationMinutes: Number(duration),
          attendees: att,
          sendInvites,
        },
      });
    },
    onSuccess: (res) => {
      toast.success("Reunião agendada.");
      qc.invalidateQueries({ queryKey: ["task-communications", taskId] });
      if (res.meetLink) navigator.clipboard?.writeText(res.meetLink).catch(() => {});
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao agendar"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" /> Agendar reunião (Google Meet)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Título</Label>
            <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data e hora</Label>
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Duração</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["15", "30", "45", "60", "90", "120"].map((m) => (
                    <SelectItem key={m} value={m}>{m} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Participantes</Label>
            <Input
              placeholder="email1@x.com, email2@y.com"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox checked={sendInvites} onCheckedChange={(v) => setSendInvites(!!v)} />
            Enviar convite por e-mail aos participantes
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !summary || !startAt}
            className="bg-[#00D084] hover:bg-[#00b873] text-white"
          >
            {save.isPending ? "Agendando..." : "Agendar e gerar Meet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
