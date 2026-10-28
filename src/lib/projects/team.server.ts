// Server-only — acesso da equipe de projeto (módulo e vínculo com o projeto).
type Db = { from: (t: string) => any };

/**
 * Libera para a pessoa somente o módulo Projetos da empresa. Quem entra pela equipe
 * de um projeto (convite, equipe do modelo) não recebe Comercial, Agenda etc.:
 * o administrador libera outros módulos manualmente, se quiser.
 */
export async function grantProjectModules(admin: Db, organizationId: string, userId: string) {
  const { data: mods } = await admin.from("modules").select("id, code").in("code", ["projects"]);
  const rows = ((mods ?? []) as { id: string }[]).map((m) => ({
    organization_id: organizationId,
    user_id: userId,
    module_id: m.id,
    can_access: true,
    updated_at: new Date().toISOString(),
  }));
  if (!rows.length) return;
  const { error } = await admin
    .from("user_module_permissions")
    .upsert(rows, { onConflict: "organization_id,user_id,module_id" });
  if (error) throw new Error(`Não foi possível liberar o módulo Projetos: ${error.message}`);
}

export type TeamSeat = {
  user_id: string;
  name: string | null;
  email: string | null;
  department: string | null;
  access_role: "gestor" | "editor" | "executor" | "visualizador";
};

/**
 * Coloca a equipe do modelo no projeto. Quem já está no projeto mantém o papel
 * (só ganha o departamento se não tinha). Só entra quem é da equipe ativa da empresa.
 */
export async function addTeamToProject(
  admin: Db,
  opts: { projectId: string; organizationId: string; ownerId?: string | null; seats: TeamSeat[] },
) {
  if (!opts.seats.length) return 0;
  const ids = opts.seats.map((s) => s.user_id);
  const { data: members } = await admin
    .from("organization_members")
    .select("user_id, role, status")
    .eq("organization_id", opts.organizationId)
    .in("user_id", ids);
  const active = new Set(
    ((members ?? []) as any[])
      .filter((m) => m.status === "active" && m.role !== "guest")
      .map((m) => m.user_id as string),
  );
  const { data: existing } = await admin
    .from("project_members")
    .select("id, user_id, role")
    .eq("project_id", opts.projectId)
    .in("user_id", ids);
  const byUser = new Map(((existing ?? []) as any[]).map((r) => [r.user_id as string, r]));
  let added = 0;
  for (const s of opts.seats) {
    if (!active.has(s.user_id)) continue;
    const cur = byUser.get(s.user_id);
    if (cur) {
      if (!cur.role && s.department) {
        await admin.from("project_members").update({ role: s.department }).eq("id", cur.id);
      }
      continue;
    }
    const { error } = await admin.from("project_members").insert({
      project_id: opts.projectId,
      user_id: s.user_id,
      access_role: s.access_role,
      status: "active",
      name: s.name,
      email: s.email,
      role: s.department || null,
      invited_at: new Date().toISOString(),
      ...(opts.ownerId ? { owner_id: opts.ownerId } : {}),
    });
    if (error) throw new Error(error.message);
    await grantProjectModules(admin, opts.organizationId, s.user_id);
    added++;
  }
  return added;
}
