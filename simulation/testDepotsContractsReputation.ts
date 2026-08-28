import {
  BASE_LOCO_BERTHS,
  BASE_STAFF_SLOTS,
  BASE_WAGON_BERTHS,
  canRelocateLoco,
  emptyDepotState,
  locoBerthCap,
  purchaseNetworkSite,
  relocateLoco,
  staffHousingCap,
  wagonBerthCap,
} from '../src/lib/depot';
import { NETWORK_SITES, STARTER_SITE_ID } from '../src/lib/networkSites';
import {
  acceptContract,
  buildContractRunOrder,
  canAcceptIndustrial,
  defaultFreightContracts,
  processFreightContractsTick,
} from '../src/lib/freightContracts';
import { generateMarketOrders } from '../src/lib/orderMarket';
import { evaluateAssignmentFit } from '../src/lib/traction';
import { EXCLUSIVE_REPUTATION, reputationGainForFulfilledContract, reputationTier } from '../src/lib/reputation';
import { SEED_COMPANY, SEED_LOCOMOTIVES } from '../src/lib/seed';
import type { Locomotive } from '../src/lib/supabase';
import { DIESEL_EUR_PER_KM, ELECTRIC_EUR_PER_KM, TRASSE_EUR_PER_TRAIN_KM } from '../src/lib/operatingRates';

function requireCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Depot/Vertrag/Reputation: ${message}`);
}

const hamburg = NETWORK_SITES.find((site) => site.id === 'hamburg-hafen');
requireCondition(Boolean(hamburg), 'Hamburg Hafen muss im Katalog stehen.');
requireCondition(
  NETWORK_SITES.some((site) => site.id === 'maschen-rbf') && NETWORK_SITES.some((site) => site.id === 'muenchen-ost'),
  'Maschen Rbf und München Ost müssen kaufbar sein.',
);

const start = emptyDepotState();
requireCondition(start.ownedSiteIds.includes(STARTER_SITE_ID), 'Starter-Depot Duisburg muss immer gehören.');
requireCondition(locoBerthCap(start) === BASE_LOCO_BERTHS, 'Starter-Lokkapazität darf sich nicht verdoppeln.');
requireCondition(wagonBerthCap(start) === BASE_WAGON_BERTHS, 'Starter muss 25 Wagen-Stellplätze halten.');
requireCondition(staffHousingCap(start) === BASE_STAFF_SLOTS, 'Starter-Personalplätze müssen zu den 8 Seed-Tf passen.');

const afterHamburg = purchaseNetworkSite(start, 'hamburg-hafen');
requireCondition(locoBerthCap(afterHamburg) === BASE_LOCO_BERTHS + (hamburg?.addLocoBerths ?? 0), 'Hamburg muss Lok-Stellplätze addieren.');
requireCondition(wagonBerthCap(afterHamburg) >= BASE_WAGON_BERTHS + 16, 'Neues Depot muss mindestens einen Ganzzug-Wagenpark zusätzlich fassen.');
requireCondition(staffHousingCap(afterHamburg) > BASE_STAFF_SLOTS, 'Personal-Kapazität muss mit dem Depot wachsen.');

const locos: Locomotive[] = SEED_LOCOMOTIVES.map((loco) => ({ ...loco }));
const relocateOk = canRelocateLoco(afterHamburg, locos, locos[0]!.id, 'hamburg-hafen');
requireCondition(relocateOk.ok, `Umstationierung nach Hamburg muss möglich sein: ${relocateOk.message}`);
const stationed = relocateLoco(afterHamburg, locos[0]!.id, 'hamburg-hafen');
requireCondition(stationed.stationing[locos[0]!.id] === 'hamburg-hafen', 'Stationierung muss persistiert werden.');

const busy = locos.map((loco, i) => (i === 0 ? { ...loco, status: 'einsatz' as const } : loco));
requireCondition(
  canRelocateLoco(afterHamburg, busy, locos[0]!.id, 'hamburg-hafen').ok === false,
  'Lok im Einsatz darf nicht umstationiert werden.',
);

const standingLow = { level: 2, reputation: 10 };
const standingHigh = { level: 5, reputation: EXCLUSIVE_REPUTATION };
const lowMarket = generateMarketOrders(0, new Set<string>(), standingLow, {
  wagonBerthCapacity: wagonBerthCap(start),
  locomotives: locos,
  ownedSiteIds: start.ownedSiteIds,
});
const highMarket = generateMarketOrders(0, new Set<string>(), standingHigh, {
  wagonBerthCapacity: wagonBerthCap(afterHamburg),
  locomotives: locos,
  ownedSiteIds: afterHamburg.ownedSiteIds,
});

requireCondition(!lowMarket.some((order) => order.exclusive), 'Ohne Premium-Reputation keine Exklusiv-Ganzzüge.');
requireCondition(highMarket.some((order) => order.exclusive), 'Ab Reputation 70 müssen exklusive Ganzzüge erscheinen.');
requireCondition(
  highMarket.some((order) => /Hamburg Hafen|Hamburg Billwerder/.test(`${order.origin} ${order.destination}`)),
  'Hamburg-Depot muss regionale Hafen-Hinterland-Aufträge erzeugen.',
);

const exclusive = highMarket.find((order) => order.exclusive);
requireCondition(Boolean(exclusive), 'Exklusivauftrag für Traction-Check fehlt.');
if (exclusive) {
  requireCondition(
    locos.some((loco) => evaluateAssignmentFit(exclusive, loco)?.ok),
    'Exklusivauftrag muss zum vorhandenen Fuhrpark (Diesel) passen, wenn Gewicht/Oberleitung es zulassen — oder klar scheitern.',
  );
  const eOnly: Locomotive = {
    ...locos[0]!,
    id: 'e-only',
    fuel_type: 'elektrik',
    power_kw: 6400,
  };
  const dark = { ...exclusive, electrified: false, type: 'baugleis' as const, destination: 'Anschlussgleis Test' };
  requireCondition(evaluateAssignmentFit(dark, eOnly)?.code === 'ohle_missing', 'E-Lok auf unelektrifizierter Vertragslaufstrecke muss scheitern.');
}

const contracts = defaultFreightContracts();
const hamburgBox = contracts.find((c) => c.id === 'fc-hhla-box');
requireCondition(Boolean(hamburgBox), 'Hamburg-Rahmenvertrag muss existieren.');
requireCondition(
  hamburgBox ? canAcceptIndustrial(hamburgBox, { level: 5, reputation: 80 }, start) === false : false,
  'Hamburg-Vertrag braucht das Hafen-Depot.',
);
requireCondition(
  hamburgBox ? canAcceptIndustrial(hamburgBox, { level: 5, reputation: 80 }, afterHamburg) : false,
  'Mit Hamburg-Depot und Reputation muss der Vertrag annahmefähig sein.',
);

const ruhr = contracts.find((c) => c.id === 'fc-ruhr-coil');
requireCondition(Boolean(ruhr), 'Ruhr-Coil-Vertrag fehlt.');
let list = acceptContract(contracts, 'fc-ruhr-coil', 0);
list = list.map((c) =>
  c.id === 'fc-ruhr-coil'
    ? { ...c, fulfilledToday: Math.max(1, c.dailyDepartures), acceptedTick: 0, endsTick: 10_000 }
    : c,
);
const beforeRep = 20;
const company = { ...SEED_COMPANY, reputation: beforeRep, level: 3, tick: 48, balance: 80_000 };
const settled = processFreightContractsTick(list, company, 47, 48, []);
const expectedGain = reputationGainForFulfilledContract(1);
requireCondition(
  settled.company.reputation === beforeRep + expectedGain,
  `Vertragserfüllung muss Reputation erhöhen (ist ${settled.company.reputation}, erwartet ${beforeRep + expectedGain}).`,
);
requireCondition(reputationTier(70).id === 'premium', 'Schwelle 70 muss Premium-EVU sein.');

const exclusiveRun = buildContractRunOrder(
  { ...hamburgBox!, exclusive: true, electrified: true, status: 'active' },
  10,
  standingHigh,
);
requireCondition(exclusiveRun.exclusive === true, 'Vertrags-Ganzzug muss exclusive flaggen.');
requireCondition(evaluateAssignmentFit(exclusiveRun, locos[0]) != null, 'Rahmenvertrag braucht denselben Traction-Check wie der Spotmarkt.');

requireCondition(TRASSE_EUR_PER_TRAIN_KM === 8.9, 'Trassen-Satz darf nicht steigen.');
requireCondition(DIESEL_EUR_PER_KM < 10, 'Diesel-Energie bleibt kundenfreundlich.');
requireCondition(ELECTRIC_EUR_PER_KM < 8, 'Strom-Energie bleibt kundenfreundlich.');

console.log(
  JSON.stringify(
    {
      ok: true,
      locoCapStart: locoBerthCap(start),
      locoCapHamburg: locoBerthCap(afterHamburg),
      wagonCapHamburg: wagonBerthCap(afterHamburg),
      staffCapHamburg: staffHousingCap(afterHamburg),
      exclusiveLow: lowMarket.filter((o) => o.exclusive).length,
      exclusiveHigh: highMarket.filter((o) => o.exclusive).length,
      reputationAfterFulfill: settled.company.reputation,
      premiumTier: reputationTier(70).label,
    },
    null,
    2,
  ),
);
