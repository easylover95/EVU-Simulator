import type { Order } from '../src/lib/supabase';
import { baugleisDailyRate, computeBaugleisDailyRate, computeSpotYield, type CommercialStanding } from '../src/lib/orderMarket';
import { calcOrderOperatingCosts } from '../src/lib/operatingCosts';

const standing: CommercialStanding = { level: 1, reputation: 0 };

function orderFor(input: {
  id: string;
  type: 'gueterverkehr' | 'baugleis';
  distanceKm: number;
  weightT: number;
  yield: number;
  dailyRate?: number;
  deploymentDays?: number;
}): Order {
  return {
    id: input.id,
    order_number: input.id,
    type: input.type,
    title: input.id,
    origin: 'Teststart',
    destination: 'Testziel',
    distance_km: input.distanceKm,
    weight_t: input.weightT,
    yield: input.yield,
    penalty: 0,
    deadline: '2026-01-02T00:00:00.000Z',
    status: 'offen',
    notes: '',
    min_brh: 60,
    required_wagon_type: 'Eanos',
    required_wagon_count: 10,
    deployment_days: input.deploymentDays ?? null,
    daily_rate: input.dailyRate ?? null,
  } as Order;
}

function spotCase(id: string, distanceKm: number, weightT: number) {
  const priced = computeSpotYield('gueterverkehr', distanceKm, weightT, 'energie', standing);
  const order = orderFor({ id, type: 'gueterverkehr', distanceKm, weightT, yield: priced.yield });
  const cost = calcOrderOperatingCosts(order, 'diesel', 'pdl');
  return {
    id,
    distanceKm,
    weightT,
    grossYield: priced.yield,
    tkm: priced.tkm,
    eurPerTkm: Number(priced.eurPerTkm.toFixed(4)),
    operatingCost: cost.total,
    netProfit: cost.netProfit,
  };
}

function baugleisCase(id: string, distanceKm: number, weightT: number) {
  const breakdown = computeBaugleisDailyRate(15, distanceKm, weightT, standing);
  const dailyRate = baugleisDailyRate(15, distanceKm, weightT, standing);
  const order = orderFor({
    id,
    type: 'baugleis',
    distanceKm,
    weightT,
    yield: dailyRate * 15,
    dailyRate,
    deploymentDays: 15,
  });
  const cost = calcOrderOperatingCosts(order, 'diesel', 'pdl');
  return {
    id,
    distanceKm,
    weightT,
    dailyRate,
    operatingCostPerDay: cost.total,
    netProfitPerDay: cost.netProfit,
    pathCost: cost.pathCost,
    energyCost: cost.energyCost,
    pdlCost: cost.pdlCost,
    formulaOperatingBaseline: breakdown.estimatedOperatingCost,
    formulaOperatingMargin: breakdown.operatingMargin,
  };
}

const shortSpot = spotCase('duisburg-dortmund-55km', 55, 1000);
const longSpot = spotCase('bayreuth-regensburg-120km', 120, 1000);
const mediumBaugleis = baugleisCase('baugleis-120km', 120, 1000);
const longBaugleis = baugleisCase('baugleis-285km', 285, 1400);

function requirePricing(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Preisregression: ${message}`);
}

requirePricing(longSpot.netProfit > shortSpot.netProfit, '120-km-Fracht muss absolut mehr Netto-Gewinn als die 55-km-Fracht liefern.');
requirePricing(longSpot.eurPerTkm >= shortSpot.eurPerTkm * 0.75, 'effektiver €/tkm-Satz der langen Strecke fällt zu stark ab.');
requirePricing(mediumBaugleis.netProfitPerDay > 0, '120-km-Baugleis muss eine positive Tagesmarge liefern.');
requirePricing(longBaugleis.netProfitPerDay > 0, '285-km-Baugleis darf nicht durch einen Pauschaldeckel defizitär werden.');

const report = {
  model: 'rebalanced-proportional',
  standing,
  spot: [shortSpot, longSpot],
  baugleis: [mediumBaugleis, longBaugleis],
};

console.log(JSON.stringify(report, null, 2));
