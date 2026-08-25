import { BookOpen, Megaphone, Train, Users, Wrench } from 'lucide-react';
import { Button } from '@/components/ui';

const TOPICS = [
  {
    icon: Wrench,
    title: 'Fristen F / ZU / HU',
    body: 'F (Fristarbeit) alle 90 Tage bzw. 60.000 km, 1 Tag, ohne Slot. ZU und HU belegen je einen Werkstatt-Slot. Buchbar erst kurz vor Fälligkeit. Ohne gültige HU ist die Lok stillgelegt. Überfällige Fristen kosten Malus und Standzeit.',
  },
  {
    icon: Train,
    title: 'ETCS-Nachrüstung',
    body: 'Bestandsloks (Diesel und Elektro) können in der Werkstatt ETCS nachrüsten: 8 % des Fahrzeugwerts, 1 Tag, eigener Slot. Danach ETCS-Badge, Zugang zu modernen Trassen/Aufträgen, weniger Verspätung und etwas strafferer Fahrplan.',
  },
  {
    icon: Users,
    title: 'Personal',
    body: 'Tf brauchen Baureihen-Freigaben (z. B. BR 218), nachschulbar über „Schulung“. Im Betrieb sammeln sie XP, steigen in Stufe/Effizienz und reduzieren Verspätungen. Die Jobbörse wechselt täglich Kandidaten, Gehälter und Qualifikationen.',
  },
  {
    icon: Megaphone,
    title: 'Werbeagentur',
    body: 'Kampagnen heben die Bekanntheit und schalten Marktzugang frei. Regionalpresse ab Level 1, Online-Banner ab Level 3, Messen ab Level 5. Laufende Kampagnen kosten Geld — ohne Frachten bleibt der Effekt schwach.',
  },
] as const;

interface HelpHandbookModalProps {
  onClose: () => void;
  onReplayTutorial: () => void;
}

export function HelpHandbookModal({ onClose, onReplayTutorial }: HelpHandbookModalProps) {
  return (
    <div className="modal-scrim fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="app-glass help-handbook max-h-[min(88vh,40rem)] w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="help-handbook-title"
      >
        <header className="app-glass-header flex items-center justify-between border-b border-amber-500/20 px-5 py-3">
          <div className="flex items-center gap-2 text-amber-200">
            <BookOpen className="h-4 w-4" />
            <h2 id="help-handbook-title" className="text-sm font-bold uppercase tracking-wide">
              Handbuch
            </h2>
          </div>
          <button type="button" className="text-slate-400 hover:text-white" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </header>
        <div className="space-y-3 overflow-y-auto p-5">
          <p className="text-xs leading-relaxed text-slate-400">
            Kompakte Übersicht der wichtigsten Mechaniken. Die goldenen Markierungen in der Zentrale öffnen die
            Fachbereiche.
          </p>
          {TOPICS.map((topic) => {
            const Icon = topic.icon;
            return (
              <article key={topic.title} className="app-glass-panel rounded-xl p-3">
                <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-amber-300">
                  <Icon className="h-3.5 w-3.5" />
                  {topic.title}
                </h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-slate-300">{topic.body}</p>
              </article>
            );
          })}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-amber-500/15 px-5 py-3">
          <Button variant="secondary" onClick={onReplayTutorial}>
            Tutorial wiederholen
          </Button>
          <Button onClick={onClose}>Schließen</Button>
        </footer>
      </div>
    </div>
  );
}
