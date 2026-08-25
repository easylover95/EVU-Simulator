import type { AssignmentWithDetails, Company, Driver, Locomotive, Notification, Order } from '@/lib/supabase';
import { newNotificationId, tickToIso } from '@/lib/gameTime';
import { isNewGameDay, loadJson, saveJson } from '@/lib/storage';
import {
  BAUGLEIS_MIN_DRIVERS,
  clampBaugleisDailyRate,
  isBaugleisEinsatz,
  isConstructionLoco,
} from '@/lib/orderMarket';
import { calcOrderOperatingCosts } from '@/lib/operatingCosts';
import { pdlAzfDailyRate } from '@/lib/pdl';

export const BAUGLEIS_DEPLOYMENTS_KEY = 'evu-baugleis-deployments';

export type BaugleisDeploymentStatus = 'active' | 'completed' | 'cancelled';

export interface BaugleisDeployment {
  id: string;
  orderId: string;
  orderNumber: string;
  title: string;
  customer: string;
  locomotiveId: string;
  driverIds: [string, string];
  assignmentId: string;
  durationDays: number;
  remainingDays: number;
  dailyRate: number;
  startedTick: number;
  status: BaugleisDeploymentStatus;
  /** Daily path charge (same formula as spot, billed each game day). */
  dailyPathCost?: number;
  /** Daily energy charge for the bound loco traction. */
  dailyEnergyCost?: number;
  /** 0 = own AZF/RB; otherwise PDL day rate. */
  pdlAzfDaily?: number;
  azfDriverId?: string | null;
}

export function loadBaugleisDeployments(): BaugleisDeployment[] {
  const loaded = loadJson<BaugleisDeployment[] | null>(BAUGLEIS_DEPLOYMENTS_KEY, null);
  if (!Array.isArray(loaded)) return [];
  return loaded
    .filter((d) => d && typeof d.id === 'string')
    .map((d) => ({ ...d, dailyRate: clampBaugleisDailyRate(d.dailyRate) }));
}

export function saveBaugleisDeployments(list: BaugleisDeployment[]): void {
  saveJson(BAUGLEIS_DEPLOYMENTS_KEY, list);
}

export function activeDeployments(list: BaugleisDeployment[]): BaugleisDeployment[] {
  return list.filter((d) => d.status === 'active');
}

export function deploymentBindsLoco(list: BaugleisDeployment[], locoId: string): boolean {
  return activeDeployments(list).some((d) => d.locomotiveId === locoId);
}

export function deploymentBindsDriver(list: BaugleisDeployment[], driverId: string): boolean {
  return activeDeployments(list).some((d) => d.driverIds.includes(driverId));
}

export function canStartBaugleisEinsatz(
  order: Order,
  loco: Locomotive | undefined,
  driverA: Driver | undefined,
  driverB: Driver | undefined,
): string | null {
  if (!isBaugleisEinsatz(order)) return null;
  if (!loco) return 'Keine Lok ausgewählt';
  if (!isConstructionLoco(loco)) {
    return 'Baugleis-Einsatz braucht eine Diesel- oder Dual-Lok (z. B. BR 218, V 90 / BR 290)';
  }
  if (!driverA || !driverB) return `Mindestens ${BAUGLEIS_MIN_DRIVERS} Tf für den Schichtwechsel erforderlich`;
  if (driverA.id === driverB.id) return 'Zwei verschiedene Tf zuweisen';
  const tf = (d: Driver) => d.qualifications.some((q) => q.toLowerCase() === 'tf');
  if (!tf(driverA) || !tf(driverB)) return 'Beide Personen müssen als Tf qualifiziert sein';
  return null;
}

