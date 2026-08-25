import { Play, Train } from 'lucide-react';
import { Button } from '@/components/ui';
import { formatEuro } from '@/lib/status';

interface MainMenuScreenProps {
  companyName: string;
  hqLocation: string;
  balance: number;
  level: number;
  onContinue: () => void;
}

export function MainMenuScreen({ companyName, hqLocation, balance, level, onContinue }: MainMenuScreenProps) {
  return (
    <div className="main-menu-screen">
      <div className="main-menu-photo" aria-hidden />
      <div className="main-menu-veil" aria-hidden />
      <div className="app-glass main-menu-card">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-500/15 text-xs font-black tracking-[0.18em] text-amber-300">
            EVU
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400/80">Eisenbahnverkehr</p>
            <h1 className="text-xl font-bold text-white">Simulator</h1>
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          Hardcore-Wirtschaftssimulation. Dein Spielstand liegt lokal in diesem Browser.
        </p>
        <div className="app-glass-panel mt-4 rounded-xl px-3 py-2.5 text-[12px]">
          <div className="flex items-center gap-2 font-bold text-white">
            <Train className="h-3.5 w-3.5 text-amber-400" />
            {companyName}
          </div>
          <div className="mt-1 text-slate-400">
            {hqLocation} · Level {level} · {formatEuro(balance)}
          </div>
        </div>
        <Button className="mt-5 w-full py-2.5" onClick={onContinue}>
          <Play className="h-3.5 w-3.5" />
          Spiel fortsetzen
        </Button>
      </div>
    </div>
  );
}
