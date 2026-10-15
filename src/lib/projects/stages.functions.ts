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
  /** cronograma por fases/semanas */
  phase: string | null;
  week_label: string | null;
  start_offset_days: number | null;
  duration_days: number | null;
  alert: string | null;
};

export type TemplateTask = {
  title: string;
  description: string | null;
  due_offset_days: number;
  responsible_type?: "equipe" | "cliente";
  visible_to_client?: boolean;
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
    phase?: string | null;
    week_label?: string | null;
    start_offset_days?: number | null;
    alert?: string | null;
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
  phase: z.string().trim().max(120).nullable().optional(),
  week_label: z.string().trim().max(60).nullable().optional(),
  alert: z.string().trim().max(1000).nullable().optional(),
});

const dayMs = 86_400_000;
const toDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDaysIso = (iso: string, n: number) => isoDay(new Date(toDay(iso).getTime() + n * dayMs));
const diffDays = (a: string, b: string) =>
  Math.round((toDay(a).getTime() - toDay(b).getTime()) / dayMs);

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
      .select(
        "id, project_id, name, description, sort_order, start_date, due_date, status, percent, notes, phase, week_label, start_offset_days, duration_days, alert",
      )
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
    const { data: proj } = await db
      .from("projects")
      .select("start_date")
      .eq("id", data.project_id)
      .maybeSingle();
    const projectStart = (proj?.start_date as string | null) ?? null;

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
      phase: s.phase || null,
      week_label: s.week_label || null,
      alert: s.alert || null,
      // dia de início e duração acompanham as datas digitadas (base do recálculo)
      start_offset_days: projectStart && s.start_date ? diffDays(s.start_date, projectStart) : null,
      duration_days:
        s.start_date && s.due_date ? Math.max(1, diffDays(s.due_date, s.start_date) + 1) : null,
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
        .update({
          status: data.status,
          percent: percentForStatus(data.status, 50),
          updated_at: now,
        })
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
      .select(
        "id, template_id, name, description, sort_order, duration_days, phase, week_label, start_offset_days, alert",
      )
      .in("template_id", ids)
      .order("sort_order");
    if (sErr) throw new Error(sErr.message);
    const stageList = (stages ?? []) as any[];
    let tasks: any[] = [];
    if (stageList.length) {
      const { data: tRows } = await db
        .from("project_template_tasks")
        .select(
          "stage_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client",
        )
        .in(
          "stage_id",
          stageList.map((s) => s.id as string),
        )
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
              responsible_type: (k.responsible_type ?? "equipe") as "equipe" | "cliente",
              visible_to_client: !!k.visible_to_client,
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
              phase: z.string().trim().max(120).nullable().optional(),
              week_label: z.string().trim().max(60).nullable().optional(),
              start_offset_days: z.number().int().min(0).max(1500).nullable().optional(),
              alert: z.string().trim().max(1000).nullable().optional(),
              tasks: z
                .array(
                  z.object({
                    title: z.string().trim().min(1).max(200),
                    description: z.string().trim().max(1000).nullable().optional(),
                    due_offset_days: z.number().int().min(0).max(365).default(0),
                    responsible_type: z.enum(["equipe", "cliente"]).default("equipe"),
                    visible_to_client: z.boolean().default(false),
                  }),
                )
                .max(60)
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
        .update({
          name: data.name,
          description: data.description ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", templateId);
      if (error) throw new Error(error.message);
      const { error: dErr } = await db
        .from("project_template_stages")
        .delete()
        .eq("template_id", templateId);
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
      phase: s.phase || null,
      week_label: s.week_label || null,
      start_offset_days: s.start_offset_days ?? null,
      alert: s.alert || null,
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
        responsible_type: t.responsible_type ?? "equipe",
        visible_to_client: t.visible_to_client ?? false,
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
    const { error } = await db
      .from("project_templates")
      .update({ active: false })
      .eq("id", data.id);
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
    .select(
      "id, name, description, sort_order, duration_days, phase, week_label, start_offset_days, alert",
    )
    .eq("template_id", opts.templateId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  const list = (stages ?? []) as any[];
  if (list.length === 0) return 0;

  // Dia inicial definido no modelo (cronograma por fases): início do projeto + dia.
  // Sem dia inicial: etapas em sequência, como antes.
  const base = opts.startDate ? opts.startDate.slice(0, 10) : null;
  let cursor = base;
  const startByOrder = new Map<number, string | null>();
  const rows = list.map((s, i) => {
    const dur = s.duration_days ?? 7;
    let start: string | null = null;
    let due: string | null = null;
    if (base) {
      if (s.start_offset_days != null) {
        start = addDaysIso(base, Number(s.start_offset_days));
        due = addDaysIso(start, Math.max(1, dur) - 1);
        cursor = addDaysIso(due, 1);
      } else if (cursor) {
        start = cursor;
        due = addDaysIso(start, dur);
        cursor = due;
      }
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
      phase: s.phase ?? null,
      week_label: s.week_label ?? null,
      alert: s.alert ?? null,
      start_offset_days: s.start_offset_days ?? (base && start ? diffDays(start, base) : null),
      duration_days: s.duration_days ?? null,
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
      .select(
        "stage_id, title, description, due_offset_days, sort_order, responsible_type, visible_to_client",
      )
      .in(
        "stage_id",
        list.map((s) => s.id as string),
      )
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
              responsible_type: t.responsible_type ?? "equipe",
              visible_to_client: !!t.visible_to_client,
            };
          });
      });
      if (taskRows.length) await db.from("tasks").insert(taskRows);
    }
  } catch {
    // tarefas padrão são complementares
  }

  // Departamentos e planilhas de custo do modelo (estrutura, sem lançamentos)
  try {
    const { copyTemplateDepartmentsToProject } = await import("./costs.server");
    await copyTemplateDepartmentsToProject(db, {
      templateId: opts.templateId,
      projectId: opts.projectId,
      organizationId: opts.organizationId,
    });
  } catch {
    // estrutura de custos é complementar
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

    const startDate =
      (project?.start_date as string | null) ?? new Date().toISOString().slice(0, 10);

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
  responsible_type: "equipe" | "cliente";
  visible_to_client: boolean;
  completed_at: string | null;
  assignee_id: string | null;
};