export function startBaugleisDeployment(input: {
  order: Order;
  locomotiveId: string;
  driverIds: [string, string];
  assignmentId: string;
  tick: number;
  existing: BaugleisDeployment[];
  fuelType?: Locomotive['fuel_type'];
  pdlAzfDaily?: number;
  azfDriverId?: string | null;
}): BaugleisDeployment[] {
  const daily = clampBaugleisDailyRate(input.order.daily_rate ?? 0);
  const days = input.order.deployment_days ?? 15;
  const opex = calcOrderOperatingCosts(input.order, input.fuelType ?? 'diesel', input.pdlAzfDaily ? 'pdl' : 'eigen');
  const next: BaugleisDeployment = {
    id: newNotificationId(),
    orderId: input.order.id,
    orderNumber: input.order.order_number,
    title: input.order.title,
    customer: input.order.customer ?? 'Gleisbau',
    locomotiveId: input.locomotiveId,
    driverIds: input.driverIds,
    assignmentId: input.assignmentId,
    durationDays: days,
    remainingDays: days,
    dailyRate: daily,
    startedTick: input.tick,
    status: 'active',
    dailyPathCost: opex.pathCost,
    dailyEnergyCost: opex.energyCost,
    pdlAzfDaily: Math.max(0, Number(input.pdlAzfDaily) || 0),
    azfDriverId: input.azfDriverId ?? null,
  };
  const list = [...input.existing, next];
  saveBaugleisDeployments(list);
  return list;
}

export function deploymentDailyOperating(d: BaugleisDeployment): number {
  return Math.max(0, (d.dailyPathCost ?? 0) + (d.dailyEnergyCost ?? 0) + (d.pdlAzfDaily ?? 0));
}

export function cancelBaugleisDeployment(
  list: BaugleisDeployment[],
  assignmentId: string,
): BaugleisDeployment[] {
  const next = list.map((d) =>
    d.assignmentId === assignmentId && d.status === 'active' ? { ...d, status: 'cancelled' as const } : d,
  );
  saveBaugleisDeployments(next);
  return next;
}

export function processBaugleisDeploymentsTick(
  list: BaugleisDeployment[],
  company: Company,
  prevTick: number,
  nextTick: number,
): {
  list: BaugleisDeployment[];
  company: Company;
  notifications: Omit<Notification, 'id'>[];
  payout: number;
  operatingCost: number;
  completedOrderIds: string[];
  freedLocoIds: string[];
  freedDriverIds: string[];
  completedAssignmentIds: string[];
} {
  let balance = company.balance;
  let payout = 0;
  let operatingCost = 0;
  const notifications: Omit<Notification, 'id'>[] = [];
  const completedOrderIds: string[] = [];
  const freedLocoIds: string[] = [];
  const freedDriverIds: string[] = [];
  const completedAssignmentIds: string[] = [];
  const payday = isNewGameDay(prevTick, nextTick);

  const nextList = list.map((d) => {
    if (d.status !== 'active') return d;
    if (!payday) return d;

    const daily = clampBaugleisDailyRate(d.dailyRate);
    const opex = deploymentDailyOperating(d);
    balance += daily;
    payout += daily;
    balance -= opex;
    operatingCost += opex;
    const remaining = d.remainingDays - 1;
    if (remaining > 0) {
      return { ...d, remainingDays: remaining };
    }

    completedOrderIds.push(d.orderId);
    completedAssignmentIds.push(d.assignmentId);
    freedLocoIds.push(d.locomotiveId);
    freedDriverIds.push(...d.driverIds);
    if (d.azfDriverId) freedDriverIds.push(d.azfDriverId);
    notifications.push({
      type: 'success',
      title: 'Baugleis-Einsatz beendet',
      message: `${d.title} (${d.customer}) ist nach ${d.durationDays} Tagen abgeschlossen. Lok, Tf und AZF/RB sind wieder frei.`,
      read: false,
      created_at: tickToIso(nextTick),
    });
    return { ...d, remainingDays: 0, status: 'completed' as const };
  });

  saveBaugleisDeployments(nextList);
  return {
    list: nextList,
    company: { ...company, balance },
    notifications,
    payout,
    operatingCost,
    completedOrderIds,
    freedLocoIds,
    freedDriverIds,
    completedAssignmentIds,
  };
}

