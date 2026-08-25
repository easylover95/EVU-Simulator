import {
  BadgeCheck,
  Building2,
  Clock,
  Cpu,
  FileCheck,
  Globe,
  HardHat,
  Handshake,
  Landmark,
  ListTodo,
  Lock,
  Megaphone,
  Package,
  Radio,
  Scale,
  Shield,
  Train,
  Trophy,
  Users,
  Warehouse,
  Wrench,
  Banknote,
  type LucideIcon,
} from 'lucide-react';
import {
  ACHIEVEMENT_BY_ID,
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENTS,
  achievementCount,
  activeLivery,
  liquidWealth,
  rewardLabel,
  workshopDiscountPct,
  type AchievementDef,
  type AchievementIcon,
  type AchievementState,
  type AchievementWorld,
} from '@/lib/achievements';
import { formatEuro } from '@/lib/status';
import { Button } from '@/components/ui';

const ICONS: Record<AchievementIcon, LucideIcon> = {
  package: Package,
  scale: Scale,
  handshake: Handshake,
  clock: Clock,
  train: Train,
  warehouse: Warehouse,
  cpu: Cpu,
  wrench: Wrench,
  banknote: Banknote,
  megaphone: Megaphone,
  building: Building2,
  users: Users,
  shield: Shield,
  landmark: Landmark,
  globe: Globe,
  radio: Radio,
  'badge-check': BadgeCheck,
  'file-check': FileCheck,
  'list-todo': ListTodo,
  'hard-hat': HardHat,
};

interface AchievementsGalleryModalProps {
  state: AchievementState;
  world: AchievementWorld;
  onClose: () => void;
}

export function AchievementsGalleryModal({ state, world, onClose }: AchievementsGalleryModalProps) {
  const unlocked = state.unlockedIds.length;
  const total = achievementCount();
  const discount = workshopDiscountPct(state);
  const livery = activeLivery(state);
  const wealth = liquidWealth(world.balance, world.overdraftLimit);

  return (
    <div className="modal-scrim fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="app-glass achievements-gallery max-h-[min(92vh,52rem)] w-full max-w-4xl overflow-hidden rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="achievements-gallery-title"
      >
        <header className="app-glass-header flex flex-wrap items-start justify-between gap-3 border-b border-amber-500/20 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-amber-200">
              <Trophy className="h-5 w-5" />
              <h2 id="achievements-gallery-title" className="text-sm font-bold uppercase tracking-wide">
                Erfolge &amp; Meilensteine
              </h2>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Liquide Mittel = Kontostand + Dispo-Rahmen · aktuell {formatEuro(wealth)}
              {discount > 0 ? ` · Werkstatt-Rabatt −${discount} %` : ''}
              {livery ? ` · Lackierung: ${livery.label}` : ''}
            </p>
          </div>
          <button type="button" className="text-slate-400 hover:text-white" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </header>

        <div className="achievements-gallery-hero mx-5 mt-4 rounded-xl px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/80">
            Freigeschaltete Meilensteine
          </div>
          <div className="mt-1 text-3xl font-black tabular-nums text-white">
            {unlocked} <span className="text-lg font-bold text-amber-200/80">/ {total}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-950/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300"
              style={{ width: `${total > 0 ? (unlocked / total) * 100 : 0}%` }}
            />
          </div>
        </div>

        <div className="mt-4 max-h-[min(62vh,36rem)] space-y-5 overflow-y-auto px-5 pb-5">
          {ACHIEVEMENT_CATEGORIES.map((cat) => {
            const items = ACHIEVEMENTS.filter((def) => def.category === cat.id);
            const catUnlocked = items.filter((def) => state.unlockedIds.includes(def.id)).length;
            return (
              <section key={cat.id}>
                <h3 className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-amber-300">
                  <span>{cat.label}</span>
                  <span className="tabular-nums text-slate-500">
                    {catUnlocked}/{items.length}
                  </span>
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((def) => (
                    <AchievementCard
                      key={def.id}
                      def={def}
                      unlocked={state.unlockedIds.includes(def.id)}
                      unlockedTick={state.unlockedAtTick[def.id]}
                      world={world}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="flex justify-end border-t border-amber-500/15 px-5 py-3">
          <Button onClick={onClose}>Schließen</Button>
        </footer>
      </div>
    </div>
  );
}

function AchievementCard({
  def,
  unlocked,
  world,
}: {
  def: AchievementDef;
  unlocked: boolean;
  unlockedTick?: number;
  world: AchievementWorld;
}) {
  const Icon = ICONS[def.icon] ?? Trophy;
  const progress = def.progress(world);
  const reward = ACHIEVEMENT_BY_ID[def.id]?.reward ?? def.reward;
  return (
    <article className={`achievement-card ${unlocked ? 'is-unlocked' : 'is-locked'}`}>
      <div className="achievement-art" style={{ ['--art-hue' as string]: String(def.artHue) }}>
        <Icon className="h-7 w-7" aria-hidden />
        {!unlocked && <Lock className="achievement-lock h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 className="text-[13px] font-bold text-white">{def.name}</h4>
          {def.aka && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-300/80">{def.aka}</span>}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{def.condition}</p>
        <p className={`mt-1.5 text-[11px] font-semibold ${unlocked ? 'text-emerald-300' : 'text-amber-200/70'}`}>
          {unlocked ? 'Bonus: ' : 'Ausblick: '}
          {rewardLabel(reward, unlocked)}
        </p>
        {progress && !unlocked && (
          <p className="mt-1 text-[10px] tabular-nums text-slate-500">
            Fortschritt: {formatProgress(progress.current, progress.unit)} / {formatProgress(progress.target, progress.unit)}
          </p>
        )}
      </div>
    </article>
  );
}

function formatProgress(value: number, unit?: string): string {
  const n = unit === '€ liquide' ? formatEuro(value) : value.toLocaleString('de-DE');
  if (!unit || unit === '€ liquide') return n;
  return `${n} ${unit}`;
}
