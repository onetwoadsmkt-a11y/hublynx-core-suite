/**
 * Escopo do módulo Financeiro.
 *
 * Todo número do financeiro pertence a uma empresa (organização), não a um
 * usuário. Antes as consultas filtravam por `owner_id`/`empresa_id`, o que
 * escondia lançamentos criados por outros membros da mesma empresa e fazia os
 * totais divergirem das listas. Aqui resolvemos a empresa uma única vez e
 * aplicamos o mesmo filtro em todas as consultas.
 */
import { resolveOrganizationId } from "@/lib/org/resolve";

export type FinanceScope = { userId: string; orgId: string | null };

export async function financeScope(sb: unknown, userId: string): Promise<FinanceScope> {
  try {
    const orgId = await resolveOrganizationId(sb as never, userId);
    return { userId, orgId };
  } catch {
    return { userId, orgId: null };
  }
}

/** Aceita tanto o id do usuário (compatibilidade) quanto um escopo já resolvido. */
export async function toScope(sb: unknown, u: string | FinanceScope): Promise<FinanceScope> {
  return typeof u === "string" ? financeScope(sb, u) : u;
}

/**
 * Aplica o filtro de empresa na consulta.
 * `ownerCol` é o filtro antigo, usado apenas quando a empresa não foi resolvida.
 */
export function scoped<T>(
  query: T,
  scope: FinanceScope,
  ownerCol: "owner_id" | "empresa_id" = "owner_id",
): T {
  const q = query as unknown as { eq: (c: string, v: string) => T };
  return scope.orgId ? q.eq("organization_id", scope.orgId) : q.eq(ownerCol, scope.userId);
}
