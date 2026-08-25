import { useState, type ReactNode } from 'react';
import { Wrench } from 'lucide-react';
import type { Company, Locomotive, Wagon } from '@/lib/supabase';
import { formatEuro, getLocoPillClass, getLocoStatusConfig } from '@/lib/status';
import { Button, Card } from '@/components/ui';
import { LocoPhoto } from '@/components/LocoPhoto';
import { EtcsBadge } from '@/components/EtcsBadge';
import { EtcsRetrofitModal } from '@/components/EtcsRetrofitModal';
import { SectionShell } from '@/components/SectionShell';
import { DepotUpgradePanel } from '@/components/DepotUpgradePanel';
import { getLocoDisplayName } from '@/lib/locoPhotos';
import { TICKS_PER_DAY } from '@/lib/storage';
import { canSpend } from '@/lib/bank';
import {
  allFristen,
  canBookWorkshopJob,
  CONDITION_CLASSES,
  DEFAULT_WORKSHOP_SLOTS,
  ensureMaintenance,
  etcsRetrofitConfirmWarning,
  formatFristPair,
  freeWorkshopSlots,
  jobLabel,
  locoFaultLabel,
  locoHasEtcsEquipment,
  locoHasFault,
  quoteWorkshopJob,
  usedWorkshopSlots,
  WORKSHOP_LEVELS,
  WORKSHOP_RATES,
  type WorkshopChannel,
  type WorkshopJob,
  type WorkshopJobKind,
  type WorkshopQuote,
} from '@/lib/workshop';
import { workshopSlotCap, nextExpansion, type DepotState } from '@/lib/depot';
import { activeLivery, liveryCssClass } from '@/lib/achievements';
import type { AchievementState } from '@/lib/achievements';

interface WorkshopViewProps {
  company: Company | null;
  locomotives: Locomotive[];
  wagons: Wagon[];
  workshopJobs: WorkshopJob[];
  depot: DepotState;
  tick: number;
  overdraftLimit?: number;
  onStartWorkshopJob: (locoId: string, kind: WorkshopJobKind, channel?: WorkshopChannel) => boolean;
  onBuyDepotExpansion: (expansionId: string) => boolean;
  workshopDiscountPct?: number;
  achievements?: AchievementState | null;
}

const PLANNED_KINDS = ['F', 'ZU', 'HU'] as const;

