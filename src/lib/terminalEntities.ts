/**
 * Kernentitäten des Schwerlast-Terminals.
 *
 * Dieses Modul enthält ausschließlich Datenverträge; es enthält bewusst keine
 * Berechnungen und keine Datenbankzugriffe. Die Fachregeln gehören in
 * `terminalLogistics.ts`, Persistenzadapter in eine spätere Server-/Repository-Schicht.
 *
 * Die Feldnamen folgen der TypeScript-Konvention. Ein PostgreSQL-/Prisma-Adapter
 * mappt sie auf snake_case (z. B. `trackLengthMeters` → `track_length_meters`).
 */

/** Opaque, aber serialisierbare Primärschlüssel der relationalen Tabellen. */
export type TerminalId = string;
export type CargoTypeId = string;
export type CargoUnitId = string;
export type WagonId = string;
export type TrainId = string;
export type TrainEventId = string;

/**
 * Relational: `terminals`.
 *
 * Ein Terminal besitzt viele Wagen (`wagons.current_terminal_id`), viele
 * Frachtpartien (`cargo_units.current_terminal_id`) und viele Zugverbände
 * (`trains.terminal_id`). Es wird nie direkt in den Unterobjekten eingebettet;
 * die Beziehung bleibt über `id` bzw. Fremdschlüssel referenziell eindeutig.
 */
export interface Terminal {
  id: TerminalId;
  name: string;

  /** Maximale nutzbare Länge des Zugbildungsgleises in Metern (> 0). */
  trackLengthMeters: number;
  /** Maximales Gewicht eines einzelnen Kranhubs in Tonnen (> 0). */
  maxCraneCapacityTons: number;
  /** Gesamte verfügbare Lagerfläche in Quadratmetern (>= 0). */
  storageAreaSqm: number;
  /** Aktuell belegte Lagerfläche in Quadratmetern (0…storageAreaSqm). */
  currentStorageUsedSqm: number;

  /** Kennzeichnet die Verfügbarkeit eines Spezialkrans für Sondergüter. */
  hasSpecialCrane: boolean;
}

/** Katalogklassen für UI-Filter, Kennzahlen und zukünftige Auftragsgeneratoren. */
export type CargoCategory =
  | 'TRACK_BALLAST'
  | 'TRACK_SLEEPERS'
  | 'RAIL_SECTION'
  | 'BRIDGE_SECTION'
  | 'TURBINE_COMPONENT'
  | 'TRANSFORMER_HOUSING'
  | 'OTHER_HEAVY_CARGO';

/**
 * Relational: `cargo_types`.
 *
 * Ein Eintrag beschreibt eine Güterart und wird von vielen physischen
 * Frachtpartien (`cargo_units.cargo_type_id`) referenziert. Das Gewicht bezieht
 * sich auf genau eine im Spiel beladbare Partie dieser Güterart.
 */
export interface CargoType {
  id: CargoTypeId;
  name: string;
  category: CargoCategory;

  /** Masse einer Frachtpartie in Tonnen (> 0). */
  weightTons: number;
  /** Der Umschlag benötigt einen Spezialkran, unabhängig vom Gewicht. */
  requiresSpecialCrane: boolean;
  /** Kennzeichnet eine Lademaßüberschreitung (LÜ). */
  isOutOfGauge: boolean;
  /**
   * Aufsteigende Entladereihenfolge an der Baustelle: 1 wird vor 2 entladen.
   * Sie wird beim Vergleichen der Wagenpositionen verwendet.
   */
  priorityOrderForConstructionSite: number;
}

/** Status einer physischen Frachtpartie in ihrem Terminal- bzw. Zuglebenszyklus. */
export type CargoUnitStatus = 'EXPECTED' | 'IN_STORAGE' | 'LOADED' | 'DELIVERED';

/**
 * Relational: `cargo_units`.
 *
 * Diese Ergänzungsentität unterscheidet einen Güterkatalogeintrag von einer
 * konkreten Partie. Sie verhindert, dass dieselbe Lieferung mehrfach auf Wagen
 * geladen wird, und ist die Quelle für Lagerflächenauslastung.
 */
