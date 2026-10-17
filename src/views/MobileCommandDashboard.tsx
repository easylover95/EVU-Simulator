import {
  ArrowUpRight,
  BarChart3,
  Building2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Package,
  Play,
  TrainFront,
  Trophy,
  Wrench,
} from 'lucide-react';
import type { Assignment, Company, Locomotive, Order, Wagon } from '@/lib/supabase';
import type { AppView } from '@/lib/navigation';
import { formatEuro } from '@/lib/status';
import { LocoPhoto } from '@/components/LocoPhoto';
import { useGameClock } from '@/lib/GameClockContext';
import {
  hasCompletedFirstTrip,
  isOrderFleetReady,
  pickGuidedFirstOrder,
  sortOrdersFleetReadyFirst,
} from '@/lib/firstTrip';
import { isOpenUnexpiredMarketOrder } from '@/lib/orderMarket';

interface MobileCommandDashboardProps {
  company: Company | null;
  orders: Order[];
  assignments: Assignment[];
  locomotives: Locomotive[];
  wagons?: Wagon[];
  onNavigate: (view: AppView) => void;
  onDisponieren?: (order: Order) => void;
}

interface TrainRow {
  loco: Locomotive;
  assignment?: Assignment;
  order?: Order;
  progress: number | null;
}

