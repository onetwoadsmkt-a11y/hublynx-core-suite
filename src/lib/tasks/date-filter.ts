import { endOfDay, isValid, parseISO, startOfDay } from "date-fns";

/** Compare deadlines and lead schedules in the user's local calendar days. */
export function matchesTaskDateRange(dueDate: string | null, from?: Date, to?: Date): boolean {
  if (!from && !to) return true;
  if (!dueDate) return false;
  const date = parseISO(dueDate);
  if (!isValid(date)) return false;
  return (!from || date >= startOfDay(from)) && (!to || date <= endOfDay(to));
}