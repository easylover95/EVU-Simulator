import { buildTerminalAnalytics, type TerminalAnalytics } from '@/lib/terminalAnalytics';
import { calculateTerminalStaffEffects } from '@/lib/terminalTycoon';
import type { TerminalSimulationSnapshot } from '@/state/terminalSimulationStore';

export type TerminalAlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type TerminalAlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
export type TerminalAlertKind =
  | 'INSOLVENCY_WARNING'
  | 'NEGATIVE_CONTRIBUTION_MARGIN'
  | 'RISING_BERTH_FEES'
  | 'STAFF_UPKEEP_RISK';
export type TerminalAlertDestination = 'terminal' | 'terminalmanagement' | 'terminalanalytics' | 'zugbildung';

/**
 * Relational target: `terminal_alerts`. Alert IDs are deterministic by kind
 * and affected entity, preventing duplicate banners on subsequent ticks.
 */
export interface TerminalAlert {
  id: string;
  kind: TerminalAlertKind;
  severity: TerminalAlertSeverity;
  status: TerminalAlertStatus;
  destination: TerminalAlertDestination;
  title: string;
  description: string;
  metricLabel: string;
  metricValue: string;
  entityId: string | null;
  createdTick: number;
  lastObservedTick: number;
  acknowledgedTick: number | null;
  resolvedTick: number | null;
}

export type AlertCandidate = Omit<TerminalAlert, 'status' | 'createdTick' | 'lastObservedTick' | 'acknowledgedTick' | 'resolvedTick'>;

export interface AlertEvaluation {
  alertsById: Record<string, TerminalAlert>;
  raised: TerminalAlert[];
  resolved: TerminalAlert[];
}

function euro(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
}

function candidatesFrom(
  snapshot: TerminalSimulationSnapshot,
  analytics: TerminalAnalytics,
): AlertCandidate[] {
  const candidates: AlertCandidate[] = [];
  const progress = snapshot.gameProgress;
  if (progress.consecutiveNegativeTicks >= progress.warningAfterNegativeTicks) {
    candidates.push({
      id: 'alert-insolvency-warning',
      kind: 'INSOLVENCY_WARNING',
      severity: 'CRITICAL',
      destination: 'terminalmanagement',
      title: 'Liquidität kritisch',
      description: `Die Liquidität ist seit ${progress.consecutiveNegativeTicks} Simulationsstunden negativ. Nach ${progress.insolvencyAfterNegativeTicks} negativen Stunden droht die Insolvenz.`,
      metricLabel: 'Aktuelle Liquidität',
      metricValue: euro(snapshot.companyBalanceCents),
      entityId: null,
    });
  }

  for (const row of analytics.trainContribution.filter((entry) => entry.revenueCents > 0 && entry.contributionMarginCents < 0).slice(0, 3)) {
    candidates.push({
      id: `alert-negative-margin-${row.id}`,
      kind: 'NEGATIVE_CONTRIBUTION_MARGIN',
      severity: 'WARNING',
      destination: 'terminalanalytics',
      title: `Negativer Deckungsbeitrag: ${row.label}`,
      description: `Der Zug erwirtschaftet nach umsatzgewichteter Kostenallokation einen negativen Deckungsbeitrag. Prüfe Kostenblöcke und Vertragsmarge vor dem nächsten vergleichbaren Einsatz.`,
      metricLabel: 'Deckungsbeitrag',
      metricValue: euro(row.contributionMarginCents),
      entityId: row.id,
    });
  }

  const berthFees = analytics.ticks.map((tick) => tick.expensesByCategory.LIEGEGEBUEHR);
  if (berthFees.length >= 6) {
    const split = Math.floor(berthFees.length / 2);
    const earlier = berthFees.slice(0, split).reduce((sum, value) => sum + value, 0);
    const recent = berthFees.slice(split).reduce((sum, value) => sum + value, 0);
    if (recent >= 25_000 && recent > Math.max(1, earlier) * 1.5) {
      candidates.push({
        id: 'alert-rising-berth-fees',
        kind: 'RISING_BERTH_FEES',
        severity: 'WARNING',
        destination: 'terminal',
        title: 'Liegegebühren steigen stark',
        description: 'Die Liegegebühren der jüngeren Simulationsstunden liegen mehr als 50 % über dem vorherigen Vergleichszeitraum. Priorisiere Umschlag und Zugbildung der wartenden Fracht.',
        metricLabel: 'Jüngste Liegegebühren',
        metricValue: euro(recent),
        entityId: null,
      });
    }
  }

  const staffEffects = calculateTerminalStaffEffects(Object.values(snapshot.specialistsById));
  if (staffEffects.upkeepCentsPerTick > 0 && snapshot.companyBalanceCents < staffEffects.upkeepCentsPerTick * 6) {
    candidates.push({
      id: 'alert-staff-upkeep-risk',
      kind: 'STAFF_UPKEEP_RISK',
      severity: snapshot.companyBalanceCents < 0 ? 'CRITICAL' : 'WARNING',
      destination: 'terminalmanagement',
      title: 'Personalunterhalt gefährdet',
      description: `Die Liquidität deckt weniger als sechs weitere Simulationsstunden für das angestellte Fachpersonal. Plane zeitnah Umsätze oder reduziere Kosten.`,
      metricLabel: 'Unterhalt pro Tick',
      metricValue: euro(staffEffects.upkeepCentsPerTick),
      entityId: null,
    });
  }
  return candidates;
}

/**
 * Reconciles active alerts only after a completed simulation transition. An
 * acknowledged alert remains visible in the central list, but is removed from
 * high-priority banners until the underlying condition is resolved and recurs.
 */
export function reconcileTerminalAlerts(
  snapshot: TerminalSimulationSnapshot,
  currentAlerts: Record<string, TerminalAlert>,
  analytics = buildTerminalAnalytics(snapshot),
): AlertEvaluation {
  const candidates = candidatesFrom(snapshot, analytics);
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const alertsById: Record<string, TerminalAlert> = { ...currentAlerts };
  const raised: TerminalAlert[] = [];
  const resolved: TerminalAlert[] = [];

  for (const candidate of candidates) {
    const existing = alertsById[candidate.id];
    if (existing) {
      alertsById[candidate.id] = { ...existing, ...candidate, lastObservedTick: snapshot.currentTick, resolvedTick: null };
      continue;
    }
    const alert: TerminalAlert = {
      ...candidate,
      status: 'ACTIVE',
      createdTick: snapshot.currentTick,
      lastObservedTick: snapshot.currentTick,
      acknowledgedTick: null,
      resolvedTick: null,
    };
    alertsById[alert.id] = alert;
    raised.push(alert);
  }

  for (const alert of Object.values(currentAlerts)) {
    if ((alert.status === 'ACTIVE' || alert.status === 'ACKNOWLEDGED') && !candidateIds.has(alert.id)) {
      const resolvedAlert = { ...alert, status: 'RESOLVED' as const, resolvedTick: snapshot.currentTick };
      alertsById[alert.id] = resolvedAlert;
      resolved.push(resolvedAlert);
    }
  }
  return { alertsById, raised, resolved };
}
