import type { Locomotive, Order, Wagon } from '@/lib/supabase';
import { WAGON_OFFERS } from '@/lib/dealer';
import { clampOrderMinBrh } from '@/lib/status';
import { calcOrderOperatingCosts } from '@/lib/operatingCosts';
import { isBaugleisEinsatz } from '@/lib/orderMarket';
import { isOrderElectrified } from '@/lib/traction';
import type { IndustrialContract } from '@/lib/freightContracts';
import { industrialDailyOperatingCost } from '@/lib/freightContracts';
import { exclusiveJobsUnlocked } from '@/lib/reputation';

export type ContractKind = 'spot' | 'rahmen' | 'baugleis';
export type TractionNeed = 'diesel' | 'elektro' | 'dual';

export interface ContractClearance {
  id: 'bremszettel' | 'wagenseinheit' | 'etcs' | 'exclusive';
  label: string;
  detail: string;
  met: boolean;
}

export interface ContractCardModel {
  kind: ContractKind;
  kindLabel: string;
  usableLengthM: number | null;
  tonnageT: number;
  traction: TractionNeed;
  tractionLabel: string;
  contribution: number;
  penalty: number;
  penaltyLabel: string;
  deadline: string | null;
  minLevel: number;
  minReputation: number;
  minBrh: number;
  clearances: ContractClearance[];
  requiredWagonType: string | null;
  requiredWagonCount: number | null;
}

function wagonLengthMm(typeCode: string | null | undefined, wagons: Wagon[]): number | null {
  if (!typeCode) return null;
  const needle = typeCode.toLowerCase();
  const owned = wagons.find((wagon) => wagon.type_code.toLowerCase() === needle && Number(wagon.length_mm) > 0);
  if (owned?.length_mm) return owned.length_mm;
  const offer = WAGON_OFFERS.find((row) => row.type_code.toLowerCase() === needle);
  return offer?.length_mm ?? null;
}

export function derivedUsableLengthM(
  order: Pick<Order, 'required_wagon_type' | 'required_wagon_count'>,
  wagons: Wagon[] = [],
): number | null {
  const count = Math.max(0, Number(order.required_wagon_count) || 0);
  const mm = wagonLengthMm(order.required_wagon_type, wagons);
  if (!count || !mm) return null;
  return Math.round((count * mm) / 100) / 10;
}

function tractionForElectrified(electrified: boolean): { traction: TractionNeed; tractionLabel: string } {
  if (electrified) {
    return { traction: 'elektro', tractionLabel: 'Elektro / Dual / Diesel' };
  }
  return { traction: 'diesel', tractionLabel: 'Diesel / Dual (ohne Oberleitung)' };
}

export function contractKindOf(order: Pick<Order, 'type' | 'contract_id' | 'deployment_days'>): ContractKind {
  if (isBaugleisEinsatz(order as Order) || order.type === 'baugleis') return 'baugleis';
  if (order.contract_id) return 'rahmen';
  return 'spot';
}

export function contractKindLabel(kind: ContractKind): string {
  if (kind === 'rahmen') return 'Rahmenvertrag';
  if (kind === 'baugleis') return 'Baugleis';
  return 'Spot';
}

