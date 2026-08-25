import { Megaphone, Star } from 'lucide-react';
import type { Company } from '@/lib/supabase';
import { formatEuro } from '@/lib/status';
import { Button, Card, CardFlush, CardHeader } from '@/components/ui';
import { SectionShell } from '@/components/SectionShell';
import {
  CAMPAIGN_CATALOG,
  campaignUnlockHint,
  isCampaignUnlocked,
  type ActiveCampaign,
  type AdvertisingState,
  type CampaignDef,
} from '@/lib/advertising';
import { formatTickLabel } from '@/lib/gameTime';
import { TICKS_PER_DAY } from '@/lib/storage';

interface AdvertisingViewProps {
  company: Company | null;
  ads: AdvertisingState;
  onStartCampaign: (def: CampaignDef) => boolean;
}

export function AdvertisingView({ company, ads, onStartCampaign }: AdvertisingViewProps) {
  const bekanntheit = company?.reputation ?? 0;
  const level = company?.level ?? 1;

  return (
    <SectionShell
      title="Werbeagentur"
      subtitle="Teure, langsame Kampagnen — Bekanntheit 0–100, nur über viele Spieltage plus echte Frachten"
    >

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="shrink-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <Star className="h-3.5 w-3.5 text-amber-400" /> Bekanntheit
            </div>
            <div className="mt-1 text-3xl font-bold text-amber-400">{bekanntheit}/100</div>
          </div>
          <div className="flex min-w-0 w-full flex-1 flex-col">
            <div className="h-2 w-full overflow-hidden rounded-full border border-amber-500/30 bg-slate-950">
              <div className="h-full bg-amber-500" style={{ width: `${bekanntheit}%` }} />
            </div>
            <p className="mt-2.5 w-full max-w-full whitespace-normal break-normal text-left text-xs leading-relaxed text-slate-400">
              Höhere Bekanntheit und höheres EVU-Level öffnen lukrative Industrieverträge (ab Level 4/5: Stahl-Pendel, Hafen-Intermodal, Autowerke).
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-3">
        {CAMPAIGN_CATALOG.map((def) => {
          const unlocked = isCampaignUnlocked(def, level);
          const hint = campaignUnlockHint(def);
          return (
            <Card
              key={def.kind}
              className={`flex flex-col ${unlocked ? '' : 'opacity-55'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-400">
                  <Megaphone className="h-4 w-4 shrink-0" />
                  <h3 className="text-sm font-bold text-white">{def.name}</h3>
                </div>
                <span className="shrink-0 rounded-full border border-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Ab Lvl {def.unlockLevel}
                </span>
              </div>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-400">{def.copy}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <dt className="uppercase text-slate-500">Kosten</dt>
                  <dd className="font-bold text-amber-300">{formatEuro(def.cost)}</dd>
                </div>
                <div>
                  <dt className="uppercase text-slate-500">Dauer</dt>
                  <dd className="font-bold text-white">
                    {Math.max(1, Math.round(def.durationTicks / TICKS_PER_DAY))} Tage
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="uppercase text-slate-500">Bekanntheit</dt>
                  <dd className="font-bold text-emerald-400">+{def.bekanntheitGain}</dd>
                </div>
              </dl>
              <span title={unlocked ? undefined : hint} className="mt-4 block w-full">
                <Button
                  className={`w-full ${unlocked ? '' : 'cursor-not-allowed opacity-50 disabled:opacity-50'}`}
                  disabled={!unlocked}
                  onClick={() => {
                    if (!unlocked) return;
                    onStartCampaign(def);
                  }}
                >
                  {unlocked ? 'Kampagne buchen' : hint}
                </Button>
              </span>
              {!unlocked && (
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{hint}</p>
              )}
            </Card>
          );
        })}
      </div>

      <CardFlush>
        <CardHeader>Laufende Kampagnen</CardHeader>
        <div className="divide-y divide-amber-500/10">
          {ads.campaigns.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-500">Keine aktive Werbung</div>
          )}
          {ads.campaigns.map((c) => (
            <CampaignRow key={c.id} campaign={c} />
          ))}
        </div>
      </CardFlush>
    </SectionShell>
  );
}

function CampaignRow({ campaign }: { campaign: ActiveCampaign }) {
  const def = CAMPAIGN_CATALOG.find((c) => c.kind === campaign.kind);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div>
        <div className="text-sm font-bold text-white">{def?.name ?? campaign.kind}</div>
        <div className="text-[11px] text-slate-400">
          Start {formatTickLabel(campaign.startedTick)} · Ende {formatTickLabel(campaign.endsTick)}
        </div>
      </div>
      <div className="text-xs font-bold text-emerald-400">+{campaign.bekanntheitGain} Bekanntheit</div>
    </div>
  );
}
