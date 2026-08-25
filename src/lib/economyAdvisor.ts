import type { Company, FuelType, Order } from '@/lib/supabase';
import type { LocoOffer, WagonOffer } from '@/lib/dealer';
import type { BankState } from '@/lib/bank';
import { summarizePnl } from '@/lib/bank';
import type { DailyFixedCosts } from '@/lib/dailyFixedCosts';
import { previewDepotDaily } from '@/lib/dailyFixedCosts';
import { calcOrderOperatingCosts } from '@/lib/operatingCosts';
import { computeSpotYield } from '@/lib/orderMarket';
import { maintenanceFundTarget, type MaintenanceFundState } from '@/lib/maintenanceFund';
import { TICKS_PER_DAY } from '@/lib/storage';

export type RiskTone = 'safe' | 'caution' | 'critical';

export interface LiquidityBuffer {
  afterCash: number;
  recommendedReserve: number;
  daysCovered: number | null;
  tone: RiskTone;
  message: string;
}

export interface InvestmentForecast {
  additionalDailyFixed: number;
  dailyFixedBefore: number;
  dailyFixedAfter: number;
  dailyContribution: number | null;
  dailyRevenue: number | null;
  dailyOperatingCost: number | null;
  operationalLabel: string;
  maintenanceFundBalance: number;
  liquidity: LiquidityBuffer;
}

export interface AdvisorAlert {
  id: 'liquidity' | 'fixed-costs' | 'debt' | 'maintenance-fund' | 'stable';
  tone: RiskTone;
  title: string;
  message: string;
}

const BUFFER_DAYS_SAFE = 7;
const BUFFER_DAYS_CAUTION = 3;

function safeNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function forecastLiquidityBuffer(afterCash: number, dailyFixed: number): LiquidityBuffer {
  const reserve = Math.max(15_000, Math.round(Math.max(0, dailyFixed) * BUFFER_DAYS_SAFE));
  const daysCovered = dailyFixed > 0 ? afterCash / dailyFixed : null;
  const tone: RiskTone = afterCash < reserve * (BUFFER_DAYS_CAUTION / BUFFER_DAYS_SAFE)
    ? 'critical'
    : afterCash < reserve
      ? 'caution'
      : 'safe';
  const message = tone === 'critical'
    ? 'Kritischer Betriebspuffer: Weniger als drei Tage Fixkosten bleiben frei verfügbar.'
    : tone === 'caution'
      ? 'Knappes Polster: Die empfohlene Reserve von sieben Tagen Fixkosten wird unterschritten.'
      : 'Betriebspuffer deckt mindestens sieben Tage der prognostizierten Fixkosten.';
  return { afterCash, recommendedReserve: reserve, daysCovered, tone, message };
}

function spotPlanForLoco(offer: LocoOffer): { label: string; distanceKm: number; weightT: number; category: 'energie' | 'intermodal'; fuel: FuelType } {
  if (offer.id === 'br232') {
    return { label: 'Bulk-Spotlauf · 90 km / 700 t', distanceKm: 90, weightT: 700, category: 'energie', fuel: offer.fuel_type };
  }
  if (offer.id === 'br140') {
    return { label: 'Intermodal-Spotlauf · 520 km / 500 t', distanceKm: 520, weightT: 500, category: 'intermodal', fuel: offer.fuel_type };
  }
  return { label: 'Konservativer Güter-Spotlauf · 120 km / 600 t', distanceKm: 120, weightT: 600, category: 'energie', fuel: offer.fuel_type };
}

function estimateLocoContribution(company: Company, offer: LocoOffer): Pick<InvestmentForecast, 'dailyContribution' | 'dailyRevenue' | 'dailyOperatingCost' | 'operationalLabel'> {
  const plan = spotPlanForLoco(offer);
  const pricing = computeSpotYield('gueterverkehr', plan.distanceKm, plan.weightT, plan.category, company);
  const order = {
    id: `forecast-${offer.id}`,
    order_number: 'PROGNOSE',
    type: 'gueterverkehr',
    title: plan.label,
    origin: 'Prognose',
    destination: 'Prognose',
    distance_km: plan.distanceKm,
    weight_t: plan.weightT,
    yield: pricing.yield,
    penalty: 0,
    deadline: null,
    status: 'offen',
    notes: 'Lokale Investitionsprognose',
    min_brh: 0,
    required_wagon_type: null,
    required_wagon_count: null,
    sperrpause_start: null,
    sperrpause_end: null,
    penalty_per_min: 0,
    created_at: company.updated_at,
    customer: 'Prognose',
    customer_id: null,
    origin_country: 'D',
    destination_country: 'D',
    requires_etcs: false,
    contract_id: null,
    deployment_days: null,
    daily_rate: null,
    required_drivers: 1,
  } as Order;
  const operating = calcOrderOperatingCosts(order, plan.fuel, 'eigen');
  return {
    dailyContribution: pricing.yield - operating.total,
    dailyRevenue: pricing.yield,
    dailyOperatingCost: operating.total,
    operationalLabel: plan.label,
  };
}

export function forecastLocoPurchase(input: {
  company: Company;
  dailyFixed: DailyFixedCosts;
  currentLocoCount: number;
  currentWagonUnits: number;
  offer: LocoOffer;
  dueNow: number;
  maintenanceFund: MaintenanceFundState;
  recurringDailyCost?: number;
}): InvestmentForecast {
  const beforeDepot = previewDepotDaily(
    Array.from({ length: input.currentLocoCount }, () => ({ status: 'einsatz' })) as never,
    [{ count: input.currentWagonUnits, status: 'im_einsatz' }] as never,
  ).total;
  const afterDepot = previewDepotDaily(
    Array.from({ length: input.currentLocoCount + 1 }, () => ({ status: 'einsatz' })) as never,
    [{ count: input.currentWagonUnits, status: 'im_einsatz' }] as never,
  ).total;
  const additionalDailyFixed = afterDepot - beforeDepot + Math.max(0, input.recurringDailyCost ?? 0);
  const dailyFixedAfter = input.dailyFixed.total + additionalDailyFixed;
  const afterCash = input.company.balance - input.dueNow;
  return {
    additionalDailyFixed,
    dailyFixedBefore: input.dailyFixed.total,
    dailyFixedAfter,
    ...estimateLocoContribution(input.company, input.offer),
    maintenanceFundBalance: input.maintenanceFund.balance,
    liquidity: forecastLiquidityBuffer(afterCash, dailyFixedAfter),
  };
}

