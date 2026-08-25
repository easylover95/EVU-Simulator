import type { Order } from '../src/lib/supabase';
import { computeSpotYield, generateMarketOrders, marketSizingPolicy, type CommercialStanding } from '../src/lib/orderMarket';
import { calcOrderOperatingCosts } from '../src/lib/operatingCosts';

function requireCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Marktgrößen-Regression: ${message}`);
}

function smallFreightOrders(orders: Order[]): Order[] {
  return orders.filter(
    (order) =>
      order.type === 'gueterverkehr' &&
      Number(order.required_wagon_count) >= 4 &&
      Number(order.required_wagon_count) <= 6,
  );
}

function maxFreightWagons(orders: Order[]): number {
  return Math.max(0, ...orders.filter((order) => order.type === 'gueterverkehr').map((order) => Number(order.required_wagon_count) || 0));
}

function pricingOrder(id: string, wagonCount: number, distanceKm = 90, payloadPerWagon = 80): Order {
  const weightT = wagonCount * payloadPerWagon;
  const standing: CommercialStanding = { level: 1, reputation: 0 };
  const priced = computeSpotYield('gueterverkehr', distanceKm, weightT, 'energie', standing);
  return {
    id,
    order_number: id,
    type: 'gueterverkehr',
    title: `${wagonCount}-Wagen-Referenz`,
    origin: 'Frühspiel Rbf',
    destination: 'Regionalterminal',
    distance_km: distanceKm,
    weight_t: weightT,
    yield: priced.yield,
    penalty: 0,
    deadline: '2026-01-02T00:00:00.000Z',
    status: 'offen',
    notes: '',
    min_brh: 60,
    required_wagon_type: 'Eanos',
    required_wagon_count: wagonCount,
    deployment_days: null,
    daily_rate: null,
    tkm_revenue: priced.tkmRevenue,
    eur_per_tkm: priced.eurPerTkm,
  } as Order;
}

function priceExample(wagonCount: number) {
  const order = pricingOrder(`eanos-${wagonCount}`, wagonCount);
  const costs = calcOrderOperatingCosts(order, 'diesel', 'pdl');
  return {
    wagonCount,
    distanceKm: order.distance_km,
    weightT: order.weight_t,
    tkm: Number(order.distance_km) * Number(order.weight_t),
    grossYield: order.yield,
    pathCost: costs.pathCost,
    energyCost: costs.energyCost,
    operatingCost: costs.total,
    netProfit: costs.netProfit,
  };
}

const earlyStanding: CommercialStanding = { level: 1, reputation: 0 };
const mediumStanding: CommercialStanding = { level: 2, reputation: 0 };
const heavyStanding: CommercialStanding = { level: 3, reputation: 25 };

const earlyMarket = generateMarketOrders(0, new Set<string>(), earlyStanding, { wagonBerthCapacity: 25 });
const mediumMarket = generateMarketOrders(0, new Set<string>(), mediumStanding, { wagonBerthCapacity: 36 });
const heavyPolicy = marketSizingPolicy(heavyStanding, { wagonBerthCapacity: 36 });

requireCondition(smallFreightOrders(earlyMarket).length >= 3, 'Startdepot muss mindestens drei 4–6-Wagen-Güteraufträge erhalten.');
requireCondition(smallFreightOrders(mediumMarket).length >= 2, 'Ausgebauter Markt muss weiterhin mindestens zwei 4–6-Wagen-Güteraufträge enthalten.');
requireCondition(maxFreightWagons(earlyMarket) <= 9, 'Schwere 10–14-Wagen-Aufträge dürfen im Starterdepot nicht generiert werden.');
requireCondition(!heavyPolicy.allowedClasses.includes('schwer') === false, 'Schwere Aufträge müssen ab Level 3 und 36 Wagenstellplätzen freigeschaltet sein.');

const fiveWagons = priceExample(5);
const elevenWagons = priceExample(11);
requireCondition(fiveWagons.netProfit > 0, 'Der 5-Wagen-Referenzauftrag muss nach Trasse und Energie positiv bleiben.');
requireCondition(elevenWagons.grossYield > fiveWagons.grossYield, 'Der 11-Wagen-Auftrag muss proportional mehr Bruttoerlös erzeugen.');
requireCondition(elevenWagons.netProfit > fiveWagons.netProfit, 'Der 11-Wagen-Auftrag muss absolut mehr Netto-Gewinn erzeugen.');

const report = {
  marketPolicy: {
    early: {
      level: earlyStanding.level,
      wagonBerthCapacity: 25,
      smallFreightOrders: smallFreightOrders(earlyMarket).length,
      maxFreightWagons: maxFreightWagons(earlyMarket),
      allowedClasses: marketSizingPolicy(earlyStanding, { wagonBerthCapacity: 25 }).allowedClasses,
    },
    medium: {
      level: mediumStanding.level,
      wagonBerthCapacity: 36,
      smallFreightOrders: smallFreightOrders(mediumMarket).length,
      maxFreightWagons: maxFreightWagons(mediumMarket),
      allowedClasses: marketSizingPolicy(mediumStanding, { wagonBerthCapacity: 36 }).allowedClasses,
    },
    heavyUnlocked: {
      level: heavyStanding.level,
      wagonBerthCapacity: 36,
      allowedClasses: heavyPolicy.allowedClasses,
    },
  },
  pricingExamples: [fiveWagons, elevenWagons],
};

console.log(JSON.stringify(report, null, 2));
