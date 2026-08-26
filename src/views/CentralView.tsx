import {
  Train,
  Users,
  Package,
  ClipboardList,
  TrendingUp,
  Boxes,
  Star,
  AlertTriangle,
} from 'lucide-react';
import type {
  Company,
  Locomotive,
  Driver,
  Order,
  AssignmentWithDetails,
  Wagon,
} from '@/lib/supabase';
import { formatEuro, locoStatusConfig, orderStatusConfig, getLocoPillClass, getOrderPillClass, getDriverPillClass, getWagonPillClass } from '@/lib/status';
import { formatTickLabel } from '@/lib/gameTime';
import { SectionShell } from '@/components/SectionShell';
import { DailyFixedCostsCard } from '@/components/DailyFixedCostsCard';
import type { DailyFixedCosts } from '@/lib/dailyFixedCosts';
import {
  corporateRankForProgress,
  milestoneXpTowardNext,
  nextCorporateRank,
  type CorporateMilestoneState,
} from '@/lib/corporateMilestones';
import { CORE_LEVEL_CAP, CORPORATE_MILESTONE_XP_STEP } from '@/lib/progression';

interface CentralViewProps {
  company: Company | null;
  locomotives: Locomotive[];
  drivers: Driver[];
  orders: Order[];
  assignments: AssignmentWithDetails[];
  wagons: Wagon[];
  dailyFixed?: DailyFixedCosts;
  corporateMilestones: CorporateMilestoneState;
  onEditCompany?: () => void;
}

