import { useState, type RefObject } from 'react';
import { BarChart3, BriefcaseBusiness, ChevronDown, ChevronRight, ClipboardList, Home, Landmark, Mail, Menu, Pause, Play, Settings, Star, Train, TrainFront, Users, UsersRound, X } from 'lucide-react';
import type { Company } from '@/lib/supabase';
import { formatEuro } from '@/lib/status';
import { CLOCK_SPEEDS, formatGameDateTime, type ClockSpeed } from '@/lib/gameTime';
import { NAV_CATEGORIES, categoryDef, categoryForView, prefetchAssetsForView, showsSubnav, type AppView } from '@/lib/navigation';
import { reputationTier } from '@/lib/reputation';
import { NetworkStatusNotice } from '@/components/NetworkStatusNotice';
import type { NetworkStatus } from '@/lib/networkStatus';

export interface AppTopbarProps {
  headerRef: RefObject<HTMLElement | null>;
  view: AppView;
  company: Company | null;
  fleetCount: number;
  personnelCount: number;
  clockRunning: boolean;
  clockSpeed: ClockSpeed;
  gameNow: Date;
  unreadCount: number;
  networkStatus: NetworkStatus;
  onRefreshNetwork: () => void;
  onSetView: (view: AppView) => void;
  onSetClockRunning: (running: boolean) => void;
  onSetClockSpeed: (speed: ClockSpeed) => void;
  onOpenInbox: () => void;
  onEditCompany: () => void;
  onHelp: () => void;
  onOpenAchievements: () => void;
  onLogout: () => void;
}

