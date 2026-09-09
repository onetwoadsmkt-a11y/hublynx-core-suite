import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { listPipelineTags, savePipelineTags } from "@/lib/pipeline/tags.functions";
import { TAG_COLORS, TAG_FUNNEL_OPTIONS, slugifyTag, type PipelineTag } from "@/lib/pipeline/tags";

const DEFAULTS: Omit<PipelineTag, "position">[] = [
  { slug: "conectado", name: "Conectado", color: "#0ea5e9", funnel_key: "conectado", active: true },
  { slug: "reuniao-agendada", name: "Reunião agendada", color: "#2563eb", funnel_key: "agendada", active: true },
  { slug: "reuniao-realizada", name: "Reunião realizada", color: "#14b8a6", funnel_key: "realizada", active: true },
  { slug: "no-show", name: "No show", color: "#f97316", funnel_key: "noshow", active: true },
  { slug: "proposta", name: "Proposta enviada", color: "#a855f7", funnel_key: "cof", active: true },
  { slug: "ganho", name: "Ganho", color: "#22c55e", funnel_key: "ganho", active: true },
  { slug: "desqualificado", name: "Desqualificado", color: "#ef4444", funnel_key: "perdido", active: true },
];

export function TagsDialog({
  open,
  onOpenChange,
  pipelineId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipelineId?: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPipelineTags);
  const saveFn = useServerFn(savePipelineTags);
  const [rows, setRows] = useState<PipelineTag[]>([]);

  const { data } = useQuery({
    queryKey: ["pipeline-tags", pipelineId ?? "none"],
    queryFn: () => listFn({ data: { pipelineId: pipelineId! } }),
    enabled: open && !!pipelineId,
  });

  useEffect(() => {
    if (open && data) setRows(data.tags);
  }, [open, data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          pipelineId: pipelineId!,
          tags: rows
            .filter((r) => r.name.trim())
            .map((r, i) => ({ ...r, slug: r.slug || slugifyTag(r.name), position: i })),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline-tags"] });
      qc.invalidateQueries({ queryKey: ["comercial-dashboard"] });
      toast.success("Tags salvas");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = (i: number, patch: Partial<PipelineTag>) =>
    setRows((r) => r.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tags de conversão</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Marque tags nos leads para medir a conversão além das etapas. Cada tag pode representar um
          marco do funil (conectado, reunião, no show, ganho...).
        </p>

        <div className="space-y-2">
          {rows.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
              <input
                type="color"
                value={t.color}
                onChange={(e) => update(i, { color: e.target.value })}
                className="h-8 w-8 cursor-pointer rounded border bg-transparent"
              />
              <Input
                value={t.name}
                onChange={(e) => update(i, { name: e.target.value, slug: t.slug || slugifyTag(e.target.value) })}
                placeholder="Nome da tag"
                className="h-9 w-48"
              />
              <Select value={t.funnel_key} onValueChange={(v) => update(i, { funnel_key: v as PipelineTag["funnel_key"] })}>
                <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAG_FUNNEL_OPTIONS.map((o) => (
                    <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={t.active} onCheckedChange={(v) => update(i, { active: v })} />
                Ativa
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-8 w-8 text-destructive"
                onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhuma tag configurada.
              <Button
                variant="link"
                onClick={() => setRows(DEFAULTS.map((d, i) => ({ ...d, position: i })))}
              >
                Usar modelo padrão
              </Button>
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            setRows((r) => [
              ...r,
              {
                slug: "",
                name: "",
                color: TAG_COLORS[r.length % TAG_COLORS.length],
                funnel_key: "nenhum",
                active: true,
                position: r.length,
              },
            ])
          }
        >
          <Plus className="mr-1.5 h-4 w-4" /> Nova tag
        </Button>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!pipelineId || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
