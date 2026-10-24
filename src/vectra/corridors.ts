/** Korridor-Tiers 1–5 — Freischaltung über Pünktlichkeit / Rang / EXP. */

import type { CareerState, DispatcherRank } from '@/vectra/types';

export type CorridorTier = 1 | 2 | 3 | 4 | 5;

export type OdPair = {
  origin: string;
  destination: string;
  cargo: string;
  dangerousGoods?: boolean;
  plannedDurationMin: number;
  /** Mindest-Tier, damit dieser OD im Pool erscheint */
  minTier: CorridorTier;
  tonnageT: number;
};

export interface CorridorTierMeta {
  tier: CorridorTier;
  label: string;
  hint: string;
}

export const CORRIDOR_TIER_META: CorridorTierMeta[] = [
  { tier: 1, label: 'Regio Hub', hint: 'Nahübergaben, Baustellenlogistik & Sperrpausen' },
  { tier: 2, label: 'Mainline Axis', hint: 'Rheintal — Schwergut & Gefahrgut (RID)' },
  { tier: 3, label: 'Port-Shuttle', hint: 'Hafen-Zeitfenster Hamburg / Bremerhaven – Halle' },
  { tier: 4, label: 'Trans-Alp', hint: 'Brenner — Vectron MS & Bergstrecken' },
  { tier: 5, label: 'Pan-European', hint: 'Rotterdam – Genua Express Network' },
];

/** Gesamter OD-Pool mit Tier-Markierung. */
export const OD_POOL: OdPair[] = [
  // Tier 1 Regio
  { origin: 'Duisburg', destination: 'Dortmund', cargo: 'Stahlcoils', plannedDurationMin: 90, minTier: 1, tonnageT: 1400 },
  { origin: 'Dortmund', destination: 'Köln', cargo: 'Container', plannedDurationMin: 120, minTier: 1, tonnageT: 1200 },
  { origin: 'Köln', destination: 'Duisburg', cargo: 'Schrott', plannedDurationMin: 110, minTier: 1, tonnageT: 1100 },
  { origin: 'Hagen', destination: 'Dortmund', cargo: 'Baustellenlogistik', plannedDurationMin: 70, minTier: 1, tonnageT: 900 },
  { origin: 'Altena', destination: 'Hagen', cargo: 'Sperrpausen-Material', plannedDurationMin: 55, minTier: 1, tonnageT: 800 },
  { origin: 'Hamburg', destination: 'Hannover', cargo: 'Intermodal', plannedDurationMin: 140, minTier: 1, tonnageT: 1300 },
  { origin: 'München', destination: 'Augsburg', cargo: 'Automobile', plannedDurationMin: 80, minTier: 1, tonnageT: 1000 },
  { origin: 'München', destination: 'Nürnberg', cargo: 'Container', plannedDurationMin: 130, minTier: 1, tonnageT: 1250 },
  { origin: 'Köln', destination: 'Frankfurt', cargo: 'Papierrollen', plannedDurationMin: 150, minTier: 1, tonnageT: 1150 },
  { origin: 'Mannheim', destination: 'Frankfurt', cargo: 'Maschinen', plannedDurationMin: 90, minTier: 1, tonnageT: 1050 },

  // Tier 2 Mainline Rheintal
  { origin: 'Köln', destination: 'Mannheim', cargo: 'Chemikalien (RID)', dangerousGoods: true, plannedDurationMin: 210, minTier: 2, tonnageT: 1600 },
  { origin: 'Köln', destination: 'Karlsruhe', cargo: 'Schwergut', plannedDurationMin: 240, minTier: 2, tonnageT: 1800 },
  { origin: 'Frankfurt', destination: 'Basel', cargo: 'Kesselwagen (RID)', dangerousGoods: true, plannedDurationMin: 280, minTier: 2, tonnageT: 1700 },
  { origin: 'Mannheim', destination: 'Köln', cargo: 'Intermodal', plannedDurationMin: 200, minTier: 2, tonnageT: 1400 },
  { origin: 'Dortmund', destination: 'Basel', cargo: 'Stahlcoils', plannedDurationMin: 340, minTier: 2, tonnageT: 1500 },

  // Tier 3 Port-Shuttle
  { origin: 'Hamburg', destination: 'Halle', cargo: 'Terminfracht Hafen', plannedDurationMin: 260, minTier: 3, tonnageT: 1450 },
  { origin: 'Bremerhaven', destination: 'Halle', cargo: 'Container (Zeitfenster)', plannedDurationMin: 280, minTier: 3, tonnageT: 1500 },
  { origin: 'Hamburg', destination: 'München', cargo: 'Intermodal', plannedDurationMin: 420, minTier: 3, tonnageT: 1600 },
  { origin: 'Hamburg', destination: 'Köln', cargo: 'Container', plannedDurationMin: 280, minTier: 3, tonnageT: 1400 },

  // Tier 4 Trans-Alp
  { origin: 'München', destination: 'Innsbruck', cargo: 'Automotive (Just-in-Time)', plannedDurationMin: 200, minTier: 4, tonnageT: 1200 },
  { origin: 'München', destination: 'Verona', cargo: 'Intermodal Alpen', plannedDurationMin: 360, minTier: 4, tonnageT: 1350 },
  { origin: 'Augsburg', destination: 'Innsbruck', cargo: 'Schiebedienst', plannedDurationMin: 220, minTier: 4, tonnageT: 1100 },

  // Tier 5 Pan-EU
  { origin: 'Rotterdam', destination: 'Genua', cargo: 'Express Network', plannedDurationMin: 720, minTier: 5, tonnageT: 1700 },
  { origin: 'Rotterdam', destination: 'Basel', cargo: 'Container EU', plannedDurationMin: 480, minTier: 5, tonnageT: 1550 },
  { origin: 'Hamburg', destination: 'Verona', cargo: 'Trans-EU Intermodal', plannedDurationMin: 540, minTier: 5, tonnageT: 1600 },
];

