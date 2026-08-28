import type { Driver, Locomotive, Order, Wagon } from '@/lib/supabase';
import { calculateTrainBrh, checkWagonAvailability, wagonShortageLabel } from '@/lib/brh';
import { BAUGLEIS_MIN_DRIVERS, isBaugleisEinsatz, requiredDriversFor } from '@/lib/orderMarket';
import { evaluateAssignmentFit } from '@/lib/traction';
import { ensureMaintenance, isLocoDeployable } from '@/lib/workshop';
import { canStartBaugleisEinsatz } from '@/lib/baugleisDeployments';
import { isBaugleisOrder } from '@/lib/pdl';
import { driverRestStatus, remainingDutyHours, type DriverRestStatus } from '@/lib/restRules';
import { networkDispatchBlock } from '@/lib/networkAccess';
import { closureBlockMessage, orderBlockedByClosure, type WorldEventState } from '@/lib/events';
import type { StaffMeta } from '@/lib/jobcenter';
import { collectQualificationGaps, type QualificationGap } from '@/lib/qualificationGaps';
import { calcOrderOperatingCosts } from '@/lib/operatingCosts';
import { derivedUsableLengthM } from '@/lib/contractCard';

export type DispatchStep = 1 | 2 | 3 | 4;
export type AzfMode = 'none' | 'eigen' | 'pdl';

export interface DispatchBlocker {
  code: string;
  step: DispatchStep;
  message: string;
}

export interface DispatchRestRow {
  driverId: string;
  name: string;
  status: DriverRestStatus;
  remainingHours: number;
  dutyLabel: string;
}

export function restDutyLabel(driver: Driver, now: Date): string {
  const rest = driverRestStatus(driver, now);
  if (driver.status === 'im_einsatz') return 'Im Einsatz';
  if (driver.status === 'pause') return 'Pause / Schulung';
  if (driver.status === 'krank') return 'Krank';
  if (driver.status === 'urlaub') return 'Urlaub';
  if (rest.overHours) return '48h-Fenster voll';
  if (rest.insufficientRest) return 'Ruhezeit läuft';
  return 'Verfügbar';
}

export function restRowsFor(drivers: Array<Driver | null | undefined>, now: Date): DispatchRestRow[] {
  return drivers
    .filter((driver): driver is Driver => Boolean(driver))
    .map((driver) => {
      const status = driverRestStatus(driver, now);
      return {
        driverId: driver.id,
        name: driver.name,
        status,
        remainingHours: remainingDutyHours(status),
        dutyLabel: restDutyLabel(driver, now),
      };
    });
}

export interface DispatchPlanInput {
  order: Order | null;
  loco: Locomotive | null;
  driver: Driver | null;
  driver2: Driver | null;
  azfMode: AzfMode;
  azfId: string;
  availableAzfIds: string[];
  wagons: Wagon[];
  staffMeta: Record<string, StaffMeta>;
  tick: number;
  worldEvents?: WorldEventState;
}

export function azfReady(input: Pick<DispatchPlanInput, 'order' | 'azfMode' | 'azfId' | 'availableAzfIds'>): boolean {
  if (!isBaugleisOrder(input.order)) return true;
  if (input.azfMode === 'pdl') return true;
  return input.azfMode === 'eigen' && Boolean(input.azfId) && input.availableAzfIds.includes(input.azfId);
}

export function driversReady(order: Order | null, driverId: string, driver2Id: string): boolean {
  if (!order) return false;
  if (isBaugleisEinsatz(order)) return Boolean(driverId) && Boolean(driver2Id) && driverId !== driver2Id;
  return Boolean(driverId);
}