/**
 * Quem pode ser responsável por tarefas: pessoas liberadas no projeto como gestor,
 * editor ou executor; e o cliente do projeto, que executa as tarefas dele pelo portal.
 */
const ASSIGNABLE_ROLES = ["gestor", "editor", "executor"];

async function assertAssignable(
  db: any,
  projectId: string,
  userId: string,
  kind: "equipe" | "cliente" = "equipe",
) {
  const { data } = await db
    .from("project_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("status", "active")
    .in("access_role", kind === "cliente" ? ["cliente"] : ASSIGNABLE_ROLES)
    .limit(1);
  if (!data?.length) {
    throw new Error(
      kind === "cliente"
        ? "Esta pessoa não é cliente deste projeto. Convide o cliente em Equipe e permissões."
        : "Esta pessoa não tem permissão para executar tarefas neste projeto. Libere em Equipe e permissões.",
    );
  }
}

export const listProjectStageTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ project_id: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<StageTask[]> => {
    const db = context.supabase as any;
    const { data: rows, error } = await db
      .from("tasks")
      .select(
        "id, stage_id, title, status, due_date, priority, responsible_type, visible_to_client, completed_at, assignee_id",
      )
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
        responsible_type: z.enum(["equipe", "cliente"]).default("equipe"),
        visible_to_client: z.boolean().default(false),
        assignee_id: uuid.nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const organization_id = await orgOfProject(db, data.project_id);
    const assignee = data.assignee_id ?? null;
    if (assignee) await assertAssignable(db, data.project_id, assignee, data.responsible_type);
    // id gerado aqui: permite anexar arquivos logo após criar (insert sem "returning")
    const id = crypto.randomUUID();
    const { error } = await db.from("tasks").insert({
      id,
      owner_id: context.userId,
      organization_id,
      project_id: data.project_id,
      stage_id: data.stage_id,
      title: data.title,
      status: "a_fazer",
      priority: "media",
      due_date: data.due_date ? new Date(data.due_date).toISOString() : null,
      position: 0,
      responsible_type: data.responsible_type,
      visible_to_client: data.visible_to_client || data.responsible_type === "cliente",
      assignee_id: assignee,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, id };
  });

/** Responsável pela tarefa (equipe ou cliente) e se o cliente acompanha pelo portal. */
export const setStageTaskClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        task_id: uuid,
        responsible_type: z.enum(["equipe", "cliente"]).optional(),
        visible_to_client: z.boolean().optional(),
        /** pessoa responsável: da equipe ou o cliente do projeto (null = sem pessoa) */
        assignee_id: uuid.nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const patch: Record<string, unknown> = {};
    if (data.responsible_type) {
      patch.responsible_type = data.responsible_type;
      // tarefa do cliente sempre aparece no portal
      if (data.responsible_type === "cliente") patch.visible_to_client = true;
    }
    if (data.assignee_id !== undefined) {
      if (data.assignee_id) {
        const { data: task } = await db
          .from("tasks")
          .select("project_id")
          .eq("id", data.task_id)
          .maybeSingle();
        if (!task?.project_id) throw new Error("Tarefa não encontrada.");
        await assertAssignable(
          db,
          task.project_id,
          data.assignee_id,
          data.responsible_type ?? "equipe",
        );
      }
      patch.assignee_id = data.assignee_id;
    }
    if (data.visible_to_client !== undefined) patch.visible_to_client = data.visible_to_client;
    const { data: row, error } = await db
      .from("tasks")
      .update(patch)
      .eq("id", data.task_id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sem permissão para alterar esta tarefa.");
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

// ---------- Cronograma: recalcular e deslocar datas ----------

type StageRow = {
  id: string;
  sort_order: number;
  start_date: string | null;
  due_date: string | null;
  start_offset_days: number | null;
  duration_days: number | null;
};

/** Move as tarefas em aberto das etapas indicadas (mantém a distância dentro da etapa). */
async function shiftStageTasks(db: any, projectId: string, deltas: Map<string, number>) {
  const ids = [...deltas.entries()].filter(([, d]) => d !== 0).map(([id]) => id);
  if (!ids.length) return 0;
  const { data: tasks, error } = await db
    .from("tasks")
    .select("id, stage_id, due_date, start_date, status")
    .eq("project_id", projectId)
    .in("stage_id", ids);
  if (error) throw new Error(error.message);
  const list = ((tasks ?? []) as any[]).filter(
    (t) => t.status !== "concluido" && t.status !== "cancelado" && (t.due_date || t.start_date),
  );
  const shift = (iso: string | null, n: number) =>
    iso ? new Date(new Date(iso).getTime() + n * dayMs).toISOString() : null;
  for (let i = 0; i < list.length; i += 20) {
    await Promise.all(
      list.slice(i, i + 20).map(async (t) => {
        const n = deltas.get(t.stage_id) ?? 0;
        const { error: e } = await db
          .from("tasks")
          .update({ due_date: shift(t.due_date, n), start_date: shift(t.start_date, n) })
          .eq("id", t.id);
        if (e) throw new Error(e.message);
      }),
    );
  }
  return list.length;
}

async function updateProjectDue(db: any, projectId: string) {
  const { data } = await db
    .from("project_stages")
    .select("due_date")
    .eq("project_id", projectId)
    .not("due_date", "is", null)
    .order("due_date", { ascending: false })
    .limit(1);
  const last = (data?.[0]?.due_date as string | undefined) ?? null;
  if (last) await db.from("projects").update({ due_date: last }).eq("id", projectId);
}

/**
 * Nova data de início do projeto: recalcula todas as etapas pelo dia inicial e
 * duração de cada uma (cronograma por fases/semanas) e leva junto as tarefas em aberto.
 */
export const rescheduleProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ project_id: uuid, start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: rows, error } = await db
      .from("project_stages")
      .select("id, sort_order, start_date, due_date, start_offset_days, duration_days")
      .eq("project_id", data.project_id)
      .order("sort_order");
    if (error) throw new Error(error.message);
    const stages = (rows ?? []) as StageRow[];
    const { data: proj } = await db
      .from("projects")
      .select("start_date")
      .eq("id", data.project_id)
      .maybeSingle();
    const oldBase = (proj?.start_date as string | null) ?? null;

    const deltas = new Map<string, number>();
    let cursor = data.start_date;
    for (const s of stages) {
      const dur =
        s.duration_days ??
        (s.start_date && s.due_date ? Math.max(1, diffDays(s.due_date, s.start_date) + 1) : 7);
      const offset =
        s.start_offset_days ??
        (s.start_date && oldBase
          ? diffDays(s.start_date, oldBase)
          : diffDays(cursor, data.start_date));
      const start = addDaysIso(data.start_date, offset);
      const due = addDaysIso(start, dur - 1);
      cursor = addDaysIso(due, 1);
      if (s.start_date) deltas.set(s.id, diffDays(start, s.start_date));
      const { error: e } = await db
        .from("project_stages")
        .update({
          start_date: start,
          due_date: due,
          start_offset_days: offset,
          duration_days: dur,
          updated_at: new Date().toISOString(),
        })
        .eq("id", s.id);
      if (e) throw new Error(e.message);
    }
    const { error: pErr } = await db
      .from("projects")
      .update({ start_date: data.start_date })
      .eq("id", data.project_id);
    if (pErr) throw new Error(pErr.message);
    const moved = await shiftStageTasks(db, data.project_id, deltas);
    await updateProjectDue(db, data.project_id);
    return { ok: true as const, stages: stages.length, tasks: moved };
  });