export function forecastWagonPurchase(input: {
  company: Company;
  dailyFixed: DailyFixedCosts;
  currentLocoCount: number;
  currentWagonUnits: number;
  offer: WagonOffer;
  quantity: number;
  dueNow: number;
  maintenanceFund: MaintenanceFundState;
  recurringDailyCost?: number;
}): InvestmentForecast {
  const beforeDepot = previewDepotDaily(
    Array.from({ length: input.currentLocoCount }, () => ({ status: 'einsatz' })) as never,
    [{ count: input.currentWagonUnits, status: 'im_einsatz' }] as never,
  ).total;
  const afterDepot = previewDepotDaily(
    Array.from({ length: input.currentLocoCount }, () => ({ status: 'einsatz' })) as never,
    [{ count: input.currentWagonUnits + input.quantity, status: 'im_einsatz' }] as never,
  ).total;
  const additionalDailyFixed = afterDepot - beforeDepot + Math.max(0, input.recurringDailyCost ?? 0);
  const dailyFixedAfter = input.dailyFixed.total + additionalDailyFixed;
  return {
    additionalDailyFixed,
    dailyFixedBefore: input.dailyFixed.total,
    dailyFixedAfter,
    dailyContribution: null,
    dailyRevenue: null,
    dailyOperatingCost: null,
    operationalLabel: `${input.quantity}× ${input.offer.type_name}: erschließt Wagenkapazität, erzeugt aber keinen automatischen Zuglauf.`,
    maintenanceFundBalance: input.maintenanceFund.balance,
    liquidity: forecastLiquidityBuffer(input.company.balance - input.dueNow, dailyFixedAfter),
  };
}

export function buildAdvisorAlerts(input: {
  company: Company | null;
  bank: BankState;
  dailyFixed: DailyFixedCosts;
  maintenanceFund: MaintenanceFundState;
  equity: number;
}): AdvisorAlert[] {
  const company = input.company;
  if (!company) return [];
  const dailyFixed = Math.max(0, input.dailyFixed.total);
  const pnl = summarizePnl(
    input.bank.bookings,
    Math.max(0, company.tick - 30 * TICKS_PER_DAY),
    company.tick,
  );
  const averageDailyRevenue = pnl.revenue / 30;
  const debt = (input.bank.loans ?? []).reduce((sum, loan) => sum + Math.max(0, safeNumber(loan.principalRemaining)), 0) + Math.max(0, -company.balance);
  const debtToEquity = input.equity > 0 ? debt / input.equity : null;
  const fundTarget = maintenanceFundTarget(dailyFixed);
  const alerts: AdvisorAlert[] = [];

  if (company.balance < Math.max(15_000, dailyFixed * BUFFER_DAYS_CAUTION)) {
    alerts.push({
      id: 'liquidity', tone: 'critical', title: 'Liquidität unter Druck',
      message: `Freie Betriebsmittel decken weniger als drei Tage Fixkosten. Zielreserve: ${Math.round(dailyFixed * BUFFER_DAYS_SAFE).toLocaleString('de-DE')} € vor neuen Investitionen.`,
    });
  }
  if (averageDailyRevenue > 0 && dailyFixed >= averageDailyRevenue * 0.8) {
    alerts.push({
      id: 'fixed-costs', tone: dailyFixed >= averageDailyRevenue ? 'critical' : 'caution', title: 'Fixkostenquote hoch',
      message: `Tägliche Fixkosten liegen bei ${Math.round(dailyFixed).toLocaleString('de-DE')} € gegenüber durchschnittlich ${Math.round(averageDailyRevenue).toLocaleString('de-DE')} € Tagesumsatz der letzten 30 Tage.`,
    });
  }
  if (debtToEquity == null || debtToEquity >= 0.85) {
    alerts.push({
      id: 'debt', tone: debtToEquity == null || debtToEquity >= 1.1 ? 'critical' : 'caution', title: 'Schuldenlast prüfen',
      message: debtToEquity == null
        ? 'Eigenkapital ist nicht positiv; neue Kredite sollten vermieden werden.'
        : `Verschuldungsgrad ${debtToEquity.toFixed(2).replace('.', ',')}×. Zusätzliche Tilgungsraten können den Betriebspuffer stark verringern.`,
    });
  }
  if (input.maintenanceFund.balance < fundTarget) {
    alerts.push({
      id: 'maintenance-fund', tone: input.maintenanceFund.balance === 0 ? 'caution' : 'caution', title: 'Risikovorsorge auffüllen',
      message: `Instandhaltungs-Fonds ${input.maintenanceFund.balance.toLocaleString('de-DE')} € von empfohlenen ${fundTarget.toLocaleString('de-DE')} € für ungeplante Reparaturen.`,
    });
  }
  if (alerts.length === 0) {
    alerts.push({ id: 'stable', tone: 'safe', title: 'Betriebspuffer stabil', message: 'Fixkosten, Liquidität, Schuldenlast und Risikovorsorge liegen innerhalb der empfohlenen Grenzen.' });
  }
  return alerts.slice(0, 3);
}
