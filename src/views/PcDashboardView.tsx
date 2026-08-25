import type { ReactNode } from 'react';
import {
  Landmark,
  BarChart3,
  Inbox,
  ClipboardList,
  Store,
  FileText,
  Train,
  Building2,
  Gauge,
  Boxes,
  Megaphone,
  Wrench,
} from 'lucide-react';
import type { Driver, Locomotive } from '@/lib/supabase';
import type { AppView } from '@/lib/navigation';

export type PcNavigate = (view: AppView) => void;

interface PcDashboardViewProps {
  active: AppView;
  locomotives: Locomotive[];
  drivers: Driver[];
  unreadCount: number;
  onNavigate: PcNavigate;
  children?: ReactNode;
}

const SIDEBAR: { id: AppView; label: string; icon: ReactNode }[] = [
  { id: 'bank', label: 'Bank', icon: <Landmark className="h-3.5 w-3.5" /> },
  { id: 'auswertungen', label: 'Auswertungen', icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: 'posteingang', label: 'Posteingang', icon: <Inbox className="h-3.5 w-3.5" /> },
  { id: 'disposition', label: 'Disposition', icon: <ClipboardList className="h-3.5 w-3.5" /> },
  { id: 'auftragsmarkt', label: 'Auftragsmarkt/Börse', icon: <Store className="h-3.5 w-3.5" /> },
  { id: 'vertraege', label: 'Verträge', icon: <FileText className="h-3.5 w-3.5" /> },
  { id: 'haendler', label: 'Händler', icon: <Wrench className="h-3.5 w-3.5" /> },
  { id: 'werbung', label: 'Werbung', icon: <Megaphone className="h-3.5 w-3.5" /> },
  { id: 'fuhrpark', label: 'Fuhrpark', icon: <Train className="h-3.5 w-3.5" /> },
  { id: 'zentrale', label: 'Büro-Zentrale', icon: <Building2 className="h-3.5 w-3.5" /> },
];