/** Adia (+) ou adianta (−) uma etapa — e, se pedido, todas as seguintes — com as tarefas. */
export const shiftProjectStages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        project_id: uuid,
        stage_id: uuid,
        days: z.number().int().min(-365).max(365),
        following: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.days === 0) return { ok: true as const, stages: 0, tasks: 0 };
    const db = context.supabase as any;
    const { data: rows, error } = await db
      .from("project_stages")
      .select("id, sort_order, start_date, due_date, start_offset_days, duration_days")
      .eq("project_id", data.project_id)
      .order("sort_order");
    if (error) throw new Error(error.message);
    const stages = (rows ?? []) as StageRow[];
    const idx = stages.findIndex((s) => s.id === data.stage_id);
    if (idx < 0) throw new Error("Etapa não encontrada.");
    const target = data.following ? stages.slice(idx) : [stages[idx]];
    const deltas = new Map<string, number>();
    for (const s of target) {
      deltas.set(s.id, data.days);
      const { error: e } = await db
        .from("project_stages")
        .update({
          start_date: s.start_date ? addDaysIso(s.start_date, data.days) : null,
          due_date: s.due_date ? addDaysIso(s.due_date, data.days) : null,
          start_offset_days:
            s.start_offset_days != null ? Math.max(0, s.start_offset_days + data.days) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", s.id);
      if (e) throw new Error(e.message);
    }
    const moved = await shiftStageTasks(db, data.project_id, deltas);
    await updateProjectDue(db, data.project_id);
    return { ok: true as const, stages: target.length, tasks: moved };
  });