export function odPoolForTier(unlockedTier: CorridorTier): OdPair[] {
  return OD_POOL.filter((od) => od.minTier <= unlockedTier);
}

/** Tier-1-Pool priorisiert Stationen des Home-Hubs. */
export function odPoolForHub(
  unlockedTier: CorridorTier,
  regionStations: string[],
): OdPair[] {
  const pool = odPoolForTier(unlockedTier);
  if (unlockedTier > 1) return pool;
  const region = new Set(regionStations.map((s) => s.toLowerCase()));
  const local = pool.filter(
    (od) => region.has(od.origin.toLowerCase()) || region.has(od.destination.toLowerCase()),
  );
  return local.length >= 4 ? local : pool.filter((od) => od.minTier === 1);
}

export interface TierUnlockResult {
  unlockedTier: CorridorTier;
  newlyUnlocked: CorridorTier | null;
  message: string | null;
}

/**
 * Prüft Freischaltung nach Schichtende.
 * Tier 2: ≥90% Pünktlichkeit, Tier 3: Rang≥2 + 85%, Tier 4: Rang≥2 + EXP, Tier 5: Rang 3.
 */
export function evaluateCorridorUnlock(
  current: CorridorTier,
  punctualityPct: number,
  career: Pick<CareerState, 'rank' | 'exp' | 'shiftsCompleted'>,
): TierUnlockResult {
  let next: CorridorTier = current;
  let newlyUnlocked: CorridorTier | null = null;

  const tryUnlock = (tier: CorridorTier, ok: boolean) => {
    if (ok && current < tier && next < tier) {
      next = tier;
      newlyUnlocked = tier;
    }
  };

  tryUnlock(2, punctualityPct >= 90 && career.shiftsCompleted >= 1);
  tryUnlock(3, punctualityPct >= 85 && career.rank >= 2 && career.shiftsCompleted >= 4);
  tryUnlock(4, punctualityPct >= 88 && career.rank >= 2 && career.exp >= 40);
  tryUnlock(5, career.rank >= 3 && punctualityPct >= 90);

  if (!newlyUnlocked) {
    return { unlockedTier: current, newlyUnlocked: null, message: null };
  }

  const meta = CORRIDOR_TIER_META.find((m) => m.tier === newlyUnlocked);
  return {
    unlockedTier: next,
    newlyUnlocked,
    message: meta ? `Korridor freigeschaltet: ${meta.label} — ${meta.hint}` : `Tier ${newlyUnlocked} freigeschaltet`,
  };
}

export function clampTier(n: number): CorridorTier {
  if (n >= 5) return 5;
  if (n >= 4) return 4;
  if (n >= 3) return 3;
  if (n >= 2) return 2;
  return 1;
}

export function rankSuggestsMinTier(rank: DispatcherRank): CorridorTier {
  if (rank >= 3) return 3;
  if (rank >= 2) return 2;
  return 1;
}
