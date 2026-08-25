import { loadJson, saveJson } from '@/lib/storage';

export const CHARGED_TRIP_COSTS_KEY = 'evu-charged-trip-costs';

export function loadChargedTripIds(): string[] {
  const loaded = loadJson<string[] | null>(CHARGED_TRIP_COSTS_KEY, null);
  return Array.isArray(loaded) ? loaded.filter((id) => typeof id === 'string') : [];
}

export function saveChargedTripIds(ids: string[]): void {
  saveJson(CHARGED_TRIP_COSTS_KEY, ids.slice(-240));
}

/** First run: mark already-running trips so we do not retroactively debit seed/in-flight assignments. */
export function grandfatherAktivTrips(aktivAssignmentIds: string[]): string[] {
  const existing = loadJson<string[] | null>(CHARGED_TRIP_COSTS_KEY, null);
  if (Array.isArray(existing)) return existing.filter((id) => typeof id === 'string');
  saveChargedTripIds(aktivAssignmentIds);
  return [...aktivAssignmentIds];
}

export function markTripCharged(ids: string[], assignmentId: string): string[] {
  if (ids.includes(assignmentId)) return ids;
  const next = [...ids, assignmentId];
  saveChargedTripIds(next);
  return next;
}
