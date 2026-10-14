import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fase 2 e 3 — equipe do projeto com papéis e convite do cliente para o portal.
 * As regras de acesso valem no banco (RLS + funções can_*_project); aqui o servidor
 * confere a permissão antes de usar a chave de serviço para ler nomes e e-mails.
 */

export const PROJECT_ROLES = ["gestor", "editor", "executor", "visualizador", "cliente"] as const;
export type ProjectAccessRole = (typeof PROJECT_ROLES)[number];

export type ProjectMemberRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  access_role: ProjectAccessRole;
  status: string;
  invited_at: string | null;
};

const uuid = z.string().uuid();
type Db = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

async function rpcBool(db: Db, fn: string, projectId: string): Promise<boolean> {
  const { data, error } = await db.rpc(fn, { _project: projectId });
  if (error) throw new Error(error.message);
  return data === true;
}

async function projectOrg(db: Db, projectId: string) {
  const { data, error } = await db
    .from("projects")
    .select("id, name, organization_id, portal_slug, project_number")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Projeto não encontrado ou sem acesso.");
  return data as {
    id: string;
    name: string;
    organization_id: string;
    portal_slug: string | null;
    project_number: number | null;
  };
}

/** Permissões do usuário atual no projeto + membros com nome e e-mail. */
export const getProjectAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const project = await projectOrg(db, data.projectId);
    const [canEdit, canManage, roleRes, orgRes, adminRes] = await Promise.all([
      rpcBool(db, "can_edit_project", data.projectId),
      rpcBool(db, "can_manage_project", data.projectId),
      db.rpc("project_role", { _project: data.projectId }),
      db
        .from("organizations")
        .select("projects_restricted")
        .eq("id", project.organization_id)
        .maybeSingle(),
      db.rpc("is_org_admin", { _org: project.organization_id }),
    ]);

    const { data: rows, error } = await db
      .from("project_members")
      .select("id, user_id, name, email, role, access_role, status, invited_at")
      .eq("project_id", data.projectId)
      .order("created_at");
    if (error) throw new Error(error.message);
    const members = (rows ?? []) as ProjectMemberRow[];

    // Nomes e e-mails de quem tem login (perfis são privados por RLS)
    const ids = members.map((m) => m.user_id).filter(Boolean) as string[];
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const admin = supabaseAdmin as unknown as Db & { auth: any };
      const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", ids);
      const nameById = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p.full_name]));
      for (const m of members) {
        if (!m.user_id) continue;
        m.name = m.name || (nameById.get(m.user_id) as string | null) || null;
        if (!m.email) {
          try {
            const { data: u } = await admin.auth.admin.getUserById(m.user_id);
            m.email = u?.user?.email ?? null;
          } catch {
            /* sem e-mail */
          }
        }
      }
    }

    const portalPath = `/portal/${project.portal_slug || project.id}`;
    return {
      projectId: project.id,
      organizationId: project.organization_id,
      projectNumber: project.project_number ?? null,
      portalSlug: project.portal_slug ?? null,
      portalUrl: `${appOrigin()}${portalPath}`,
      myRole: (roleRes?.data as ProjectAccessRole | null) ?? null,
      canEdit,
      canManage,
      isOrgAdmin: adminRes?.data === true,
      restricted: !!(orgRes?.data as any)?.projects_restricted,
      members,
    };
  });

