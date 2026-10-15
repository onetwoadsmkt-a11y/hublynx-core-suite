// Server-only — contatos repetidos no pipeline.
// Regra: o mesmo envio chegando por dois caminhos (Lead Pro direto + Make) em poucos
// minutos é o MESMO lead → junta em silêncio. Uma nova inscrição do mesmo contato
// (mais tarde) vira um card NOVO com alerta de duplicata, para a equipe decidir se une.
type Db = { from: (t: string) => any };

/** Janela em que o mesmo envio pode chegar por mais de um caminho. */
export const SAME_SUBMISSION_WINDOW_MS = 30 * 60 * 1000;

export const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "").slice(-11);

export type DuplicateMatch = {
  lead: Record<string, any>;
  by: "email" | "telefone";
};

/** Lead mais recente da empresa com o mesmo e-mail ou telefone. */
export async function findDuplicate(
  admin: Db,
  organizationId: string,
  email?: string | null,
  phone?: string | null,
  excludeId?: string | null,
): Promise<DuplicateMatch | null> {
  const mail = email?.trim().toLowerCase() || null;
  const tel = digits(phone);
  const hasTel = tel.length >= 10;
  if (!mail && !hasTel) return null;
  // filtro largo no banco (últimos 8 dígitos do telefone) e conferência exata aqui
  const safe = (s: string) => s.replace(/[,()*%\\]/g, "");
  const ors: string[] = [];
  if (mail) ors.push(`email.ilike.${safe(mail)}`);
  if (hasTel) ors.push(`phone.ilike.*${tel.slice(-8)}*`);
  let q = admin
    .from("leads")
    .select("*")
    .eq("organization_id", organizationId)
    .or(ors.join(","))
    .order("created_at", { ascending: false })
    .limit(50);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  for (const l of (data ?? []) as Record<string, any>[]) {
    if (
      mail &&
      String(l.email ?? "")
        .trim()
        .toLowerCase() === mail
    )
      return { lead: l, by: "email" };
    if (hasTel && digits(l.phone) === tel) return { lead: l, by: "telefone" };
  }
  return null;
}

/** Identificador do envio do formulário, quando o payload traz (Lead Pro / Make). */
export function submissionIdOf(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  const v =
    r.submission_id ?? r.lead?.id ?? r.payload?.submission_id ?? r.payload?.lead?.id ?? null;
  return typeof v === "string" && v.length >= 8 ? v : null;
}

/** É o mesmo envio chegando por outro caminho? */
export function isSameSubmission(existing: Record<string, any>, raw: unknown): boolean {
  const sid = submissionIdOf(raw);
  const prev = submissionIdOf(existing.metadata);
  if (sid && prev) return sid === prev;
  const created = existing.created_at ? new Date(existing.created_at).getTime() : 0;
  return Date.now() - created < SAME_SUBMISSION_WINDOW_MS;
}

/** Marca de duplicata gravada no metadata do card novo. */
export function duplicateMark(match: DuplicateMatch) {
  return {
    duplicate_of: match.lead.id as string,
    duplicate_of_name: (match.lead.name as string | null) ?? null,
    duplicate_by: match.by,
    duplicate_detected_at: new Date().toISOString(),
  };
}
