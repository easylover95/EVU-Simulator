import { ATMOSPHERE_SRC, type SubmenuAtmosphere } from '@/lib/navigation';

export function SubmenuAtmosphere({ theme }: { theme: SubmenuAtmosphere | null }) {
  if (!theme) return null;
  return (
    <div className="submenu-atmosphere" aria-hidden>
      <div
        className="submenu-atmosphere-photo"
        style={{ backgroundImage: `url('${ATMOSPHERE_SRC[theme]}')` }}
      />
      <div className="submenu-atmosphere-veil" />
    </div>
  );
}