/** Pessoas da equipe da empresa (sem clientes) para adicionar ao projeto. */
export const listOrgTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    if (!(await rpcBool(db, "can_manage_project", data.projectId))) {
      throw new Error("Só o gestor do projeto ou o administrador pode adicionar pessoas.");
    }
    const project = await projectOrg(db, data.projectId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Db & { auth: any };
    const { data: mem, error } = await admin
      .from("organization_members")
      .select("user_id, role, status")
      .eq("organization_id", project.organization_id)
      .eq("status", "active")
      .neq("role", "guest");
    if (error) throw new Error(error.message);
    const ids = ((mem ?? []) as any[]).map((m) => m.user_id as string);
    if (!ids.length) return [];
    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", ids);
    const nameById = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p.full_name]));
    const out: { user_id: string; name: string; email: string | null; org_role: string }[] = [];
    for (const m of (mem ?? []) as any[]) {
      let email: string | null = null;
      try {
        const { data: u } = await admin.auth.admin.getUserById(m.user_id);
        email = u?.user?.email ?? null;
      } catch {
        /* ignora */
      }
      out.push({
        user_id: m.user_id,
        name: (nameById.get(m.user_id) as string) || email || "Usuário",
        email,
        org_role: m.role,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  });

/** Adiciona ou altera o papel de uma pessoa da equipe no projeto. */
export const setProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        userId: uuid,
        accessRole: z.enum(["gestor", "editor", "executor", "visualizador"]),
        label: z.string().trim().max(120).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    if (!(await rpcBool(db, "can_manage_project", data.projectId))) {
      throw new Error("Só o gestor do projeto ou o administrador pode alterar a equipe.");
    }
    const { data: existing } = await db
      .from("project_members")
      .select("id, access_role")
      .eq("project_id", data.projectId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (existing?.access_role === "cliente") {
      throw new Error("Esta pessoa é o cliente do projeto. Remova o acesso de cliente antes.");
    }
    // project_members.name é obrigatório: usa o nome do perfil (ou o e-mail)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Db & { auth: any };
    const { data: prof } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", data.userId)
      .maybeSingle();
    let email: string | null = null;
    try {
      const { data: u } = await admin.auth.admin.getUserById(data.userId);
      email = u?.user?.email ?? null;
    } catch {
      /* sem acesso ao auth: segue com o perfil */
    }
    const fullName = ((prof as { full_name?: string | null } | null)?.full_name ?? "").trim();
    const payload: Record<string, unknown> = {
      project_id: data.projectId,
      user_id: data.userId,
      access_role: data.accessRole,
      status: "active",
      owner_id: context.userId,
      name: fullName || email || "Usuário",
      email,
    };
    if (data.label !== undefined) payload.role = data.label || null;
    const { error } = existing
      ? await db.from("project_members").update(payload).eq("id", existing.id)
      : await db.from("project_members").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/**
 * Convida uma pessoa nova para a equipe da empresa e já a coloca no projeto.
 * Só o administrador da empresa: a pessoa vira usuário da empresa (conta no plano).
 * Cria a conta com senha gerada (ou usa a conta que já existe) e envia o convite
 * pelo Gmail/SMTP conectado, como no convite do cliente.
 */
export const inviteTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        name: z.string().trim().min(1).max(160),
        email: z.string().trim().toLowerCase().email().max(200),
        accessRole: z.enum(["gestor", "editor", "executor", "visualizador"]),
        label: z.string().trim().max(120).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const project = await projectOrg(db, data.projectId);
    const { data: isAdmin } = await db.rpc("is_org_admin", { _org: project.organization_id });
    if (isAdmin !== true) {
      throw new Error("Só o administrador da empresa pode cadastrar uma pessoa nova na equipe.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Db & { auth: any };
    const { generatePassword, sendClientInviteMail } = await import("./client-invite.server");

    // 1) Conta: nova com senha gerada, ou a existente (sem trocar a senha)
    let userId: string | null = null;
    let password: string | null = generatePassword();
    const created = await admin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.name, temp_password: true },
    });
    if (!created.error && created.data?.user) {
      userId = created.data.user.id;
    } else {
      const gen = await admin.auth.admin.generateLink({ type: "magiclink", email: data.email });
      userId = gen.data?.user?.id ?? null;
      password = null;
      if (!userId) {
        throw new Error(
          created.error?.message ?? gen.error?.message ?? "Não foi possível criar a conta.",
        );
      }
    }

    // 2) Vínculo com a empresa como usuário da equipe (cliente do portal não vira equipe)
    const { data: membership } = await admin
      .from("organization_members")
      .select("id, role, status")
      .eq("organization_id", project.organization_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (membership?.role === "guest") {
      throw new Error(
        "Este e-mail é de um cliente do portal. Use outro e-mail para a pessoa da equipe.",
      );
    }
    if (!membership) {
      const { error } = await admin.from("organization_members").insert({
        organization_id: project.organization_id,
        user_id: userId,
        role: "user",
        status: "active",
      });
      if (error) throw new Error(error.message);
    } else if (membership.status !== "active") {
      await admin.from("organization_members").update({ status: "active" }).eq("id", membership.id);
    }

    // 3) Papel no projeto
    const { data: existing } = await admin
      .from("project_members")
      .select("id, access_role")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    const payload: Record<string, unknown> = {
      project_id: data.projectId,
      user_id: userId,
      access_role: data.accessRole,
      status: "active",
      name: data.name,
      email: data.email,
      role: data.label || null,
      invited_at: new Date().toISOString(),
      owner_id: context.userId,
    };
    const { error: pmErr } = existing
      ? await admin.from("project_members").update(payload).eq("id", existing.id)
      : await admin.from("project_members").insert(payload);
    if (pmErr) throw new Error(pmErr.message);

    // 4) Convite por e-mail
    const loginUrl = `${appOrigin()}/projetos/${data.projectId}`;
    const mail = await sendClientInviteMail(admin, {
      inviterId: context.userId,
      organizationId: project.organization_id,
      projectName: project.name,
      projectNumber: project.project_number,
      clientName: data.name,
      clientEmail: data.email,
      password,
      portalUrl: loginUrl,
      audience: "equipe",
    });
    return {
      ok: true as const,
      portalUrl: loginUrl,
      email: data.email,
      password,
      emailSent: mail.sent,
      sentFrom: mail.from,
      emailError: mail.error,
    };
  });

