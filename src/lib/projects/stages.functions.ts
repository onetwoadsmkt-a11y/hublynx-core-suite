import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Etapas do roadmap agora vivem em public.project_stages (Etapa 3). */
export type StageStatus = "not_started" | "in_progress" | "waiting" | "blocked" | "done";

export type ProjectStage = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  start_date: string | null;
  due_date: string | null;
  status: StageStatus;
  percent: number;
  notes: string | null;
};

export type TemplateTask = {
  title: string;
  description: string | null;
  due_offset_days: number;
};

export type ProjectTemplate = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  active: boolean;
  stages: {
    id: string;
    name: string;
    description: string | null;
    sort_order: number;
    duration_days: number | null;
    tasks: TemplateTask[];
  }[];
};

const uuid = z.string().uuid();
const statusEnum = z.enum(["not_started", "in_progress", "waiting", "blocked", "done"]);

const stageInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  start_date: z.string().nullable().optional(),
  due_date: z.string().nullable().optional(),
  status: statusEnum.default("not_started"),
  percent: z.number().int().min(0).max(100).default(0),
  notes: z.string().max(2000).nullable().optional(),
});

function percentForStatus(status: StageStatus, current: number) {
  if (status === "done") return 100;
  if (status === "not_started") return 0;
  return current > 0 && current < 100 ? current : 50;
}

async function orgOfProject(db: any, projectId: string): Promise<string> {
  const { data, error } = await db
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .single();
  if (error) throw new Error(error.message);
  const org = data?.organization_id as string | null;
  if (!org) throw new Error("Projeto sem empresa vinculada.");
  return org;
}

export const listProjectStages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ project_id: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<ProjectStage[]> => {
    const db = context.supabase as any;
    const { data: rows, error } = await db
      .from("project_stages")
      .select("id, project_id, name, description, sort_order, start_date, due_date, status, percent, notes")
      .eq("project_id", data.project_id)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return (rows ?? []) as ProjectStage[];
  });

/** Substitui a lista completa de etapas do projeto (cria, atualiza e remove). */
export const saveProjectStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ project_id: uuid, stages: z.array(stageInput).max(40) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const organization_id = await orgOfProject(db, data.project_id);

    const keep = data.stages.map((s) => s.id).filter(Boolean) as string[];
    const del = db.from("project_stages").delete().eq("project_id", data.project_id);
    const { error: delErr } = keep.length
      ? await del.not("id", "in", `(${keep.join(",")})`)
      : await del;
    if (delErr) throw new Error(delErr.message);

    const rows = data.stages.map((s, i) => ({
      ...(s.id ? { id: s.id } : {}),
      project_id: data.project_id,
      organization_id,
      name: s.name,
      description: s.description ?? null,
      sort_order: i,
      start_date: s.start_date || null,
      due_date: s.due_date || null,
      status: s.status,
      percent: percentForStatus(s.status, s.percent),
      notes: s.notes ?? null,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error } = await db.from("project_stages").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    return { ok: true as const, count: rows.length };
  });

/** Avança/retrocede uma etapa: tudo antes fica concluído, o resto pendente. */
export const setStageProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ project_id: uuid, stage_id: uuid, status: statusEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: rows, error } = await db
      .from("project_stages")
      .select("id, sort_order")
      .eq("project_id", data.project_id)
      .order("sort_order");
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as { id: string; sort_order: number }[];
    const idx = list.findIndex((s) => s.id === data.stage_id);
    if (idx < 0) throw new Error("Etapa não encontrada.");

    const now = new Date().toISOString();
    if (data.status === "done" || data.status === "not_started") {
      const doneIds = list
        .filter((_, i) => (data.status === "done" ? i <= idx : i < idx))
        .map((s) => s.id);
      const pendingIds = list.filter((s) => !doneIds.includes(s.id)).map((s) => s.id);
      if (doneIds.length) {
        const { error: e1 } = await db
          .from("project_stages")
          .update({ status: "done", percent: 100, updated_at: now })
          .in("id", doneIds);
        if (e1) throw new Error(e1.message);
      }
      if (pendingIds.length) {
        const { error: e2 } = await db
          .from("project_stages")
          .update({ status: "not_started", percent: 0, updated_at: now })
          .in("id", pendingIds);
        if (e2) throw new Error(e2.message);
      }
    } else {
      const { error: e3 } = await db
        .from("project_stages")
        .update({ status: data.status, percent: percentForStatus(data.status, 50), updated_at: now })
        .eq("id", data.stage_id);
      if (e3) throw new Error(e3.message);
    }
    return { ok: true as const };
  });

// ---------- Modelos de projeto ----------

