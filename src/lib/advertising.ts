import type { Company, Notification } from '@/lib/supabase';
import { clampReputation, loadJson, saveJson, TICKS_PER_DAY } from '@/lib/storage';
import { newNotificationId } from '@/lib/gameTime';

export const ADVERTISING_STATE_KEY = 'evu-advertising-state';

export type CampaignKind = 'regionalpresse' | 'online-banner' | 'branchenmessen';

export interface CampaignDef {
  kind: CampaignKind;
  name: string;
  cost: number;
  durationTicks: number;
  bekanntheitGain: number;
  copy: string;
  /** Minimum company level required to book this campaign. */
  unlockLevel: number;
}

export interface ActiveCampaign {
  id: string;
  kind: CampaignKind;
  startedTick: number;
  endsTick: number;
  bekanntheitGain: number;
  cost: number;
}

export interface AdvertisingState {
  campaigns: ActiveCampaign[];
}

export const CAMPAIGN_CATALOG: CampaignDef[] = [
  {
    kind: 'regionalpresse',
    name: 'Regionalpresse',
    cost: 3_500,
    durationTicks: 7 * TICKS_PER_DAY,
    bekanntheitGain: 1,
    copy: 'Lokalpresse und regionale Branchenblätter schaffen einen bezahlbaren ersten Bekanntheitsschub im Heimatnetz.',
    unlockLevel: 1,
  },
  {
    kind: 'online-banner',
    name: 'Online-Banner',
    cost: 14_000,
    durationTicks: 10 * TICKS_PER_DAY,
    bekanntheitGain: 4,
    copy: 'Gezielte Banner auf Logistikportalen erweitern die Reichweite deutlich über das Heimatnetz hinaus.',
    unlockLevel: 3,
  },
  {
    kind: 'branchenmessen',
    name: 'Branchenmessen',
    cost: 60_000,
    durationTicks: 14 * TICKS_PER_DAY,
    bekanntheitGain: 10,
    copy: 'Ein Messeauftritt mit Logistikstand erzeugt überregionale Sichtbarkeit und einen starken, aber kostenintensiven Bekanntheitsschub.',
    unlockLevel: 5,
  },
];

export function isCampaignUnlocked(def: CampaignDef, companyLevel: number): boolean {
  return Math.max(1, companyLevel) >= def.unlockLevel;
}

export function campaignUnlockHint(def: CampaignDef): string {
  return `Freischaltung ab Firmen-Level ${def.unlockLevel}`;
}

export function loadAdvertisingState(): AdvertisingState {
  const loaded = loadJson<AdvertisingState | null>(ADVERTISING_STATE_KEY, null);
  if (!loaded || !Array.isArray(loaded.campaigns)) return { campaigns: [] };
  return { campaigns: loaded.campaigns };
}

export function saveAdvertisingState(state: AdvertisingState): void {
  saveJson(ADVERTISING_STATE_KEY, state);
}

export function startCampaign(
  state: AdvertisingState,
  def: CampaignDef,
  tick: number,
  companyLevel = 1,
): AdvertisingState | null {
  if (!isCampaignUnlocked(def, companyLevel)) return null;
  return {
    campaigns: [
      {
        id: newNotificationId(),
        kind: def.kind,
        startedTick: tick,
        endsTick: tick + def.durationTicks,
        bekanntheitGain: def.bekanntheitGain,
        cost: def.cost,
      },
      ...state.campaigns,
    ].slice(0, 24),
  };
}

export function processAdvertisingTick(
  state: AdvertisingState,
  company: Company,
  nextTick: number,
): { state: AdvertisingState; notifications: Omit<Notification, 'id'>[] } {
  const still: ActiveCampaign[] = [];
  const notifications: Omit<Notification, 'id'>[] = [];
  for (const campaign of state.campaigns) {
    if (campaign.endsTick <= nextTick) {
      notifications.push({
        type: 'info',
        title: 'Kampagne beendet',
        message: `${CAMPAIGN_CATALOG.find((c) => c.kind === campaign.kind)?.name ?? 'Werbung'} ist ausgelaufen. Bekanntheit bleibt bei ${company.reputation}.`,
        read: false,
        created_at: company.updated_at,
      });
    } else {
      still.push(campaign);
    }
  }
  return { state: { campaigns: still }, notifications };
}

export function applyBekanntheit(company: Company, gain: number): Company {
  return { ...company, reputation: clampReputation(company.reputation + gain) };
}
