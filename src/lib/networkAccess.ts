import type { CountryPackage, Locomotive, Order } from '@/lib/supabase';
import { COUNTRY_PACKAGES } from '@/lib/dealer';
import { loadJson, saveJson } from '@/lib/storage';

export const NETWORK_ACCESS_KEY = 'evu-network-access';
export const HOME_NETWORK: CountryPackage = 'D';

export interface NetworkAccessState {
  packages: CountryPackage[];
}

const ALL_PACKAGES = new Set<CountryPackage>(COUNTRY_PACKAGES.map((p) => p.id));

export function countryPackageLabel(id: CountryPackage): string {
  return COUNTRY_PACKAGES.find((p) => p.id === id)?.label ?? id;
}

export function countryPackagePrice(id: CountryPackage): number {
  return COUNTRY_PACKAGES.find((p) => p.id === id)?.price ?? 0;
}

function uniquePackages(list: CountryPackage[]): CountryPackage[] {
  const next = new Set<CountryPackage>([HOME_NETWORK]);
  for (const id of list) {
    if (ALL_PACKAGES.has(id)) next.add(id);
  }
  return [...next];
}

export function defaultNetworkAccess(): NetworkAccessState {
  return { packages: [HOME_NETWORK] };
}

export function loadNetworkAccess(): NetworkAccessState {
  const loaded = loadJson<NetworkAccessState | null>(NETWORK_ACCESS_KEY, null);
  const packages = uniquePackages(Array.isArray(loaded?.packages) ? loaded!.packages : []);
  const state = { packages };
  saveNetworkAccess(state);
  return state;
}

export function saveNetworkAccess(state: NetworkAccessState): void {
  saveJson(NETWORK_ACCESS_KEY, { packages: uniquePackages(state.packages) });
}

export function hasCountryAccess(state: NetworkAccessState, country: CountryPackage): boolean {
  if (country === HOME_NETWORK) return true;
  return state.packages.includes(country);
}

export function grantNetworkPackages(state: NetworkAccessState, extra: CountryPackage[]): NetworkAccessState {
  return { packages: uniquePackages([...state.packages, ...extra]) };
}

export function inferCountryFromLabel(label: string | null | undefined): CountryPackage {
  const s = (label ?? '').toLowerCase();
  if (/basel|chiasso|lugano|gotthard|olten|biel/.test(s)) return 'CH';
  if (/wien|salzburg|innsbruck|linz|graz/.test(s)) return 'A';
  if (/warszawa|pozna[nń]|wroclaw|wrocław|szczecin|gdansk|gda[nń]sk|katowice/.test(s)) return 'PL';
  if (/praha|prag|brno|ostrava|d[eě][cč][ií]n/.test(s)) return 'CZ';
  if (/amsterdam|rotterdam|utrecht|venlo|arnhem/.test(s)) return 'NL';
  if (/milano|verona|bologna|domodossola|vercelli/.test(s)) return 'IT';
  return HOME_NETWORK;
}

export function orderOriginCountry(order: Pick<Order, 'origin' | 'origin_country'>): CountryPackage {
  return order.origin_country ?? inferCountryFromLabel(order.origin);
}

export function orderDestCountry(order: Pick<Order, 'destination' | 'destination_country'>): CountryPackage {
  return order.destination_country ?? inferCountryFromLabel(order.destination);
}

export function orderCountries(order: Pick<Order, 'origin' | 'destination' | 'origin_country' | 'destination_country'>): CountryPackage[] {
  return [...new Set([orderOriginCountry(order), orderDestCountry(order)])];
}

export function orderRequiresEtcs(
  order: Pick<Order, 'requires_etcs' | 'origin' | 'destination' | 'origin_country' | 'destination_country'>,
): boolean {
  if (order.requires_etcs) return true;
  const origin = orderOriginCountry(order);
  const dest = orderDestCountry(order);
  if (origin === 'CH' || dest === 'CH') return true;
  return origin !== dest;
}

export function missingNetworkCountries(
  state: NetworkAccessState,
  order: Pick<Order, 'origin' | 'destination' | 'origin_country' | 'destination_country'>,
): CountryPackage[] {
  return orderCountries(order).filter((c) => !hasCountryAccess(state, c));
}

