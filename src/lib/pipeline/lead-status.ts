/**
 * Definição única de "ganho": lead convertido em cliente, ou numa etapa marcada
 * como ganha, ou com uma tag de funil "ganho". Leads = não ganhos; Clientes = ganhos.
 */
export type WonInput = {
  converted_client_id?: string | null;
  stage_id?: string | null;
  tags?: string[] | null;
};

export function isWonLead(
  lead: WonInput,
  wonStageIds: Set<string>,
  wonTagSlugs: Set<string>,
): boolean {
  if (lead.converted_client_id) return true;
  if (lead.stage_id && wonStageIds.has(lead.stage_id)) return true;
  return (lead.tags ?? []).some((t) => wonTagSlugs.has(String(t).toLowerCase()));
}
