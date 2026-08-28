import {
  ArrowUpRight,
  BarChart3,
  Building2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Gauge,
  MapPinned,
  Package,
  TrainFront,
  TrendingUp,
  Trophy,
  Wrench,
} from 'lucide-react';
import type { Assignment, Company, Locomotive, Order } from '@/lib/supabase';
import type { AppView } from '@/lib/navigation';
import { formatEuro } from '@/lib/status';
import { LocoPhoto } from '@/components/LocoPhoto';

interface MobileCommandDashboardProps {
  company: Company | null;
  orders: Order[];
  assignments: Assignment[];
  locomotives: Locomotive[];
  onNavigate: (view: AppView) => void;
}

interface TrainRow {
  loco: Locomotive;
  assignment?: Assignment;
  order?: Order;
  progress: number;
}

const HUBS = [
  { city: 'Duisburg', level: 5, type: 'Hauptquartier', tone: 'hub-cobalt', position: 'center 56%' },
  { city: 'Köln', level: 4, type: 'Umschlagterminal', tone: 'hub-teal', position: 'center 40%' },
  { city: 'Mannheim', level: 3, type: 'Rangierbahnhof', tone: 'hub-amber', position: 'center 68%' },
  { city: 'Hamburg', level: 4, type: 'Hafen-Depot', tone: 'hub-violet', position: 'center 28%' },
];

const CARGO_TONES: Record<string, string> = {
  stahl: 'cargo-steel',
  holz: 'cargo-wood',
  chem: 'cargo-chem',
  container: 'cargo-container',
};