export function collectDispatchBlockers(input: DispatchPlanInput): DispatchBlocker[] {
  const blockers: DispatchBlocker[] = [];
  if (!input.order) {
    blockers.push({ code: 'order', step: 1, message: 'Auftrag wählen (Spot, Rahmen oder Baugleis).' });
    return blockers;
  }
  if (!input.loco) {
    blockers.push({ code: 'loco', step: 2, message: 'Triebfahrzeug per Tipp wählen.' });
  } else {
    if (!isLocoDeployable(ensureMaintenance(input.loco))) {
      blockers.push({ code: 'loco_maint', step: 2, message: 'Lok nicht einsatzbereit (HU/Stillstand/Wartung).' });
    }
    const traction = evaluateAssignmentFit(input.order, input.loco);
    if (traction && !traction.ok) {
      blockers.push({ code: traction.code, step: 2, message: traction.message });
    }
    const net = networkDispatchBlock(input.order, input.loco);
    if (net) blockers.push({ code: 'network', step: 2, message: net });
  }

  const needDrivers = requiredDriversFor(input.order);
  if (!input.driver) {
    blockers.push({
      code: 'driver',
      step: 3,
      message: needDrivers > 1 ? 'Tf 1 (Schicht A) wählen.' : 'Triebfahrzeugführer wählen.',
    });
  }
  if (isBaugleisEinsatz(input.order) && !input.driver2) {
    blockers.push({
      code: 'driver2',
      step: 3,
      message: `Baugleis-Einsatz: ${BAUGLEIS_MIN_DRIVERS} Tf im Schichtwechsel erforderlich.`,
    });
  }
  if (isBaugleisEinsatz(input.order) && input.driver && input.driver2 && input.driver.id === input.driver2.id) {
    blockers.push({ code: 'driver_same', step: 3, message: 'Zwei verschiedene Tf für den Schichtwechsel wählen.' });
  }
  if (!azfReady(input)) {
    blockers.push({
      code: 'azf',
      step: 3,
      message: 'Baugleis: Arbeitszugführer / Rangierbegleiter (eigen oder PDL) ist Pflicht.',
    });
  }

  const wagonCheck = checkWagonAvailability(input.order, input.wagons);
  if (!wagonCheck.sufficient) {
    blockers.push({
      code: 'wagons',
      step: 3,
      message: wagonShortageLabel(wagonCheck) ?? 'Nicht genügend Wagen — Zuweisung blockiert.',
    });
  }

  if (input.loco && input.order) {
    const brh = calculateTrainBrh(input.loco, input.order, input.wagons);
    if (!brh.passed) {
      blockers.push({ code: 'brh', step: 3, message: brh.message });
    }
    const einsatz = canStartBaugleisEinsatz(input.order, input.loco, input.driver ?? undefined, input.driver2 ?? undefined);
    if (einsatz) blockers.push({ code: 'einsatz', step: 3, message: einsatz });
  }

  const gaps = collectQualificationGaps({
    order: input.order,
    loco: input.loco,
    driver: input.driver,
    driver2: input.driver2,
    wagons: input.wagons,
    staffMeta: input.staffMeta,
  });
  for (const gap of gaps) {
    if (!gap.blocksDispatch) continue;
    if (blockers.some((row) => row.message === gap.detail)) continue;
    blockers.push({
      code: gap.code,
      step: gap.kind === 'series' ? 2 : 3,
      message: gap.detail,
    });
  }

  const closed = orderBlockedByClosure(input.order, input.tick, input.worldEvents?.closures);
  if (closed) {
    blockers.push({ code: 'closure', step: 1, message: closureBlockMessage(closed, input.tick) });
  }

  return blockers;
}

export function canConfirmDispatch(blockers: DispatchBlocker[]): boolean {
  return blockers.length === 0;
}

export function blockersForStep(blockers: DispatchBlocker[], step: DispatchStep): DispatchBlocker[] {
  return blockers.filter((row) => row.step === step);
}

export function forecastCosts(order: Order | null, fuelType: Locomotive['fuel_type'] | undefined, azfMode: AzfMode) {
  if (!order) return null;
  return calcOrderOperatingCosts(order, fuelType ?? 'diesel', azfMode === 'eigen' ? 'eigen' : 'pdl');
}

export function trainWeightPreview(order: Order | null, loco: Locomotive | null, wagons: Wagon[]): number | null {
  if (!order || !loco) return null;
  return calculateTrainBrh(loco, order, wagons).breakdown.totalWeight;
}

export function trainLengthPreview(order: Order | null, wagons: Wagon[]): number | null {
  if (!order) return null;
  return derivedUsableLengthM(order, wagons);
}

export function qualificationPreview(input: {
  order: Order | null;
  loco: Locomotive | null;
  driver: Driver | null;
  driver2: Driver | null;
  wagons: Wagon[];
  staffMeta: Record<string, StaffMeta>;
}): QualificationGap[] {
  return collectQualificationGaps(input);
}
