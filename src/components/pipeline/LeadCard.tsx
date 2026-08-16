import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Mail, MapPin, Phone, Tag, MoreVertical, Trash2, Pencil, FileSpreadsheet } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteLead, getLeadDetail } from "@/lib/pipeline/pipeline.functions";
import { exportLeadJourneyToExcel } from "@/lib/pipeline/export-leads";
import { cn } from "@/lib/utils";
import { useLeadCardLayout } from "./card-layout";
import type { Lead } from "./types";



export function relativeTime(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}

export function currency(v: number | null) {
  if (v == null) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function LeadCard({
  lead,
  onOpen,
  onEdit,
  draggable = true,
}: {
  lead: Lead;
  onOpen: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  draggable?: boolean;
}) {
  const qc = useQueryClient();
  const del = useServerFn(deleteLead);
  const detail = useServerFn(getLeadDetail);
  const remove = useMutation({
    mutationFn: () => del({ data: { id: lead.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline"] }),
  });
  const exportJourney = useMutation({
    mutationFn: async () => {
      const d = await detail({ data: { leadId: lead.id } });
      exportLeadJourneyToExcel(lead, d.events, d.tasks);
    },
    onSuccess: () => toast.success("Jornada exportada"),
    onError: (e: Error) => toast.error(e.message),
  });


  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    disabled: !draggable,
  });

  const { layout } = useLeadCardLayout();
  const value = currency(lead.value != null ? Number(lead.value) : null);
  const location = [lead.city, lead.state].filter(Boolean).join(" / ");

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      className={cn(
        "group cursor-pointer rounded-xl border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md",
        isDragging && "opacity-40",
      )}
      onClick={() => onOpen(lead)}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-semibold leading-tight">{lead.name}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => onEdit(lead)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={exportJourney.isPending}
              onSelect={(e) => { e.preventDefault(); exportJourney.mutate(); }}
            >
              <FileSpreadsheet className="mr-2 h-3.5 w-3.5" /> Exportar jornada (Excel)
            </DropdownMenuItem>

            <DropdownMenuItem className="text-destructive" onSelect={() => remove.mutate()}>
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {layout.company && lead.company && (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Building2 className="h-3 w-3" /> {lead.company}
        </p>
      )}
      {layout.location && location && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{location}</span>
        </p>
      )}
      {layout.phone && lead.phone && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Phone className="h-3 w-3" /> {lead.phone}
        </p>
      )}
      {layout.email && lead.email && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{lead.email}</span>
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {layout.value && value && (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
            {value}
          </Badge>
        )}
        {layout.source && (lead.utm_source || lead.source) && (
          <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
            <Tag className="h-2.5 w-2.5" />
            {lead.utm_source ?? lead.source}
          </Badge>
        )}
        {layout.utm && lead.utm_medium && (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            {lead.utm_medium}
          </Badge>
        )}
        {layout.utm && lead.utm_campaign && (
          <Badge variant="outline" className="h-5 max-w-[120px] truncate px-1.5 text-[10px]">
            {lead.utm_campaign}
          </Badge>
        )}
      </div>

      {layout.time && (
        <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          {relativeTime(lead.created_at)}
        </p>
      )}
    </div>
  );

}
