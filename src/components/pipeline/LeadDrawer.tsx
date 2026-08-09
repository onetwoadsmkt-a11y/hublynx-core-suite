import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, ArrowRightLeft, Building2, Mail, MapPin, MessageSquare, Phone, Plus, Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addLeadNote, getLeadDetail, moveLead } from "@/lib/pipeline/pipeline.functions";
import { currency } from "./LeadCard";
import type { Lead, PipelineStage } from "./types";

const EVENT_ICON: Record<string, typeof Activity> = {
  created: Plus,
  stage_changed: ArrowRightLeft,
  note_added: MessageSquare,
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function LeadDrawer({
  lead,
  stages,
  onOpenChange,
  onEdit,
}: {
  lead: Lead | null;
  stages: PipelineStage[];
  onOpenChange: (v: boolean) => void;
  onEdit: (lead: Lead) => void;
}) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getLeadDetail);
  const noteFn = useServerFn(addLeadNote);
  const moveFn = useServerFn(moveLead);
  const [note, setNote] = useState("");

  const { data } = useQuery({
    queryKey: ["lead-detail", lead?.id],
    queryFn: () => detailFn({ data: { leadId: lead!.id } }),
    enabled: !!lead,
  });

  const addNote = useMutation({
    mutationFn: () => noteFn({ data: { leadId: lead!.id, body: note.trim() } }),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["lead-detail", lead?.id] });
    },
  });

  const move = useMutation({
    mutationFn: (stageId: string) => moveFn({ data: { id: lead!.id, stage_id: stageId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["lead-detail", lead?.id] });
    },
  });

  const utms = lead
    ? ([
        ["utm_source", lead.utm_source],
        ["utm_medium", lead.utm_medium],
        ["utm_campaign", lead.utm_campaign],
        ["utm_term", lead.utm_term],
        ["utm_content", lead.utm_content],
        ["gclid", lead.gclid],
        ["fbclid", lead.fbclid],
      ] as const).filter(([, v]) => !!v)
    : [];

  return (
    <Sheet open={!!lead} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {lead && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-xl">{lead.name}</SheetTitle>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {lead.value != null && (
                  <Badge className="font-semibold">{currency(Number(lead.value))}</Badge>
                )}
                <Select value={lead.stage_id ?? ""} onValueChange={(v) => move.mutate(v)}>
                  <SelectTrigger className="h-8 w-[190px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => onEdit(lead)}>Editar</Button>
              </div>
            </SheetHeader>

            <div className="mt-4 grid gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
              {lead.company && <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />{lead.company}</p>}
              {lead.phone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{lead.phone}</p>}
              {lead.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{lead.email}</p>}
              {(lead.city || lead.state) && (
                <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" />{[lead.city, lead.state].filter(Boolean).join(" — ")}</p>
              )}
              {lead.source && <p className="flex items-center gap-2"><Tag className="h-4 w-4 text-muted-foreground" />{lead.source}</p>}
            </div>

            <Tabs defaultValue="jornada" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="jornada">Jornada</TabsTrigger>
                <TabsTrigger value="notas">Notas</TabsTrigger>
                <TabsTrigger value="utm">UTM</TabsTrigger>
              </TabsList>

              <TabsContent value="jornada" className="mt-4">
                <ol className="relative space-y-4 border-l pl-5">
                  {(data?.events ?? []).map((ev) => {
                    const Icon = EVENT_ICON[ev.kind] ?? Activity;
                    return (
                      <li key={ev.id} className="relative">
                        <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Icon className="h-3 w-3" />
                        </span>
                        <p className="text-sm font-medium">{ev.title}</p>
                        {ev.description && <p className="text-xs text-muted-foreground">{ev.description}</p>}
                        <p className="text-[11px] text-muted-foreground">{fmt(ev.created_at)}</p>
                      </li>
                    );
                  })}
                  {(data?.events ?? []).length === 0 && (
                    <li className="text-sm text-muted-foreground">Sem eventos ainda.</li>
                  )}
                </ol>
              </TabsContent>

              <TabsContent value="notas" className="mt-4 space-y-3">
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Registre o resumo da conversa com o lead..."
                />
                <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
                  Adicionar nota
                </Button>
                <Separator />
                <div className="space-y-3">
                  {(data?.notes ?? []).map((n) => (
                    <div key={n.id} className="rounded-lg border bg-card p-3">
                      <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{fmt(n.created_at)}</p>
                    </div>
                  ))}
                  {(data?.notes ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma nota registrada.</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="utm" className="mt-4 space-y-2">
                {utms.length === 0 && <p className="text-sm text-muted-foreground">Sem dados de campanha.</p>}
                {utms.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{k}</span>
                    <span className="max-w-[60%] truncate font-medium">{v}</span>
                  </div>
                ))}
                {lead.landing_url && (
                  <div className="rounded-lg border px-3 py-2 text-xs">
                    <p className="text-muted-foreground">landing_url</p>
                    <p className="break-all">{lead.landing_url}</p>
                  </div>
                )}
                {lead.referrer && (
                  <div className="rounded-lg border px-3 py-2 text-xs">
                    <p className="text-muted-foreground">referrer</p>
                    <p className="break-all">{lead.referrer}</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