export const listProjectTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProjectTemplate[]> => {
    const db = context.supabase as any;
    const { data: tpls, error } = await db
      .from("project_templates")
      .select("id, organization_id, name, description, active")
      .eq("active", true)
      .order("name");
    if (error) throw new Error(error.message);
    const ids = ((tpls ?? []) as any[]).map((t) => t.id as string);
    if (ids.length === 0) return [];
    const { data: stages, error: sErr } = await db
      .from("project_template_stages")
      .select("id, template_id, name, description, sort_order, duration_days")
      .in("template_id", ids)
      .order("sort_order");
    if (sErr) throw new Error(sErr.message);
    const stageList = (stages ?? []) as any[];
    let tasks: any[] = [];
    if (stageList.length) {
      const { data: tRows } = await db
        .from("project_template_tasks")
        .select("stage_id, title, description, due_offset_days, sort_order")
        .in("stage_id", stageList.map((s) => s.id as string))
        .order("sort_order");
      tasks = (tRows ?? []) as any[];
    }
    return ((tpls ?? []) as any[]).map((t) => ({
      ...t,
      stages: stageList
        .filter((s) => s.template_id === t.id)
        .map((s) => ({
          ...s,
          tasks: tasks
            .filter((k) => k.stage_id === s.id)
            .map((k) => ({
              title: k.title as string,
              description: (k.description ?? null) as string | null,
              due_offset_days: Number(k.due_offset_days ?? 0),
            })),
        })),
    })) as ProjectTemplate[];
  });

export const saveProjectTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        organization_id: uuid,
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).nullable().optional(),
        stages: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(120),
              description: z.string().trim().max(500).nullable().optional(),
              duration_days: z.number().int().min(0).max(365).nullable().optional(),
              tasks: z
                .array(
                  z.object({
                    title: z.string().trim().min(1).max(200),
                    description: z.string().trim().max(1000).nullable().optional(),
                    due_offset_days: z.number().int().min(0).max(365).default(0),
                  }),
                )
                .max(30)
                .optional(),
            }),
          )
          .min(1)
          .max(40),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    let templateId = data.id ?? null;

    if (templateId) {
      const { error } = await db
        .from("project_templates")
        .update({ name: data.name, description: data.description ?? null, updated_at: new Date().toISOString() })
        .eq("id", templateId);
      if (error) throw new Error(error.message);
      const { error: dErr } = await db.from("project_template_stages").delete().eq("template_id", templateId);
      if (dErr) throw new Error(dErr.message);
    } else {
      const { data: created, error } = await db
        .from("project_templates")
        .insert({
          organization_id: data.organization_id,
          name: data.name,
          description: data.description ?? null,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      templateId = created.id as string;
    }

    const rows = data.stages.map((s, i) => ({
      template_id: templateId,
      organization_id: data.organization_id,
      name: s.name,
      description: s.description ?? null,
      sort_order: i,
      duration_days: s.duration_days ?? null,
    }));
    const { data: insertedStages, error: iErr } = await db
      .from("project_template_stages")
      .insert(rows)
      .select("id, sort_order");
    if (iErr) throw new Error(iErr.message);

    const stageIdByOrder = new Map<number, string>(
      ((insertedStages ?? []) as any[]).map((s) => [Number(s.sort_order), s.id as string]),
    );
    const taskRows = data.stages.flatMap((s, i) => {
      const stageId = stageIdByOrder.get(i);
      if (!stageId) return [];
      return (s.tasks ?? []).map((t, j) => ({
        stage_id: stageId,
        organization_id: data.organization_id,
        title: t.title,
        description: t.description ?? null,
        due_offset_days: t.due_offset_days ?? 0,
        sort_order: j,
      }));
    });
    if (taskRows.length) {
      const { error: tErr } = await db.from("project_template_tasks").insert(taskRows);
      if (tErr) throw new Error(tErr.message);
    }
    return { id: templateId as string };
  });

