/**
 * Aplica o filtro de workspace numa query PostgREST quando houver um workspace ativo.
 * Fase 2: o workspace_id vindo da interface é apenas um filtro de visualização;
 * a segurança continua garantida pelo RLS atual (auth.uid() = owner_id).
 */
export function scopeWorkspace<T>(query: T, workspaceId?: string | null): T {
  if (!workspaceId) return query;
  return (query as unknown as { eq: (c: string, v: string) => T }).eq("workspace_id", workspaceId);
}

/** Campos de workspace para INSERT (tipos gerados ainda não conhecem a coluna). */
export function workspaceFields(workspaceId?: string | null): Record<string, string> {
  return workspaceId ? { workspace_id: workspaceId } : {};
}
