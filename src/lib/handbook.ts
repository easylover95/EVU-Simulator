export type HandbookCategoryId =
  | 'einstieg'
  | 'gueter'
  | 'baugleis'
  | 'fuhrpark'
  | 'personal'
  | 'finanzen';

export interface HandbookOpenTo {
  categoryId?: HandbookCategoryId;
  articleId?: string;
}

export interface HandbookArticle {
  id: string;
  title: string;
  summary: string;
  body: string[];
  notes?: string[];
  keywords: string[];
}

export interface HandbookCategory {
  id: HandbookCategoryId;
  label: string;
  shortLabel: string;
  eyebrow: string;
  intro: string;
  articles: HandbookArticle[];
}

export type ContextHelpTopicId =
  | 'nutzlaenge'
  | 'traktion'
  | 'deckungsbeitrag'
  | 'hakenlast'
  | 'oberleitung'
  | 'poenale'
  | 'brh';

export interface ContextHelpTopic {
  id: ContextHelpTopicId;
  title: string;
  paragraphs: string[];
  handbook: HandbookOpenTo;
}

export const HANDBOOK_CATEGORIES: readonly HandbookCategory[] = [
  {
    id: 'einstieg',
    label: 'Einstieg & Grundlagen',
    shortLabel: 'Einstieg',
    eyebrow: 'Leitstelle',
    intro:
      'Du führst ein Güter-EVU: Spotmarkt, Rahmenverträge, Depots und Reputation steuern, welche Aufträge erscheinen und was du disponieren darfst.',
    articles: [
      {
        id: 'quick-guide',
        title: 'Quick-Guide für Neueinsteiger',
        summary: 'Vom ersten Spot bis zur Abfahrt — die operative Reihenfolge.',
        body: [
          '1. Frachtbörse: einen offenen Spot oder Baugleis-Auftrag wählen. Prüfe Last (t), Fahrleitung, Wagenbedarf und den angezeigten Netto nach Trasse/Energie.',
          '2. Wagenpark und Fuhrpark: fehlende Gattungen kaufen oder mieten, eine passende Lok (Diesel/Dual/E-Lok, Hakenlast) bereithalten.',
          '3. Disposition: Auftrag, Lok und Tf zuweisen. Baugleis-Einsatz braucht zwei Tf im Schichtwechsel plus AZF/RB (eigen oder PDL).',
          '4. Bank: Disporahmen nur als operatives Sicherheitsnetz nutzen. Investitionen (Händler, Depotausbau) verlangen ausreichendes Guthaben.',
          '5. Reputation und Level: höhere Stufen öffnen Rahmenverträge und ab 70 Reputation exklusive Ganzzüge. Der Marktgenerator berücksichtigt Fuhrpark und Depot-Regionen.',
        ],
        notes: [
          'Pausiere die Spielzeit vor größeren Buchungen. Das Handbuch und das Tutorial halten die Uhr an.',
        ],
        keywords: ['quick', 'guide', 'einstieg', 'tutorial', 'erste schritte', 'anleitung'],
      },
      {
        id: 'evu-start',
        title: 'EVU-Start: Zentrale, Depot, Fuhrpark',
        summary: 'Was du am ersten Spieltag bereits besitzt und wo du steuerst.',
        body: [
          'Das Starter-Depot liegt in Duisburg (EVU-Betriebshof). Es zählt zur Grundkapazität: 2 Lok-Stellplätze, 25 Wagen-Stellplätze, 2 Werkstatt-Slots und 8 Personalplätze — passend zum Startfuhrpark.',
          'Weitere Betriebsstellen (Hamburg Hafen, Maschen, Mannheim Rbf, München Ost u. a.) kaufst du unter Gebäude / Netz. Jeder Standort erhöht Stellplätze und Staff-Kapazität und speist regionale Aufträge in der Frachtbörse.',
          'Die Topbar zeigt Konto, Level, XP, Flotten- und Personalzahl sowie Reputation. Navigation: Zentrale, Fracht (Börse, Disposition, Verträge), Flotte, Bank, Firma.',
          'Loks stationierst du auf eigenen Betriebsstellen. Eine Lok im Einsatz darf nicht umstationiert werden. Umsetzen kostet eine einmalige Verlegungsgebühr.',
        ],
        keywords: ['start', 'depot', 'duisburg', 'zentrale', 'kapazität', 'stellplatz'],
      },
      {
        id: 'reputation',
        title: 'Firmen-Reputation',
        summary: 'Stufen von Newcomer bis Marktführer — und was sie im Markt freischalten.',
        body: [
          'Reputation steht in der Topbar (0–100) und bestimmt Marktzugang, nicht die Trassenformel.',
          'Stufen im aktuellen Build: Newcomer (0), Regionalpartner (25), Vertrauenswürdig (50), Premium-EVU (70), Marktführer (85).',
          'Ab Reputation 70 erscheinen exklusive Ganzzüge (höherer Ertragsfaktor). Rahmenverträge haben eigene Mindest-Reputation und Mindest-Level; manche verlangen eine bestimmte Betriebsstelle.',
          'Erfüllte Rahmenvertragstage erhöhen die Reputation (1 bis 4 Punkte je nach Anzahl der Pflichtläufe). Fehlende Pflichtläufe senken sie und buchen eine Vertragsstrafe.',
        ],
        keywords: ['reputation', 'bekanntheit', 'exklusiv', 'premium', 'stufen'],
      },
    ],
  },
  {
    id: 'gueter',
    label: 'Güterverkehr & Aufträge',
    shortLabel: 'Güter',
    eyebrow: 'Frachtbörse',
    intro:
      'Spotaufträge sind einmalige Läufe. Rahmenverträge erzeugen tägliche Pflichtläufe. Beide nutzen dieselbe Trassen- und Energieformel.',
    articles: [
      {
        id: 'spot-vs-rahmen',
        title: 'Spotmarkt und Rahmenverträge',
        summary: 'Einmalfahrt gegen Industrievertrag mit täglichen Abfahrten.',
        body: [
          'Spot: du nimmst einen offenen Auftrag in der Frachtbörse und disponierst ihn einmal. Erlös bei Abschluss, Trasse und Energie beim Start. Frist und Pönale stehen in der Auftragskarte.',
          'Rahmenvertrag: Annahme unter Verträge / Register „Rahmenverträge“. Der Vertrag bindet Partner, Korridor, Wagen-Gattung und oft eine Betriebsstelle. Jeder Spieltage erzeugt Pflichtläufe (Anzahl steigt mit dem Firmenlevel, gedeckelt durch den Vertrag).',
          'Vertragsläufe erscheinen als Aufträge mit Nummer RV-… und denselben Dispo-Prüfungen wie Spots (Hakenlast, Oberleitung, Wagen, Brh, Tf-Baureihe).',
          'Der Marktgenerator richtet sich nach Fuhrpark (Diesel/E-Lok/Hakenlast) und den Regionen deiner Depots. Ein täglicher Refresh ist einmal pro Ingame-Tag möglich.',
        ],
        keywords: ['spot', 'rahmenvertrag', 'industrie', 'vertrag', 'pflichtlauf', 'frachtbörse'],
      },
      {
        id: 'deckungsbeitrag',
        title: 'Deckungsbeitrag (Auftragskalkulation)',
        summary: 'Bruttoerlös minus Trasse, Energie und ggf. PDL — so wie die Karte es zeigt.',
        body: [
          'In Frachtbörse und Disposition heißt die Spanne „Netto-Gewinn“ bzw. in der Händler-Vorschau „Deckungsbeitrag“. Rechnerisch: Bruttoerlös − Trassenpreis − Energie (− PDL AZF/RB bei Baugleis, falls kein eigenes AZF-Personal).',
          'Spot-Güterzug: Sockelpauschale plus Tonnenkilometer-Anteil (Gewicht × Distanz × €/tkm). Der angezeigte Ertrag ist die Summe; Trasse und Energie werden getrennt abgezogen.',
          'Trasse im aktuellen Build: 8,90 € je Zug-km plus 0,32 € je 100 t·km, bei Baugleis mit Faktor 0,65, und nie über dem internen Alt-Tarif-Deckel.',
          'Energie: Diesel 4,4 l/km × 1,95 €/l; Strom (OHLE) 18 kWh/km × 0,28 €/kWh. Dual-Loks fahren im Güterverkehr elektrisch und auf dem Baugleis diesel.',
          'Gehälter, Hallenmiete, Standgeld und Dispozinsen gehören nicht in diese Auftragskarte — sie laufen als Tagesfixkosten über die Bank.',
        ],
        notes: ['Die Kalkulation ändert keine Preise; sie erklärt nur die bestehende Formel.'],
        keywords: ['deckungsbeitrag', 'netto', 'trasse', 'energie', '8,90', 'kalkulation', 'marge'],
      },
      {
        id: 'poenale',
        title: 'Pönale und Vertragsstrafe',
        summary: 'Verspätung, Sperrpause und verfehlte Rahmenvertragsläufe.',
        body: [
          'Güter-Spot: feste Pönale in Euro, fällig wenn die Frist gerissen wird (Abschluss nach Deadline).',
          'Baugleis mit Sperrpause: zusätzlich Pönale pro Minute, solange die Sperrpause aktiv ist und der Einsatz die Fensterregeln verletzt. Der Auftrag zeigt den Satz als €/Min.',
          'Rahmenvertrag: fehlen am Tagesende Pflichtläufe, bucht das Spiel je fehlendem Lauf eine Vertragsstrafe (mindestens 650 €, abgeleitet vom Vertragserlös) und zieht Reputation ab.',
          'Pönalen erscheinen in der Bank unter Strafen. Sie sind kein Trassenbestandteil.',
        ],
        keywords: ['pönale', 'strafe', 'frist', 'verspätung', 'vertragsstrafe', 'sperrpause'],
      },
      {
        id: 'exclusive',
        title: 'Exklusive Ganzzüge',
        summary: 'Freischaltung ab Reputation 70.',
        body: [
          'Exklusiv-Ganzzüge erscheinen erst, wenn die Firmenreputation mindestens 70 beträgt (Stufe Premium-EVU).',
          'Sie tragen die Markierung „Exklusiv-Ganzzug“, nutzen denselben Dispo-Check und einen höheren Ertragsfaktor gegenüber dem normalen Spot.',
          'Ohne diese Reputation filtert die Börse sie heraus — das ist Marktzugang, keine versteckte Trassenänderung.',
        ],
        keywords: ['exklusiv', 'ganzzug', '70', 'premium'],
      },
    ],
  },
  {
    id: 'baugleis',
    label: 'Baugleis & Baustellen',
    shortLabel: 'Baugleis',
    eyebrow: 'Infrastruktur-Logistik',
    intro:
      'Baugleis läuft ohne Oberleitung, mit Diesel- oder Dual-Lok, und oft als mehrtägiger Einsatz mit Schichtwechsel.',
    articles: [
      {
        id: 'baugleis-slots',
        title: 'Baugleis-Slots und Einsatzbindung',
        summary: 'Was ein Baugleis-Einsatz für Lok, Tf und AZF blockiert.',
        body: [
          'Unterscheide Spot-Baugleis (ein Lauf) und Baugleis-Einsatz (mehrtägig, Tagespauschale). Der Einsatz bindet eine Diesel- oder Dual-Lok (z. B. BR 218, V 90 / BR 290) plus zwei verschiedene Tf für den Schichtwechsel.',
          'Zusätzlich ist ein Arbeitszugführer / Rangierbegleiter Pflicht: fest angestellt (keine PDL-Kosten) oder über Personaldienstleister (650–850 €/Tag).',
          'Solange der Einsatz aktiv ist, sind Lok und beide Tf gebunden. Tageserlös und Tageskosten (Trasse, Energie, ggf. PDL) werden parallel gebucht.',
          'Ohne Oberleitung: eine reine E-Lok wird von evaluateAssignmentFit abgelehnt (Code ohle_missing).',
        ],
        keywords: ['baugleis', 'einsatz', 'slot', 'diesel', 'schichtwechsel', 'azf'],
      },
      {
        id: 'logistik-infra',
        title: 'Logistik der Infrastruktur: Depots und Korridore',
        summary: 'Betriebsstellen steuern, welche Baustellen und Industrien der Markt anbietet.',
        body: [
          'Jede gekaufte Betriebsstelle bringt Regionen, Kategorien (Gleisbau, Stahl, Chemie, Energie, Intermodal) und Beispielrelationen mit — elektrifiziert oder nicht.',
          'Der Auftragsgenerator bevorzugt Relationen um deine Depots. Ein reines Duisburg-EVU sieht vor allem Ruhr-Korridore; Hamburg Hafen speist Hinterland-Container.',
          'Stellplätze müssen mindestens einen Standard-Ganzzug fassen. Wagen-Ausbauten und neue Standorte wachsen mit der Flotte mit — nicht künstlich deckeln.',
        ],
        keywords: ['depot', 'baustelle', 'infrastruktur', 'region', 'netz'],
      },
      {
        id: 'sperrpause',
        title: 'Sperrpause',
        summary: 'Zeitfenster auf der Baustelle mit Minuten-Pönale.',
        body: [
          'Manche Baugleis-Aufträge nennen Sperrpause von–bis. In diesem Fenster gilt der Minuten-Pönalsatz.',
          'Die Frachtbörse zählt den Countdown bis zum Fenster bzw. die Restzeit darin. Das ist Anzeige, keine Änderung der Fahrphysik.',
        ],
        keywords: ['sperrpause', 'baustelle', 'fenster', 'minute'],
      },
    ],
  },
  {
    id: 'fuhrpark',
    label: 'Fuhrpark & Traktion',
    shortLabel: 'Fuhrpark',
    eyebrow: 'Triebfahrzeuge',
    intro:
      'Die Disposition prüft Oberleitung, Hakenlast, Brh und Wagen-Gattung. Eine separate Gleis-Nutzlänge sperrt im aktuellen Build nicht.',
    articles: [
      {
        id: 'diesel-elok',
        title: 'Diesel, E-Lok und Dual',
        summary: 'Welche Traktion auf welcher Strecke fahren darf.',
        body: [
          'E-Lok: nur bei vorhandener Oberleitung. Fehlt der Fahrdraht (Baugleis, Anschluss, Werk, Nebenbahn oder Auftragskennzeichen electrified = false), ist die Zuweisung blockiert.',
          'Diesellok: überall zulässig, höhere Energiekosten je km als Strom.',
          'Dual: fährt unelektrifiziert und unter Fahrdraht. Energiebuchung: Strom auf Güterverkehr, Diesel auf Baugleis.',
          'In der Frachtbörse siehst du „Fahrdraht / E-Lok möglich“ oder „Ohne Oberleitung · Diesel/Dual“. Der Fuhrpark-Check nutzt dieselbe Funktion wie die Disposition.',
        ],
        keywords: ['diesel', 'e-lok', 'dual', 'traktion', 'fuel'],
      },
      {
        id: 'oberleitung',
        title: 'Oberleitung / Fahrdraht',
        summary: 'Wann die Strecke als elektrifiziert gilt.',
        body: [
          'Ist am Auftrag electrified gesetzt, gilt dieser Wert. Sonst: Baugleis immer ohne Fahrdraht; Zieltexte mit Baugleis, Anschluss, Werk, Baustelle oder Nebenbahn ebenfalls ohne.',
          'Standard-Güterkorridore gelten als elektrifiziert, sofern nicht anders gekennzeichnet.',
          'Nur dieser Check entscheidet über E-Lok-Zulassung — nicht ETCS und nicht das Landespaket.',
        ],
        keywords: ['oberleitung', 'fahrdraht', 'ohle', 'elektrifiziert'],
      },
      {
        id: 'hakenlast',
        title: 'Hakenlast',
        summary: 'Zulässige Anhängelast der Lok gegen Auftragsgewicht.',
        body: [
          'Die Hakenlast ist eine Näherung für deutsche Güterzüge: aus Leistung (kW), Dienstmasse und Traktionsart. Rangierloks (wenig kW) bekommen einen höheren t/kW-Faktor, schwere E-Loks einen niedrigeren. Untergrenze 320 t.',
          'evaluateAssignmentFit vergleicht Auftragsgewicht (weight_t) mit dieser Hakenlast. Ist die Fracht schwerer, Code trailing_load — Zuweisung unmöglich.',
          'Die Dispo-Liste blendet unpassende Loks aus. In der Börse warnt der Fuhrpark-Check, wenn keine Bestandslok die Last zieht.',
        ],
        keywords: ['hakenlast', 'anhängelast', 'gewicht', 'trailing', 'kw'],
      },
      {
        id: 'nutzlaenge',
        title: 'Nutzlänge und Zuglänge',
        summary: 'Was der aktuelle Build prüft — und was er nicht prüft.',
        body: [
          'Im Eisenbahnbetrieb ist die Nutzlänge die nutzbare Gleislänge (Überholung, Anschluss, Baugleis). Ein Zug, der länger ist als das Gleis, passt physisch nicht.',
          'Dieser Build speichert Wagen-„Länge über Puffer“ (mm) im Wagenpark und beim Händler. Die Disposition vergleicht diese Längen nicht mit einer Gleis-Nutzlänge. Es gibt keine Sperre „Nutzlänge zu kurz“.',
          'Stattdessen blockieren: zu wenig Wagen der geforderten Gattung, Hakenlast kleiner als das Auftragsgewicht, unzureichende Brh, falsche Traktion. Wenn ein Hinweis „zu kurz“ gemeint ist, prüfe zuerst Wagenzahl und Hakenlast — nicht eine (noch nicht implementierte) Längenprüfung.',
        ],
        notes: ['Eine Gleis-Nutzlänge als Dispo-Gate ist Spielkonzept, kein aktiver Check in diesem Build.'],
        keywords: ['nutzlänge', 'zuglänge', 'über puffer', 'gleis', 'länge'],
      },
      {
        id: 'brh',
        title: 'Bremshundertstel (Brh)',
        summary: 'Mindest-Bremsvermögen von Lok plus Wagen.',
        body: [
          'Jeder Auftrag hat eine Mindest-Brh (typisch Güter 60–75, Baugleis etwas niedriger). Die Disposition rechnet Bremsmasse Lok + Wagen gegen Gesamtmasse × 100.',
          'Unterschreitung blockiert die Abfahrt. Mehr oder besser bremsende Wagen bzw. eine andere Lok heben die Brh.',
        ],
        keywords: ['brh', 'bremse', 'bremshundertstel', 'mindest'],
      },
      {
        id: 'depot-kapazitaet',
        title: 'Depot, Werkstatt, ETCS',
        summary: 'Stellplätze, HU/F/ZU und Netzzugang.',
        body: [
          'Ohne freien Lok- oder Wagenstellplatz blockiert der Händler den Kauf — nicht die Disposition eines bereits vorhandenen Zuges.',
          'F (Fristarbeit), ZU und HU laufen über die Werkstatt. Ohne gültige HU ist die Lok stillgelegt und nicht zuweisbar.',
          'ETCS ist ein separates Fahrzeugmerkmal für bestimmte Korridore und Länderpakete. Es ersetzt weder Oberleitung noch Hakenlast.',
        ],
        keywords: ['depot', 'werkstatt', 'hu', 'etcs', 'stellplatz'],
      },
    ],
  },
  {
    id: 'personal',
    label: 'Personal & Qualifikationen',
    shortLabel: 'Personal',
    eyebrow: 'Jobbörse',
    intro:
      'Tf brauchen Baureihen-Freigabe, Baugleis braucht zwei Tf plus AZF/RB. Wagenprüfer ist im Personalmodell vorgesehen.',
    articles: [
      {
        id: 'tf-quali',
        title: 'Tf-Berechtigungen',
        summary: 'Qualifikation Tf und Baureihen-Fit zur gewählten Lok.',
        body: [
          'Nur Personal mit Qualifikation „Tf“ und Status verfügbar erscheint in der Disposition. Die Baureihe der Lok muss in den seriesIds des Tf stehen, sonst blockiert seriesDispatchBlock.',
          'Die Jobbörse aktualisiert sich täglich und listet vor allem Tf (und AZF). Stufe 1–3 beeinflusst Gehalt und Fahrplan-Effizienz über Erfahrung.',
          'Quick-Pay bei der Einstellung kauft fehlende Baureihen des eigenen Fuhrparks sofort dazu. Alternativ: einzelne Baureihe in der Personalakte schulen — währenddessen ist der Tf nicht einsetzbar.',
        ],
        keywords: ['tf', 'triebfahrzeugführer', 'baureihe', 'berechtigung', 'qualifikation'],
      },
      {
        id: 'wagenpruefer',
        title: 'Wagenprüfer',
        summary: 'Rolle, Gehaltstabelle und Wagen-Fristen.',
        body: [
          'Wagenprüfer ist eine Personalrolle mit Qualifikationsstufen 1–3 und eigenen Monatsgehältern im Personalmodell.',
          'Die tägliche Jobbörse füllt aktuell Tf- und AZF-Slots. Wagenprüfer erscheinen dort nicht als Standardangebot; Simulationsläufe können die Rolle setzen.',
          'Im Wagenpark steht das Frist-Level als „Wagenprüfer Stufe“. Fristverlängerung und Revision sind Werkstatt-/Wagenjobs (Kosten und Takte laut Wagenpark), unabhängig von einem zugewiesenen Prüfer in der Disposition.',
        ],
        notes: ['Kein Dispo-Zwang „Wagenprüfer muss am Zug stehen“ in diesem Build.'],
        keywords: ['wagenprüfer', 'frist', 'revision', 'wagenpark'],
      },
      {
        id: 'schulungen',
        title: 'Schulungen und AZF/RB',
        summary: 'Baureihen-Lehrgang, Rang und Personaldienstleister.',
        body: [
          'Reguläre Baureihen-Schulung: Kosten und Dauer hängen vom Segment ab; der Tf ist bis Abschluss gebunden.',
          'AZF/RB: Qualifikation Arbeitszugführer oder Rangierbegleiter. Für jedes Baugleis musst du eigenes AZF-Personal wählen oder PDL (650–850 € je Schicht/Tag).',
          'Personalplätze folgen Depot und Lok-Ausbauten (Start 8, plus je Lok-Ausbau und Standort). Volle Unterkunft blockiert Einstellungen.',
        ],
        keywords: ['schulung', 'azf', 'rb', 'pdl', 'personalplatz'],
      },
    ],
  },
  {
    id: 'finanzen',
    label: 'Finanzen & Disporahmen',
    shortLabel: 'Finanzen',
    eyebrow: 'Bank',
    intro:
      'Der Dispo ist ein Notfallrahmen mit auslastungsabhängigen Tageszinsen — kein Investitionskredit.',
    articles: [
      {
        id: 'disporahmen',
        title: 'Dispoauslastung',
        summary: 'Rahmen, Zinsen, Investitionsstopp, Sanierung.',
        body: [
          'Starttypisch 25.000 € Dispo, Stufen bis 175.000 € ab Level 10. Der Rahmen lässt sich nur bei nichtnegativem Saldo umstellen.',
          'Auslastung = genutzter Überzug / Limit. Bis 50 % gilt der günstige Tagessatz, darüber teurer, ab 85 % der kritische Satz. Ab 60 % Auslastung sind Investitionen gesperrt — erst den Rahmen entlasten.',
          'Sinkt das Konto unter −Limit, beginnt eine 14-tägige Sanierung. Danach Insolvenz, wenn der Rahmen weiter gerissen ist. Darlehensrest ist kein eigener Insolvenzgrund.',
          'Operative Zahlungen (Trasse, Energie, Gehälter) dürfen den Dispo nutzen. Anlagenkäufe müssen aus Guthaben kommen.',
        ],
        keywords: ['dispo', 'überziehung', 'zinsen', 'sanierung', 'insolvenz', 'rahmen'],
      },
      {
        id: 'kostenstruktur',
        title: 'Kostenstruktur',
        summary: 'Was täglich läuft und was pro Fahrt gebucht wird.',
        body: [
          'Pro Fahrt bzw. Baugleis-Tag: Trasse, Energie, optional PDL. Spot-Erlös bei Abschluss, Einsatz-Tagespauschale täglich.',
          'Täglich unabhängig vom Zug: anteilige Gehälter, Hallenmiete/Standgeld, Versicherungen, Dispozinsen bei negativem Saldo, Darlehensrate, Leasing.',
          'Die Karte „Tagesfixkosten“ und die Bank-GuV trennen Fracht, Betrieb, Personal, Standort, Zinsen und Strafen. Der Auftrag-Netto ist daher nicht der Tagesgewinn der Firma.',
        ],
        keywords: ['kosten', 'gehalt', 'miete', 'standgeld', 'leasing', 'guv'],
      },
    ],
  },
] as const;