export function WorkshopView({
  company,
  locomotives,
  wagons,
  workshopJobs,
  depot,
  tick,
  overdraftLimit = 0,
  onStartWorkshopJob,
  onBuyDepotExpansion,
  workshopDiscountPct = 0,
  achievements = null,
}: WorkshopViewProps) {
  const workshopCap = workshopSlotCap(depot);
  const slotsUsed = usedWorkshopSlots(workshopJobs, tick);
  const slotsFree = freeWorkshopSlots(workshopJobs, tick, workshopCap);
  const nextWs = nextExpansion(depot, 'workshop');
  const jobsByLoco = new Map<string, WorkshopJob>();
  for (const job of workshopJobs) jobsByLoco.set(job.locoId, job);
  const [pendingEtcs, setPendingEtcs] = useState<Locomotive | null>(null);
  const livery = activeLivery(achievements);
  const pendingQuote = pendingEtcs ? quoteWorkshopJob(pendingEtcs, 'etcs', 'eigen', workshopDiscountPct) : null;
  const pendingBlocked = pendingEtcs
    ? canBookWorkshopJob(pendingEtcs, workshopJobs, 'etcs', 'eigen', tick, workshopCap)
    : null;
  const pendingCanPay = pendingQuote
    ? canSpend(company?.balance ?? 0, pendingQuote.cost, overdraftLimit)
    : false;
  const pendingWarning = pendingEtcs
    ? etcsRetrofitConfirmWarning(pendingBlocked, pendingCanPay, company?.balance ?? 0, formatEuro)
    : null;

  return (
    <SectionShell
      title="Werkstatt"
      subtitle="Fristarbeit, ZU, HU — ETCS-Nachrüstung für alle Loks (1 Tag, eigener Slot) — Reparatur nur bei Schaden"
      tutorialId="tutorial-werkstatt"
    >
      <Card className="border-amber-400/40 bg-amber-950/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wide text-amber-300">Werkstatt-Slots</div>
            <p className="mt-1 text-sm font-bold text-amber-100">
              {slotsUsed} / {workshopCap} Slots belegt · {slotsFree} frei
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-200/70">
              ZU, HU und ETCS-Nachrüstung belegen je einen eigenen Slot. F läuft ohne Slot. Fremdvergabe (F/ZU/HU)
              stets +25 %, ohne Slot. ETCS nur eigen, gleicher Preis wie beim Händler (8 % Katalog), 1 Tag. Überfällige
              Frist (rot) bis +60 %.
              Reparatur erscheint erst nach einem gemeldeten Schaden.
            </p>
            <p className="mt-1 text-[11px] text-amber-200/80">
              {nextWs
                ? `Nächster Ausbau: ${nextWs.label} ab Level ${nextWs.unlockLevel} — unter Gebäude kaufbar.`
                : 'Maximale eigene Slot-Zahl erreicht.'}
              {workshopDiscountPct > 0
                ? ` Meilenstein-Rabatt −${workshopDiscountPct} % auf alle Werkstattpreise (F/ZU/HU, Reparatur, ETCS).`
                : ''}
            </p>
          </div>
          <div className="shrink-0 text-right text-[11px] text-amber-200/80">
            <div>Start: {DEFAULT_WORKSHOP_SLOTS} eigene Slots</div>
            <div>{workshopJobs.length} laufende Aufträge</div>
          </div>
        </div>
      </Card>
      <DepotUpgradePanel
        compact
        depot={depot}
        companyLevel={company?.level ?? 1}
        balance={company?.balance ?? 0}
        locoCount={locomotives.length}
        wagons={wagons}
        workshopUsed={slotsUsed}
        onBuy={onBuyDepotExpansion}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {locomotives.map((raw) => {
          const loco = ensureMaintenance(raw);
          const job = jobsByLoco.get(loco.id);
          const cfg = getLocoStatusConfig(loco.status);
          const fristen = allFristen(loco);
          const condition = loco.maintenance?.conditionPct ?? 100;
          const cls = CONDITION_CLASSES[loco.maintenance?.conditionClass ?? 1];
          const fault = locoHasFault(loco);
          const faultName = locoFaultLabel(loco);
          return (
            <Card key={loco.id} className="p-4">
              <div className="flex gap-3">
                <div className={`h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-800 ${liveryCssClass(livery?.id)}`}>
                  <LocoPhoto designation={loco.designation} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-white">{getLocoDisplayName(loco.designation)}</div>
                      <div className="font-mono text-[11px] text-slate-400">{loco.name}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={getLocoPillClass(loco.status)}>
                        <span className={`status-dot ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      {locoHasEtcsEquipment(loco) && <EtcsBadge />}
                      {livery && (
                        <span className="rounded-full border border-amber-500/40 bg-slate-950/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-200">
                          Lackierung: {livery.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    Zustand {condition}% · {cls.label}
                    {loco.status === 'stillgelegt' && (
                      <span className="ml-2 font-bold text-rose-400">ohne gültige HU nicht einsatzbereit</span>
                    )}
                  </div>
                </div>
              </div>
              {job ? (
                <p className="mt-3 text-xs text-amber-300">
                  {jobLabel(job)} · noch {Math.max(1, Math.ceil((job.completeAtTick - tick) / TICKS_PER_DAY))} T.
                  {job.occupiesSlot ? ' · belegt Slot' : ''}
                </p>
              ) : (
                <div className="workshop-job-stack">
                  {PLANNED_KINDS.map((kind) => (
                    <WorkshopJobBlock
                      key={kind}
                      loco={loco}
                      kind={kind}
                      jobs={workshopJobs}
                      tick={tick}
                      slotCap={workshopCap}
                      restLabel={`${formatFristPair(fristen[kind]).days} / ${formatFristPair(fristen[kind]).km}`}
                      restOverdue={fristen[kind].overdue}
                      onStart={onStartWorkshopJob}
                      discountPct={workshopDiscountPct}
                    />
                  ))}
                  <WorkshopEtcsBlock
                    loco={loco}
                    jobs={workshopJobs}
                    tick={tick}
                    slotCap={workshopCap}
                    onRequest={() => setPendingEtcs(loco)}
                    discountPct={workshopDiscountPct}
                  />
                  <WorkshopRepairBlock
                    loco={loco}
                    jobs={workshopJobs}
                    tick={tick}
                    slotCap={workshopCap}
                    hasFault={fault}
                    faultName={faultName}
                    onStart={onStartWorkshopJob}
                    discountPct={workshopDiscountPct}
                  />
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {pendingEtcs && pendingQuote && (
        <EtcsRetrofitModal
          locoName={`${getLocoDisplayName(pendingEtcs.designation)} · ${pendingEtcs.name}`}
          cost={pendingQuote.cost}
          listCost={pendingQuote.listCost}
          durationDays={pendingQuote.durationDays}
          warning={pendingWarning}
          confirmDisabled={Boolean(pendingWarning)}
          onCancel={() => setPendingEtcs(null)}
          onConfirm={() => {
            const ok = onStartWorkshopJob(pendingEtcs.id, 'etcs', 'eigen');
            if (ok) setPendingEtcs(null);
            return ok;
          }}
        />
      )}
    </SectionShell>
  );
}

function WorkshopJobBlock({
  loco,
  kind,
  jobs,
  tick,
  slotCap,
  restLabel,
  restOverdue,
  onStart,
  discountPct = 0,
}: {
  loco: Locomotive;
  kind: 'F' | 'ZU' | 'HU';
  jobs: WorkshopJob[];
  tick: number;
  slotCap: number;
  restLabel: string;
  restOverdue: boolean;
  onStart: (locoId: string, kind: WorkshopJobKind, channel?: WorkshopChannel) => boolean;
  discountPct?: number;
}) {
  const eigen = quoteWorkshopJob(loco, kind, 'eigen', discountPct);
  const fremd = quoteWorkshopJob(loco, kind, 'fremdvergabe', discountPct);
  const eigenBlock = canBookWorkshopJob(loco, jobs, kind, 'eigen', tick, slotCap);
  const fremdBlock = canBookWorkshopJob(loco, jobs, kind, 'fremdvergabe', tick, slotCap);
  const slotsFull = Boolean(eigenBlock?.startsWith('Kein freier Werkstatt-Slot'));
  const hint = eigenBlock?.startsWith('Erst ab')
    ? eigenBlock
    : fremdBlock?.startsWith('Erst ab')
      ? fremdBlock
      : slotsFull && !fremdBlock
        ? 'Eigene Slots voll — Fremdvergabe startet sofort ohne Slot (+25 %).'
        : eigenBlock && eigenBlock !== fremdBlock
          ? eigenBlock
          : null;
  const locked = Boolean(eigenBlock && fremdBlock);

  return (
    <article className={`workshop-job-block ${locked ? 'is-locked' : ''}`}>
      <header className="workshop-job-head">
        <h3 className="workshop-job-title">{WORKSHOP_RATES[kind].label}</h3>
        <p className={`workshop-job-rest ${restOverdue ? 'is-overdue' : ''}`}>{restLabel}</p>
      </header>
      <div className="workshop-job-actions">
        <WorkshopActionButton
          disabled={Boolean(eigenBlock)}
          title={eigenBlock ?? undefined}
          onClick={() => onStart(loco.id, kind, 'eigen')}
        >
          Eigen · {formatQuotedCost(eigen)} · {eigen.durationDays} T.
          {eigen.overdue ? ' · +Malus' : ''}
        </WorkshopActionButton>
        <WorkshopActionButton
          disabled={Boolean(fremdBlock)}
          emphasize={!fremdBlock && slotsFull}
          title={fremdBlock ?? 'Fremdvergabe: +25 %, kein eigener Slot, startet sofort'}
          onClick={() => onStart(loco.id, kind, 'fremdvergabe')}
        >
          Fremd +25% · {formatQuotedCost(fremd)} · {fremd.durationDays === 0 ? 'sofort' : `${fremd.durationDays} T.`}
        </WorkshopActionButton>
      </div>
      <p className="workshop-job-hint">{hint ?? '\u00a0'}</p>
    </article>
  );
}

function WorkshopEtcsBlock({
  loco,
  jobs,
  tick,
  slotCap,
  onRequest,
  discountPct = 0,
}: {
  loco: Locomotive;
  jobs: WorkshopJob[];
  tick: number;
  slotCap: number;
  onRequest: () => void;
  discountPct?: number;
}) {
  const hasEtcs = locoHasEtcsEquipment(loco);
  const quote = quoteWorkshopJob(loco, 'etcs', 'eigen', discountPct);
  const blocked = canBookWorkshopJob(loco, jobs, 'etcs', 'eigen', tick, slotCap);

  return (
    <article className={`workshop-job-block ${hasEtcs ? 'is-locked' : ''}`}>
      <header className="workshop-job-head">
        <h3 className="workshop-job-title">{WORKSHOP_RATES.etcs.label}</h3>
        <p className="workshop-job-rest">{hasEtcs ? 'verbaut' : 'Diesel & Elektro'}</p>
      </header>
      {hasEtcs ? (
        <p className="workshop-job-empty">ETCS ist auf dieser Lok bereits vorhanden.</p>
      ) : (
        <div className="workshop-job-actions">
          <WorkshopActionButton
            title={blocked ?? 'Öffnet die Bestätigung. Belegt danach einen Werkstatt-Slot, Standzeit 1 Tag'}
            onClick={onRequest}
          >
            ETCS nachrüsten · {formatQuotedCost(quote)} · {quote.durationDays} T.
          </WorkshopActionButton>
        </div>
      )}
      <p className="workshop-job-hint">
        {hasEtcs
          ? 'ETCS-Trassen und Aufträge sind für diese Lok freigeschaltet.'
          : blocked ??
            'Gleicher Preis wie ETCS beim Händler (8 % Katalogpreis). Moderner Netzzugang, weniger Verspätung.'}
      </p>
    </article>
  );
}

function WorkshopRepairBlock({
  loco,
  jobs,
  tick,
  slotCap,
  hasFault,
  faultName,
  onStart,
  discountPct = 0,
}: {
  loco: Locomotive;
  jobs: WorkshopJob[];
  tick: number;
  slotCap: number;
  hasFault: boolean;
  faultName: string | null;
  onStart: (locoId: string, kind: WorkshopJobKind, channel?: WorkshopChannel) => boolean;
  discountPct?: number;
}) {
  const eigen = quoteWorkshopJob(loco, 'reparatur', 'eigen', discountPct);
  const fremd = quoteWorkshopJob(loco, 'reparatur', 'fremdvergabe', discountPct);
  const eigenBlock = canBookWorkshopJob(loco, jobs, 'reparatur', 'eigen', tick, slotCap);
  const fremdBlock = canBookWorkshopJob(loco, jobs, 'reparatur', 'fremdvergabe', tick, slotCap);

  return (
    <article className={`workshop-job-block ${hasFault ? 'is-fault' : 'is-locked'}`}>
      <header className="workshop-job-head">
        <h3 className="workshop-job-title">{WORKSHOP_RATES.reparatur.label}</h3>
        <p className={`workshop-job-rest ${hasFault ? 'is-overdue' : ''}`}>
          {hasFault ? faultName ?? 'Schaden gemeldet' : 'Kein Schaden gemeldet'}
        </p>
      </header>
      {hasFault ? (
        <div className="workshop-job-actions">
          <WorkshopActionButton
            disabled={Boolean(eigenBlock)}
            title={eigenBlock ?? undefined}
            onClick={() => onStart(loco.id, 'reparatur', 'eigen')}
          >
            Eigen · {formatQuotedCost(eigen)} · {eigen.durationDays} T.
          </WorkshopActionButton>
          <WorkshopActionButton
            disabled={Boolean(fremdBlock)}
            title={fremdBlock ?? undefined}
            onClick={() => onStart(loco.id, 'reparatur', 'fremdvergabe')}
          >
            Fremd +25% · {formatQuotedCost(fremd)} · {fremd.durationDays} T.
          </WorkshopActionButton>
        </div>
      ) : (
        <p className="workshop-job-empty">Reparatur ist gesperrt, bis ein Ausfall gemeldet wird.</p>
      )}
      <p className="workshop-job-hint">
        {hasFault
          ? 'Posteingang: Schaden dieser Lok beheben, bevor sie wieder eingesetzt werden kann.'
          : 'Kein Schaden gemeldet'}
      </p>
    </article>
  );
}

function formatQuotedCost(quote: WorkshopQuote): ReactNode {
  if (quote.discountPct > 0 && quote.listCost > quote.cost) {
    return (
      <>
        <span className="mr-1 text-[10px] font-semibold text-slate-500 line-through">{formatEuro(quote.listCost)}</span>
        {formatEuro(quote.cost)}
      </>
    );
  }
  return formatEuro(quote.cost);
}

function WorkshopActionButton({
  disabled = false,
  title,
  onClick,
  children,
  emphasize = false,
}: {
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <span title={title} className="inline-flex min-w-0">
      <Button
        variant={emphasize && !disabled ? 'primary' : 'secondary'}
        className={`px-3 py-1.5 ${disabled ? 'cursor-not-allowed opacity-40 disabled:opacity-40' : ''}`}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onClick();
        }}
      >
        {children}
      </Button>
    </span>
  );
}

export function WorkshopHint() {
  return (
    <p className="inline-flex items-center gap-1 text-xs text-slate-500">
      <Wrench className="h-3 w-3" /> Werkstatt
    </p>
  );
}
