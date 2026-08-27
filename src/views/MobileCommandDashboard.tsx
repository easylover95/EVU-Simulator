import { AlertTriangle, BarChart3, BriefcaseBusiness, ChevronRight, Landmark, MapPinned, TrainFront } from 'lucide-react';
import type { Assignment, Company, Locomotive, Order } from '@/lib/supabase';
import type { AppView } from '@/lib/navigation';
import { formatEuro } from '@/lib/status';

interface MobileCommandDashboardProps {
  company: Company | null;
  orders: Order[];
  assignments: Assignment[];
  locomotives: Locomotive[];
  onNavigate: (view: AppView) => void;
}

function deadlineLabel(value: string | null): string {
  if (!value) return 'Ohne feste Frist';
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return 'Frist folgt';
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(deadline);
}

/** Mobile-First-Leitstelle: priorisiert einen echten nächsten Einsatz und zentrale Einhand-Aktionen. */
export function MobileCommandDashboard({ company, orders, assignments, locomotives, onNavigate }: MobileCommandDashboardProps) {
  const activeAssignments = assignments.filter((assignment) => assignment.status === 'aktiv' || assignment.status === 'geplant');
  const activeOrder = activeAssignments
    .map((assignment) => orders.find((order) => order.id === assignment.order_id))
    .find((order): order is Order => Boolean(order));
  const urgentOrder = [...orders]
    .filter((order) => order.status === 'offen')
    .sort((a, b) => new Date(a.deadline ?? '2999-01-01').getTime() - new Date(b.deadline ?? '2999-01-01').getTime())[0];
  const focusOrder = activeOrder ?? urgentOrder;
  const focusIsActive = Boolean(activeOrder);
  const freeLocos = locomotives.filter((loco) => loco.status === 'frei').length;

  return (
    <div className="mobile-command-dashboard" data-mobile-command-dashboard>
      <section className="mobile-command-greeting">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">Mobile Leitstelle</p>
        <h1>{company?.name ?? 'Dein EVU'}</h1>
        <p>{company?.hq_location || 'Leitstelle'} · {activeAssignments.length} {activeAssignments.length === 1 ? 'aktiver Einsatz' : 'aktive Einsätze'}</p>
      </section>

      <section className="mobile-command-focus" aria-label="Aktuelle Betriebspriorität">
        <div className="mobile-command-focus-kicker">
          {focusIsActive ? <TrainFront className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {focusIsActive ? 'Nächster Zuglauf' : 'Dringender Marktauftrag'}
        </div>
        {focusOrder ? (
          <>
            <h2>{focusOrder.title}</h2>
            <p>{focusOrder.origin} <span aria-hidden>→</span> {focusOrder.destination}</p>
            <div className="mobile-command-focus-stats">
              <span>{focusOrder.weight_t.toLocaleString('de-DE')} t</span>
              <span>{formatEuro(focusOrder.yield)}</span>
              <span>{deadlineLabel(focusOrder.deadline)}</span>
            </div>
            <button type="button" className="btn-action btn-action-primary w-full" onClick={() => onNavigate('disposition')}>
              {focusIsActive ? 'Zur Zugdisposition' : 'Auftrag disponieren'} <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <h2>Leitstelle bereit</h2>
            <p>Aktuell wartet kein offener Auftrag. Prüfe den Markt oder plane die nächste Fahrt.</p>
            <button type="button" className="btn-action btn-action-primary w-full" onClick={() => onNavigate('auftragsmarkt')}>
              Zum Auftragsmarkt <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </section>

      <section className="mobile-command-quick-actions" aria-label="Schnellzugriffe">
        <button type="button" onClick={() => onNavigate('auftragsmarkt')}><BriefcaseBusiness /><span>Frachtmarkt</span><small>{orders.filter((order) => order.status === 'offen').length} offen</small></button>
        <button type="button" onClick={() => onNavigate('disposition')}><MapPinned /><span>Disposition</span><small>{activeAssignments.length} im Plan</small></button>
        <button type="button" onClick={() => onNavigate('fuhrpark')}><TrainFront /><span>Fuhrpark</span><small>{freeLocos}/{locomotives.length} frei</small></button>
        <button type="button" onClick={() => onNavigate('bank')}><Landmark /><span>Finanzen</span><small>{formatEuro(company?.balance ?? 0)}</small></button>
        <button type="button" onClick={() => onNavigate('auswertungen')}><BarChart3 /><span>Auswertungen</span><small>KPIs & Archiv</small></button>
      </section>
    </div>
  );
}
