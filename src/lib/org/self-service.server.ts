// Server-only — conta criada pelo próprio usuário já nasce com a empresa de teste liberada.
// Faz no servidor o mesmo que o gatilho do banco (migração 12), para funcionar mesmo
// que o gatilho não esteja instalado: empresa em teste de 14 dias, a pessoa como
// administradora e os módulos CRM, Tarefas e Projetos liberados. Não faz nada se a
// pessoa já tem empresa, se a conta foi criada pela administração ou se é convite de equipe.

type Admin = { from: (t: string) => any; auth: any };

const TRIAL_MODULES = ["crm", "tasks", "projects"];
const TRIAL_HOURS = 14 * 24;

export async function ensureSelfServiceWorkspace(
  admin: Admin,
  userId: string,
  opts: { companyName?: string | null } = {},
): Promise<{ created: boolean; organizationId: string | null }> {
  const { data: members } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1);
  if ((members ?? []).length) return { created: false, organizationId: members[0].organization_id };

  const { data: u } = await admin.auth.admin.getUserById(userId);
  const user = u?.user;
  if (!user) return { created: false, organizationId: null };
  const app = (user.app_metadata ?? {}) as Record<string, unknown>;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  // criada pela administração ou convite de equipe/cliente: a liberação segue o fluxo de quem convidou
  if (app.account_provisioning === "administrative" || meta.temp_password === true) {
    return { created: false, organizationId: null };
  }
  const { data: isAdmin } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (isAdmin) return { created: false, organizationId: null };

  const email = String(user.email ?? "");
  const name = String(
    opts.companyName || meta.company_name || meta.full_name || meta.name || email.split("@")[0] || "Minha empresa",
  ).slice(0, 160);
  const started = new Date();
  const expires = new Date(started.getTime() + TRIAL_HOURS * 3600_000);

  // empresa (com prazo de teste quando a coluna existir)
  let org = await admin
    .from("organizations")
    .insert({ name, status: "trial", contracted_users: 1, legacy_owner_id: userId, trial_expires_at: expires.toISOString() })
    .select("id")
    .single();
  if (org.error) {
    org = await admin
      .from("organizations")
      .insert({ name, status: "trial", contracted_users: 1, legacy_owner_id: userId })
      .select("id")
      .single();
  }
  if (org.error || !org.data) throw new Error(`Não foi possível criar a empresa: ${org.error?.message ?? ""}`);
  const orgId = org.data.id as string;

  const { error: mErr } = await admin
    .from("organization_members")
    .insert({ organization_id: orgId, user_id: userId, role: "org_admin", status: "active" });
  if (mErr) {
    await admin.from("organizations").delete().eq("id", orgId);
    throw new Error(`Não foi possível liberar o acesso: ${mErr.message}`);
  }

  const { data: mods } = await admin.from("modules").select("id, code").eq("active", true).in("code", TRIAL_MODULES);
  const list = (mods ?? []) as { id: string; code: string }[];
  if (list.length) {
    await admin.from("organization_modules").insert(list.map((m) => ({ organization_id: orgId, module_id: m.id, enabled: true })));
    await admin
      .from("user_module_permissions")
      .insert(list.map((m) => ({ organization_id: orgId, user_id: userId, module_id: m.id, can_access: true })));
  }
  // assinatura de teste (melhor esforço: a tabela pode variar entre instalações)
  await admin
    .from("subscriptions")
    .insert({
      user_id: userId,
      organization_id: orgId,
      account_name: name,
      plan: "teste_14_dias",
      status: "trial",
      price_monthly: 0,
      capabilities: ["hub", "comercial", "operacao", "configuracoes"],
      current_period_end: expires.toISOString().slice(0, 10),
    })
    .then(() => undefined, () => undefined);

  return { created: true, organizationId: orgId };
}
