/*
# Schwerlast-Terminal-Logistik

Erweitert den EVU-Simulator um eine physische, intermodale Terminaldomäne für
Baugleis- und Schwerlastprojekte. Bestehende `wagons`-Zeilen bleiben erhalten,
da sie historische bzw. aggregierte Flottenpakete darstellen können. Neue
terminaldisponierte Wagen sind Einzelwagen mit `count = 1`.

## Authoritative rules

Die relationalen Grenzen werden hier durch NOT NULL, CHECK, FK und eindeutige
Positionen abgesichert. Fachliche Prüfungen über mehrere Zeilen (Gesamtzuladung,
Reihung und LÜ-Freigabe) laufen serverseitig transaktional über
`src/lib/terminalLogistics.ts`. Die dort berechneten Summen werden in `trains`
denormalisiert, damit Listenansichten keine teuren Aggregationen benötigen.
*/

CREATE TABLE IF NOT EXISTS terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  track_length_meters numeric(10, 3) NOT NULL CHECK (track_length_meters > 0),
  max_crane_capacity_tons numeric(10, 3) NOT NULL CHECK (max_crane_capacity_tons > 0),
  storage_area_sqm numeric(12, 3) NOT NULL CHECK (storage_area_sqm >= 0),
  current_storage_used numeric(12, 3) NOT NULL DEFAULT 0
    CHECK (current_storage_used >= 0 AND current_storage_used <= storage_area_sqm),
  has_special_crane boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cargo_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  weight_tons numeric(10, 3) NOT NULL CHECK (weight_tons > 0),
  requires_special_crane boolean NOT NULL DEFAULT false,
  is_out_of_gauge boolean NOT NULL DEFAULT false,
  priority_order_for_construction_site integer NOT NULL
    CHECK (priority_order_for_construction_site >= 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

/* A cargo type is a catalogue record. A cargo unit is the physical lot that
   consumes storage and can be loaded at most once. */
CREATE TABLE IF NOT EXISTS cargo_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_type_id uuid NOT NULL REFERENCES cargo_types(id) ON DELETE RESTRICT,
  current_terminal_id uuid NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
  storage_area_sqm numeric(12, 3) NOT NULL CHECK (storage_area_sqm > 0),
  status text NOT NULL DEFAULT 'EXPECTED'
    CHECK (status IN ('EXPECTED', 'IN_STORAGE', 'LOADED', 'DELIVERED')),
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id uuid NOT NULL REFERENCES terminals(id) ON DELETE RESTRICT,
  destination_construction_site text NOT NULL,
  total_length_meters numeric(10, 3) NOT NULL DEFAULT 0 CHECK (total_length_meters >= 0),
  total_weight_tons numeric(12, 3) NOT NULL DEFAULT 0 CHECK (total_weight_tons >= 0),
  status text NOT NULL DEFAULT 'ASSEMBLING'
    CHECK (status IN ('ASSEMBLING', 'IN_INSPECTION', 'DISPATCHED', 'DELIVERED')),
  is_order_valid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

/* The existing table has fleet compatibility fields (type_code, capacity_t,
   length_mm, count). These additions make one row capable of representing one
   physically positionable Schwerlastwagen. */
ALTER TABLE wagons ADD COLUMN IF NOT EXISTS uic_wagon_type text;
ALTER TABLE wagons ADD COLUMN IF NOT EXISTS max_payload_tons numeric(10, 3);
ALTER TABLE wagons ADD COLUMN IF NOT EXISTS length_over_buffers_meters numeric(10, 3);
ALTER TABLE wagons ADD COLUMN IF NOT EXISTS current_terminal_id uuid;
ALTER TABLE wagons ADD COLUMN IF NOT EXISTS current_train_id uuid;
ALTER TABLE wagons ADD COLUMN IF NOT EXISTS position_in_train integer;

UPDATE wagons
SET
  uic_wagon_type = COALESCE(uic_wagon_type, type_code),
  max_payload_tons = COALESCE(max_payload_tons, capacity_t),
  length_over_buffers_meters = COALESCE(length_over_buffers_meters, length_mm::numeric / 1000)
WHERE uic_wagon_type IS NULL
   OR max_payload_tons IS NULL
   OR length_over_buffers_meters IS NULL;

ALTER TABLE wagons
  ADD CONSTRAINT wagons_current_terminal_fk
  FOREIGN KEY (current_terminal_id) REFERENCES terminals(id) ON DELETE RESTRICT;

ALTER TABLE wagons
  ADD CONSTRAINT wagons_current_train_fk
  FOREIGN KEY (current_train_id) REFERENCES trains(id) ON DELETE RESTRICT;

ALTER TABLE wagons
  ADD CONSTRAINT wagons_max_payload_tons_check
  CHECK (max_payload_tons IS NULL OR max_payload_tons >= 0);

ALTER TABLE wagons
  ADD CONSTRAINT wagons_length_over_buffers_meters_check
  CHECK (length_over_buffers_meters IS NULL OR length_over_buffers_meters > 0);

ALTER TABLE wagons
  ADD CONSTRAINT wagons_train_position_pair_check
  CHECK (
    (current_train_id IS NULL AND position_in_train IS NULL)
    OR (current_train_id IS NOT NULL AND position_in_train IS NOT NULL AND position_in_train >= 1)
  );

ALTER TABLE wagons
  ADD CONSTRAINT wagons_terminal_train_is_single_wagon_check
  CHECK (current_train_id IS NULL OR count = 1);

CREATE UNIQUE INDEX IF NOT EXISTS wagons_train_position_unique
  ON wagons (current_train_id, position_in_train)
  WHERE current_train_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wagons_terminal_availability_idx
  ON wagons (current_terminal_id, current_train_id)
  WHERE current_terminal_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS wagon_loads (
  wagon_id uuid NOT NULL REFERENCES wagons(id) ON DELETE CASCADE,
  cargo_unit_id uuid NOT NULL UNIQUE REFERENCES cargo_units(id) ON DELETE RESTRICT,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wagon_id, cargo_unit_id)
);