export const deleteProjectTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { error } = await db.from("project_templates").update({ active: false }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Cria as etapas de um projeto a partir de um modelo. */
export async function applyTemplateStages(
  db: any,
  opts: {
    projectId: string;
    organizationId: string;
    templateId: string;
    startDate?: string | null;
    ownerId?: string | null;
  },
) {
  const { data: stages, error } = await db
    .from("project_template_stages")
    .select("id, name, description, sort_order, duration_days")
    .eq("template_id", opts.templateId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  const list = (stages ?? []) as any[];
  if (list.length === 0) return 0;

  let cursor = opts.startDate ? new Date(`${opts.startDate}T12:00:00`) : null;
  const startByOrder = new Map<number, string | null>();
  const rows = list.map((s, i) => {
    let start: string | null = null;
    let due: string | null = null;
    if (cursor) {
      start = cursor.toISOString().slice(0, 10);
      const d = new Date(cursor);
      d.setDate(d.getDate() + (s.duration_days ?? 7));
      due = d.toISOString().slice(0, 10);
      cursor = d;
    }
    startByOrder.set(i, start);
    return {
      project_id: opts.projectId,
      organization_id: opts.organizationId,
      name: s.name,
      description: s.description ?? null,
      sort_order: i,
      start_date: start,
      due_date: due,
      status: "not_started",
      percent: 0,
    };
  });
  const { data: createdStages, error: iErr } = await db
    .from("project_stages")
    .insert(rows)
    .select("id, sort_order");
  if (iErr) throw new Error(iErr.message);

  // Tarefas padrão de cada etapa do modelo (complementares: não quebram o roadmap)
  try {
    const { data: tplTasks } = await db
      .from("project_template_tasks")
      .select("stage_id, title, description, due_offset_days, sort_order")
      .in("stage_id", list.map((s) => s.id as string))
      .order("sort_order");
    const tasks = (tplTasks ?? []) as any[];
    if (tasks.length) {
      const projectStageByOrder = new Map<number, string>(
        ((createdStages ?? []) as any[]).map((s) => [Number(s.sort_order), s.id as string]),
      );
      const taskRows = list.flatMap((tplStage, i) => {
        const projectStageId = projectStageByOrder.get(i);
        if (!projectStageId) return [];
        const stageStart = startByOrder.get(i) ?? null;
        return tasks
          .filter((t) => t.stage_id === tplStage.id)
          .map((t) => {
            let dueIso: string | null = null;
            if (stageStart) {
              const d = new Date(`${stageStart}T12:00:00`);
              d.setDate(d.getDate() + Number(t.due_offset_days ?? 0));
              dueIso = d.toISOString();
            }
            return {
              ...(opts.ownerId ? { owner_id: opts.ownerId } : {}),
              organization_id: opts.organizationId,
              project_id: opts.projectId,
              stage_id: projectStageId,
              title: t.title,
              description: t.description ?? null,
              status: "a_fazer",
              priority: "media",
              due_date: dueIso,
              position: 0,
            };
          });
      });
      if (taskRows.length) await db.from("tasks").insert(taskRows);
    }
  } catch {
    // tarefas padrão são complementares
  }
  return rows.length;
}

export const applyTemplateToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ project_id: uuid, template_id: uuid, replace: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const organization_id = await orgOfProject(db, data.project_id);

    const { data: project, error: projectErr } = await db
      .from("projects")
      .select("start_date")
      .eq("id", data.project_id)
      .single();
    if (projectErr) throw new Error(projectErr.message);

    const startDate = (project?.start_date as string | null) ?? new Date().toISOString().slice(0, 10);

    if (data.replace) {
      const { error } = await db.from("project_stages").delete().eq("project_id", data.project_id);
      if (error) throw new Error(error.message);
    }
    const count = await applyTemplateStages(db, {
      projectId: data.project_id,
      organizationId: organization_id,
      templateId: data.template_id,
      startDate,
      ownerId: context.userId,
    });
    return { ok: true as const, count };
  });

// ---------- Tarefas por etapa do roadmap ----------

export type StageTask = {
  id: string;
  stage_id: string | null;
  title: string;
  status: string;
  due_date: string | null;
  priority: string;
};

export const listProjectStageTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ project_id: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<StageTask[]> => {
    const db = context.supabase as any;
    const { data: rows, error } = await db
      .from("tasks")
      .select("id, stage_id, title, status, due_date, priority")
      .eq("project_id", data.project_id)
      .not("stage_id", "is", null)
      .order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as StageTask[];
  });

export const addProjectStageTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        project_id: uuid,
        stage_id: uuid,
        title: z.string().trim().min(1).max(200),
        due_date: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const organization_id = await orgOfProject(db, data.project_id);
    const { error } = await db.from("tasks").insert({
      owner_id: context.userId,
      organization_id,
      project_id: data.project_id,
      stage_id: data.stage_id,
      title: data.title,
      status: "a_fazer",
      priority: "media",
      due_date: data.due_date ? new Date(data.due_date).toISOString() : null,
      position: 0,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setProjectStageTaskDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ task_id: uuid, done: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { error } = await db
      .from("tasks")
      .update({
        status: data.done ? "concluido" : "a_fazer",
        completed_at: data.done ? new Date().toISOString() : null,
      })
      .eq("id", data.task_id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