export function AppTopbar({
  headerRef,
  view,
  company,
  fleetCount,
  personnelCount,
  clockRunning,
  clockSpeed,
  gameNow,
  unreadCount,
  networkStatus,
  onRefreshNetwork,
  onSetView,
  onSetClockRunning,
  onSetClockSpeed,
  onOpenInbox,
  onEditCompany,
  onHelp,
  onOpenAchievements,
  onLogout,
}: AppTopbarProps) {
  const cat = categoryForView(view);
  const def = categoryDef(cat);
  const subnav = showsSubnav(view);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false);
  const mobileNavItems: Array<{ id: string; label: string; view: AppView; icon: typeof Home; active: boolean }> = [
    { id: 'home', label: 'Home', view: 'zentrale', icon: Home, active: cat === 'zentrale' },
    { id: 'dispo', label: 'Dispo', view: 'disposition', icon: ClipboardList, active: view === 'disposition' },
    { id: 'flotte', label: 'Flotte', view: 'fuhrpark', icon: TrainFront, active: cat === 'fleet' },
    { id: 'finanzen', label: 'Finanzen', view: 'bank', icon: Landmark, active: cat === 'finance' },
  ];

  function warmViewAssets(viewId: AppView) {
    prefetchAssetsForView(viewId);
  }

  function navigateMobile(viewId: AppView) {
    warmViewAssets(viewId);
    setMobileMenuOpen(false);
    setMobileSectionOpen(false);
    onSetView(viewId);
  }
  const compactNavLabels: Record<(typeof NAV_CATEGORIES)[number]['id'], string> = {
    zentrale: 'Home',
    transport: 'Fracht',
    fleet: 'Flotte',
    finance: 'Bank',
    firma: 'Firma',
  };

  return (
    <header ref={headerRef as RefObject<HTMLElement>} className="app-topbar">
      <div className="app-topbar-status">
        <div className="app-topbar-brand">
          <span className="app-topbar-mark" aria-hidden>
            EVU
          </span>
          <div className="min-w-0">
            <div className="app-topbar-company">{company?.name ?? 'AixRail GmbH'}</div>
            <div className="app-topbar-meta">
              <span>{company?.hq_location?.trim() || 'Aachen'}</span>
              <span className="app-topbar-dot" />
              <span data-tutorial="tutorial-level">Lvl {company?.level ?? 1}</span>
              <span className="app-topbar-dot" />
              <Train className="h-3 w-3 text-amber-400/80" />
              <span className="tabular-nums">{fleetCount}</span>
              <Users className="h-3 w-3 text-amber-400/80" />
              <span className="tabular-nums">{personnelCount}</span>
              <Star className="h-3 w-3 text-amber-400/80" />
              <span className="tabular-nums text-amber-300">{company?.reputation ?? 0}</span>
              <span className="hidden text-[10px] uppercase tracking-wide text-slate-500 sm:inline">
                {reputationTier(company?.reputation).label}
              </span>
            </div>
          </div>
        </div>

        <div className="app-topbar-clock">
          <button
            type="button"
            title="Pause"
            onClick={() => onSetClockRunning(false)}
            className={`app-topbar-ctrl ${!clockRunning ? 'is-on is-pause' : ''}`}
          >
            <Pause className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Play"
            onClick={() => onSetClockRunning(true)}
            className={`app-topbar-ctrl ${clockRunning ? 'is-on is-play' : ''}`}
          >
            <Play className="h-3.5 w-3.5" />
          </button>
          <div className="app-topbar-speeds">
            {CLOCK_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => onSetClockSpeed(speed)}
                className={clockSpeed === speed ? 'is-on' : ''}
              >
                {speed}x
              </button>
            ))}
          </div>
          <span
            className={`app-topbar-live ${clockRunning ? 'is-running' : ''}`}
            aria-hidden
          />
          <span className="fi-tick app-topbar-time">{formatGameDateTime(gameNow)}</span>
        </div>

        <div className="app-topbar-actions">
          <NetworkStatusNotice status={networkStatus} onRefresh={onRefreshNetwork} variant="desktop" />
          <div className="app-topbar-konto" data-tutorial="tutorial-konto">
            <span>Konto</span>
            <strong>{formatEuro(company?.balance ?? 0)}</strong>
          </div>
          <button
            type="button"
            title="Firma bearbeiten"
            onClick={onEditCompany}
            className="app-topbar-ctrl"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Posteingang"
            onClick={onOpenInbox}
            className={`app-topbar-ctrl relative ${view === 'posteingang' ? 'is-on is-pause' : ''}`}
          >
            <Mail className="h-3.5 w-3.5" />
            {unreadCount > 0 && (
              <span className="app-topbar-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>
          <button type="button" onClick={onHelp} className="app-topbar-text-btn" title="Handbuch">
            Hilfe
          </button>
          <button type="button" onClick={onLogout} className="app-topbar-text-btn" title="Zum Hauptmenü">
            Logout
          </button>
        </div>
      </div>

      <div className="app-mobile-status-strip" aria-label="Mobiler Spielstatus">
        <div className="app-mobile-status-company">
          <span className="app-topbar-mark" aria-hidden>EVU</span>
          <div className="min-w-0">
            <p>{company?.name ?? 'AixRail GmbH'}</p>
            <span>Lvl {company?.level ?? 1} · {company?.xp ?? 0} XP</span>
          </div>
        </div>
        <div className="app-mobile-status-balance"><span>Konto</span><strong>{formatEuro(company?.balance ?? 0)}</strong></div>
        <div className="app-mobile-status-actions">
          <button type="button" className="app-topbar-ctrl relative" aria-label="Posteingang" onClick={onOpenInbox}>
            <Mail className="h-3.5 w-3.5" />
            {unreadCount > 0 && <span className="app-topbar-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
          <button type="button" className="app-topbar-ctrl" aria-label="Einstellungen" onClick={onEditCompany}><Settings className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="app-mobile-clock" aria-label="Zeitsteuerung">
        <div className="app-mobile-clock-row">
          <button
            type="button"
            title="Pause"
            aria-label="Spiel pausieren"
            onClick={() => onSetClockRunning(false)}
            className={`app-mobile-clock-icon ${!clockRunning ? 'is-on is-pause' : ''}`}
          >
            <Pause className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Spiel starten"
            aria-label="Spiel starten"
            onClick={() => onSetClockRunning(true)}
            className={`app-mobile-clock-icon ${clockRunning ? 'is-on is-play' : ''}`}
          >
            <Play className="h-3.5 w-3.5" />
          </button>
          <div className="app-mobile-clock-speeds" aria-label="Spielgeschwindigkeit">
            {CLOCK_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                title={`Geschwindigkeit ${speed}×`}
                aria-label={`Geschwindigkeit ${speed}×`}
                onClick={() => onSetClockSpeed(speed)}
                className={clockSpeed === speed ? 'is-on' : ''}
              >
                {speed}×
              </button>
            ))}
          </div>
          <span className={`app-mobile-clock-live ${clockRunning ? 'is-running' : ''}`} aria-hidden />
        </div>
      </div>

      {subnav && (
        <div className="app-mobile-section-switcher">
          <button
            type="button"
            className="app-mobile-section-trigger"
            aria-expanded={mobileSectionOpen}
            aria-haspopup="dialog"
            onClick={() => {
              setMobileMenuOpen(false);
              setMobileSectionOpen(true);
            }}
          >
            <span>
              <small>Bereich</small>
              <strong>{def.label} · {def.items.find((item) => item.id === view)?.label ?? def.defaultView}</strong>
            </span>
            <ChevronDown aria-hidden />
          </button>
        </div>
      )}

      <div className="app-topbar-tabs-row">
        <nav className="app-nav-tabs no-scrollbar" aria-label="Hauptnavigation">
          {NAV_CATEGORIES.map((item) => {
            const active = cat === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                onPointerEnter={() => warmViewAssets(item.defaultView)}
                onFocus={() => warmViewAssets(item.defaultView)}
                onTouchStart={() => warmViewAssets(item.defaultView)}
                onClick={() => onSetView(item.defaultView)}
                className={`app-nav-tab ${active ? 'is-active' : ''}`}
              >
                <span className="app-nav-tab-label-wide">{item.label}</span>
                <span className="app-nav-tab-label-compact">{compactNavLabels[item.id]}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {subnav && (
        <nav className="app-topbar-sub no-scrollbar" aria-label="Untermenü">
          {def.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onPointerEnter={() => warmViewAssets(item.id)}
              onFocus={() => warmViewAssets(item.id)}
              onTouchStart={() => warmViewAssets(item.id)}
              onClick={() => onSetView(item.id)}
              className={`app-sub-tab ${view === item.id ? 'is-active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      <nav className="app-mobile-quicknav" aria-label="Mobile Hauptnavigation">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              onPointerEnter={() => warmViewAssets(item.view)}
              onFocus={() => warmViewAssets(item.view)}
              onTouchStart={() => warmViewAssets(item.view)}
              onClick={() => navigateMobile(item.view)}
              className={`app-mobile-quicknav-item ${item.active ? 'is-active' : ''}`}
            >
              <Icon className="app-mobile-quicknav-icon" aria-hidden />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button type="button" aria-label="Menü öffnen" aria-expanded={mobileMenuOpen} onClick={() => { setMobileSectionOpen(false); setMobileMenuOpen(true); }} className={`app-mobile-quicknav-item ${mobileMenuOpen ? 'is-active' : ''}`}>
          <Menu className="app-mobile-quicknav-icon" aria-hidden />
          <span>Menü</span>
        </button>
      </nav>

      {mobileSectionOpen && (
        <div className="app-mobile-menu-layer" role="presentation">
          <button type="button" className="app-mobile-menu-backdrop" aria-label="Bereichsauswahl schließen" onClick={() => setMobileSectionOpen(false)} />
          <section className="app-mobile-menu-sheet" role="dialog" aria-modal="true" aria-label={`${def.label} Untermenü`}>
            <div className="app-mobile-menu-handle" aria-hidden />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-300">Bereich wählen</p>
                <h2 className="mt-1 text-base font-bold text-white">{def.label}</h2>
              </div>
              <button type="button" className="app-topbar-ctrl" aria-label="Bereichsauswahl schließen" onClick={() => setMobileSectionOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="app-mobile-menu-actions">
              {def.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={view === item.id ? 'is-active' : ''}
                  onPointerEnter={() => warmViewAssets(item.id)}
                  onFocus={() => warmViewAssets(item.id)}
                  onTouchStart={() => warmViewAssets(item.id)}
                  onClick={() => navigateMobile(item.id)}
                >
                  <span className="app-mobile-menu-item-marker" aria-hidden />
                  <span>{item.label}</span>
                  <ChevronRight aria-hidden />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {mobileMenuOpen && (
        <div className="app-mobile-menu-layer" role="presentation">
          <button type="button" className="app-mobile-menu-backdrop" aria-label="Menü schließen" onClick={() => setMobileMenuOpen(false)} />
          <section className="app-mobile-menu-sheet" role="dialog" aria-modal="true" aria-label="Spielmenü">
            <div className="app-mobile-menu-handle" aria-hidden />
            <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-300">Leitstellen-Menü</p><h2 className="mt-1 text-base font-bold text-white">Verwaltung & Statistik</h2></div><button type="button" className="app-topbar-ctrl" aria-label="Menü schließen" onClick={() => setMobileMenuOpen(false)}><X className="h-4 w-4" /></button></div>
            <div className="app-mobile-menu-actions">
              <button type="button" onPointerEnter={() => warmViewAssets('auftragsmarkt')} onFocus={() => warmViewAssets('auftragsmarkt')} onTouchStart={() => warmViewAssets('auftragsmarkt')} onClick={() => navigateMobile('auftragsmarkt')}><BriefcaseBusiness /><span>Auftragsmarkt</span><ChevronRight /></button>
              <button type="button" onPointerEnter={() => warmViewAssets('vertraege')} onFocus={() => warmViewAssets('vertraege')} onTouchStart={() => warmViewAssets('vertraege')} onClick={() => navigateMobile('vertraege')}><ClipboardList /><span>Verträge</span><ChevronRight /></button>
              <button type="button" onPointerEnter={() => warmViewAssets('personal')} onFocus={() => warmViewAssets('personal')} onTouchStart={() => warmViewAssets('personal')} onClick={() => navigateMobile('personal')}><UsersRound /><span>Firma & Personal</span><ChevronRight /></button>
              <button type="button" onPointerEnter={() => warmViewAssets('auswertungen')} onFocus={() => warmViewAssets('auswertungen')} onTouchStart={() => warmViewAssets('auswertungen')} onClick={() => navigateMobile('auswertungen')}><BarChart3 /><span>Auswertungen</span><ChevronRight /></button>
              <button type="button" onClick={() => { setMobileMenuOpen(false); onOpenAchievements(); }}><Star /><span>Erfolge</span><ChevronRight /></button>
              <button type="button" onPointerEnter={() => warmViewAssets('statistikarchiv')} onFocus={() => warmViewAssets('statistikarchiv')} onTouchStart={() => warmViewAssets('statistikarchiv')} onClick={() => navigateMobile('statistikarchiv')}><Star /><span>Ruhmeshalle</span><ChevronRight /></button>
              <button type="button" onClick={() => { setMobileMenuOpen(false); onEditCompany(); }}><Settings /><span>Einstellungen</span><ChevronRight /></button>
            </div>
            <div className="mt-3 flex gap-2"><button type="button" className="btn-action btn-action-detail flex-1" onClick={() => { setMobileMenuOpen(false); onHelp(); }}>Handbuch</button><button type="button" className="btn-action btn-action-danger flex-1" onClick={() => { setMobileMenuOpen(false); onLogout(); }}>Zum Hauptmenü</button></div>
          </section>
        </div>
      )}
      </header>
  );
}
