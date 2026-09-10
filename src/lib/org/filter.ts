/**
 * Escopo multi-tenant por organização (Etapa 7).
 * A segurança real vem do RLS por organização; o filtro aqui é para leitura
 * correta quando o usuário participa de mais de uma empresa (ex.: super admin).
 */
export function scopeOrganization<T>(query: T, organizationId?: string | null): T {
  if (!organizationId) return query;
  return (query as unknown as { eq: (c: string, v: string) => T }).eq(
    "organization_id",
    organizationId,
  );
}

/** Campos de organização para INSERT (tipos gerados ainda não conhecem a coluna). */
export function organizationFields(organizationId?: string | null): Record<string, string> {
  return organizationId ? { organization_id: organizationId } : {};
}
