/*
# EVU Simulator — Schema & Seed Data

Creates the core tables for a railway transport company (EVU) simulator:
locomotives (Fuhrpark), drivers/personnel (Personal), orders (Aufträge),
and assignments (Disposition).

## Tables

1. `locomotives` — Fleet of locomotives
   - id (uuid PK)
   - designation (text) — e.g. "BR 218"
   - name (text) — friendly name / road number, e.g. "218 312-7"
   - status (text) — one of: 'frei', 'einsatz', 'v1', 'wartung'
   - fuel_type (text) — 'diesel', 'elektrik', 'dual'
   - fuel_level (int) — 0-100 percent
   - brake_pct (int) — brake performance percentage
   - last_service (date)
   - power_kw (int) — power output in kilowatts
   - max_speed (int) — top speed km/h
   - weight_t (int) — weight in tonnes
   - created_at (timestamptz)

2. `drivers` — Personnel / Triebfahrzeugführer
   - id (uuid PK)
   - name (text)
   - status (text) — 'verfuegbar', 'im_einsatz', 'pause', 'urlaub', 'krank'
   - qualifications (text[]) — array of qualifications e.g. ['Tf','Wagenprüfer Stufe 1']
   - hours_worked (numeric) — hours worked in current week
   - max_hours (int) — max weekly hours
   - last_rest_end (timestamptz) — when the last rest period ended
   - shift_start (timestamptz) — current shift start (nullable)
   - phone (text)
   - created_at (timestamptz)

3. `orders` — Order market / Auftragsmarkt
   - id (uuid PK)
   - order_number (text) — human-readable order number
   - type (text) — 'gueterverkehr' or 'baugleis'
   - title (text)
   - origin (text)
   - destination (text)
   - distance_km (int)
   - weight_t (int) — total train weight
   - yield (numeric) — reward in EUR
   - penalty (numeric) — delay penalty per hour in EUR
   - deadline (timestamptz) — delivery deadline
   - status (text) — 'offen', 'zugewiesen', 'abgeschlossen', 'abgelehnt'
   - notes (text)
   - created_at (timestamptz)

4. `assignments` — Dispatch / Disposition (links loco + driver + order)
   - id (uuid PK)
   - order_id (uuid FK -> orders)
   - locomotive_id (uuid FK -> locomotives)
   - driver_id (uuid FK -> drivers)
   - assigned_at (timestamptz default now())
   - status (text) — 'geplant', 'aktiv', 'abgeschlossen', 'abgebrochen'

## Security

- Single-tenant app (no sign-in requested). RLS enabled on all tables.
- Policies allow anon + authenticated full CRUD on all tables (shared demo data).
*/

CREATE TABLE IF NOT EXISTS locomotives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designation text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'frei',
  fuel_type text NOT NULL DEFAULT 'diesel',
  fuel_level int NOT NULL DEFAULT 100,
  brake_pct int NOT NULL DEFAULT 100,
  last_service date,
  power_kw int,
  max_speed int,
  weight_t int,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE locomotives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_locomotives" ON locomotives;
CREATE POLICY "anon_select_locomotives" ON locomotives FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_locomotives" ON locomotives;
CREATE POLICY "anon_insert_locomotives" ON locomotives FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_locomotives" ON locomotives;
CREATE POLICY "anon_update_locomotives" ON locomotives FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_locomotives" ON locomotives;
CREATE POLICY "anon_delete_locomotives" ON locomotives FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'verfuegbar',
  qualifications text[] NOT NULL DEFAULT '{}',
  hours_worked numeric NOT NULL DEFAULT 0,
  max_hours int NOT NULL DEFAULT 48,
  last_rest_end timestamptz DEFAULT now(),
  shift_start timestamptz,
  phone text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_drivers" ON drivers;
CREATE POLICY "anon_select_drivers" ON drivers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_drivers" ON drivers;
CREATE POLICY "anon_insert_drivers" ON drivers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_drivers" ON drivers;
CREATE POLICY "anon_update_drivers" ON drivers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_drivers" ON drivers;
CREATE POLICY "anon_delete_drivers" ON drivers FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  type text NOT NULL DEFAULT 'gueterverkehr',
  title text NOT NULL,
  origin text NOT NULL,
  destination text NOT NULL,
  distance_km int NOT NULL DEFAULT 0,
  weight_t int NOT NULL DEFAULT 0,
  yield numeric NOT NULL DEFAULT 0,
  penalty numeric NOT NULL DEFAULT 0,
  deadline timestamptz,
  status text NOT NULL DEFAULT 'offen',
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "anon_update_orders" ON orders FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "anon_delete_orders" ON orders FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  locomotive_id uuid NOT NULL REFERENCES locomotives(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'geplant'
);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_assignments" ON assignments;
CREATE POLICY "anon_select_assignments" ON assignments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_assignments" ON assignments;
CREATE POLICY "anon_insert_assignments" ON assignments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_assignments" ON assignments;
CREATE POLICY "anon_update_assignments" ON assignments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_assignments" ON assignments;
CREATE POLICY "anon_delete_assignments" ON assignments FOR DELETE
  TO anon, authenticated USING (true);