CREATE INDEX IF NOT EXISTS wagon_loads_wagon_idx ON wagon_loads (wagon_id);

/* ASCII identifier avoids encoding and API interoperability problems; the UI
   must render this as “LÜ-Genehmigung erforderlich”. */
CREATE TABLE IF NOT EXISTS train_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  train_id uuid NOT NULL REFERENCES trains(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('LUE_GENEHMIGUNG_ERFORDERLICH')),
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'APPROVED', 'REJECTED', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK ((status IN ('OPEN', 'CANCELLED') AND resolved_at IS NULL) OR (status IN ('APPROVED', 'REJECTED') AND resolved_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS train_events_one_open_lue_per_train
  ON train_events (train_id, event_type)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS trains_terminal_status_idx ON trains (terminal_id, status);
CREATE INDEX IF NOT EXISTS cargo_units_terminal_status_idx ON cargo_units (current_terminal_id, status);
CREATE INDEX IF NOT EXISTS train_events_train_status_idx ON train_events (train_id, status);

-- Single-tenant demo security: follows the existing public CRUD convention.
ALTER TABLE terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE cargo_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE cargo_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE trains ENABLE ROW LEVEL SECURITY;
ALTER TABLE wagon_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE train_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['terminals', 'cargo_types', 'cargo_units', 'trains', 'wagon_loads', 'train_events']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS anon_select_%I ON %I', target_table, target_table);
    EXECUTE format('DROP POLICY IF EXISTS anon_insert_%I ON %I', target_table, target_table);
    EXECUTE format('DROP POLICY IF EXISTS anon_update_%I ON %I', target_table, target_table);
    EXECUTE format('DROP POLICY IF EXISTS anon_delete_%I ON %I', target_table, target_table);
    EXECUTE format('CREATE POLICY anon_select_%I ON %I FOR SELECT TO anon, authenticated USING (true)', target_table, target_table);
    EXECUTE format('CREATE POLICY anon_insert_%I ON %I FOR INSERT TO anon, authenticated WITH CHECK (true)', target_table, target_table);
    EXECUTE format('CREATE POLICY anon_update_%I ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', target_table, target_table);
    EXECUTE format('CREATE POLICY anon_delete_%I ON %I FOR DELETE TO anon, authenticated USING (true)', target_table, target_table);
  END LOOP;
END $$;

COMMENT ON TABLE terminals IS 'Intermodale Schwerlastterminals mit Gleis-, Kran- und Lagerkapazität.';
COMMENT ON TABLE cargo_types IS 'Güterkatalog inklusive LÜ- und Baustellenreihenfolge-Regeln.';
COMMENT ON TABLE cargo_units IS 'Physisch disponierbare Frachtpartien im Terminal.';
COMMENT ON TABLE trains IS 'Baugleis-Zugverbände; Summen und Reihenfolgestatus werden durch die Domain-Validierung geschrieben.';
COMMENT ON TABLE wagon_loads IS 'Beladung eines physischen Terminalwagens; eine Frachtpartie darf nur in einem Wagen liegen.';
COMMENT ON TABLE train_events IS 'Genehmigungsereignisse, insbesondere LÜ-Freigaben vor Abfahrt.';
