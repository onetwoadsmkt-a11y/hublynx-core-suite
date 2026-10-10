import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Mail, MapPin, Phone, Tag, TagIcon, MoreVertical, Trash2, Pencil, FileSpreadsheet, AlarmClock, Lock } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLeadTags } from "@/lib/pipeline/tags.functions";
import { deleteLead, getLeadDetail } from "@/lib/pipeline/pipeline.functions";
import { exportLeadJourneyToExcel } from "@/lib/pipeline/export-leads";
import { cn } from "@/lib/utils";
import { useLeadCardLayout } from "./card-layout";
import type { Lead } from "./types";
import { maskBRL } from "@/lib/security/value-lock";



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
  return maskBRL(v, { maximumFractionDigits: 0 });
}

export type ScoreTone = "hot" | "warm" | "cold" | "nutrition" | "neutral";

// Aceita as chaves em inglês (Lead Pro / webhooks) e os nomes em português das faixas.
const SCORE_ALIASES: Record<string, ScoreTone> = {
  hot: "hot", quente: "hot",
  warm: "warm", morno: "warm",
  cold: "cold", frio: "cold",
  nutrition: "nutrition", "nutrição": "nutrition", nutricao: "nutrition",
};

/** Normaliza a classificação do lead scoring (pt/en) para quente/morno/frio/nutrição. */
export function leadScoreTone(classification: string | null | undefined): ScoreTone {
  return SCORE_ALIASES[classification?.trim().toLowerCase() ?? ""] ?? "neutral";
}

export function leadScorePresentation(classification: string | null | undefined) {
  const normalized = classification?.trim().toLowerCase() ?? "";
  const tone: ScoreTone = SCORE_ALIASES[normalized] ?? "neutral";
  const labels: Record<ScoreTone, string> = {
    hot: "Quente",
    warm: "Morno",
    cold: "Frio",
    nutrition: "Nutrição",
    neutral: classification?.trim() || "Sem classificação",
  };
  const classes: Record<ScoreTone, string> = {
    hot: "border-score-hot/25 bg-score-hot/15 text-score-hot",
    warm: "border-score-warm/25 bg-score-warm/15 text-score-warm",
    cold: "border-score-cold/25 bg-score-cold/15 text-score-cold",
    nutrition: "border-score-nutrition/25 bg-score-nutrition/15 text-score-nutrition",
    neutral: "border-border bg-muted text-muted-foreground",
  };
  return { label: labels[tone], className: classes[tone] };
}

export function LeadCard({
  lead,
  onOpen,
  onEdit,
  draggable = true,
  locked = false,
  onLockedDrag,
  tags = [],
}: {
  lead: Lead;
  onOpen: (lead: Lead) => void;
  onEdit: (lead: Lead) => void;
  draggable?: boolean;
  locked?: boolean;
  onLockedDrag?: () => void;
  tags?: { slug: string; name: string; color: string }[];
}) {
  const leadTags = ((lead as any).tags as string[] | null) ?? [];
  const [sel, setSel] = useState<string[]>(leadTags.map(String));
  useEffect(() => {
    setSel((((lead as any).tags as string[] | null) ?? []).map(String));
  }, [lead]);
  const has = (slug: string) => sel.some((s) => s.toLowerCase() === slug.toLowerCase());
  const shownTags = tags.filter((t) => has(t.slug));
  const qc = useQueryClient();
  const del = useServerFn(deleteLead);
  const detail = useServerFn(getLeadDetail);
  const saveTags = useServerFn(setLeadTags);
  const tagMut = useMutation({
    mutationFn: (next: string[]) => saveTags({ data: { leadId: lead.id, tags: next } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["lead-detail", lead.id] });
    },
    onError: (e: Error) => {
      setSel(leadTags.map(String));
      toast.error(e.message);
    },
  });
  const toggleTag = (slug: string) => {
    const next = has(slug)
      ? sel.filter((s) => s.toLowerCase() !== slug.toLowerCase())
      : [...sel, slug];
    setSel(next);
    tagMut.mutate(next);
  };
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
  const nextAction = (lead as any).next_action as string | null;
  const nextActionAt = (lead as any).next_action_at as string | null;
  const nextActionOverdue = !!nextActionAt && new Date(nextActionAt).getTime() < Date.now();
  const leadScore = lead.lead_score != null ? Number(lead.lead_score) : null;
  const scorePresentation = leadScorePresentation(lead.lead_classification);

  return (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      className={cn(
        "group cursor-pointer rounded-xl border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md",
        isDragging && "opacity-40",
        locked && "cursor-not-allowed border-dashed bg-muted/40 hover:border-border hover:shadow-sm",
      )}
      onClick={() => onOpen(lead)}
      onPointerDown={() => locked && onLockedDrag?.()}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 flex min-w-0 items-center gap-1.5 break-words text-sm font-semibold leading-tight">
          {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          {lead.name}
          {tags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Adicionar tag"
                  className={cn(
                    "h-5 w-5 shrink-0 text-muted-foreground",
                    shownTags.length === 0 && "md:opacity-0 md:group-hover:opacity-100",
                  )}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <TagIcon className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-56"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <DropdownMenuLabel className="text-xs">Tags</DropdownMenuLabel>
                {tags.map((t) => (
                  <DropdownMenuCheckboxItem
                    key={t.slug}
                    checked={has(t.slug)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggleTag(t.slug)}
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 md:h-6 md:w-6 md:opacity-0 md:group-hover:opacity-100"
              aria-label="Ações do lead"
              onPointerDown={(e) => e.stopPropagation()}
            >
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

      {(nextAction || nextActionAt) && (
        <p
          className={cn(
            "mt-1.5 flex items-center gap-1 truncate rounded-md px-1.5 py-1 text-[11px]",
            nextActionOverdue
              ? "bg-destructive/10 font-medium text-destructive"
              : "bg-muted text-muted-foreground",
          )}
        >
          <AlarmClock className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {nextAction || "Próxima ação"}
            {nextActionAt
              ? ` · ${new Date(nextActionAt).toLocaleDateString("pt-BR")}`
              : ""}
            {nextActionOverdue ? " (atrasada)" : ""}
          </span>
        </p>
      )}

      {shownTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {shownTags.map((t) => (
            <span
              key={t.slug}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${t.color}1f`, color: t.color }}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {layout.score && (leadScore != null || lead.lead_classification) && (
          <Badge variant="outline" className={cn("h-5 gap-1 px-1.5 text-[10px] font-semibold", scorePresentation.className)}>
            {leadScore != null && (Number.isInteger(leadScore) ? leadScore : leadScore.toLocaleString("pt-BR"))}
            <span className="font-medium">{leadScore != null ? "· " : ""}{scorePresentation.label}</span>
          </Badge>
        )}
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
