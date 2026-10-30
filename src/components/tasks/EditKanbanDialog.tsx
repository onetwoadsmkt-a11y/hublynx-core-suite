import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, ArrowUp, ArrowDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { KANBAN_TONES, useKanbanColumns, type KanbanColumn } from "@/hooks/useKanbanColumns";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "coluna";
}

export function EditKanbanDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data: serverCols = [] } = useKanbanColumns();
  const [cols, setCols] = useState<KanbanColumn[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newTone, setNewTone] = useState(KANBAN_TONES[0].value);
  const [confirmDelete, setConfirmDelete] = useState<KanbanColumn | null>(null);

  useEffect(() => {
    if (open) setCols(serverCols.map((c) => ({ ...c })));
  }, [open, serverCols]);

  const saveMutation = useMutation({
    mutationFn: async (next: KanbanColumn[]) => {
      const { data: auth } = await supabase.auth.getUser();
      const ownerId = auth.user?.id;
      if (!ownerId) throw new Error("Sessão expirada.");
      // Upsert/insert each column and update positions
      for (let i = 0; i < next.length; i++) {
        const c = next[i];
        if (c.id.startsWith("default-") || c.id.startsWith("new-")) {
          const { error } = await supabase.from("kanban_columns").upsert(
            { owner_id: ownerId, key: c.key, label: c.label, tone: c.tone, position: i },
            { onConflict: "owner_id,key" },
          );
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("kanban_columns")
            .update({ label: c.label, tone: c.tone, position: i })
            .eq("id", c.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kanban-columns"] });
      toast.success("Kanban atualizado.");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (col: KanbanColumn) => {
      // Move tasks in this status to the first remaining column
      const remaining = cols.filter((c) => c.key !== col.key);
      const fallback = remaining[0]?.key;
      if (fallback) {
        await supabase.from("tasks").update({ status: fallback }).eq("status", col.key);
      }
      if (!col.id.startsWith("default-") && !col.id.startsWith("new-")) {
        const { error } = await supabase.from("kanban_columns").delete().eq("id", col.id);
        if (error) throw error;
      }
    },
    onSuccess: (_d, col) => {
      setCols((prev) => prev.filter((c) => c.key !== col.key));
      qc.invalidateQueries({ queryKey: ["kanban-columns"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`Coluna "${col.label}" removida.`);
      setConfirmDelete(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover."),
  });

  function move(idx: number, dir: -1 | 1) {
    setCols((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  function addColumn() {
    const label = newLabel.trim();
    if (!label) return toast.error("Informe o nome da coluna.");
    let key = slugify(label);
    const existing = new Set(cols.map((c) => c.key));
    let i = 1;
    while (existing.has(key)) { key = `${slugify(label)}_${i++}`; }
    setCols((prev) => [...prev, {
      id: `new-${key}`, key, label, tone: newTone, position: prev.length,
    }]);
    setNewLabel("");
    setNewTone(KANBAN_TONES[0].value);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Kanban</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {cols.map((c, idx) => (
              <div key={c.key} className="flex items-center gap-2 p-2 rounded-md border bg-card">
                <div className="flex flex-col">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(idx, -1)} disabled={idx === 0}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(idx, 1)} disabled={idx === cols.length - 1}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Input
                  value={c.label}
                  onChange={(e) => setCols((prev) => prev.map((x) => x.key === c.key ? { ...x, label: e.target.value } : x))}
                  className="flex-1"
                />
                <Select value={c.tone} onValueChange={(v) => setCols((prev) => prev.map((x) => x.key === c.key ? { ...x, tone: v } : x))}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KANBAN_TONES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        <span className={`px-2 py-0.5 rounded text-xs ${t.value}`}>{t.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge variant="secondary" className={c.tone}>{c.label || "Preview"}</Badge>
                <Button
                  variant="ghost" size="icon"
                  className="text-rose-600 hover:text-rose-700"
                  onClick={() => setConfirmDelete(c)}
                  disabled={cols.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="border-t pt-4 space-y-2">
            <Label>Nova coluna</Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nome da coluna (ex: Aprovação)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addColumn(); } }}
              />
              <Select value={newTone} onValueChange={setNewTone}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KANBAN_TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className={`px-2 py-0.5 rounded text-xs ${t.value}`}>{t.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={addColumn} type="button">
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={() => saveMutation.mutate(cols)}
              disabled={saveMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {saveMutation.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover coluna "{confirmDelete?.label}"?</AlertDialogTitle>
            <AlertDialogDescription>
              As tarefas desta coluna serão movidas para a primeira coluna restante.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