-- Seed locomotives
INSERT INTO locomotives (designation, name, status, fuel_type, fuel_level, brake_pct, last_service, power_kw, max_speed, weight_t) VALUES
  ('BR 218', '218 312-7', 'frei', 'diesel', 78, 92, '2026-07-15', 1840, 140, 80),
  ('BR 218', '218 389-3', 'einsatz', 'diesel', 64, 88, '2026-06-28', 1840, 140, 80),
  ('BR 218', '218 456-1', 'wartung', 'diesel', 15, 95, '2026-08-20', 1840, 140, 80),
  ('BR 272', '272 001-2', 'v1', 'elektrik', 100, 96, '2026-07-30', 2000, 120, 90),
  ('BR 272', '272 014-8', 'einsatz', 'elektrik', 88, 90, '2026-08-02', 2000, 120, 90),
  ('BR 193 (MS-E)', '193 281-0', 'frei', 'elektrik', 92, 94, '2026-07-22', 6400, 200, 85),
  ('BR 193 (MS-E)', '193 305-8', 'einsatz', 'elektrik', 71, 91, '2026-08-05', 6400, 200, 85),
  ('BR 193 (MS-E)', '193 342-1', 'v1', 'elektrik', 100, 93, '2026-07-18', 6400, 200, 85)
ON CONFLICT DO NOTHING;

-- Seed drivers
INSERT INTO drivers (name, status, qualifications, hours_worked, max_hours, last_rest_end, shift_start, phone) VALUES
  ('Markus Bergmann', 'verfuegbar', ARRAY['Tf', 'Wagenprüfer Stufe 1', 'Wagenprüfer Stufe 2'], 34, 48, now() - interval '10 hours', NULL, '+49 151 2233445'),
  ('Stefan Kohler', 'im_einsatz', ARRAY['Tf', 'Wagenprüfer Stufe 3'], 41, 48, now() - interval '5 hours', now() - interval '3 hours', '+49 160 7788990'),
  ('Andreas Fischer', 'verfuegbar', ARRAY['Tf'], 18, 48, now() - interval '14 hours', NULL, '+49 176 3344556'),
  ('Thomas Wagner', 'pause', ARRAY['Tf', 'Wagenprüfer Stufe 1'], 28, 48, now() - interval '2 hours', NULL, '+49 152 6677889'),
  ('Jürgen Hoffmann', 'verfuegbar', ARRAY['Tf', 'Wagenprüfer Stufe 2'], 12, 48, now() - interval '16 hours', NULL, '+49 170 4455667'),
  ('Peter Schneider', 'im_einsatz', ARRAY['Tf'], 39, 48, now() - interval '6 hours', now() - interval '4 hours', '+49 159 1122334'),
  ('Klaus Bauer', 'krank', ARRAY['Tf', 'Wagenprüfer Stufe 3'], 0, 48, now() - interval '1 day', NULL, '+49 173 8899001'),
  ('Michael Richter', 'verfuegbar', ARRAY['Tf', 'Wagenprüfer Stufe 1'], 22, 48, now() - interval '12 hours', NULL, '+49 165 2233114')
ON CONFLICT DO NOTHING;

-- Seed orders
INSERT INTO orders (order_number, type, title, origin, destination, distance_km, weight_t, yield, penalty, deadline, status, notes) VALUES
  ('EVU-2026-001', 'gueterverkehr', 'Holztransport Bayreuth–Regensburg', 'Bayreuth', 'Regensburg', 120, 800, 18500, 250, now() + interval '2 days', 'offen', 'Sägegut, 15 Wagen'),
  ('EVU-2026-002', 'gueterverkehr', 'Containerzug Hamburg–München', 'Hamburg Hbf', 'München Nord', 790, 1400, 52000, 800, now() + interval '3 days', 'offen', 'Intermodal, 25 Wagen'),
  ('EVU-2026-003', 'baugleis', 'Schottertransport Baustelle Nürnberg–Ingolstadt', 'Nürnberg Hbf', 'Baugleis Ingolstadt', 95, 1200, 42000, 5000, now() + interval '1 day', 'offen', 'ZEITKRITISCH! Gleisbau ABS 9, Sperrfrist bis 20:00'),
  ('EVU-2026-004', 'gueterverkehr', 'Stahlcoils Salzgitter–Stuttgart', 'Salzgitter', 'Stuttgart-Untertürkheim', 510, 1000, 31000, 450, now() + interval '4 days', 'offen', 'Schwertransport, 12 Wagen'),
  ('EVU-2026-005', 'baugleis', 'Oberleitungsmaterial Würzburg–Baugleis Fulda', 'Würzburg Hbf', 'Baugleis Fulda', 110, 600, 38000, 4500, now() + interval '1 day', 'offen', 'ZEITKRITISCH! Oberleitungsneubau, Sperrfrist eng'),
  ('EVU-2026-006', 'gueterverkehr', 'Getreidetransport Passau–Augsburg', 'Passau', 'Augsburg', 230, 900, 16000, 200, now() + interval '2 days', 'offen', 'Losschüttgut, 18 Wagen'),
  ('EVU-2026-007', 'baugleis', 'Schwellen delivery Baustelle Leipzig–Halle', 'Leipzig Hbf', 'Baugleis Halle', 35, 700, 28500, 3200, now() + interval '18 hours', 'offen', 'ZEITKRITISCH! Schwellenersatz, enge Sperrfrist'),
  ('EVU-2026-008', 'gueterverkehr', 'Kohletransport Köln–Saarbrücken', 'Köln Eifeltor', 'Saarbrücken', 280, 1300, 24000, 350, now() + interval '5 days', 'offen', 'Schüttgut, 20 Wagen')
ON CONFLICT DO NOTHING;