export function hydrateDeploymentAssignments(
  deployments: BaugleisDeployment[],
  orders: Order[],
  locomotives: Locomotive[],
  drivers: Driver[],
  assignments: AssignmentWithDetails[],
): {
  orders: Order[];
  locomotives: Locomotive[];
  drivers: Driver[];
  assignments: AssignmentWithDetails[];
  deployments: BaugleisDeployment[];
} {
  const byOrder = new Map(orders.map((o) => [o.id, o]));
  const synced = deployments.map((d) => {
    const order = byOrder.get(d.orderId);
    const fromOrder = order && isBaugleisEinsatz(order) && order.daily_rate != null ? order.daily_rate : d.dailyRate;
    const dailyRate = clampBaugleisDailyRate(fromOrder);
    const loco = locomotives.find((l) => l.id === d.locomotiveId);
    const needsOpex = (d.dailyPathCost == null || d.dailyEnergyCost == null) && order && isBaugleisEinsatz(order);
    const opex = needsOpex ? calcOrderOperatingCosts(order, loco?.fuel_type ?? 'diesel', d.pdlAzfDaily ? 'pdl' : 'eigen') : null;
    const next = {
      ...d,
      dailyRate,
      dailyPathCost: d.dailyPathCost ?? opex?.pathCost,
      dailyEnergyCost: d.dailyEnergyCost ?? opex?.energyCost,
      pdlAzfDaily: d.pdlAzfDaily ?? (order && isBaugleisEinsatz(order) ? pdlAzfDailyRate(order) : 0),
    };
    return next;
  });
  if (
    synced.some(
      (d, i) =>
        d.dailyRate !== deployments[i]?.dailyRate ||
        d.dailyPathCost !== deployments[i]?.dailyPathCost ||
        d.dailyEnergyCost !== deployments[i]?.dailyEnergyCost,
    )
  ) {
    saveBaugleisDeployments(synced);
  }

  const active = activeDeployments(synced);
  if (active.length === 0) {
    return { orders, locomotives, drivers, assignments, deployments: synced };
  }

  const boundLoco = new Set(active.map((d) => d.locomotiveId));
  const boundDrivers = new Set(active.flatMap((d) => [...d.driverIds, d.azfDriverId].filter(Boolean) as string[]));
  const boundOrders = new Set(active.map((d) => d.orderId));
  const knownAssign = new Set(assignments.map((a) => a.id));

  const nextLocos = locomotives.map((l) =>
    boundLoco.has(l.id) && l.status === 'frei' ? { ...l, status: 'einsatz' as const } : l,
  );
  const nextDrivers = drivers.map((d) =>
    boundDrivers.has(d.id) && d.status === 'verfuegbar' ? { ...d, status: 'im_einsatz' as const } : d,
  );
  const nextOrders = orders.map((o) =>
    boundOrders.has(o.id) && o.status === 'offen' ? { ...o, status: 'zugewiesen' as const } : o,
  );

  const extras: AssignmentWithDetails[] = [];
  for (const d of active) {
    if (knownAssign.has(d.assignmentId)) continue;
    const order = nextOrders.find((o) => o.id === d.orderId);
    const loco = nextLocos.find((l) => l.id === d.locomotiveId);
    const driver = nextDrivers.find((x) => x.id === d.driverIds[0]);
    const second = nextDrivers.find((x) => x.id === d.driverIds[1]);
    const azf = d.azfDriverId ? nextDrivers.find((x) => x.id === d.azfDriverId) : undefined;
    extras.push({
      id: d.assignmentId,
      order_id: d.orderId,
      locomotive_id: d.locomotiveId,
      driver_id: d.driverIds[0],
      second_driver_id: d.driverIds[1],
      azf_driver_id: d.azfDriverId ?? null,
      pdl_azf_daily: d.pdlAzfDaily ?? 0,
      assigned_at: tickToIso(d.startedTick),
      status: 'aktiv',
      order,
      locomotive: loco,
      driver,
      second_driver: second,
      azf_driver: azf,
    });
  }

  return {
    orders: nextOrders,
    locomotives: nextLocos,
    drivers: nextDrivers,
    assignments: extras.length > 0 ? [...extras, ...assignments] : assignments,
    deployments: synced,
  };
}
