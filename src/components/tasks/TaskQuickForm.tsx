import { TaskCreateDialog, type TaskCreateDefaults } from "@/components/tasks/TaskCreateDialog";

/** Mantido para as telas antigas: usa a criação de tarefa padrão do Core. */
export type TaskQuickFormDefaults = Omit<TaskCreateDefaults, "lead">;

export function TaskQuickForm({
  open,
  onOpenChange,
  defaults,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaults?: TaskQuickFormDefaults;
  onCreated?: (id: string) => void;
}) {
  return <TaskCreateDialog open={open} onOpenChange={onOpenChange} defaults={defaults} onCreated={(id) => onCreated?.(id)} />;
}