export interface CargoUnit {
  id: CargoUnitId;
  cargoTypeId: CargoTypeId;
  currentTerminalId: TerminalId;
  storageAreaSqm: number;
  status: CargoUnitStatus;
}

/** Betriebszustand eines einzelnen, physisch disponierbaren Wagens. */
export type WagonStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'ASSEMBLING'
  | 'IN_TRANSIT'
  | 'MAINTENANCE'
  | 'INSPECTION_DUE';

/**
 * Relational: `wagons`.
 *
 * `currentTerminalId` verweist auf `terminals.id`. `currentTrainId` ist der
 * optionale Fremdschlüssel auf `trains.id`; er ist nur gesetzt, wenn der Wagen
 * Teil eines Zugverbands ist. `positionInTrain` ist dann 1-basiert, eindeutig
 * pro Zug und bezeichnet die erste Entladeposition an der Baustellenseite.
 */
export interface Wagon {
  id: WagonId;
  /** UIC-Bauart, beispielsweise `Fccs`, `Res` oder `Uaai Tieflader`. */
  uicWagonType: string;
  /** Maximal zulässige Zuladung in Tonnen (>= 0). */
  maxPayloadTons: number;
  /** Länge über Puffer (LÜP) in Metern (> 0). */
  lengthOverBuffersMeters: number;
  /** Leergewicht in Tonnen; optional für übernommene Altdaten. */
  tareWeightTons?: number;

  currentTerminalId: TerminalId;
  currentTrainId: TrainId | null;
  positionInTrain: number | null;
  status: WagonStatus;
}

/**
 * Relational: `wagon_loads`.
 *
 * Verknüpfungstabelle zwischen einem Wagen und einer physischen Frachtpartie.
 * `cargoUnitId` hat in der Datenbank einen UNIQUE-Constraint; eine Partie kann
 * daher höchstens einmal gleichzeitig geladen sein.
 */
export interface WagonLoad {
  wagonId: WagonId;
  cargoUnitId: CargoUnitId;
  cargoTypeId: CargoTypeId;
}

/** Zuglebenszyklus; ein LÜ-Vorgang besitzt einen getrennten Eventstatus. */
export type TrainStatus = 'ASSEMBLING' | 'IN_INSPECTION' | 'DISPATCHED' | 'DELIVERED';

/**
 * Relational: `trains`.
 *
 * `terminalId` ist ein Fremdschlüssel auf `terminals.id` und liefert die
 * zulässige Gleislänge für diesen Zug. `totalLengthMeters`,
 * `totalWeightTons` und `isOrderValid` sind denormalisierte, abgeleitete Werte.
 * Sie werden ausschließlich aus Wagen, Wagenladungen und Frachtprioritäten
 * berechnet und nie als manuelle Eingabe übernommen.
 */
export interface Train {
  id: TrainId;
  terminalId: TerminalId;
  destinationConstructionSite: string;

  totalLengthMeters: number;
  totalWeightTons: number;
  status: TrainStatus;
  /** Wahr, wenn die Wagenpositionen die Baustellenpriorität erfüllen. */
  isOrderValid: boolean;
}

/** Ereignistypen, die die Abfahrt eines Zugs zusätzlich freigeben oder sperren. */
export type TrainEventType = 'LUE_GENEHMIGUNG_ERFORDERLICH';
export type TrainEventStatus = 'OPEN' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/**
 * Relational: `train_events`.
 *
 * Ein LÜ-Ereignis wird beim Beladen eines LÜ-Guts erzeugt. Nur ein Ereignis mit
 * `status: 'APPROVED'` hebt den daraus resultierenden Abfahrtsblocker auf.
 */
export interface TrainEvent {
  id: TrainEventId;
  trainId: TrainId;
  type: TrainEventType;
  status: TrainEventStatus;
  createdAt: string;
  resolvedAt?: string | null;
}
