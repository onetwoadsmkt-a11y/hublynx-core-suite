import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

const schema = z.object({
  leadId: uuid,
  /** Usar um cliente já existente em vez de criar um novo. */
  clientId: uuid.nullable().optional(),
  client: z
    .object({
      name: z.string().trim().min(1).max(200),
      company: z.string().trim().max(200).nullable().optional(),
      email: z.string().trim().max(255).nullable().optional(),
      phone: z.string().trim().max(40).nullable().optional(),
    })
    .optional(),
  project: z.object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
    service_type: z
      .enum([
        "desenvolvimento",
        "trafego_pago",
        "gestao_conteudo",
        "consultoria",
        "design",
        "suporte",
        "outros",
      ])
      .nullable()
      .optional(),
    commercial_model: z.enum([
      "projeto_fechado",
      "mensal_recorrente",
      "banco_horas",
      "por_hora",
      "suporte_continuo",
    ]),
    contract_value: z.number().nonnegative().nullable().optional(),
    monthly_value: z.number().nonnegative().nullable().optional(),
    start_date: z.string().nullable().optional(),
    due_date: z.string().nullable().optional(),
  }),
  finance: z
    .object({
      generate: z.boolean(),
      amount: z.number().positive(),
      first_due_date: z.string().min(8),
      installments: z.number().int().min(1).max(60),
      /** mensal_recorrente gera lançamentos mensais recorrentes */
      recurring: z.boolean().optional(),
    })
    .optional(),
});

function addMonths(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export const convertLeadToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", data.leadId)
      .single();
    if (leadErr) throw new Error(leadErr.message);
    if ((lead as any).converted_project_id) {
      throw new Error("Este lead já foi convertido em cliente/projeto.");
    }

    // 1) Cliente
    let clientId = data.clientId ?? (lead as any).client_id ?? null;
    if (!clientId) {
      const c: {
        name: string;
        company?: string | null;
        email?: string | null;
        phone?: string | null;
      } = data.client ?? { name: String((lead as any).name) };
      const { data: created, error } = await supabase
        .from("clients")
        .insert({
          owner_id: userId,
          name: c.name,
          company: c.company ?? null,
          email: c.email ?? null,
          phone: c.phone ?? null,
          status: "ativo",
          notes: `Convertido do lead "${(lead as any).name}".`,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      clientId = (created as any).id as string;
    }

    // 2) Projeto
    const p = data.project;
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .insert({
        owner_id: userId,
        client_id: clientId,
        name: p.name,
        description: p.description ?? null,
        status: "ativo",
        service_type: p.service_type ?? null,
        commercial_model: p.commercial_model,
        contract_value: p.contract_value ?? null,
        value: p.contract_value ?? null,
        monthly_value: p.monthly_value ?? null,
        start_date: p.start_date ?? new Date().toISOString().slice(0, 10),
        due_date: p.due_date ?? null,
      })
      .select("id, name")
      .single();
    if (projErr) throw new Error(projErr.message);
    const projectId = (project as any).id as string;

    // 3) Financeiro (contas a receber)
    let created = 0;
    const f = data.finance;
    if (f?.generate) {
      const n = Math.max(1, f.installments);
      const rows = Array.from({ length: n }, (_, i) => ({
        owner_id: userId,
        kind: "receber" as const,
        client_id: clientId,
        project_id: projectId,
        description:
          n > 1
            ? `${p.name} • Parcela ${i + 1}/${n}`
            : p.name,
        amount: f.amount,
        due_date: addMonths(f.first_due_date, i),
        status: "aberto" as const,
        natureza: "fee",
        competencia: addMonths(f.first_due_date, i).slice(0, 7),
        recurrence: f.recurring ? "monthly" : "none",
        installment_no: n > 1 ? i + 1 : null,
        installment_total: n > 1 ? n : null,
      }));
      const { error } = await supabase.from("finances").insert(rows);
      if (error) throw new Error(error.message);
      created = rows.length;
    }

    // 4) Vincula o lead e registra na jornada
    const { error: updErr } = await supabase
      .from("leads")
      .update({
        client_id: clientId,
        converted_client_id: clientId,
        converted_project_id: projectId,
        converted_at: new Date().toISOString(),
        status: "ganho",
      })
      .eq("id", data.leadId);
    if (updErr) throw new Error(updErr.message);

    await supabase.from("lead_events").insert({
      lead_id: data.leadId,
      owner_id: userId,
      actor_id: userId,
      kind: "converted",
      title: "Lead convertido em cliente",
      description: `Projeto "${p.name}" criado${created ? ` • ${created} lançamento(s) financeiro(s)` : ""}.`,
      meta: { client_id: clientId, project_id: projectId, finances: created },
    });

    return { clientId: clientId as string, projectId, finances: created };
  });