function compactEuro(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace('.', ',')}M €`;
  if (absolute >= 1_000) return `${Math.round(value / 1_000).toLocaleString('de-DE')}K €`;
  return `${Math.round(value).toLocaleString('de-DE')} €`;
}

function cargoTone(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('stahl') || lower.includes('metall')) return CARGO_TONES.stahl;
  if (lower.includes('holz')) return CARGO_TONES.holz;
  if (lower.includes('chem')) return CARGO_TONES.chem;
  return CARGO_TONES.container;
}

function cargoLabel(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('stahl') || lower.includes('metall')) return 'Stahltransport';
  if (lower.includes('holz')) return 'Holzlieferung';
  if (lower.includes('chem')) return 'Chemikalien';
  if (lower.includes('container')) return 'Containerzug';
  return title;
}

function progressFor(assignment: Assignment | undefined, index: number): number {
  if (typeof assignment?.progress === 'number') return Math.min(100, Math.max(3, Math.round(assignment.progress)));
  return [68, 35, 90][index] ?? 48;
}

function statusFor(loco: Locomotive, assignment?: Assignment): { label: string; tone: string } {
  if (loco.status === 'wartung' || loco.status === 'stillgelegt') return { label: 'WARTUNG', tone: 'is-maintenance' };
  if (assignment?.status === 'aktiv') return { label: 'AUFTRAG', tone: 'is-active' };
  if (assignment?.status === 'geplant') return { label: 'GEPLANT', tone: 'is-planned' };
  return { label: 'LEERFAHRT', tone: 'is-empty' };
}

function deadlineLabel(value: string | null): string {
  if (!value) return 'Ohne feste Frist';
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return 'Frist folgt';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' }).format(deadline);
}

function HubArt({ position, tone }: { position: string; tone: string }) {
  return (
    <div className={`tycoon-hub-art ${tone}`} style={{ backgroundPosition: position }} aria-hidden>
      <span className="tycoon-hub-art-grid" />
      <span className="tycoon-hub-art-building tycoon-hub-art-building-main" />
      <span className="tycoon-hub-art-building tycoon-hub-art-building-side" />
      <span className="tycoon-hub-art-track tycoon-hub-art-track-one" />
      <span className="tycoon-hub-art-track tycoon-hub-art-track-two" />
      <span className="tycoon-hub-art-glow" />
      <Building2 className="tycoon-hub-art-icon" />
    </div>
  );
}

/** Mobile-first Railway-Tycoon-Zentrale. Auf Desktop wird dieselbe Oberfläche als breites Dashboard genutzt. */
export function MobileCommandDashboard({ company, orders, assignments, locomotives, onNavigate }: MobileCommandDashboardProps) {
  const home = company?.hq_location?.trim() || 'Duisburg';
  const activeAssignments = assignments.filter((assignment) => assignment.status === 'aktiv' || assignment.status === 'geplant');
  const rows: TrainRow[] = locomotives.slice(0, 3).map((loco, index) => {
    const assignment = activeAssignments.find((item) => item.locomotive_id === loco.id);
    const order = assignment ? orders.find((item) => item.id === assignment.order_id) : undefined;
    return { loco, assignment, order, progress: progressFor(assignment, index) };
  });
  const openOrders = orders.filter((order) => order.status === 'offen' || order.status === 'zugewiesen').slice(0, 3);
  const revenue = openOrders.reduce((sum, order) => sum + order.yield, 0);
  const projectedRevenue = revenue || 7_333;
  const projectedCosts = Math.round(projectedRevenue * 0.39);
  const freeLocos = locomotives.filter((loco) => loco.status === 'frei').length;
  const level = company?.level ?? 1;

  return (
    <div className="tycoon-dashboard" data-mobile-command-dashboard>
      <section className="tycoon-hero" aria-label="Betriebsübersicht">
        <div className="tycoon-hero-photo" />
        <div className="tycoon-hero-shade" />
        <div className="tycoon-hero-content">
          <div className="tycoon-eyebrow"><span className="tycoon-live-dot" /> Leitstelle live · {home}</div>
          <h1>Dein Netzwerk.<br /><span>Dein Vorteil.</span></h1>
          <p>{activeAssignments.length} aktive Zugläufe · {freeLocos} Loks bereit</p>
        </div>
        <button type="button" className="tycoon-hero-action" onClick={() => onNavigate('auftragsmarkt')}>
          <span>Auftrag wählen</span><ArrowUpRight aria-hidden />
        </button>
      </section>

      <section className="tycoon-section tycoon-fleet-section" aria-labelledby="tycoon-fleet-title">
        <div className="tycoon-section-heading">
          <div><span className="tycoon-section-kicker">Betrieb</span><h2 id="tycoon-fleet-title">Meine Züge</h2></div>
          <button type="button" className="tycoon-link" onClick={() => onNavigate('fuhrpark')}>Alle anzeigen <ChevronRight aria-hidden /></button>
        </div>
        <div className="tycoon-fleet-list">
          {rows.length > 0 ? rows.map(({ loco, assignment, order, progress }) => {
            const status = statusFor(loco, assignment);
            const route = order ? `${order.origin} → ${order.destination}` : (loco.status === 'wartung' ? `Werkstatt ${home}` : `${home} → Bereitstellung`);
            return (
              <article className="tycoon-train-card" key={loco.id}>
                <div className="tycoon-train-photo"><LocoPhoto designation={loco.designation} alt={`${loco.designation} ${loco.name}`} /></div>
                <div className="tycoon-train-copy">
                  <div className="tycoon-train-topline"><strong>{loco.designation}</strong><span className={`tycoon-status ${status.tone}`}>{status.label}</span></div>
                  <p className="tycoon-train-name">{loco.name}</p>
                  <p className="tycoon-train-route">{route}</p>
                  <div className="tycoon-progress-row"><span>Fortschritt</span><span>{progress}%</span></div>
                  <div className="tycoon-progress-track"><span style={{ width: `${progress}%` }} /></div>
                </div>
                <button type="button" className="tycoon-round-action" aria-label={`${loco.designation} öffnen`} onClick={() => onNavigate('fuhrpark')}><ChevronRight aria-hidden /></button>
              </article>
            );
          }) : (
            <div className="tycoon-empty-state"><TrainFront aria-hidden /><div><strong>Dein Fuhrpark wartet</strong><span>Schalte deine erste Lokomotive frei.</span></div></div>
          )}
        </div>
      </section>

      <div className="tycoon-two-column">
        <section className="tycoon-panel tycoon-orders-panel" aria-labelledby="tycoon-orders-title">
          <div className="tycoon-section-heading tycoon-panel-heading">
            <div><span className="tycoon-section-kicker">Markt</span><h2 id="tycoon-orders-title">Aktive Aufträge</h2></div>
            <button type="button" className="tycoon-link" onClick={() => onNavigate('auftragsmarkt')}>Mehr <ChevronRight aria-hidden /></button>
          </div>
          <div className="tycoon-order-list">
            {openOrders.length > 0 ? openOrders.map((order) => (
              <button type="button" className="tycoon-order-card" key={order.id} onClick={() => onNavigate('auftragsmarkt')}>
                <span className={`tycoon-cargo-icon ${cargoTone(order.title)}`}><Package aria-hidden /></span>
                <span className="tycoon-order-copy"><strong>{cargoLabel(order.title)}</strong><small>{order.origin} <b>→</b> {order.destination}</small></span>
                <span className="tycoon-order-reward"><strong>{compactEuro(order.yield)}</strong><small><Clock3 aria-hidden /> {deadlineLabel(order.deadline)}</small></span>
              </button>
            )) : (
              <div className="tycoon-empty-state"><Package aria-hidden /><div><strong>Keine offenen Aufträge</strong><span>Der Markt ist bereit für dich.</span></div></div>
            )}
          </div>
        </section>

        <section className="tycoon-panel tycoon-budget-panel" aria-labelledby="tycoon-budget-title">
          <div className="tycoon-section-heading tycoon-panel-heading">
            <div><span className="tycoon-section-kicker">Finanzen</span><h2 id="tycoon-budget-title">Budget Übersicht</h2></div>
            <button type="button" className="tycoon-icon-link" aria-label="Finanzen öffnen" onClick={() => onNavigate('bank')}><BarChart3 aria-hidden /></button>
          </div>
          <div className="tycoon-budget-balance"><span>Kontostand</span><strong>{formatEuro(company?.balance ?? 0)}</strong><small><TrendingUp aria-hidden /> +4,8% diese Woche</small></div>
          <div className="tycoon-budget-chart" aria-label="Einnahmen-Ausgaben-Verlauf">
            <div className="tycoon-chart-labels"><span>250k</span><span>200k</span><span>150k</span></div>
            <svg viewBox="0 0 420 138" preserveAspectRatio="none" role="img" aria-label="Steigender Kontostand-Verlauf">
              <defs><linearGradient id="tycoon-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f4b51b" stopOpacity="0.34" /><stop offset="1" stopColor="#f4b51b" stopOpacity="0" /></linearGradient></defs>
              <path d="M0 108 L42 91 L82 100 L122 78 L164 84 L207 55 L247 72 L289 58 L330 36 L374 27 L420 8 V138 H0 Z" fill="url(#tycoon-chart-fill)" />
              <path d="M0 108 L42 91 L82 100 L122 78 L164 84 L207 55 L247 72 L289 58 L330 36 L374 27 L420 8" fill="none" stroke="#f7bd2d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              {[['0','108'],['42','91'],['82','100'],['122','78'],['164','84'],['207','55'],['247','72'],['289','58'],['330','36'],['374','27'],['420','8']].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="#0f172a" stroke="#f7bd2d" strokeWidth="3" />)}
            </svg>
            <div className="tycoon-chart-axis"><span>-24h</span><span>-18h</span><span>-12h</span><span>-6h</span><span>Jetzt</span></div>
          </div>
          <div className="tycoon-budget-stats"><div><span>Ø Brutto / Fahrt</span><strong className="is-positive">+ {compactEuro(projectedRevenue)}</strong></div><div><span>Ø Betriebskosten</span><strong className="is-negative">- {compactEuro(projectedCosts)}</strong></div></div>
        </section>
      </div>

      <section className="tycoon-section tycoon-hubs-section" aria-labelledby="tycoon-hubs-title">
        <div className="tycoon-section-heading"><div><span className="tycoon-section-kicker">Infrastruktur</span><h2 id="tycoon-hubs-title">Meine Hubs</h2></div><button type="button" className="tycoon-link" onClick={() => onNavigate('gebaeude')}>Alle anzeigen <ChevronRight aria-hidden /></button></div>
        <div className="tycoon-hubs-list">
          {HUBS.map((hub) => (
            <button type="button" className="tycoon-hub-card" key={hub.city} onClick={() => onNavigate('gebaeude')}>
              <HubArt position={hub.position} tone={hub.tone} />
              <span className="tycoon-hub-copy"><strong>{hub.city} Hub</strong><small>{hub.type}</small><span><Gauge aria-hidden /> Level {hub.level}</span></span>
            </button>
          ))}
        </div>
      </section>

      <section className="tycoon-bottom-callout" aria-label="Schnellzugriff">
        <div><span className="tycoon-section-kicker">Dein nächster Schritt</span><strong>Mehr Ladung. Mehr Strecke. Mehr Gewinn.</strong></div>
        <button type="button" onClick={() => onNavigate('auftragsmarkt')}>Markt öffnen <ChevronRight aria-hidden /></button>
      </section>

      <div className="tycoon-desktop-metrics" aria-label="Netzwerk-Kennzahlen">
        <span><CircleDollarSign aria-hidden /> Cashflow <b>{compactEuro(projectedRevenue - projectedCosts)}</b></span>
        <span><MapPinned aria-hidden /> Hubs <b>{HUBS.length}</b></span>
        <span><Trophy aria-hidden /> Level <b>{level}</b></span>
        <span><Wrench aria-hidden /> In Wartung <b>{locomotives.filter((loco) => loco.status === 'wartung').length}</b></span>
      </div>
    </div>
  );
}
