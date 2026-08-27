import type { LucideIcon } from 'lucide-react';
import type { AppView } from '@/lib/navigation';
import {
  LayoutDashboard,
  Monitor,
  Train,
  Map,
  Warehouse,
  Users,
  HardHat,
  UserCog,
  ClipboardList,
  TrendingDown,
  Wrench,
  Star,
  Landmark,
  AlertTriangle,
  Flag,
} from 'lucide-react';

export const TUTORIAL_KEY = 'evu-has-seen-tutorial';

export type TutorialTone = 'default' | 'warn';
export type TutorialRing = 'rect' | 'arch' | 'round';

export interface TutorialStep {
  title: string;
  description: string;
  icon: LucideIcon;
  tone?: TutorialTone;
  view?: AppView;
  targetId?: string;
  /** Soft vignette over the office instead of a cut-out spotlight. */
  spotlight?: boolean;
  /** Clicking the highlighted hotspot advances this step (and blocks navigation). */
  advanceOnClick?: boolean;
  ring?: TutorialRing;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Willkommen in der Leitstelle',
    description:
      'Das ist dein Büro — die Zentrale deines EVU. Du startest mit 150.000 €. Oben siehst du Konto, Uhr und Post. Die goldenen Markierungen im Raum sind dein Hauptmenü: klicke die Gegenstände, um Bereiche zu öffnen.',
    icon: LayoutDashboard,
    view: 'zentrale',
    targetId: 'tutorial-office-intro',
    spotlight: false,
  },
  {
    title: 'Zentrale & Frachtbörse',
    description:
      'Die beiden Computermonitore links sind dein Arbeitsplatz. Hier öffnest du die Zentrale (PC) und gelangst zu Aufträgen und Frachten. Klicke auf die Monitore, um fortzufahren.',
    icon: Monitor,
    view: 'zentrale',
    targetId: 'tutorial-office-monitors',
    advanceOnClick: true,
    ring: 'rect',
  },
  {
    title: 'Fuhrpark & Händler',
    description:
      'Durch das große Fenster siehst du den Betriebshof mit den Loks. Ein Klick darauf öffnet Fuhrpark & Händler — Kauf, Leasing und Werkstatt. Klicke auf das Fenster.',
    icon: Train,
    view: 'zentrale',
    targetId: 'tutorial-office-window',
    advanceOnClick: true,
    ring: 'arch',
  },
  {
    title: 'Trassen & Netzwerk',
    description:
      'Die große Wandkarte rechts zeigt dein Schienennetz. Darüber planst du Disposition und Trassen: wo Züge fahren, welche Strecken frei sind und wie das Netz zusammenhängt. Klicke auf die Karte.',
    icon: Map,
    view: 'zentrale',
    targetId: 'tutorial-office-map',
    advanceOnClick: true,
    ring: 'rect',
  },
  {
    title: 'Depot & Standgeld',
    description:
      'Dein Depot startet mit 2 Lok-Gleisen und 25 Wagen-Stellplätzen. Hallenmiete läuft jeden Tag; zusätzlich zahlst du Gleismiete / Standgeld für inaktive Fahrzeuge. Stehende Loks und Wagen fressen Liquidität.',
    icon: Warehouse,
    tone: 'warn',
    view: 'bank',
    targetId: 'tutorial-standgeld',
  },
  {
    title: 'Personal (Triebfahrzeugführer)',
    description:
      'Jeder Tf bezieht ein monatliches Festgehalt, das täglich (Gehalt / 30) vom Konto geht. Ohne verfügbaren Tf fährt kein Zug. Schichtzeiten und Qualifikation Tf sind Pflicht für die Disposition.',
    icon: Users,
    view: 'personal',
    targetId: 'tutorial-personal',
  },
  {
    title: 'Sonderfall Baugleis',
    description:
      'Baugleis-Aufträge (Spot und Langzeit-Einsatz) brauchen zusätzlich einen Arbeitszugführer / Rangierbegleiter (AZF/RB). Ohne diese Rolle darf der Zug nicht abfahren — die Disposition blockiert die Startfreigabe.',
    icon: HardHat,
    view: 'personal',
    targetId: 'tutorial-jobcenter',
  },
  {
    title: 'Personaldienstleister (PDL)',
    description:
      'Hast du keinen eigenen AZF/RB frei, buchst du ihn über den PDL. Das kostet 650–850 € pro Schicht und mindert die Marge spürbar. Eigenes Personal ist auf Dauer günstiger — der PDL ist die teure Notlösung.',
    icon: UserCog,
    tone: 'warn',
    view: 'disposition',
    targetId: 'tutorial-pdl',
  },
  {
    title: 'Disposition',
    description:
      'In der Disposition weist du Lok, Wagen und Personal einem Auftrag zu. Baugleis-Einsätze binden eine Diesellok plus zwei Tf im Schichtwechsel. Erst wenn alles passt (Brh, Wagen, AZF/RB), kannst du den Zug abfahren lassen.',
    icon: ClipboardList,
    view: 'disposition',
    targetId: 'tutorial-disposition',
  },
  {
    title: 'Kosten-Vorschau',
    description:
      'Der Auftragserlös ist brutto. Trassenpreis und Energie (Diesel oder Strom) werden variabel abgezogen. In der Kalkulation siehst du den Netto-Gewinn, bevor du zusagst — unrentable Fahrten lieber liegen lassen.',
    icon: TrendingDown,
    view: 'auftragsmarkt',
    targetId: 'tutorial-frachtboerse',
  },
  {
    title: 'Fristarbeiten',
    description:
      'Loks brauchen planmäßige Instandhaltung: F (Frist), ZU (Zwischenuntersuchung) und HU (Hauptuntersuchung). Ohne gültige HU wird die Lok stillgelegt. Wagen mit abgelaufener Frist gehören in den Wagendienst.',
    icon: Wrench,
    view: 'werkstatt',
    targetId: 'tutorial-werkstatt',
  },
  {
    title: 'EVU-Level',
    description:
      'Erfüllte Aufträge bringen XP. Lukrative Industrie-Großverträge (Stahl-Pendel, Kohle, Seehafen) schalten sich erst ab Level 4/5 frei — und oft erst mit ausreichender Bekanntheit. Frühphase heißt: lokale Spots, knappe Kasse.',
    icon: Star,
    view: 'zentrale',
    targetId: 'tutorial-level',
  },
  {
    title: 'Finanzen & Dispo',
    description:
      'Die Bank gewährt einen Dispo-Kreditrahmen. Rutscht das Konto ins Minus, fängt der Dispo Engpässe ab — gegen Tageszinsen. Den Rahmen kannst du mit dem EVU-Level erhöhen. Nutze ihn bewusst, nicht als Dauerzustand.',
    icon: Landmark,
    view: 'bank',
    targetId: 'tutorial-bank-dispo',
  },
  {
    title: 'Insolvenzregeln',
    description:
      'Liegt das Konto 14 Tage ununterbrochen unter dem Dispo-Limit, ist das Spiel vorbei: Insolvenz / Game Over. Eine Warn-Mail der Bank kommt, sobald du ins Minus rutschst. Handle dann schnell — Aufträge, Kredit, weniger Standgeld.',
    icon: AlertTriangle,
    tone: 'warn',
    view: 'bank',
    targetId: 'tutorial-bank-dispo',
  },
  {
    title: 'Startfreigabe',
    description:
      'Dein erster Auftrag wartet auf dich. Öffne die Frachtbörse, nimm einen regionalen Spot, disponiere Lok, Wagen und Tf — und behalte Hallenmiete, Standgeld und Personalkosten im Blick. Viel Erfolg an der Spitze deines EVU.',
    icon: Flag,
    view: 'auftragsmarkt',
    targetId: 'tutorial-frachtboerse',
  },
];

export const TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length;

export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* private mode */
  }
}
