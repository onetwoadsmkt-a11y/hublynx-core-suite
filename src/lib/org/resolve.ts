type Db = { from: (t: string) => any };

/**
 * Resolve a organização de um registro no servidor.
 * Nunca confia cegamente no id vindo da interface: só aceita quando o usuário
 * é membro ativo da empresa (ou administrador da plataforma). Caso contrário,
 * usa a primeira empresa ativa do usuário.
 */
export async function resolveOrganizationId(
  db: Db,
  userId: string,
  provided?: string | null,
): Promise<string | null> {
  const { data: memberships } = await db
    .from("organization_members")
    .select("organization_id, status")
    .eq("user_id", userId);

  const ids = ((memberships ?? []) as any[])
    .filter((m) => (m.status ?? "active") === "active")
    .map((m) => m.organization_id as string);

  if (provided && ids.includes(provided)) return provided;

  if (provided) {
    const { data: superRow } = await db
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (superRow) return provided;
  }

  return ids[0] ?? null;
}

/** Campos de empresa prontos para INSERT, resolvidos no servidor. */
export async function orgFields(db: Db, userId: string, provided?: string | null) {
  const id = await resolveOrganizationId(db, userId, provided);
  return id ? { organization_id: id } : {};
}

/** Empresa herdada de um registro pai (projeto, cliente, lead...). */
export async function orgFieldsFromRow(
  db: Db,
  table: string,
  id: string,
): Promise<Record<string, string>> {
  const { data } = await db.from(table).select("organization_id").eq("id", id).maybeSingle();
  const org = (data?.organization_id as string | undefined) ?? null;
  return org ? { organization_id: org } : {};
}
