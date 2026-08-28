import type { AchievementState, LiveryId } from '@/lib/achievements';
import { ACHIEVEMENT_BY_ID, activeLivery, unlockedLiveries } from '@/lib/achievements';
import type { CorporateMilestoneState } from '@/lib/corporateMilestones';
import { corporateRankForProgress } from '@/lib/corporateMilestones';
import { CORE_LEVEL_CAP } from '@/lib/progression';
import { exclusiveJobsUnlocked, reputationTier } from '@/lib/reputation';
import type { NetworkAccessState } from '@/lib/networkAccess';
import { countryPackageLabel } from '@/lib/networkAccess';
import type { Locomotive } from '@/lib/supabase';
import { locoHasEtcs } from '@/lib/networkAccess';

export type CertificateKind = 'safety' | 'ops' | 'identity';

export interface OperatingCertificate {
  id: string;
  kind: CertificateKind;
  label: string;
  detail: string;
  earned: boolean;
}

export interface IdentitySnapshot {
  rankLabel: string;
  coreLevel: number;
  coreCap: number;
  livery: { id: LiveryId; label: string } | null;
  liveries: LiveryId[];
  certificates: OperatingCertificate[];
}

export function operatingCertificates(input: {
  level: number;
  reputation: number;
  locos: Locomotive[];
  network: NetworkAccessState | null | undefined;
  achievements: AchievementState;
  milestones: CorporateMilestoneState;
}): OperatingCertificate[] {
  const etcs = input.locos.filter((loco) => locoHasEtcs(loco)).length;
  const packages = input.network?.packages ?? ['D'];
  const rank = corporateRankForProgress(input.level, input.milestones.totalXp);
  const exclusive = exclusiveJobsUnlocked(input.reputation);
  const schadensfrei = input.achievements.unlockedIds.includes('schadensfrei');
  return [
    {
      id: 'eba-ops',
      kind: 'safety',
      label: 'Betriebszertifikat EBA-Ruhezeiten',
      detail: 'Transparente 8h-Ruhe / 48h-Fenster — Regeln unverändert.',
      earned: true,
    },
    {
      id: 'brh-sheet',
      kind: 'safety',
      label: 'Bremszettel-Verfahren',
      detail: 'Abfahrt nur mit ausreichender Brh (Live-Check).',
      earned: true,
    },
    {
      id: 'etcs',
      kind: 'ops',
      label: 'ETCS-Betriebsfreigabe',
      detail: etcs > 0 ? `${etcs} Lok(s) mit ETCS` : 'Noch keine ETCS-Lok im Bestand',
      earned: etcs > 0,
    },
    {
      id: 'exclusive',
      kind: 'ops',
      label: 'Exklusiv-Ganzzüge',
      detail: exclusive ? 'Reputation 70+ — Premium-EVU' : `Aktuell ${reputationTier(input.reputation).label}`,
      earned: exclusive,
    },
    {
      id: 'network',
      kind: 'ops',
      label: 'Netzzugang',
      detail: packages.map((id) => countryPackageLabel(id)).join(', '),
      earned: packages.length > 1,
    },
    {
      id: 'core-20',
      kind: 'identity',
      label: 'Kernmeilenstein Stufe 20',
      detail:
        input.level >= CORE_LEVEL_CAP
          ? 'Wirtschaftlicher Kern erreicht — kein Reset, Konzern-Meilensteine aktiv.'
          : `Level ${Math.min(CORE_LEVEL_CAP, input.level)} / ${CORE_LEVEL_CAP}`,
      earned: input.level >= CORE_LEVEL_CAP,
    },
    {
      id: 'rank',
      kind: 'identity',
      label: rank.label,
      detail: rank.description,
      earned: true,
    },
    {
      id: 'damage-free',
      kind: 'safety',
      label: 'Schadensfrei-Zertifikat',
      detail: schadensfrei
        ? ACHIEVEMENT_BY_ID['schadensfrei']?.condition ?? '90 Tage ohne ungeplanten Schaden'
        : 'Noch nicht erreicht',
      earned: schadensfrei,
    },
  ];
}

export function identitySnapshot(input: {
  level: number;
  reputation: number;
  locos: Locomotive[];
  network: NetworkAccessState | null | undefined;
  achievements: AchievementState;
  milestones: CorporateMilestoneState;
}): IdentitySnapshot {
  return {
    rankLabel: corporateRankForProgress(input.level, input.milestones.totalXp).label,
    coreLevel: Math.min(CORE_LEVEL_CAP, Math.max(1, input.level)),
    coreCap: CORE_LEVEL_CAP,
    livery: activeLivery(input.achievements),
    liveries: unlockedLiveries(input.achievements),
    certificates: operatingCertificates(input),
  };
}
