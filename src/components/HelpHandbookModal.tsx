import { useState } from 'react';
import {
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Coins,
  Factory,
  GraduationCap,
  Landmark,
  MapPinned,
  ShieldCheck,
  Train,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui';

type HandbookCategoryId = 'einstieg' | 'betrieb' | 'fuhrpark' | 'personal' | 'finanzen' | 'hilfe';

interface HandbookTopic {
  icon: LucideIcon;
  title: string;
  body: string;
  note?: string;
}

interface HandbookCategory {
  id: HandbookCategoryId;
  label: string;
  eyebrow: string;
  intro: string;
  icon: LucideIcon;
  topics: HandbookTopic[];
}

const HANDBOOK_CATEGORIES: HandbookCategory[] = [
  {
    id: 'einstieg',
    label: 'Einstieg',
    eyebrow: 'Leitstelle',
    intro:
      'Die Zentrale ist dein operativer Ausgangspunkt. Nutze die goldenen Büro-Hotspots oder die Navigation, um jeweils in einen Verwaltungsbereich zu wechseln.',
    icon: BookOpen,
    topics: [
      {
        icon: MapPinned,
        title: 'Vom Auftrag zur Fahrt',
        body: 'Wähle einen offenen Auftrag, prüfe Zug, Personal und Wagenbedarf und plane die Fahrt in der Disposition. Erst mit einer vollständigen Besetzung kann der Auftrag anlaufen.',
        note: 'Tipp: Prüfe vor der Disposition Verfügbarkeit, Fristen und Streckenzugang.',
      },
      {
        icon: ClipboardCheck,
        title: 'Leitstellen-Routine',
        body: 'Die Spielzeit steuert laufende Einsätze, Gehälter, Wartung, Schulungen und Marktaktualisierungen. Pausiere die Zeit vor größeren Verwaltungsentscheidungen.',
      },
    ],
  },
  {
    id: 'betrieb',
    label: 'Betrieb',
    eyebrow: 'Disposition',
    intro:
      'Zuverlässiger Betrieb entsteht aus einer belastbaren Zugbildung, ausreichender Ruhezeit und einer korrekten Personalbesetzung.',
    icon: Train,
    topics: [
      {
        icon: Train,
        title: 'Disposition und Zugbildung',
        body: 'Für einen Auftrag müssen passende Lok, verfügbare Wagen und die erforderliche Besatzung bereitstehen. Fehlende Wagenpakete oder gesperrte Fahrzeuge blockieren die Abfahrt.',
      },
      {
        icon: ShieldCheck,
        title: 'Ruhezeit und Einsatzfähigkeit',
        body: 'Triebfahrzeugführer benötigen ihre Ruhezeit. Die Personalakte zeigt die Stunden im 48-h-Fenster, die laufende Schicht und den aktuellen Verfügbarkeitsstatus.',
      },
      {
        icon: Factory,
        title: 'Spezial- und Baugleiseinsätze',
        body: 'Einige Einsätze haben eigene Besetzungs- und Ablaufregeln. Prüfe die Auftragsdetails, bevor du Ressourcen fest bindest.',
      },
    ],
  },
  {
    id: 'fuhrpark',
    label: 'Fuhrpark',
    eyebrow: 'Fahrzeugmanagement',
    intro:
      'Ein Einsatz ist nur so belastbar wie sein Fuhrpark. Wartung, Fristen und technische Freigaben gehören vor die operative Planung.',
    icon: Wrench,
    topics: [
      {
        icon: Wrench,
        title: 'Fristen F / ZU / HU',
        body: 'F (Fristarbeit) wird alle 90 Tage beziehungsweise 60.000 km fällig und dauert einen Tag ohne Werkstatt-Slot. ZU und HU belegen je einen Slot. Ohne gültige HU ist eine Lok stillgelegt.',
        note: 'Überfällige Fristen verursachen Malus und Standzeit.',
      },
      {
        icon: Train,
        title: 'ETCS-Nachrüstung',
        body: 'Bestandsloks können in der Werkstatt mit ETCS nachgerüstet werden. Danach erhalten sie Zugang zu modernen Trassen und Aufträgen und profitieren von weniger Verspätung.',
      },
      {
        icon: Factory,
        title: 'Depotkapazität',
        body: 'Depotausbauten schaffen Abstellplätze und Werkstatt-Slots. Plane Erweiterungen, bevor neue Lokomotiven oder große Wagenbestände zu Kapazitätsengpässen führen.',
      },
    ],
  },
  {
    id: 'personal',
    label: 'Personal',
    eyebrow: 'Mitarbeiter & Qualifikationen',
    intro:
      'Die Personalakte verbindet Rolle, Erfahrung und Baureihen-Freigaben. Die Jobbörse aktualisiert sich täglich und jede Einstellung wird vor der Buchung geprüft.',
    icon: Users,
    topics: [
      {
        icon: BriefcaseBusiness,
        title: 'Einstellung prüfen',
        body: 'Vergleiche Rolle, Qualifikationsstufe, Monatsgehalt und vorhandene Baureihen-Freigaben mit deinem Fuhrpark. Die Börse markiert passende Kandidaten und zeigt fehlende Baureihen direkt an.',
        note: 'Die Einstellungsgebühr wird nur nach expliziter Bestätigung gebucht.',
      },
      {
        icon: CheckCircle2,
        title: 'Quick-Pay-Nachschulung',
        body: 'Bei der Einstellung kannst du fehlende Baureihen sofort gegen einen Pauschalpreis pro fehlender Klasse ergänzen. Der neue Tf ist dadurch unmittelbar für diese Baureihen freigegeben.',
        note: 'Quick-Pay ergänzt nur Baureihen, die im eigenen Fuhrpark fehlen.',
      },
      {
        icon: GraduationCap,
        title: 'Reguläre Baureihen-Schulung',
        body: 'Über die Personalakte lässt sich eine einzelne fehlende Baureihe gezielt schulen. Kosten und Dauer hängen vom Fahrzeugsegment ab. Während der Schulung ist der Tf nicht einsetzbar.',
      },
      {
        icon: Users,
        title: 'Erfahrung und Rang',
        body: 'Personal sammelt im Betrieb Erfahrung. Mit steigender Stufe verbessert sich die Fahrplan-Effizienz, gleichzeitig kann sich das Gehalt erhöhen.',
      },
    ],
  },
  {
    id: 'finanzen',
    label: 'Finanzen',
    eyebrow: 'Liquidität & Wachstum',
    intro:
      'Verfolge nicht nur Erlöse, sondern auch laufende Verpflichtungen. Jede Investition soll die Einsatzfähigkeit oder die Marktposition messbar stärken.',
    icon: Landmark,
    topics: [
      {
        icon: Coins,
        title: 'Laufende Kosten',
        body: 'Personalgehälter, Finanzierung, Versicherungen und betriebliche Kosten werden mit der Spielzeit fortgeschrieben. Berücksichtige sie vor jeder neuen Verpflichtung.',
      },
      {
        icon: Calculator,
        title: 'Investitionen absichern',
        body: 'Einstellungen, Schulungen, Wartung und Depotausbauten prüfen die verfügbare Liquidität inklusive Disporahmen. Eine abgelehnte Zahlung verändert den Spielstand nicht.',
      },
    ],
  },
  {
    id: 'hilfe',
    label: 'Hilfe',
    eyebrow: 'Orientierung',
    intro:
      'Nutze das Handbuch als kompakte Entscheidungsstütze. Für eine geführte Einführung kann das Tutorial jederzeit erneut gestartet werden.',
    icon: BookOpen,
    topics: [
      {
        icon: BookOpen,
        title: 'Sicher entscheiden',
        body: 'Finanzielle oder statusändernde Aktionen werden grundsätzlich über einen Bestätigungsdialog abgeschlossen. Lies dort Preis, Dauer und unmittelbare Wirkung vor dem finalen Klick.',
      },
      {
        icon: ChevronRight,
        title: 'Nächster sinnvoller Schritt',
        body: 'Nutze in Hinweisen und Listen zuerst die sichtbaren Sperrgründe. Sie führen direkt zu dem Bereich, in dem du die Voraussetzung beheben kannst.',
      },
    ],
  },
];

interface HelpHandbookModalProps {
  onClose: () => void;
  onReplayTutorial: () => void;
}

export function HelpHandbookModal({ onClose, onReplayTutorial }: HelpHandbookModalProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<HandbookCategoryId>('einstieg');
  const activeCategory = HANDBOOK_CATEGORIES.find((category) => category.id === activeCategoryId) ?? HANDBOOK_CATEGORIES[0];
  const ActiveIcon = activeCategory.icon;

  return (
    <div className="modal-scrim fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
      <section
        className="app-glass help-handbook max-h-[min(90vh,46rem)] w-full max-w-4xl overflow-hidden rounded-2xl shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-handbook-title"
      >
        <header className="app-glass-header flex items-center justify-between border-b border-amber-500/20 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2 text-amber-200">
            <BookOpen className="h-4 w-4 shrink-0" />
            <div>
              <h2 id="help-handbook-title" className="text-sm font-bold uppercase tracking-wide">
                Betriebs-Handbuch
              </h2>
              <p className="mt-0.5 text-[10px] font-medium normal-case tracking-normal text-slate-500">
                Leitfaden für Verwaltung, Betrieb und Wachstum
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            onClick={onClose}
            aria-label="Handbuch schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="help-handbook-layout min-h-0 flex-1">
          <nav className="help-handbook-nav" aria-label="Handbuch-Kategorien" role="tablist" aria-orientation="vertical">
            {HANDBOOK_CATEGORIES.map((category) => {
              const Icon = category.icon;
              const isActive = category.id === activeCategory.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  className={`help-handbook-nav-item ${isActive ? 'is-active' : ''}`}
                  onClick={() => setActiveCategoryId(category.id)}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`handbook-panel-${category.id}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{category.label}</span>
                </button>
              );
            })}
          </nav>

          <div
            id={`handbook-panel-${activeCategory.id}`}
            className="help-handbook-content overflow-y-auto p-4 sm:p-5"
            role="tabpanel"
          >
            <div className="help-handbook-hero">
              <span className="help-handbook-hero-icon">
                <ActiveIcon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300/80">{activeCategory.eyebrow}</p>
                <h3 className="mt-0.5 text-base font-bold text-white">{activeCategory.label}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{activeCategory.intro}</p>
              </div>
            </div>

            {activeCategory.id === 'personal' && <PersonnelDecisionMap />}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {activeCategory.topics.map((topic) => {
                const Icon = topic.icon;
                return (
                  <article key={topic.title} className="help-handbook-topic">
                    <div className="flex items-start gap-2.5">
                      <span className="help-handbook-topic-icon">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-[11px] font-bold uppercase tracking-wide text-amber-200">{topic.title}</h4>
                        <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{topic.body}</p>
                        {topic.note && <p className="mt-2 text-[11px] font-semibold leading-relaxed text-amber-300/90">{topic.note}</p>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-amber-500/15 px-4 py-3 sm:px-5">
          <Button variant="secondary" onClick={onReplayTutorial}>
            Tutorial wiederholen
          </Button>
          <Button onClick={onClose}>Schließen</Button>
        </footer>
      </section>
    </div>
  );
}

function PersonnelDecisionMap() {
  return (
    <section className="help-handbook-decision-map" aria-labelledby="handbook-personal-flow-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p id="handbook-personal-flow-title" className="text-[11px] font-bold uppercase tracking-wide text-amber-200">
            Entscheidungshilfe: Baureihen-Fit
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            Die Personalansicht führt jede Einstellung über denselben Prüfpfad.
          </p>
        </div>
        <GraduationCap className="h-5 w-5 shrink-0 text-amber-400" />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="help-handbook-decision-step">
          <span>01</span>
          <strong>Kandidat prüfen</strong>
          <p>Rolle, Rang und Freigaben mit dem Fuhrpark abgleichen.</p>
        </div>
        <div className="help-handbook-decision-step">
          <span>02</span>
          <strong>Weg wählen</strong>
          <p>Passend einstellen oder fehlende Klassen sofort ergänzen.</p>
        </div>
        <div className="help-handbook-decision-step">
          <span>03</span>
          <strong>Wirkung bestätigen</strong>
          <p>Preis und Freigabe vor der finalen Buchung kontrollieren.</p>
        </div>
      </div>
    </section>
  );
}