export function CentralView({
  company,
  locomotives,
  drivers,
  orders,
  assignments,
  wagons,
  dailyFixed,
  corporateMilestones,
  onEditCompany,
}: CentralViewProps) {
  const activeAssignments = assignments.filter(
    (a) => a.status === 'geplant' || a.status === 'aktiv',
  ).length;
  const openOrders = orders.filter((o) => o.status === 'offen').length;
  const locosFrei = locomotives.filter((l) => l.status === 'frei').length;
  const driversVerfuegbar = drivers.filter((d) => d.status === 'verfuegbar').length;
  const wagonsVerfuegbar = wagons
    .filter((w) => w.status === 'verfuegbar')
    .reduce((sum, w) => sum + w.count, 0);
  const wagonsFrist = wagons
    .filter((w) => w.status === 'frist_abgelaufen')
    .reduce((sum, w) => sum + w.count, 0);
  const totalYield = orders
    .filter((o) => o.status === 'offen')
    .reduce((sum, o) => sum + Number(o.yield), 0);
  const completedRevenue = orders
    .filter((o) => o.status === 'abgeschlossen')
    .reduce((sum, o) => sum + Number(o.yield), 0);
  const tonKm = orders
    .filter((o) => o.status === 'abgeschlossen' || o.status === 'zugewiesen')
    .reduce((sum, o) => sum + o.distance_km * o.weight_t, 0);
  const xpPct = company && company.xp_next > 0 ? Math.min(100, (company.xp / company.xp_next) * 100) : 0;
  const repColor =
    (company?.reputation ?? 0) >= 70 ? 'text-emerald-400' : (company?.reputation ?? 0) >= 40 ? 'text-amber-400' : 'text-rose-400';
  const repBarColor =
    (company?.reputation ?? 0) >= 70 ? 'bg-emerald-500' : (company?.reputation ?? 0) >= 40 ? 'bg-amber-500' : 'bg-rose-500';
  const coreLevel = Math.min(CORE_LEVEL_CAP, Math.max(1, company?.level ?? 1));
  const corporateRank = corporateRankForProgress(coreLevel, corporateMilestones.totalXp);
  const nextRank = nextCorporateRank(coreLevel, corporateMilestones.totalXp);
  const milestoneProgress = milestoneXpTowardNext(corporateMilestones);
  const milestonePct = Math.min(100, (milestoneProgress / CORPORATE_MILESTONE_XP_STEP) * 100);
  const milestoneNumber = corporateMilestones.completedMilestones + 1;

  return (
    <SectionShell
      title="Auswertungen"
      subtitle="Kennzahlen, Erlöse und Betriebsstatus"
      actions={
        onEditCompany ? (
          <button type="button" onClick={onEditCompany} className="btn-action btn-action-detail">
            Firma bearbeiten
          </button>
        ) : undefined
      }
    >

      <div className="grid gap-3 md:grid-cols-3">
        <div className="game-box p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Kontostand</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-1 text-lg font-bold fi-gold">{formatEuro(company?.balance ?? 0)}</div>
          <div className="text-[10px] text-slate-500">{formatTickLabel(company?.tick ?? 0)}</div>
        </div>
        <div className="game-box p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Level / XP</span>
            <Star className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-1 text-lg font-bold text-amber-400">Lvl {company?.level ?? 0}</div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${xpPct}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            {company?.xp ?? 0} / {company?.xp_next ?? 0} XP
          </div>
        </div>
        <div className="game-box p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Reputation</span>
            <Star className={`h-4 w-4 ${repColor}`} />
          </div>
          <div className={`mt-1 text-lg font-bold ${repColor}`}>{company?.reputation ?? 0}/100</div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-700">
            <div className={`h-full rounded-full ${repBarColor}`} style={{ width: `${company?.reputation ?? 0}%` }} />
          </div>
        </div>
      </div>

      <div className="game-box border border-amber-500/25 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
              <Star className="h-3.5 w-3.5" /> Konzern-Rang
            </div>
            <h2 className="mt-1 text-lg font-bold text-amber-200">{corporateRank.label}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-300">{corporateRank.description}</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Kernfortschritt</p>
            <p className="mt-1 text-sm font-bold text-white">Level {coreLevel} / {CORE_LEVEL_CAP}</p>
          </div>
        </div>
        {coreLevel >= CORE_LEVEL_CAP ? (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 text-[11px]">
              <span className="font-semibold text-slate-200">Konzern-Meilenstein {milestoneNumber}</span>
              <span className="tabular-nums text-amber-200">{milestoneProgress.toLocaleString('de-DE')} / {CORPORATE_MILESTONE_XP_STEP.toLocaleString('de-DE')} XP</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-300" style={{ width: `${milestonePct}%` }} />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              Weitere Aufträge zählen dauerhaft als Konzern-Meilensteinpunkte. Kein Spielstands-Reset: Fuhrpark, Personal, Kapital und Depot bleiben erhalten.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
            {nextRank ? `Nächster Rang: ${nextRank.label} ab Level ${nextRank.requiredLevel}.` : 'Alle Konzern-Ränge freigeschaltet.'}
            {' '}Ab Level {CORE_LEVEL_CAP} werden weitere XP zu dauerhaften Konzern-Meilensteinpunkten statt zu weiteren Kernleveln.
          </p>
        )}
      </div>

      {dailyFixed && <DailyFixedCostsCard costs={dailyFixed} variant="compact" />}

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-4">
        <KPIBox label="Triebfahrzeuge" value={`${locosFrei}/${locomotives.length}`} sub="frei/gesamt" icon={<Train className="h-4 w-4" />} color="text-emerald-400" />
        <KPIBox label="Wagen" value={`${wagonsVerfuegbar}`} sub="verfügbar" icon={<Boxes className="h-4 w-4" />} color="text-sky-400" />
        <KPIBox label="Personal" value={`${driversVerfuegbar}/${drivers.length}`} sub="verfügbar/gesamt" icon={<Users className="h-4 w-4" />} color="text-amber-400" />
        <KPIBox label="Offene Aufträge" value={`${openOrders}`} sub={`${formatEuro(totalYield)} Volumen`} icon={<Package className="h-4 w-4" />} color="text-orange-400" />
        <KPIBox label="Aktive Einsätze" value={`${activeAssignments}`} sub="zugewiesen" icon={<ClipboardList className="h-4 w-4" />} color="text-sky-400" />
        <KPIBox label="Frist-Warnungen" value={`${wagonsFrist}`} sub="Wagen überfällig" icon={<AlertTriangle className="h-4 w-4" />} color="text-rose-400" />
        <KPIBox label="Erlöse (realisiert)" value={formatEuro(completedRevenue)} sub="abgeschlossene Aufträge" icon={<TrendingUp className="h-4 w-4" />} color="text-emerald-400" />
        <KPIBox label="Tonnenkilometer" value={tonKm.toLocaleString('de-DE')} sub="tkm (zugewiesen + erfüllt)" icon={<ClipboardList className="h-4 w-4" />} color="text-sky-400" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Fuhrpark-Status */}
        <div className="game-box">
          <div className="game-box-header flex items-center gap-2">
            <Train className="h-3.5 w-3.5 text-amber-500" />
            Fuhrpark-Status
          </div>
          <div className="p-3 space-y-2">
            {Object.entries(locoStatusConfig).map(([key, cfg]) => {
              const count = locomotives.filter((l) => l.status === key).length;
              return (
                <div key={key} className="flex items-center justify-between border-b border-slate-800 pb-1.5 last:border-0">
                    <span className={getLocoPillClass(key)}>
                      <span className={`status-dot ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  <span className="text-sm font-bold text-white">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Personal-Status */}
        <div className="game-box">
          <div className="game-box-header flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-amber-500" />
            Personal-Status
          </div>
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className={getDriverPillClass('verfuegbar')}>
                <span className="status-dot bg-emerald-400" /> Verfügbar
              </span>
              <span className="text-sm font-bold text-white">{driversVerfuegbar}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className={getDriverPillClass('im_einsatz')}>
                <span className="status-dot bg-sky-400" /> Im Einsatz
              </span>
              <span className="text-sm font-bold text-white">{drivers.filter((d) => d.status === 'im_einsatz').length}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className={getDriverPillClass('pause')}>
                <span className="status-dot bg-amber-400" /> Pause
              </span>
              <span className="text-sm font-bold text-white">{drivers.filter((d) => d.status === 'pause').length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={getDriverPillClass('krank')}>
                <span className="status-dot bg-rose-400" /> Krank
              </span>
              <span className="text-sm font-bold text-white">{drivers.filter((d) => d.status === 'krank').length}</span>
            </div>
          </div>
        </div>

        {/* Auftrags-Status */}
        <div className="game-box">
          <div className="game-box-header flex items-center gap-2">
            <Package className="h-3.5 w-3.5 text-amber-500" />
            Auftrags-Status
          </div>
          <div className="p-3 space-y-2">
            {Object.entries(orderStatusConfig).map(([key, cfg]) => {
              const count = orders.filter((o) => o.status === key).length;
              return (
                <div key={key} className="flex items-center justify-between border-b border-slate-800 pb-1.5 last:border-0">
                    <span className={getOrderPillClass(key)}>
                      <span className={`status-dot ${cfg.text.replace('text-', 'bg-').replace('-300', '-400')}`} />
                      {cfg.label}
                    </span>
                  <span className="text-sm font-bold text-white">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Wagen-Status */}
        <div className="game-box">
          <div className="game-box-header flex items-center gap-2">
            <Boxes className="h-3.5 w-3.5 text-amber-500" />
            Wagenpark-Status
          </div>
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className={getWagonPillClass('verfuegbar')}>
                <span className="status-dot bg-emerald-400" /> Verfügbar
              </span>
              <span className="text-sm font-bold text-white">{wagonsVerfuegbar}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className={getWagonPillClass('im_einsatz')}>
                <span className="status-dot bg-sky-400" /> Im Einsatz
              </span>
              <span className="text-sm font-bold text-white">{wagons.filter((w) => w.status === 'im_einsatz').reduce((s, w) => s + w.count, 0)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className={getWagonPillClass('wartung')}>
                <span className="status-dot bg-amber-400" /> Wartung
              </span>
              <span className="text-sm font-bold text-white">{wagons.filter((w) => w.status === 'wartung').reduce((s, w) => s + w.count, 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={getWagonPillClass('frist_abgelaufen')}>
                <span className="status-dot bg-rose-400" /> Frist abgelaufen
              </span>
              <span className="text-sm font-bold text-white">{wagonsFrist}</span>
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

interface KPIBoxProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
}

function KPIBox({ label, value, sub, icon, color }: KPIBoxProps) {
  return (
    <div className="game-box p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
        <span className={color}>{icon}</span>
      </div>
      <div className={`mt-1 text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-500">{sub}</div>
    </div>
  );
}