export const updateProjectMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        accessRole: z.enum(["gestor", "editor", "executor", "visualizador"]).optional(),
        label: z.string().trim().max(120).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const patch: Record<string, unknown> = {};
    if (data.accessRole) patch.access_role = data.accessRole;
    if (data.label !== undefined) patch.role = data.label || null;
    const { data: row, error } = await db
      .from("project_members")
      .update(patch)
      .eq("id", data.id)
      .neq("access_role", "cliente")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sem permissão para alterar este membro.");
    return { ok: true as const };
  });

export const removeProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { data: row, error } = await db
      .from("project_members")
      .delete()
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sem permissão para remover este membro.");
    return { ok: true as const };
  });

/** Liga/desliga "cada projeto só para a sua equipe" na empresa (somente administrador). */
export const setProjectsRestricted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: uuid, restricted: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { data: isAdmin } = await db.rpc("is_org_admin", { _org: data.organizationId });
    if (isAdmin !== true)
      throw new Error("Somente o administrador da empresa pode alterar esta regra.");
    const { error } = await db
      .from("organizations")
      .update({ projects_restricted: data.restricted })
      .eq("id", data.organizationId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Origem pública do app (para o link do convite). */
function appOrigin(): string {
  try {
    const req = getRequest();
    const origin = req?.headers.get("origin");
    if (origin) return origin.replace(/\/$/, "");
    const host = req?.headers.get("x-forwarded-host") ?? req?.headers.get("host");
    if (host) return `https://${host}`;
  } catch {
    /* fora de requisição */
  }
  return "https://core.hublynx.com.br";
}

/**
 * Convida o cliente (lead convertido / franqueado) para o portal do projeto.
 * Cria a conta com senha gerada e envia o convite pelo e-mail conectado de quem
 * convida; devolve também e-mail e senha para mandar por WhatsApp. O cliente entra na empresa como "guest":
 * não vê leads, outros clientes, valores nem tarefas internas.
 */
export const inviteProjectClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        email: z.string().trim().toLowerCase().email().max(200),
        name: z.string().trim().min(1).max(160),
        /** edição: acesso de cliente que este convite substitui (troca de e-mail) */
        replaceId: uuid.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    if (!(await rpcBool(db, "can_manage_project", data.projectId))) {
      throw new Error("Só o gestor do projeto ou o administrador pode convidar o cliente.");
    }
    const project = await projectOrg(db, data.projectId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Db & { auth: any };
    const { generatePassword, sendClientInviteMail } = await import("./client-invite.server");
    const portalUrl = `${appOrigin()}/portal/${project.portal_slug || project.id}`;

    // 1) Conta do cliente com senha gerada (sem e-mail do Supabase: quem envia é o Core)
    let userId: string | null = null;
    let password: string | null = generatePassword();
    let existed = false;
    const created = await admin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.name, temp_password: true },
    });
    if (!created.error && created.data?.user) {
      userId = created.data.user.id;
    } else {
      existed = true;
      // só descobre o id da conta existente (não envia nada)
      const gen = await admin.auth.admin.generateLink({ type: "magiclink", email: data.email });
      userId = gen.data?.user?.id ?? null;
      if (!userId) {
        throw new Error(
          created.error?.message ??
            gen.error?.message ??
            "Não foi possível criar o acesso do cliente.",
        );
      }
      // Conta de equipe (em qualquer empresa) ou da plataforma: nunca troca a senha.
      const [{ data: staff }, { data: platform }] = await Promise.all([
        admin
          .from("organization_members")
          .select("id")
          .eq("user_id", userId)
          .neq("role", "guest")
          .limit(1),
        admin.from("platform_admins").select("user_id").eq("user_id", userId).limit(1),
      ]);
      if (staff?.length || platform?.length) {
        password = null;
      } else {
        const upd = await admin.auth.admin.updateUserById(userId, {
          password,
          email_confirm: true,
          user_metadata: { full_name: data.name, temp_password: true },
        });
        if (upd.error) throw new Error(upd.error.message);
      }
    }

    // 2) Vínculo com a empresa: cliente entra como guest (equipe continua equipe)
    const { data: membership } = await admin
      .from("organization_members")
      .select("id, role, status")
      .eq("organization_id", project.organization_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (membership && membership.role !== "guest") {
      throw new Error(
        "Este e-mail já é de alguém da equipe da empresa. Use outro e-mail para o cliente.",
      );
    }
    if (!membership) {
      const { error } = await admin.from("organization_members").insert({
        organization_id: project.organization_id,
        user_id: userId,
        role: "guest",
        status: "active",
      });
      if (error) throw new Error(error.message);
    } else if (membership.status !== "active") {
      await admin.from("organization_members").update({ status: "active" }).eq("id", membership.id);
    }

    // 3) Acesso ao projeto como cliente
    const { data: existing } = await admin
      .from("project_members")
      .select("id")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    const payload = {
      project_id: data.projectId,
      user_id: userId,
      access_role: "cliente",
      status: "active",
      name: data.name,
      email: data.email,
      role: "Cliente",
      invited_at: new Date().toISOString(),
      owner_id: context.userId,
    };
    const { error: pmErr } = existing
      ? await admin.from("project_members").update(payload).eq("id", existing.id)
      : await admin.from("project_members").insert(payload);
    if (pmErr) throw new Error(pmErr.message);

    // 4) Edição com e-mail novo: tira o acesso antigo deste projeto
    if (data.replaceId) {
      const { data: old } = await admin
        .from("project_members")
        .select("id, user_id")
        .eq("id", data.replaceId)
        .eq("project_id", data.projectId)
        .eq("access_role", "cliente")
        .maybeSingle();
      if (old && old.user_id !== userId) {
        await admin.from("project_members").delete().eq("id", old.id);
        if (old.user_id) {
          // sem outro projeto como cliente nesta empresa: sai do vínculo guest
          const { data: others } = await admin
            .from("project_members")
            .select("id")
            .eq("user_id", old.user_id)
            .eq("organization_id", project.organization_id)
            .eq("access_role", "cliente")
            .limit(1);
          if (!others?.length) {
            await admin
              .from("organization_members")
              .delete()
              .eq("organization_id", project.organization_id)
              .eq("user_id", old.user_id)
              .eq("role", "guest");
          }
        }
      }
    }

    // 5) E-mail de convite enviado pela caixa de e-mail conectada de quem convida
    const mail = await sendClientInviteMail(admin, {
      inviterId: context.userId,
      organizationId: project.organization_id,
      projectName: project.name,
      projectNumber: project.project_number,
      clientName: data.name,
      clientEmail: data.email,
      password,
      portalUrl,
    });

    return {
      ok: true as const,
      existed,
      portalUrl,
      email: data.email,
      password,
      emailSent: mail.sent,
      sentFrom: mail.from,
      emailError: mail.error,
    };
  });