export function buildOrderContractCard(
  order: Order,
  wagons: Wagon[],
  standing?: { level?: number; reputation?: number; hasEtcs?: boolean },
): ContractCardModel {
  const kind = contractKindOf(order);
  const electrified = isOrderElectrified(order);
  const traction = tractionForElectrified(electrified);
  const costs = calcOrderOperatingCosts(order, electrified ? 'elektrik' : 'diesel', 'pdl');
  const minBrh = clampOrderMinBrh(order.type, order.min_brh);
  const wagonOk = Boolean(
    !order.required_wagon_type ||
      wagons.some(
        (wagon) =>
          wagon.type_code.toLowerCase() === order.required_wagon_type!.toLowerCase() &&
          wagon.status === 'verfuegbar',
      ),
  );
  const penalty =
    kind === 'baugleis' && Number(order.penalty_per_min) > 0 ? Number(order.penalty_per_min) : Number(order.penalty) || 0;
  const clearances: ContractClearance[] = [
    {
      id: 'bremszettel',
      label: 'Bremszettel',
      detail: `Mindest-Brh ${minBrh}`,
      met: true,
    },
    {
      id: 'wagenseinheit',
      label: 'Wagenseinheit',
      detail: order.required_wagon_type
        ? `${order.required_wagon_count}× ${order.required_wagon_type}`
        : 'Keine gebundene Gattung',
      met: !order.required_wagon_type || wagonOk,
    },
  ];
  if (order.requires_etcs) {
    clearances.push({
      id: 'etcs',
      label: 'ETCS',
      detail: 'Korridor mit ETCS-Pflicht',
      met: Boolean(standing?.hasEtcs),
    });
  }
  if (order.exclusive) {
    clearances.push({
      id: 'exclusive',
      label: 'Exklusiv',
      detail: 'Ganzzug ab Reputation 70',
      met: exclusiveJobsUnlocked(standing?.reputation),
    });
  }
  return {
    kind,
    kindLabel: contractKindLabel(kind),
    usableLengthM: derivedUsableLengthM(order, wagons),
    tonnageT: Math.max(0, Number(order.weight_t) || 0),
    traction: traction.traction,
    tractionLabel: traction.tractionLabel,
    contribution: costs.netProfit,
    penalty,
    penaltyLabel:
      kind === 'baugleis' && Number(order.penalty_per_min) > 0 ? `${penalty.toLocaleString('de-DE')} €/Min` : `${penalty.toLocaleString('de-DE')} €`,
    deadline: order.deadline,
    minLevel: 1,
    minReputation: 0,
    minBrh,
    clearances,
    requiredWagonType: order.required_wagon_type,
    requiredWagonCount: order.required_wagon_count,
  };
}

export function buildFrameworkContractCard(
  contract: IndustrialContract,
  wagons: Wagon[],
  standing?: { level?: number; reputation?: number; hasEtcs?: boolean },
): ContractCardModel {
  const stub = {
    type: 'gueterverkehr' as const,
    required_wagon_type: contract.requiredWagonType ?? null,
    required_wagon_count: contract.requiredWagonCount ?? null,
    weight_t: contract.trainWeightT ?? 0,
    electrified: contract.electrified !== false,
    destination: contract.corridor,
  };
  const traction = tractionForElectrified(contract.electrified !== false);
  const dailyOp = industrialDailyOperatingCost(contract);
  const contribution = (Number(contract.dailyRevenue) || 0) - dailyOp;
  const wagonOk = Boolean(
    !contract.requiredWagonType ||
      wagons.some((wagon) => wagon.type_code.toLowerCase() === contract.requiredWagonType!.toLowerCase()),
  );
  return {
    kind: 'rahmen',
    kindLabel: 'Rahmenvertrag',
    usableLengthM: derivedUsableLengthM(stub, wagons),
    tonnageT: Math.max(0, Number(contract.trainWeightT) || 0),
    traction: traction.traction,
    tractionLabel: traction.tractionLabel,
    contribution,
    penalty: 0,
    penaltyLabel: 'Tagespönale laut Vertragslauf',
    deadline: null,
    minLevel: Math.max(1, Number(contract.minLevel) || 1),
    minReputation: Math.max(0, Number(contract.minBekanntheit) || 0),
    minBrh: clampOrderMinBrh('gueterverkehr', 65),
    clearances: [
      {
        id: 'bremszettel',
        label: 'Bremszettel',
        detail: 'Güterzug-Mindest-Brh laut Dispo-Check',
        met: true,
      },
      {
        id: 'wagenseinheit',
        label: 'Wagenseinheit',
        detail: contract.requiredWagonType
          ? `${contract.requiredWagonCount}× ${contract.requiredWagonType}`
          : 'Keine gebundene Gattung',
        met: !contract.requiredWagonType || wagonOk,
      },
      ...(contract.requiresEtcs
        ? [
            {
              id: 'etcs' as const,
              label: 'ETCS',
              detail: 'Rahmenkorridor mit ETCS',
              met: Boolean(standing?.hasEtcs),
            },
          ]
        : []),
    ],
    requiredWagonType: contract.requiredWagonType ?? null,
    requiredWagonCount: contract.requiredWagonCount ?? null,
  };
}

export function locoHasEtcsFleet(locomotives: Locomotive[]): boolean {
  return locomotives.some((loco) => (loco.equipment ?? []).includes('etcs'));
}
