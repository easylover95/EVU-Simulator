/*
# EVU Optimierungen — BR 272 Korrektur, Waggonpark, Baugleis-Erweiterungen

## Änderungen

1. BR 272 Korrektur:
   - fuel_type von 'elektrik' auf 'diesel' für alle BR 272 Lokomotiven
   - power_kw von 2000 auf 1500 kW für alle BR 272 Lokomotiven

2. orders-Tabelle — Neue Spalten für Baugleis-Logik:
   - min_brh (int) — Mindest-Bremshundertstel für den Auftrag
   - required_wagon_type (text) — Erforderlicher Wagentyp für Baugleis (z.B. 'Fccpps')
   - required_wagon_count (int) — Anzahl der erforderlichen Wagen
   - sperrpause_start (text) — Sperrpausenfenster Startzeit (z.B. "22:00")
   - sperrpause_end (text) — Sperrpausenfenster Ende (z.B. "04:00")
   - penalty_per_min (numeric) — Pönale pro Minute Verspätung (für Baugleis)

3. Neue Tabelle `wagons` — Wagenpark:
   - id (uuid PK)
   - type_code (text) — UIC-Kennung, z.B. "Fccpps", "Res", "Sggmrss"
   - type_name (text) — Bezeichnung, z.B. "Schotterwagen", "Flachwagen"
   - category (text) — 'schotter', 'flach', 'container', 'kessel'
   - capacity_t (int) — Ladekapazität in Tonnen
   - brake_position (text) — Bremsstellung: 'G', 'P', 'R'
   - tare_weight_t (int) — Eigengewicht in Tonnen
   - length_mm (int) — Länge über Puffer in mm
   - status (text) — 'verfuegbar', 'im_einsatz', 'wartung', 'frist_abgelaufen'
   - frist_level (int) — Nächste erforderliche Wagenprüfer-Stufe (1, 2 oder 3)
   - frist_date (date) — Fristablaufdatum
   - count (int) — Anzahl verfügbarer Wagen dieses Typs im Bestand
   - created_at (timestamptz)

4. Bestehende Baugleis-Aufträge mit Sperrpausen-Daten und Wagentyp-Anforderungen aktualisiert.

## Security
- wagons: RLS aktiviert, anon+authenticated CRUD (single-tenant)
*/

-- 1. BR 272 Korrektur
UPDATE locomotives SET fuel_type = 'diesel', power_kw = 1500 WHERE designation = 'BR 272';

-- 2. Neue Spalten auf orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS min_brh int DEFAULT 80;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS required_wagon_type text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS required_wagon_count int;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sperrpause_start text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sperrpause_end text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS penalty_per_min numeric DEFAULT 0;

-- 3. Baugleis-Aufträge mit Sperrpausen- und Wagentyp-Daten aktualisieren
UPDATE orders SET
  min_brh = 110,
  required_wagon_type = 'Fccpps',
  required_wagon_count = 12,
  sperrpause_start = '22:00',
  sperrpause_end = '04:00',
  penalty_per_min = 150
WHERE order_number = 'EVU-2026-003';

UPDATE orders SET
  min_brh = 105,
  required_wagon_type = 'Res',
  required_wagon_count = 8,
  sperrpause_start = '23:00',
  sperrpause_end = '05:00',
  penalty_per_min = 120
WHERE order_number = 'EVU-2026-005';

UPDATE orders SET
  min_brh = 100,
  required_wagon_type = 'Rns',
  required_wagon_count = 10,
  sperrpause_start = '20:00',
  sperrpause_end = '03:00',
  penalty_per_min = 180
WHERE order_number = 'EVU-2026-007';

-- Güterverkehr-Aufträge: min_brh setzen, keine Sperrpause
UPDATE orders SET min_brh = 80 WHERE order_number = 'EVU-2026-001';
UPDATE orders SET min_brh = 90 WHERE order_number = 'EVU-2026-002';
UPDATE orders SET min_brh = 85 WHERE order_number = 'EVU-2026-004';
UPDATE orders SET min_brh = 75 WHERE order_number = 'EVU-2026-006';
UPDATE orders SET min_brh = 82 WHERE order_number = 'EVU-2026-008';

-- 4. Waggonpark-Tabelle
CREATE TABLE IF NOT EXISTS wagons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_code text NOT NULL,
  type_name text NOT NULL,
  category text NOT NULL,
  capacity_t int NOT NULL DEFAULT 0,
  brake_position text NOT NULL DEFAULT 'G',
  tare_weight_t int NOT NULL DEFAULT 0,
  length_mm int,
  status text NOT NULL DEFAULT 'verfuegbar',
  frist_level int NOT NULL DEFAULT 1,
  frist_date date,
  count int NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE wagons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_wagons" ON wagons;
CREATE POLICY "anon_select_wagons" ON wagons FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_wagons" ON wagons;
CREATE POLICY "anon_insert_wagons" ON wagons FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_wagons" ON wagons;
CREATE POLICY "anon_update_wagons" ON wagons FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_wagons" ON wagons;
CREATE POLICY "anon_delete_wagons" ON wagons FOR DELETE
  TO anon, authenticated USING (true);

-- Seed Wagons
INSERT INTO wagons (type_code, type_name, category, capacity_t, brake_position, tare_weight_t, length_mm, status, frist_level, frist_date, count) VALUES
  ('Fccpps', 'Schotterwagen', 'schotter', 65, 'G', 22, 12000, 'verfuegbar', 2, '2026-11-15', 18),
  ('Fccpps', 'Schotterwagen', 'schotter', 65, 'G', 22, 12000, 'im_einsatz', 2, '2026-10-20', 6),
  ('Fccpps', 'Schotterwagen', 'schotter', 65, 'G', 22, 12000, 'frist_abgelaufen', 3, '2026-06-01', 4),
  ('Res', 'Flachwagen (Schienen)', 'flach', 60, 'P', 19, 19000, 'verfuegbar', 1, '2027-01-10', 12),
  ('Res', 'Flachwagen (Schienen)', 'flach', 60, 'P', 19, 19000, 'wartung', 2, '2026-08-15', 3),
  ('Rns', 'Flachwagen (Schwellen)', 'flach', 55, 'P', 18, 15000, 'verfuegbar', 1, '2026-12-05', 14),
  ('Rns', 'Flachwagen (Schwellen)', 'flach', 55, 'P', 18, 15000, 'im_einsatz', 1, '2026-11-30', 4),
  ('Sggmrss', 'Containertragwagen', 'container', 90, 'R', 17, 20000, 'verfuegbar', 1, '2027-02-20', 22),
  ('Sggmrss', 'Containertragwagen', 'container', 90, 'R', 17, 20000, 'verfuegbar', 2, '2026-09-10', 8),
  ('Sggmrss', 'Containertragwagen', 'container', 90, 'R', 17, 20000, 'wartung', 1, '2026-07-01', 2),
  ('Zans', 'Kesselwagen', 'kessel', 48, 'G', 24, 14000, 'verfuegbar', 2, '2026-12-12', 10),
  ('Zans', 'Kesselwagen', 'kessel', 48, 'G', 24, 14000, 'frist_abgelaufen', 3, '2026-05-15', 3)
ON CONFLICT DO NOTHING;
