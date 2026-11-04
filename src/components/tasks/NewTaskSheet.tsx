import { TaskCreateDialog, type TaskCreateDefaults } from "@/components/tasks/TaskCreateDialog";

/** Mantido para as telas antigas: usa a criação de tarefa padrão do Core. */
export function NewTaskSheet({
  open,
  onOpenChange,
  defaultProjectId,
  defaultClientId,
  projectName,
  clientName,
  defaults,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultProjectId?: string | null;
  defaultClientId?: string | null;
  projectName?: string | null;
  clientName?: string | null;
  defaults?: TaskCreateDefaults;
  onCreated?: (id: string) => void;
}) {
  return (
    <TaskCreateDialog
      open={open}
      onOpenChange={onOpenChange}
      defaults={{ ...defaults, projectId: defaultProjectId ?? defaults?.projectId ?? null, clientId: defaultClientId ?? defaults?.clientId ?? null }}
      projectName={projectName}
      clientName={clientName}
      onCreated={(id) => onCreated?.(id)}
    />
  );
}
