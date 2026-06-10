import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type KanbanColumn = {
  id: string;
  key: string;
  label: string;
  tone: string;
  position: number;
};

export const DEFAULT_STATUS_COLS: KanbanColumn[] = [
  { id: "default-backlog", key: "backlog", label: "Backlog", tone: "bg-muted text-muted-foreground", position: 0 },
  { id: "default-a_fazer", key: "a_fazer", label: "A fazer", tone: "bg-blue-100 text-blue-700", position: 1 },
  { id: "default-em_andamento", key: "em_andamento", label: "Em andamento", tone: "bg-amber-100 text-amber-700", position: 2 },
  { id: "default-revisao", key: "revisao", label: "Revisão", tone: "bg-indigo-100 text-indigo-700", position: 3 },
  { id: "default-concluido", key: "concluido", label: "Concluído", tone: "bg-emerald-100 text-emerald-700", position: 4 },
];

export const KANBAN_TONES: { value: string; label: string }[] = [
  { value: "bg-muted text-muted-foreground", label: "Cinza" },
  { value: "bg-blue-100 text-blue-700", label: "Azul" },
  { value: "bg-amber-100 text-amber-700", label: "Âmbar" },
  { value: "bg-indigo-100 text-indigo-700", label: "Índigo" },
  { value: "bg-emerald-100 text-emerald-700", label: "Verde" },
  { value: "bg-rose-100 text-rose-700", label: "Rosa" },
  { value: "bg-violet-100 text-violet-700", label: "Violeta" },
  { value: "bg-orange-100 text-orange-700", label: "Laranja" },
  { value: "bg-teal-100 text-teal-700", label: "Teal" },
  { value: "bg-slate-200 text-slate-700", label: "Ardósia" },
];

export function useKanbanColumns() {
  return useQuery({
    queryKey: ["kanban-columns"],
    queryFn: async (): Promise<KanbanColumn[]> => {
      const { data, error } = await supabase
        .from("kanban_columns")
        .select("id,key,label,tone,position")
        .order("position");
      if (error) throw error;
      if (!data || data.length === 0) return DEFAULT_STATUS_COLS;
      return data as KanbanColumn[];
    },
    staleTime: 60_000,
  });
}