export const CONTEXT_HELP_TOPICS: Record<ContextHelpTopicId, ContextHelpTopic> = {
  nutzlaenge: {
    id: 'nutzlaenge',
    title: 'Warum wirkt eine Nutzlänge „zu kurz“?',
    paragraphs: [
      'Nutzlänge ist die nutzbare Gleislänge. Dieser Build prüft sie nicht gegen die Zuglänge.',
      'Blockiert wird stattdessen durch zu wenige Wagen der geforderten Gattung oder durch zu geringe Hakenlast. Wagenlängen stehen im Wagenpark unter „Länge über Puffer“.',
    ],
    handbook: { categoryId: 'fuhrpark', articleId: 'nutzlaenge' },
  },
  traktion: {
    id: 'traktion',
    title: 'Was bedeutet die Traktionsart für die Strecke?',
    paragraphs: [
      'Mit Oberleitung: E-Lok, Dual und Diesel. Ohne Oberleitung (Baugleis, Anschluss, Werk): nur Diesel oder Dual — reine E-Lok wird abgelehnt.',
      'Dual bucht im Güterverkehr Strom, auf dem Baugleis Diesel. Dieselloks sind teurer je Kilometer, aber überall einsetzbar.',
    ],
    handbook: { categoryId: 'fuhrpark', articleId: 'diesel-elok' },
  },
  deckungsbeitrag: {
    id: 'deckungsbeitrag',
    title: 'Wie berechnet sich der Deckungsbeitrag?',
    paragraphs: [
      'Netto = Bruttoerlös − Trasse − Energie (− PDL bei Baugleis ohne eigenes AZF).',
      'Trasse: 8,90 €/Zug-km + 0,32 €/100 t·km (Baugleis × 0,65). Energie: Diesel 8,58 €/km, Strom 5,04 €/km. Gehälter und Miete zählen nicht in diese Karte.',
    ],
    handbook: { categoryId: 'gueter', articleId: 'deckungsbeitrag' },
  },
  hakenlast: {
    id: 'hakenlast',
    title: 'Hakenlast der Lok',
    paragraphs: [
      'Die Hakenlast schätzt, wie viel Anhängelast die Lok auf typischer Hauptbahn ziehen darf (aus kW, Masse, Diesel/E/Dual).',
      'Ist das Auftragsgewicht größer, bleibt die Zuweisung gesperrt. Wähle eine stärkere Lok oder einen leichteren Auftrag.',
    ],
    handbook: { categoryId: 'fuhrpark', articleId: 'hakenlast' },
  },
  oberleitung: {
    id: 'oberleitung',
    title: 'Fahrdraht auf diesem Lauf',
    paragraphs: [
      '„Fahrdraht / E-Lok möglich“: elektrifizierter Lauf. „Ohne Oberleitung“: E-Lok unzulässig.',
      'Baugleis gilt immer als ohne Fahrdraht, unabhängig von der Nachbarstrecke.',
    ],
    handbook: { categoryId: 'fuhrpark', articleId: 'oberleitung' },
  },
  poenale: {
    id: 'poenale',
    title: 'Pönale',
    paragraphs: [
      'Spot-Güter: fester Betrag nach Fristüberschreitung. Baugleis: oft zusätzlich € je Minute in der Sperrpause.',
      'Rahmenvertrag: Vertragsstrafe je fehlendem Pflichtlauf am Tagesende, plus Reputationsverlust.',
    ],
    handbook: { categoryId: 'gueter', articleId: 'poenale' },
  },
  brh: {
    id: 'brh',
    title: 'Mindest-Bremshundertstel',
    paragraphs: [
      'Brh = (Bremsmasse Lok + Wagen) / Zugmasse × 100. Unter der Auftrags-Mindest-Brh gibt es keine Abfahrt.',
    ],
    handbook: { categoryId: 'fuhrpark', articleId: 'brh' },
  },
};