/** Remove o acesso do cliente ao projeto (a conta continua existindo). */
export const revokeProjectClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    const { data: row, error } = await db
      .from("project_members")
      .delete()
      .eq("id", data.id)
      .eq("access_role", "cliente")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sem permissão para remover o cliente.");
    return { ok: true as const };
  });

/**
 * Link personalizado do portal: padrão <número>-<cliente>-<empresa>.
 * Vazio volta ao padrão. Só gestor/administrador altera.
 */
export const updatePortalSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: uuid, slug: z.string().trim().max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as Db;
    if (!(await rpcBool(db, "can_manage_project", data.projectId))) {
      throw new Error("Só o gestor do projeto ou o administrador pode alterar o link.");
    }
    const clean = data.slug
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
    const { data: row, error } = await db
      .from("projects")
      .update({ portal_slug: clean || "" })
      .eq("id", data.projectId)
      .select("portal_slug")
      .maybeSingle();
    if (error) {
      if (/duplicate|unique/i.test(error.message))
        throw new Error("Este link já está em uso em outro projeto.");
      throw new Error(error.message);
    }
    if (!row) throw new Error("Sem permissão para alterar o link.");
    return {
      slug: row.portal_slug as string,
      portalUrl: `${appOrigin()}/portal/${row.portal_slug}`,
    };
  });
