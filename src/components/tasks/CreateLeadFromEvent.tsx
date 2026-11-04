import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/hooks/useWorkspace";
import { listAllStages } from "@/lib/pipeline/pipeline.functions";
import { createLeadFromGoogleEvent } from "@/lib/agenda/agenda.functions";
import { invalidatePendingQueries } from "@/hooks/usePendingItems";
import { openLeadCard } from "@/components/pipeline/LeadCardHost";
import type { AgendaEvent } from "@/lib/agenda/types";

/** Tira prefixos comuns do título do evento para sugerir o nome do lead. */
function suggestName(ev: AgendaEvent) {
  const guest = ev.attendees?.find((a) => a.name)?.name;
  if (guest) return guest;
  const t = ev.title.replace(/^\s*(reuni[aã]o|call|liga[cç][aã]o|meet|apresenta[cç][aã]o)\s*(com|-|:|–)?\s*/i, "").trim();
  return t || ev.title;
}

/** Evento do Google na Agenda → sugestão de criar o lead no Core, já ligado à reunião. */
export function CreateLeadFromEventButton({ event }: { event: AgendaEvent }) {
  const [open, setOpen] = useState(false);
  if (!event.googleEventId) return null;
  return (
    <>
      <Button size="sm" className="h-7 text-xs" onClick={() => setOpen(true)}>
        <UserPlus className="mr-1 h-3 w-3" /> Criar lead no Core
      </Button>
      <CreateLeadFromEventDialog event={event} open={open} onOpenChange={setOpen} />
    </>
  );
}

function CreateLeadFromEventDialog({ event, open, onOpenChange }: { event: AgendaEvent; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { activeOrganizationId } = useWorkspace();
  const stagesFn = useServerFn(listAllStages);
  const createFn = useServerFn(createLeadFromGoogleEvent);
  const stagesQ = useQuery({
    queryKey: ["all-stages", activeOrganizationId],
    enabled: open && !!activeOrganizationId,
    queryFn: () => stagesFn({ data: { organizationId: activeOrganizationId ?? undefined } }),
  });
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; stages: { id: string; name: string }[] }>();
    for (const s of stagesQ.data ?? []) {
      const k = s.pipeline_id ?? "none";
      const g = m.get(k) ?? { name: s.pipeline_name, stages: [] };
      g.stages.push({ id: s.id, name: s.name });
      m.set(k, g);
    }
    return [...m.values()];
  }, [stagesQ.data]);

  const guest = event.attendees?.[0] ?? null;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [stageId, setStageId] = useState("");
  useEffect(() => {
    if (!open) return;
    setName(suggestName(event));
    setEmail(guest?.email ?? "");
    setPhone("");
    setCompany("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open && !stageId && groups[0]?.stages[0]) setStageId(groups[0].stages[0].id);
  }, [open, groups, stageId]);

  const m = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          organizationId: activeOrganizationId!,
          stageId,
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          company: company.trim() || null,
          googleEventId: event.googleEventId!,
          title: event.title.slice(0, 200),
          start: event.start,
          end: event.end,
          meetLink: event.meetLink ?? null,
          notes: event.description ? event.description.replace(/<[^>]+>/g, " ").slice(0, 8000) : null,
        },
      }),
    onSuccess: (r) => {
      toast.success(r.created ? "Lead criado e ligado à reunião." : "Esta reunião já está ligada a um lead.");
      invalidatePendingQueries(qc, r.leadId);
      qc.invalidateQueries({ queryKey: ["agenda"] });
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      onOpenChange(false);
      openLeadCard(r.leadId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Criar lead a partir da reunião</DialogTitle>
          <DialogDescription>
            “{event.title}” vira um lead no pipeline, com esta reunião no cartão dele. Não cria outro evento no Google.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lf-name">Nome do lead *</Label>
            <Input id="lf-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lf-email">E-mail</Label>
              <Input id="lf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-phone">Telefone / WhatsApp</Label>
              <Input id="lf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-company">Empresa</Label>
            <Input id="lf-company" value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Pipeline e etapa *</Label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger><SelectValue placeholder={stagesQ.isLoading ? "Carregando…" : "Escolha a etapa"} /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectGroup key={g.name}>
                    <SelectLabel>{g.name}</SelectLabel>
                    {g.stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(event.attendees?.length ?? 0) > 1 && (
            <p className="text-[11px] text-muted-foreground">
              Convidados: {event.attendees!.map((a) => a.name || a.email).join(", ")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!name.trim() || !stageId || !activeOrganizationId || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? "Criando…" : "Criar lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