export function handbookCategoryById(id: HandbookCategoryId | undefined): HandbookCategory {
  return HANDBOOK_CATEGORIES.find((category) => category.id === id) ?? HANDBOOK_CATEGORIES[0];
}

export function handbookArticleById(
  articleId: string | undefined,
): { category: HandbookCategory; article: HandbookArticle } | null {
  if (!articleId) return null;
  for (const category of HANDBOOK_CATEGORIES) {
    const article = category.articles.find((entry) => entry.id === articleId);
    if (article) return { category, article };
  }
  return null;
}

export function resolveHandbookTarget(openTo?: HandbookOpenTo | null): {
  categoryId: HandbookCategoryId;
  articleId: string;
} {
  const byArticle = handbookArticleById(openTo?.articleId);
  if (byArticle) {
    return { categoryId: byArticle.category.id, articleId: byArticle.article.id };
  }
  const category = handbookCategoryById(openTo?.categoryId);
  return { categoryId: category.id, articleId: category.articles[0]?.id ?? 'quick-guide' };
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
}

export interface HandbookSearchHit {
  categoryId: HandbookCategoryId;
  categoryLabel: string;
  article: HandbookArticle;
}

export function searchHandbookArticles(query: string): HandbookSearchHit[] {
  const needle = normalizeSearch(query);
  if (needle.length < 2) return [];
  const hits: HandbookSearchHit[] = [];
  for (const category of HANDBOOK_CATEGORIES) {
    for (const article of category.articles) {
      const hay = normalizeSearch(
        [article.title, article.summary, ...article.body, ...(article.notes ?? []), ...article.keywords, category.label].join(
          ' ',
        ),
      );
      if (hay.includes(needle)) {
        hits.push({ categoryId: category.id, categoryLabel: category.label, article });
      }
    }
  }
  return hits;
}

export function handbookCategoryCount(): number {
  return HANDBOOK_CATEGORIES.length;
}
