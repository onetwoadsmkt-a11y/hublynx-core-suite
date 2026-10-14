/**
 * Cópia da estrutura de departamentos/planilhas (sem as linhas) entre modelo e projeto.
 * Usa o cliente que recebe — as regras de acesso do banco valem normalmente.
 */
type Db = { from: (t: string) => any };

type Scope = { projectId?: string | null; templateId?: string | null };

async function readStructure(db: Db, scope: Scope) {
  let q = db.from("cost_departments").select("id, name, color, position").order("position");
  q = scope.projectId ? q.eq("project_id", scope.projectId) : q.eq("template_id", scope.templateId);
  const { data: depts, error } = await q;
  if (error) throw new Error(error.message);
  const list = (depts ?? []) as { id: string; name: string; color: string; position: number }[];
  if (!list.length) return [];
  const { data: sheets, error: sErr } = await db
    .from("cost_sheets")
    .select("id, department_id, name, columns, position")
    .in(
      "department_id",
      list.map((d) => d.id),
    )
    .order("position");
  if (sErr) throw new Error(sErr.message);
  return list.map((d) => ({
    ...d,
    sheets: ((sheets ?? []) as any[]).filter((s) => s.department_id === d.id),
  }));
}

async function writeStructure(
  db: Db,
  organizationId: string,
  target: Scope,
  structure: Awaited<ReturnType<typeof readStructure>>,
  startPosition = 0,
) {
  let pos = startPosition;
  for (const d of structure) {
    const { data: dept, error } = await db
      .from("cost_departments")
      .insert({
        organization_id: organizationId,
        project_id: target.projectId ?? null,
        template_id: target.templateId ?? null,
        name: d.name,
        color: d.color,
        position: pos++,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (d.sheets.length) {
      const { error: sErr } = await db.from("cost_sheets").insert(
        d.sheets.map((s: any, i: number) => ({
          organization_id: organizationId,
          department_id: dept.id,
          name: s.name,
          columns: s.columns ?? [],
          position: i,
        })),
      );
      if (sErr) throw new Error(sErr.message);
    }
  }
}

export async function copyTemplateDepartmentsToProject(
  db: Db,
  opts: { templateId: string; projectId: string; organizationId: string },
) {
  const structure = await readStructure(db, { templateId: opts.templateId });
  if (!structure.length) return 0;
  const existing = await readStructure(db, { projectId: opts.projectId });
  const names = new Set(existing.map((d) => d.name.trim().toLowerCase()));
  const missing = structure.filter((d) => !names.has(d.name.trim().toLowerCase()));
  await writeStructure(
    db,
    opts.organizationId,
    { projectId: opts.projectId },
    missing,
    existing.length,
  );
  return missing.length;
}

export async function replaceTemplateDepartmentsFromProject(
  db: Db,
  opts: { templateId: string; projectId: string; organizationId: string },
) {
  const structure = await readStructure(db, { projectId: opts.projectId });
  const { error } = await db.from("cost_departments").delete().eq("template_id", opts.templateId);
  if (error) throw new Error(error.message);
  await writeStructure(db, opts.organizationId, { templateId: opts.templateId }, structure);
  return structure.length;
}