export function locoCountries(loco: Pick<Locomotive, 'country_packages'> | null | undefined): CountryPackage[] {
  const packs = loco?.country_packages;
  if (!Array.isArray(packs) || packs.length === 0) return [HOME_NETWORK];
  return uniquePackages(packs);
}

export function locoHasEtcs(loco: Pick<Locomotive, 'equipment'> | null | undefined): boolean {
  return (loco?.equipment ?? []).includes('etcs');
}

/** Slightly tighter Fahrplanlaufzeit after ETCS retrofit. */
export const ETCS_RUNTIME_FACTOR = 0.92;
/** Verspätungspunkte / Störungs-Delay werden stark abgefedert. */
export const ETCS_DELAY_FACTOR = 0.4;

export function etcsRuntimeTicks(baseTicks: number, hasEtcs: boolean): number {
  if (!hasEtcs || baseTicks <= 0) return baseTicks;
  return Math.max(1, Math.round(baseTicks * ETCS_RUNTIME_FACTOR));
}

export function etcsMitigatedDelay(delayTicks: number, hasEtcs: boolean): number {
  if (!hasEtcs || delayTicks <= 0) return delayTicks;
  return Math.max(0, Math.round(delayTicks * ETCS_DELAY_FACTOR));
}

export function fleetHasEtcs(locos: Locomotive[] | null | undefined): boolean {
  return (locos ?? []).some(locoHasEtcs);
}

export function locoCoversOrder(
  loco: Pick<Locomotive, 'country_packages' | 'equipment'> | null | undefined,
  order: Pick<Order, 'origin' | 'destination' | 'origin_country' | 'destination_country' | 'requires_etcs'>,
): { ok: boolean; missingCountries: CountryPackage[]; needsEtcs: boolean } {
  const have = new Set(locoCountries(loco));
  const missingCountries = orderCountries(order).filter((c) => !have.has(c));
  const needsEtcs = orderRequiresEtcs(order) && !locoHasEtcs(loco);
  return { ok: missingCountries.length === 0 && !needsEtcs, missingCountries, needsEtcs };
}

export function networkAcceptBlock(
  order: Pick<Order, 'origin' | 'destination' | 'origin_country' | 'destination_country' | 'requires_etcs'>,
  access: NetworkAccessState,
  locos?: Locomotive[] | null,
): string | null {
  const missing = missingNetworkCountries(access, order);
  if (missing.length > 0) {
    const labels = missing.map((id) => `${countryPackageLabel(id)} (${id})`).join(', ');
    return `Netzzugang fehlt: ${labels}. Paket im Händler unter Netzzugang kaufen.`;
  }
  if (orderRequiresEtcs(order) && locos && !fleetHasEtcs(locos)) {
    return 'Diese Trasse erfordert ETCS. Keine ETCS-Lok im Bestand — in der Werkstatt nachrüsten oder mit ETCS erwerben.';
  }
  return null;
}

export function networkDispatchBlock(
  order: Pick<Order, 'origin' | 'destination' | 'origin_country' | 'destination_country' | 'requires_etcs'>,
  loco: Pick<Locomotive, 'country_packages' | 'equipment'> | null | undefined,
): string | null {
  if (!loco) return null;
  const cover = locoCoversOrder(loco, order);
  if (cover.needsEtcs) {
    return 'Diese Trasse erfordert ETCS. Die gewählte Lok hat keine ETCS-Ausrüstung — in der Werkstatt nachrüsten.';
  }
  if (cover.missingCountries.length > 0) {
    const labels = cover.missingCountries.map((id) => `${countryPackageLabel(id)} (${id})`).join(', ');
    return `Lok ohne Länderpaket: ${labels}. Im Händler eine Lok mit diesem Paket erwerben.`;
  }
  return null;
}

export function corridorCountryHint(
  order: Pick<Order, 'origin' | 'destination' | 'origin_country' | 'destination_country' | 'requires_etcs'>,
): string {
  const origin = orderOriginCountry(order);
  const dest = orderDestCountry(order);
  const etcs = orderRequiresEtcs(order) ? ' · ETCS' : '';
  if (origin === dest) return `${origin}${etcs}`;
  return `${origin}–${dest}${etcs}`;
}
