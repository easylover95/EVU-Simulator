import type { ReactNode } from 'react';
import { AppTopbar, type AppTopbarProps } from '@/components/AppTopbar';
import { SubmenuAtmosphere } from '@/components/SubmenuAtmosphere';
import type { AppView, SubmenuAtmosphere as AtmosphereTheme } from '@/lib/navigation';

export function Layout({
  view,
  atmosphere,
  topbar,
  children,
}: {
  view: AppView;
  atmosphere: AtmosphereTheme | null;
  topbar: AppTopbarProps;
  children: ReactNode;
}) {
  return (
    <div
      className={`app-shell app-industrial-bg relative min-h-[100dvh] text-slate-300${
        atmosphere ? ' has-submenu-atmosphere' : ''
      }`}
      data-view={view}
    >
      <SubmenuAtmosphere theme={atmosphere} />
      <AppTopbar {...topbar} />
      {children}
    </div>
  );
}
