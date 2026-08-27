import type { SubmenuAtmosphere } from '@/lib/navigation';

export function SubmenuAtmosphere({ theme }: { theme: SubmenuAtmosphere | null }) {
  if (!theme) return null;
  return (
    <div className="submenu-atmosphere" aria-hidden>
      <div className={`submenu-atmosphere-photo submenu-atmosphere-photo--${theme}`} />
      <div className="submenu-atmosphere-veil" />
    </div>
  );
}
