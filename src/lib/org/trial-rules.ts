export const TRIAL_DAYS = 14;
export const TRIAL_MODULE_CODES = ["crm", "tasks", "projects"] as const;

export function trialEndsAt(startedAt: string): string {
  return new Date(Date.parse(startedAt) + TRIAL_DAYS * 86_400_000).toISOString();
}

export function trialHasExpired(endsAt: string | null | undefined, now = Date.now()): boolean {
  if (!endsAt) return false;
  const end = Date.parse(endsAt);
  return !Number.isFinite(end) || now >= end;
}