function compactEuro(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace('.', ',')}M €`;
  if (absolute >= 1_000) return `${Math.round(value / 1_000).toLocaleString('de-DE')}K €`;
  return `${Math.round(value).toLocaleString('de-DE')} €`;
}

function cargoTone(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('stahl') || lower.includes('metall')) return 'cargo-steel';
  if (lower.includes('holz')) return 'cargo-wood';
  if (lower.includes('chem')) return 'cargo-chem';
  return 'cargo-container';
}

function progressFor(assignment: Assignment | undefined): number | null {
  if (typeof assignment?.progress === 'number') {
    return Math.min(100, Math.max(0, Math.round(assignment.progress)));
  }
  return null;
}

function statusFor(loco: Locomotive, assignment?: Assignment): { label: string; tone: string } {
  if (loco.status === 'wartung' || loco.status === 'stillgelegt') return { label: 'Wartung', tone: 'is-maintenance' };
  if (assignment?.status === 'aktiv') return { label: 'Auftrag', tone: 'is-active' };
  if (assignment?.status === 'geplant') return { label: 'Geplant', tone: 'is-planned' };
  if (loco.status === 'frei') return { label: 'Bereit', tone: 'is-empty' };
  return { label: 'Einsatz', tone: 'is-active' };
}

function deadlineLabel(value: string | null): string {
  if (!value) return 'Ohne feste Frist';
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return 'Frist folgt';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(deadline);
}

/** Mobile-first Leitstelle. Desktop nutzt dieselbe Oberfläche als Dashboard. */
export function MobileCommandDashboard({
  company,
  orders,
  assignments,
  locomotives,
  wagons = [],
  onNavigate,
  onDisponieren,
}: MobileCommandDashboardProps) {
  const { gameNow } = useGameClock();
  const home = company?.hq_location?.trim() || 'Duisburg';
  const balance = company?.balance ?? 0;
  const level = company?.level ?? 1;
  const xp = company?.xp ?? 0;
  const xpNext = Math.max(1, company?.xp_next ?? 1000);
  const xpPct = Math.min(100, Math.round((xp / xpNext) * 100));

  const activeAssignments = assignments.filter(
    (assignment) => assignment.status === 'aktiv' || assignment.status === 'geplant',
  );
  const rows: TrainRow[] = locomotives.slice(0, 3).map((loco) => {
    const assignment = activeAssignments.find((item) => item.locomotive_id === loco.id);
    const order = assignment ? orders.find((item) => item.id === assignment.order_id) : undefined;
    return { loco, assignment, order, progress: progressFor(assignment) };
  });

  const openMarket = orders.filter((order) => isOpenUnexpiredMarketOrder(order, gameNow));
  const readyOrders = sortOrdersFleetReadyFirst(
    openMarket.filter((order) => isOrderFleetReady(order, wagons)),
    wagons,
  );
  const previewOrders = (readyOrders.length > 0 ? readyOrders : sortOrdersFleetReadyFirst(openMarket, wagons)).slice(0, 3);

  const freeLocos = locomotives.filter((loco) => loco.status === 'frei').length;
  const inMaintenance = locomotives.filter((loco) => loco.status === 'wartung' || loco.status === 'stillgelegt').length;
  const assignedOrders = orders.filter((order) => order.status === 'zugewiesen');
  const avgOpenYield =
    readyOrders.length > 0
      ? Math.round(readyOrders.reduce((sum, order) => sum + Number(order.yield || 0), 0) / readyOrders.length)
      : openMarket.length > 0
        ? Math.round(openMarket.reduce((sum, order) => sum + Number(order.yield || 0), 0) / openMarket.length)
        : 0;

  const guidedOrder = pickGuidedFirstOrder(orders, wagons, gameNow);
  const showGuided =
    !hasCompletedFirstTrip() &&
    activeAssignments.length === 0 &&
    assignedOrders.length === 0;

  let nextStepTitle = 'Markt öffnen und Auftrag wählen';
  let nextStepAction = () => onNavigate('auftragsmarkt');
  let nextStepLabel = 'Markt öffnen';

  if (showGuided && freeLocos === 0 && inMaintenance > 0) {
    nextStepTitle = 'Loks sind in Wartung — Zeit laufen lassen, dann erste Fahrt starten';
    nextStepAction = () => onNavigate('werkstatt');
    nextStepLabel = 'Werkstatt öffnen';
  } else if (showGuided && guidedOrder && freeLocos > 0 && onDisponieren) {
    nextStepTitle = `Erste Fahrt: ${guidedOrder.title}`;
    nextStepAction = () => onDisponieren(guidedOrder);
    nextStepLabel = 'Jetzt disponieren';
  } else if (showGuided && !guidedOrder) {
    nextStepTitle = 'Kein passender Auftrag — Wagen kaufen oder mieten';
    nextStepAction = () => onNavigate('auftragsmarkt');
    nextStepLabel = 'Markt öffnen';
  } else if (activeAssignments.length > 0) {
    nextStepTitle = 'Laufende Züge in der Disposition prüfen';
    nextStepAction = () => onNavigate('leitstelle');
    nextStepLabel = 'Zur Disposition';
  }

  return (
    <div className="tycoon-dashboard" data-mobile-command-dashboard>
      <section className="tycoon-hero" aria-label="Betriebsübersicht">
        <div className="tycoon-hero-photo" />
        <div className="tycoon-hero-shade" />
        <div className="tycoon-hero-content">
          <div className="tycoon-eyebrow">
            <span className="tycoon-live-dot" /> Leitstelle live · {home}
          </div>
          <h1>
            Dein Netzwerk.
            <br />
            <span>Dein Vorteil.</span>
          </h1>
          <p>
            {activeAssignments.length} aktive Zugläufe · {freeLocos} Loks bereit
            {inMaintenance > 0 ? ` · ${inMaintenance} in Wartung` : ''}
          </p>
        </div>
        <button type="button" className="tycoon-hero-action" onClick={nextStepAction}>
          <span>{showGuided && guidedOrder && freeLocos > 0 ? 'Erste Fahrt starten' : 'Auftrag wählen'}</span>
          <ArrowUpRight aria-hidden />
        </button>
      </section>

      {showGuided && (
        <section className="tycoon-bottom-callout" aria-label="Geführter Einstieg" style={{ marginTop: 0 }}>
          <div>
            <span className="tycoon-section-kicker">Dein nächster Schritt</span>
            <strong>{nextStepTitle}</strong>
            {guidedOrder && freeLocos > 0 && (
              <small style={{ display: 'block', marginTop: '0.35rem', color: '#94a3b8' }}>
                Passt zu deinem Fuhrpark · {guidedOrder.origin} → {guidedOrder.destination} ·{' '}
                {compactEuro(Number(guidedOrder.yield))}
              </small>
            )}
          </div>
          <button type="button" onClick={nextStepAction}>
            {nextStepLabel === 'Jetzt disponieren' ? <Play aria-hidden className="h-3.5 w-3.5" /> : null}
            {nextStepLabel} <ChevronRight aria-hidden />
          </button>
        </section>
      )}

      <section className="tycoon-section tycoon-fleet-section" aria-labelledby="tycoon-fleet-title">
        <div className="tycoon-section-heading">
          <div>
            <span className="tycoon-section-kicker">Betrieb</span>
            <h2 id="tycoon-fleet-title">Meine Züge</h2>
          </div>
          <button type="button" className="tycoon-link" onClick={() => onNavigate('fuhrpark')}>
            Alle anzeigen <ChevronRight aria-hidden />
          </button>
        </div>
        <div className="tycoon-fleet-list">
          {rows.length > 0 ? (
            rows.map(({ loco, assignment, order, progress }) => {
              const status = statusFor(loco, assignment);
              const route = order
                ? `${order.origin} → ${order.destination}`
                : loco.status === 'wartung'
                  ? `Werkstatt ${home}`
                  : `${home} · bereit`;
              return (
                <article className="tycoon-train-card" key={loco.id}>
                  <div className="tycoon-train-photo">
                    <LocoPhoto designation={loco.designation} alt={`${loco.designation} ${loco.name}`} />
                  </div>
                  <div className="tycoon-train-copy">
                    <div className="tycoon-train-topline">
                      <strong>{loco.designation}</strong>
                      <span className={`tycoon-status ${status.tone}`}>{status.label}</span>
                    </div>
                    <p className="tycoon-train-name">{loco.name}</p>
                    <p className="tycoon-train-route">{route}</p>
                    {progress !== null ? (
                      <>
                        <div className="tycoon-progress-row">
                          <span>Fortschritt</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="tycoon-progress-track">
                          <span style={{ width: `${progress}%` }} />
                        </div>
                      </>
                    ) : (
                      <p className="tycoon-train-route" style={{ marginTop: '0.35rem' }}>
                        {loco.status === 'wartung'
                          ? 'Warten bis die Fristarbeit fertig ist — Zeit laufen lassen.'
                          : 'Bereit für den nächsten Auftrag.'}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="tycoon-round-action"
                    aria-label={`${loco.designation} öffnen`}
                    onClick={() => onNavigate(loco.status === 'wartung' ? 'werkstatt' : 'fuhrpark')}
                  >
                    <ChevronRight aria-hidden />
                  </button>
                </article>
              );
            })
          ) : (
            <div className="tycoon-empty-state">
              <TrainFront aria-hidden />
              <div>
                <strong>Dein Fuhrpark wartet</strong>
                <span>Kaufe oder lease deine erste Lokomotive.</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="tycoon-two-column">
        <section className="tycoon-panel tycoon-orders-panel" aria-labelledby="tycoon-orders-title">
          <div className="tycoon-section-heading tycoon-panel-heading">
            <div>
              <span className="tycoon-section-kicker">Markt</span>
              <h2 id="tycoon-orders-title">
                {readyOrders.length > 0 ? 'Passt zu dir' : 'Offene Aufträge'}
              </h2>
            </div>
            <button type="button" className="tycoon-link" onClick={() => onNavigate('auftragsmarkt')}>
              Mehr <ChevronRight aria-hidden />
            </button>
          </div>
          <div className="tycoon-order-list">
            {previewOrders.length > 0 ? (
              previewOrders.map((order) => {
                const ready = isOrderFleetReady(order, wagons);
                return (
                  <button
                    type="button"
                    className="tycoon-order-card"
                    key={order.id}
                    onClick={() => {
                      if (ready && onDisponieren) onDisponieren(order);
                      else onNavigate('auftragsmarkt');
                    }}
                  >
                    <span className={`tycoon-cargo-icon ${cargoTone(order.title)}`}>
                      <Package aria-hidden />
                    </span>
                    <span className="tycoon-order-copy">
                      <strong>{order.title}</strong>
                      <small>
                        {order.origin} <b>→</b> {order.destination}
                        {!ready ? ' · Wagen fehlen' : ' · Passt'}
                      </small>
                    </span>
                    <span className="tycoon-order-reward">
                      <strong>{compactEuro(Number(order.yield))}</strong>
                      <small>
                        <Clock3 aria-hidden /> {deadlineLabel(order.deadline)}
                      </small>
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="tycoon-empty-state">
                <Package aria-hidden />
                <div>
                  <strong>Keine offenen Aufträge</strong>
                  <span>Aktualisiere den Markt am nächsten Spieltag.</span>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="tycoon-panel tycoon-budget-panel" aria-labelledby="tycoon-budget-title">
          <div className="tycoon-section-heading tycoon-panel-heading">
            <div>
              <span className="tycoon-section-kicker">Finanzen</span>
              <h2 id="tycoon-budget-title">Budget Übersicht</h2>
            </div>
            <button
              type="button"
              className="tycoon-icon-link"
              aria-label="Finanzen öffnen"
              onClick={() => onNavigate('bank')}
            >
              <BarChart3 aria-hidden />
            </button>
          </div>
          <div className="tycoon-budget-balance">
            <span>Kontostand</span>
            <strong>{formatEuro(balance)}</strong>
            <small>
              Level {level} · {xp.toLocaleString('de-DE')} / {xpNext.toLocaleString('de-DE')} XP
            </small>
          </div>
          <div className="tycoon-progress-track" style={{ margin: '0.75rem 0 1rem' }} aria-label="Level-Fortschritt">
            <span style={{ width: `${xpPct}%` }} />
          </div>
          <div className="tycoon-budget-stats">
            <div>
              <span>Ø Ertrag freier Aufträge</span>
              <strong className="is-positive">{avgOpenYield > 0 ? `+ ${compactEuro(avgOpenYield)}` : '—'}</strong>
            </div>
            <div>
              <span>Passende Aufträge</span>
              <strong>{readyOrders.length}</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="tycoon-section tycoon-hubs-section" aria-labelledby="tycoon-hubs-title">
        <div className="tycoon-section-heading">
          <div>
            <span className="tycoon-section-kicker">Standort</span>
            <h2 id="tycoon-hubs-title">Meine Zentrale</h2>
          </div>
          <button type="button" className="tycoon-link" onClick={() => onNavigate('gebaeude')}>
            Gebäude <ChevronRight aria-hidden />
          </button>
        </div>
        <div className="tycoon-hubs-list">
          <button type="button" className="tycoon-hub-card" onClick={() => onNavigate('gebaeude')}>
            <div className="tycoon-hub-art hub-cobalt" aria-hidden>
              <Building2 className="tycoon-hub-art-icon" />
            </div>
            <span className="tycoon-hub-copy">
              <strong>{home}</strong>
              <small>Hauptquartier · Depot & Werkstatt</small>
              <span>
                <TrainFront aria-hidden /> {locomotives.length} Loks · Level {level}
              </span>
            </span>
          </button>
        </div>
      </section>

      {!showGuided && (
        <section className="tycoon-bottom-callout" aria-label="Schnellzugriff">
          <div>
            <span className="tycoon-section-kicker">Weiter</span>
            <strong>{nextStepTitle}</strong>
          </div>
          <button type="button" onClick={nextStepAction}>
            {nextStepLabel} <ChevronRight aria-hidden />
          </button>
        </section>
      )}

      <div className="tycoon-desktop-metrics" aria-label="Netzwerk-Kennzahlen">
        <span>
          <CircleDollarSign aria-hidden /> Konto <b>{compactEuro(balance)}</b>
        </span>
        <span>
          <Package aria-hidden /> Passend <b>{readyOrders.length}</b>
        </span>
        <span>
          <Trophy aria-hidden /> Level <b>{level}</b>
        </span>
        <span>
          <Wrench aria-hidden /> Wartung <b>{inMaintenance}</b>
        </span>
      </div>
    </div>
  );
}