export function PcDashboardView({
  active,
  locomotives,
  drivers,
  unreadCount,
  onNavigate,
  children,
}: PcDashboardViewProps) {
  const isHome = active === 'dashboard';
  const locosFrei = locomotives.filter((l) => l.status === 'frei').length;
  const driversFrei = drivers.filter((d) => d.status === 'verfuegbar').length;
  const capacityDenom = locomotives.length + drivers.length;
  const capacityPct = capacityDenom > 0 ? Math.round(((locosFrei + driversFrei) / capacityDenom) * 100) : 0;

  return (
    <div className="pc-shell">
      <aside className="pc-sidebar">
        <div className="border-b border-amber-500/20 px-3 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400/80">EVU-OS</div>
          <div className="text-sm font-bold text-white">Desktop</div>
          <button type="button" onClick={() => onNavigate('dashboard')} className="mt-2 text-[10px] font-bold uppercase tracking-wide text-amber-400 hover:text-amber-300">
            {isHome ? 'Start' : '← Desktop'}
          </button>
        </div>
        <nav className="pc-sidebar-nav">
          {SIDEBAR.map((item) => {
            const isActive =
              active === item.id || (item.id === 'fuhrpark' && active === 'wagenpark');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`pc-sidebar-item ${isActive ? 'pc-sidebar-item-active' : ''}`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
                {item.id === 'posteingang' && unreadCount > 0 && (
                  <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="pc-main">
        <div className="pc-main-bar">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {isHome ? 'Desktop' : SIDEBAR.find((s) => s.id === active)?.label ?? (active === 'wagenpark' ? 'Wagendienst' : 'Anwendung')}
          </span>
          <div className="hidden min-w-[160px] sm:block">
            <div className="mb-0.5 flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-wide text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Gauge className="h-3 w-3 text-sky-400" />
                Betriebskapazität
              </span>
              <span className="text-sky-300">{capacityPct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.7)]"
                style={{ width: `${capacityPct}%` }}
              />
            </div>
            <div className="mt-0.5 text-[9px] text-slate-600">
              {locosFrei}/{locomotives.length} Loks · {driversFrei}/{drivers.length} Tf frei
            </div>
          </div>
        </div>

        <div className="pc-main-body">
          {isHome ? (
            <PcDesktopHome onNavigate={onNavigate} unreadCount={unreadCount} />
          ) : (
            children
          )}
        </div>
      </section>
    </div>
  );
}

function PcDesktopHome({ onNavigate, unreadCount }: { onNavigate: PcNavigate; unreadCount: number }) {
  return (
    <div className="space-y-6">
      <h1 className="pc-home-title">Was möchtest du verwalten?</h1>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AppCard
          icon={<Landmark className="h-6 w-6" />}
          title="Bank"
          description="Kontostand, Erträge und wirtschaftliche Kennzahlen"
          action="BANK ÖFFNEN"
          onClick={() => onNavigate('bank')}
        />
        <AppCard
          icon={<BarChart3 className="h-6 w-6" />}
          title="Auswertungen"
          description="KPIs, Fuhrpark, Personal und Tonnenkilometer"
          action="ANALYSEN ÖFFNEN"
          onClick={() => onNavigate('auswertungen')}
        />
        <AppCard
          icon={<Inbox className="h-6 w-6" />}
          title="Posteingang"
          description="System- und Störungsmeldungen"
          action="POST ÖFFNEN"
          badge={unreadCount}
          onClick={() => onNavigate('posteingang')}
        />
        <AppCard
          icon={<ClipboardList className="h-6 w-6" />}
          title="Disposition"
          description="Europakarte, Einsatzplanung und Live-Tracking"
          action="PLANUNG ÖFFNEN"
          onClick={() => onNavigate('disposition')}
        />
        <AppCard
          icon={<Store className="h-6 w-6" />}
          title="Auftragsmarkt"
          description="Offene Frachten an der Börse suchen und annehmen"
          action="FRACHTEN SUCHEN"
          onClick={() => onNavigate('auftragsmarkt')}
        />
        <AppCard
          icon={<FileText className="h-6 w-6" />}
          title="Verträge"
          description="Laufende und erfüllte Transportverträge"
          action="VERTRÄGE ÖFFNEN"
          onClick={() => onNavigate('vertraege')}
        />
        <AppCard
          icon={<Megaphone className="h-6 w-6" />}
          title="Werbeagentur"
          description="Kampagnen buchen und Bekanntheit steigern"
          action="WERBUNG ÖFFNEN"
          onClick={() => onNavigate('werbung')}
        />
        <AppCard
          icon={<Train className="h-6 w-6" />}
          title="Fuhrpark & Wagendienst"
          description="Triebfahrzeuge und Wagenpark inkl. FRIST/REV"
          action="FUHRPARK ÖFFNEN"
          secondaryAction="WAGENDIENST"
          onClick={() => onNavigate('fuhrpark')}
          onSecondary={() => onNavigate('wagenpark')}
          secondaryIcon={<Boxes className="h-3 w-3" />}
        />
        <AppCard
          icon={<Wrench className="h-6 w-6" />}
          title="Händler & Werkstatt"
          description="Loks und Wagen kaufen, leasen oder nach EBO instand halten"
          action="HÄNDLER"
          secondaryAction="WERKSTATT"
          onClick={() => onNavigate('haendler')}
          onSecondary={() => onNavigate('werkstatt')}
        />
      </div>
    </div>
  );
}

function AppCard({
  icon,
  title,
  description,
  action,
  secondaryAction,
  badge,
  onClick,
  onSecondary,
  secondaryIcon,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: string;
  secondaryAction?: string;
  badge?: number;
  onClick: () => void;
  onSecondary?: () => void;
  secondaryIcon?: ReactNode;
}) {
  return (
    <article className="pc-app-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400">
          {icon}
        </div>
        {badge != null && badge > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
            {badge}
          </span>
        )}
      </div>
      <h3 className="mt-3 text-base font-bold text-white">{title}</h3>
      <p className="mt-1 min-h-[2.5rem] text-[12px] leading-relaxed text-slate-400">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onClick} className="btn-gold">
          {action}
        </button>
        {secondaryAction && onSecondary && (
          <button type="button" onClick={onSecondary} className="btn-gold-ghost">
            {secondaryIcon}
            {secondaryAction}
          </button>
        )}
      </div>
    </article>
  );
}
