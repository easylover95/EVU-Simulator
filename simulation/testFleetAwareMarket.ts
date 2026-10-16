import type { Locomotive, Order } from '../src/lib/supabase';
import { generateMarketOrders, isBaugleisEinsatz, type CommercialStanding } from '../src/lib/orderMarket';
import { calcOrderOperatingCosts, pathRatePerKm, DIESEL_EUR_PER_KM, ELECTRIC_EUR_PER_KM } from '../src/lib/operatingCosts';
import {
  LEGACY_DIESEL_EUR_PER_KM,
  LEGACY_ELECTRIC_EUR_PER_KM,
  legacyPathRatePerKm,
} from '../src/lib/operatingRates';
import {
  analyzeFleetForMarket,
  evaluateAssignmentFit,
  isOrderElectrified,
  trailingLoadT,
} from '../src/lib/traction';
import { SEED_LOCOMOTIVES } from '../src/lib/seed';

function requireCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Fleet-Markt-Regression: ${message}`);
}

function loco(partial: Partial<Locomotive> & Pick<Locomotive, 'id' | 'fuel_type' | 'power_kw'>): Locomotive {
  return {
    designation: partial.designation ?? 'Testlok',
    name: partial.name ?? partial.id,
    status: partial.status ?? 'frei',
    fuel_level: 100,
    brake_pct: 100,
    last_service: null,
    max_speed: 120,
    weight_t: partial.weight_t ?? 80,
    created_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

const standing: CommercialStanding = { level: 2, reputation: 10 };

const electricFleet = [
  loco({ id: 'e1', fuel_type: 'elektrik', power_kw: 3700, weight_t: 83, designation: 'BR 140' }),
];
const dieselFleet = SEED_LOCOMOTIVES;
const mixedFleet = [
  ...SEED_LOCOMOTIVES,
  loco({ id: 'vectron', fuel_type: 'elektrik', power_kw: 6400, weight_t: 85, designation: 'BR 193' }),
];

const electricMarket = generateMarketOrders(0, new Set<string>(), standing, {
  wagonBerthCapacity: 25,
  locomotives: electricFleet,
});
const dieselMarket = generateMarketOrders(0, new Set<string>(), standing, {
  wagonBerthCapacity: 25,
  locomotives: dieselFleet,
});
const mixedMarket = generateMarketOrders(0, new Set<string>(), standing, {
  wagonBerthCapacity: 36,
  locomotives: mixedFleet,
});

function matching(orders: Order[], locos: Locomotive[]): Order[] {
  return orders.filter((order) => locos.some((row) => evaluateAssignmentFit(order, row)?.ok));
}

const eWire = electricMarket.filter((order) => isOrderElectrified(order) && !isBaugleisEinsatz(order));
const eDark = electricMarket.filter((order) => !isOrderElectrified(order));
const dWire = dieselMarket.filter((order) => isOrderElectrified(order) && order.type === 'gueterverkehr');
const dDark = dieselMarket.filter((order) => !isOrderElectrified(order));

requireCondition(eWire.length >= 3, 'E-Lok-Fuhrpark muss mindestens drei elektrifizierte Spot-Aufträge sehen.');
requireCondition(eDark.length >= 3, 'Markt muss auch ohne Oberleitung Angebote halten (Anschluss/Bau).');
requireCondition(matching(eWire, electricFleet).length >= 3, 'Mindestens drei elektrifizierte Aufträge müssen zur E-Lok-Hakenlast passen.');
requireCondition(dDark.length >= 3, 'Diesel-Fuhrpark braucht unelektrifizierte Anschluss-/Bau-Aufträge.');
requireCondition(matching(dDark, dieselFleet).length >= 2, 'Mindestens zwei unelektrifizierte Aufträge müssen zur Diesel-Hakenlast passen.');
requireCondition(dWire.length >= 3, 'Diesel darf elektrifizierte Hauptbahn-Aufträge fahren — Markt muss sie liefern.');
requireCondition(dieselMarket.filter((order) => order.special).length >= 2, 'Jeder Refresh braucht Spezialaufträge für den vorhandenen Fuhrpark.');
requireCondition(mixedMarket.some((order) => Number(order.weight_t) <= analyzeFleetForMarket(mixedFleet).minTrailingT), 'Leichte Frachten für die schwächste Lok müssen existieren.');

const hook218 = trailingLoadT(SEED_LOCOMOTIVES[0]!);
requireCondition(hook218 >= 1_500 && hook218 <= 2_200, `BR 218 Hakenlast unplausibel: ${hook218} t`);

const tooHeavy: Order = {
  ...electricMarket[0]!,
  weight_t: 99_000,
  electrified: true,
};
requireCondition(evaluateAssignmentFit(tooHeavy, electricFleet[0])?.ok === false, 'Überlast muss den Zuweisungs-Check blockieren.');
requireCondition(
  evaluateAssignmentFit({ ...electricMarket[0]!, electrified: false, type: 'baugleis', destination: 'Baugleis Test' }, electricFleet[0])
    ?.code === 'ohle_missing',
  'E-Lok auf unelektrifizierter Strecke muss an der Oberleitung scheitern.',
);

const sample = dieselMarket.find((order) => order.type === 'gueterverkehr' && isOrderElectrified(order));
requireCondition(Boolean(sample), 'Dieselmarkt braucht einen elektrifizierten Güterauftrag als Kalkulationsprobe.');
if (sample) {
  const costs = calcOrderOperatingCosts(sample, 'diesel', 'pdl');
  requireCondition(costs.netProfit > 0, 'Spot-Auftrag muss nach günstigerer Trasse/Energie positiv bleiben.');
  requireCondition(
    pathRatePerKm(sample) <= legacyPathRatePerKm(sample.weight_t, false) + 1e-9,
    'Trassen-€/km dürfen den Alt-Tarif nicht überschreiten.',
  );
}

requireCondition(DIESEL_EUR_PER_KM < LEGACY_DIESEL_EUR_PER_KM, 'Diesel-€/km müssen unter dem bisherigen Satz liegen.');
requireCondition(ELECTRIC_EUR_PER_KM < LEGACY_ELECTRIC_EUR_PER_KM, 'Strom-€/km müssen unter dem bisherigen Satz liegen.');

console.log(
  JSON.stringify(
    {
      ok: true,
      hook218,
      dieselEurPerKm: DIESEL_EUR_PER_KM,
      electricEurPerKm: ELECTRIC_EUR_PER_KM,
      legacyDieselEurPerKm: LEGACY_DIESEL_EUR_PER_KM,
      legacyElectricEurPerKm: LEGACY_ELECTRIC_EUR_PER_KM,
      electricMarket: {
        total: electricMarket.length,
        electrified: eWire.length,
        unelectrified: eDark.length,
        matchingElectrified: matching(eWire, electricFleet).length,
        special: electricMarket.filter((order) => order.special).length,
      },
      dieselMarket: {
        total: dieselMarket.length,
        electrifiedFreight: dWire.length,
        unelectrified: dDark.length,
        matchingUnelectrified: matching(dDark, dieselFleet).length,
        special: dieselMarket.filter((order) => order.special).length,
      },
    },
    null,
    2,
  ),
);
