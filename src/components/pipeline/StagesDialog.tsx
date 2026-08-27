import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { deleteStage, upsertStage } from "@/lib/pipeline/pipeline.functions";
import { STAGE_COLORS } from "@/lib/pipeline/defaults";
import type { PipelineStage } from "./types";

export function StagesDialog({
  open,
  onOpenChange,
  stages,
  pipelineId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stages: PipelineStage[];
  pipelineId?: string;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(upsertStage);
  const delFn = useServerFn(deleteStage);
  const [rows, setRows] = useState<PipelineStage[]>(stages);
  const [newName, setNewName] = useState("");

  useEffect(() => { if (open) setRows(stages); }, [open, stages]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["pipeline"] });

  const save = useMutation({
    mutationFn: (s: { id?: string; name: string; color: string; position?: number }) =>
      saveFn({ data: { ...s, ...(s.id ? {} : { pipeline_id: pipelineId }) } }),
    onSuccess: refresh,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Etapas do funil</DialogTitle></DialogHeader>

        <div className="space-y-2">
          {rows.map((s, i) => {
            const locked = s.is_won || s.is_lost;
            if (locked) {
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 p-2"
                >
                  <span
                    className="h-8 w-8 shrink-0 rounded"
                    style={{ backgroundColor: s.color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Etapa fixa {s.is_won ? "(venda ganha)" : "(desqualificado)"} — não pode ser editada
                      ou removida.
                    </p>
                  </div>
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              );
            }
            return (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border p-2">
                <input
                  type="color"
                  className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                  value={s.color}
                  onChange={(e) =>
                    setRows((r) => r.map((x) => (x.id === s.id ? { ...x, color: e.target.value } : x)))
                  }
                  onBlur={(e) => save.mutate({ id: s.id, name: s.name, color: e.target.value, position: i })}
                />
                <Input
                  value={s.name}
                  onChange={(e) =>
                    setRows((r) => r.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))
                  }
                  onBlur={(e) => save.mutate({ id: s.id, name: e.target.value, color: s.color, position: i })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive"
                  onClick={() => delFn({ data: { id: s.id } }).then(refresh)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 pt-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nova etapa"
          />
          <Button
            disabled={!newName.trim()}
            onClick={() => {
              const color = STAGE_COLORS[rows.length % STAGE_COLORS.length]!;
              save.mutate({ name: newName.trim(), color, position: rows.length });
              setNewName("");
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
