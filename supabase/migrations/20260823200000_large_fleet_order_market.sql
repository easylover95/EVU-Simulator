/*
# Large fleet, personnel, order market

Replaces the small starter kit when no assignments exist (same guard as before).
If the player is already running (assignments present), upserts missing known IDs
and clamps min_brh / wagon type labels without wiping progress.

Seed:
- 8 locomotives: 3× BR 218, 2× G 2000 BB (BR 272), 3× BR 193
- 35 wagons grouped: Res 10, Facns 14, Sggrss 7, Zans 4
- 8 named Triebfahrzeugführer
- 8 German orders (min_brh Güterverkehr 60–75, Baustelle 50–65)
- 2 matching active assignments for the two Tf im Einsatz
*/

ALTER TABLE orders ALTER COLUMN min_brh SET DEFAULT 65;

UPDATE orders
SET min_brh = LEAST(75, GREATEST(60, COALESCE(min_brh, 65)))
WHERE type = 'gueterverkehr';

UPDATE orders
SET min_brh = LEAST(65, GREATEST(50, COALESCE(min_brh, 55)))
WHERE type = 'baugleis';

UPDATE wagons
SET type_code = 'Facns', type_name = 'Schüttgutwagen'
WHERE type_code IN ('Fccpps', 'Facns');

UPDATE wagons
SET type_code = 'Sggrss', type_name = 'Containertragwagen'
WHERE type_code IN ('Sggmrss', 'Sggmrs');

UPDATE orders SET required_wagon_type = 'Facns' WHERE required_wagon_type IN ('Fccpps', 'Facns');
UPDATE orders SET required_wagon_type = 'Sggrss' WHERE required_wagon_type IN ('Sggmrss', 'Sggmrs');

UPDATE orders SET min_brh = 65, required_wagon_type = 'Res', required_wagon_count = 8 WHERE order_number = 'EVU-2026-001';
UPDATE orders SET min_brh = 72, required_wagon_type = 'Sggrss', required_wagon_count = 6 WHERE order_number = 'EVU-2026-002';
UPDATE orders SET min_brh = 55, required_wagon_type = 'Facns', required_wagon_count = 12,
  sperrpause_start = COALESCE(sperrpause_start, '22:00'),
  sperrpause_end = COALESCE(sperrpause_end, '04:00'),
  penalty_per_min = CASE WHEN penalty_per_min IS NULL OR penalty_per_min = 0 THEN 150 ELSE penalty_per_min END
WHERE order_number = 'EVU-2026-003';
UPDATE orders SET min_brh = 68, required_wagon_type = 'Res', required_wagon_count = 8 WHERE order_number = 'EVU-2026-004';
UPDATE orders SET min_brh = 58, required_wagon_type = 'Res', required_wagon_count = 8,
  sperrpause_start = COALESCE(sperrpause_start, '23:00'),
  sperrpause_end = COALESCE(sperrpause_end, '05:00'),
  penalty_per_min = CASE WHEN penalty_per_min IS NULL OR penalty_per_min = 0 THEN 120 ELSE penalty_per_min END
WHERE order_number = 'EVU-2026-005';
UPDATE orders SET min_brh = 62, required_wagon_type = 'Facns', required_wagon_count = 10 WHERE order_number = 'EVU-2026-006';
UPDATE orders SET min_brh = 62, required_wagon_type = 'Res', required_wagon_count = 6,
  sperrpause_start = COALESCE(sperrpause_start, '20:00'),
  sperrpause_end = COALESCE(sperrpause_end, '03:00'),
  penalty_per_min = CASE WHEN penalty_per_min IS NULL OR penalty_per_min = 0 THEN 180 ELSE penalty_per_min END
WHERE order_number = 'EVU-2026-007';
UPDATE orders SET min_brh = 74, required_wagon_type = 'Zans', required_wagon_count = 3 WHERE order_number = 'EVU-2026-008';

DO $$
DECLARE
  epoch timestamptz := TIMESTAMPTZ '2026-08-20 06:00:00+02';
BEGIN
  IF EXISTS (SELECT 1 FROM assignments) THEN
    RAISE NOTICE 'Assignments exist — inserting missing seed rows only';

    INSERT INTO locomotives (
      id, designation, name, status, fuel_type, fuel_level, brake_pct,
      last_service, power_kw, max_speed, weight_t
    ) VALUES
      ('a18e0218-0000-4000-8000-000000000218', 'BR 218', '218 312-7', 'frei', 'diesel', 100, 100, '2026-07-15', 1840, 140, 80),
      ('a18e0218-0000-4000-8000-000000000219', 'BR 218', '218 389-3', 'einsatz', 'diesel', 100, 100, '2026-06-28', 1840, 140, 80),
      ('a18e0218-0000-4000-8000-000000000220', 'BR 218', '218 456-1', 'wartung', 'diesel', 100, 100, '2026-08-20', 1840, 140, 80),
      ('a18e0272-0000-4000-8000-000000000272', 'BR 272', '272 001-2', 'frei', 'diesel', 100, 100, '2026-07-30', 2240, 120, 90),
      ('a18e0272-0000-4000-8000-000000000273', 'BR 272', '272 014-8', 'einsatz', 'diesel', 100, 100, '2026-08-02', 2240, 120, 90),
      ('a18e0193-0000-4000-8000-000000000193', 'BR 248 Dual Mode', '193 281-0', 'frei', 'dual', 100, 100, '2026-07-22', 2400, 160, 90),
      ('a18e0193-0000-4000-8000-000000000194', 'BR 193 (MS-E)', '193 305-8', 'frei', 'elektrik', 100, 100, '2026-08-05', 6400, 200, 85),
      ('a18e0193-0000-4000-8000-000000000195', 'BR 248 Dual Mode', '193 342-1', 'wartung', 'dual', 100, 100, '2026-07-18', 2400, 160, 90)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO drivers (
      id, name, status, qualifications, hours_worked, max_hours,
      last_rest_end, shift_start, phone, recovery_hours_left
    ) VALUES
      ('a18e0101-0000-4000-8000-000000000101', 'Andreas Fischer', 'verfuegbar', ARRAY['Tf', 'Wagenprüfer Stufe 2'], 18, 48, epoch - interval '15 hours', NULL, '+49 176 3344556', NULL),
      ('a18e0102-0000-4000-8000-000000000102', 'Jürgen Hoffmann', 'verfuegbar', ARRAY['Tf', 'Wagenprüfer Stufe 2'], 12, 48, epoch - interval '17 hours', NULL, '+49 170 4455667', NULL),
      ('a18e0103-0000-4000-8000-000000000103', 'Klaus Bauer', 'krank', ARRAY['Tf', 'Wagenprüfer Stufe 3'], 0, 48, epoch - interval '12 hours', NULL, '+49 171 8899001', 12),
      ('a18e0104-0000-4000-8000-000000000104', 'Markus Bergmann', 'verfuegbar', ARRAY['Tf', 'Wagenprüfer Stufe 1', 'Wagenprüfer Stufe 2'], 34, 48, epoch - interval '11 hours', NULL, '+49 151 2233445', NULL),
      ('a18e0105-0000-4000-8000-000000000105', 'Michael Richter', 'verfuegbar', ARRAY['Tf', 'Wagenprüfer Stufe 1'], 22, 48, epoch - interval '13 hours', NULL, '+49 165 2233114', NULL),
      ('a18e0106-0000-4000-8000-000000000106', 'Peter Schneider', 'im_einsatz', ARRAY['Tf', 'Wagenprüfer Stufe 1'], 39, 48, epoch - interval '7 hours', epoch - interval '5 hours', '+49 159 1122334', NULL),
      ('a18e0107-0000-4000-8000-000000000107', 'Stefan Kohler', 'im_einsatz', ARRAY['Tf', 'Wagenprüfer Stufe 3'], 41, 48, epoch - interval '8 hours', epoch - interval '4 hours', '+49 160 7738890', NULL),
      ('a18e0108-0000-4000-8000-000000000108', 'Thomas Wagner', 'pause', ARRAY['Tf', 'Wagenprüfer Stufe 1'], 28, 48, epoch - interval '5 hours', NULL, '+49 152 6677669', NULL)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO wagons (
      id, type_code, type_name, category, capacity_t, brake_position,
      tare_weight_t, length_mm, status, frist_level, frist_date, count
    ) VALUES
      ('a18e0301-0000-4000-8000-000000000301', 'Res', 'Flachwagen', 'flach', 60, 'P', 19, 19000, 'verfuegbar', 1, '2027-02-23', 8),
      ('a18e0303-0000-4000-8000-000000000303', 'Res', 'Flachwagen', 'flach', 60, 'P', 19, 19000, 'wartung', 2, '2026-08-15', 2),
      ('a18e0302-0000-4000-8000-000000000302', 'Facns', 'Schüttgutwagen', 'schotter', 70, 'G', 24, 15500, 'verfuegbar', 1, '2027-02-23', 12),
      ('a18e0304-0000-4000-8000-000000000304', 'Facns', 'Schüttgutwagen', 'schotter', 70, 'G', 24, 15500, 'frist_abgelaufen', 3, '2026-06-01', 2),
      ('a18e0305-0000-4000-8000-000000000305', 'Sggrss', 'Containertragwagen', 'container', 90, 'R', 17, 20000, 'verfuegbar', 1, '2027-02-20', 6),
      ('a18e0306-0000-4000-8000-000000000306', 'Sggrss', 'Containertragwagen', 'container', 90, 'R', 17, 20000, 'wartung', 1, '2026-07-01', 1),
      ('a18e0307-0000-4000-8000-000000000307', 'Zans', 'Kesselwagen', 'kessel', 48, 'G', 24, 14000, 'verfuegbar', 2, '2026-12-12', 3),
      ('a18e0308-0000-4000-8000-000000000308', 'Zans', 'Kesselwagen', 'kessel', 48, 'G', 24, 14000, 'frist_abgelaufen', 3, '2026-05-15', 1)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO orders (
      id, order_number, type, title, origin, destination, distance_km, weight_t,
      yield, penalty, deadline, status, notes, min_brh, required_wagon_type,
      required_wagon_count, sperrpause_start, sperrpause_end, penalty_per_min
    )
    SELECT * FROM (VALUES
      ('a18e0501-0000-4000-8000-000000000501'::uuid, 'EVU-2026-001', 'gueterverkehr', 'Holztransport Bayreuth–Regensburg', 'Bayreuth', 'Regensburg', 120, 800, 18500::numeric, 250::numeric, epoch + interval '48 hours', 'offen', 'Schnittholz auf Res-Flachwagen, 8 Wagen, Strecke nicht elektrifiziert.', 65, 'Res', 8, NULL, NULL, 0::numeric),
      ('a18e0502-0000-4000-8000-000000000502'::uuid, 'EVU-2026-002', 'gueterverkehr', 'Containerzug Hamburg–München', 'Hamburg Billwerder', 'München-Riem', 790, 1400, 52000::numeric, 800::numeric, epoch + interval '72 hours', 'zugewiesen', 'Intermodal 6× Sggrss, elektrifizierte Magistrale Hamburg–München.', 72, 'Sggrss', 6, NULL, NULL, 0::numeric),
      ('a18e0503-0000-4000-8000-000000000503'::uuid, 'EVU-2026-003', 'baugleis', 'Schottertransport Baustelle Nürnberg–Ingolstadt', 'Nürnberg Rbf', 'Baugleis Ingolstadt', 95, 1200, 42000::numeric, 5000::numeric, epoch + interval '24 hours', 'zugewiesen', 'ZEITKRITISCH! Gleisbau ABS 9, 12× Facns, Sperrpause 22:00–04:00 Uhr.', 55, 'Facns', 12, '22:00', '04:00', 150::numeric),
      ('a18e0504-0000-4000-8000-000000000504'::uuid, 'EVU-2026-004', 'gueterverkehr', 'Stahlcoils Salzgitter–Stuttgart', 'Salzgitter', 'Stuttgart-Untertürkheim', 510, 1000, 31000::numeric, 450::numeric, epoch + interval '96 hours', 'offen', 'Schwertransport Coils, 8× Res, Achslast beachten.', 68, 'Res', 8, NULL, NULL, 0::numeric),
      ('a18e0505-0000-4000-8000-000000000505'::uuid, 'EVU-2026-005', 'baugleis', 'Oberleitungsmaterial Würzburg–Baugleis Fulda', 'Würzburg Hbf', 'Baugleis Fulda', 110, 600, 38000::numeric, 4500::numeric, epoch + interval '30 hours', 'offen', 'ZEITKRITISCH! Oberleitungsneubau, 8× Res, Sperrpause 23:00–05:00 Uhr.', 58, 'Res', 8, '23:00', '05:00', 120::numeric),
      ('a18e0506-0000-4000-8000-000000000506'::uuid, 'EVU-2026-006', 'gueterverkehr', 'Getreidetransport Passau–Augsburg', 'Passau', 'Augsburg', 230, 900, 16000::numeric, 200::numeric, epoch + interval '48 hours', 'offen', 'Losschüttgut Getreide, 10× Facns.', 62, 'Facns', 10, NULL, NULL, 0::numeric),
      ('a18e0507-0000-4000-8000-000000000507'::uuid, 'EVU-2026-007', 'baugleis', 'Schwellenlieferung Baustelle Leipzig–Halle', 'Leipzig Hbf', 'Baugleis Halle', 35, 700, 28500::numeric, 3200::numeric, epoch + interval '18 hours', 'offen', 'ZEITKRITISCH! Schwellenersatz, 6× Res, Sperrpause 20:00–03:00 Uhr.', 62, 'Res', 6, '20:00', '03:00', 180::numeric),
      ('a18e0508-0000-4000-8000-000000000508'::uuid, 'EVU-2026-008', 'gueterverkehr', 'Kesselwagen Chemie Ludwigshafen–Köln', 'Ludwigshafen Chemiepark', 'Köln-Niehl', 280, 600, 24000::numeric, 350::numeric, epoch - interval '12 hours', 'abgeschlossen', 'Gefahrgut Zans, 3 Wagen, bereits abgewickelt.', 74, 'Zans', 3, NULL, NULL, 0::numeric)
    ) AS v(id, order_number, type, title, origin, destination, distance_km, weight_t, yield, penalty, deadline, status, notes, min_brh, required_wagon_type, required_wagon_count, sperrpause_start, sperrpause_end, penalty_per_min)
    WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.order_number = v.order_number);

    RETURN;
  END IF;

  DELETE FROM assignments;
  DELETE FROM locomotives;
  DELETE FROM drivers;
  DELETE FROM wagons;
  DELETE FROM orders;

  INSERT INTO locomotives (
    id, designation, name, status, fuel_type, fuel_level, brake_pct,
    last_service, power_kw, max_speed, weight_t
  ) VALUES
    ('a18e0218-0000-4000-8000-000000000218', 'BR 218', '218 312-7', 'frei', 'diesel', 100, 100, '2026-07-15', 1840, 140, 80),
    ('a18e0218-0000-4000-8000-000000000219', 'BR 218', '218 389-3', 'einsatz', 'diesel', 100, 100, '2026-06-28', 1840, 140, 80),
    ('a18e0218-0000-4000-8000-000000000220', 'BR 218', '218 456-1', 'wartung', 'diesel', 100, 100, '2026-08-20', 1840, 140, 80),
    ('a18e0272-0000-4000-8000-000000000272', 'BR 272', '272 001-2', 'frei', 'diesel', 100, 100, '2026-07-30', 2240, 120, 90),
    ('a18e0272-0000-4000-8000-000000000273', 'BR 272', '272 014-8', 'einsatz', 'diesel', 100, 100, '2026-08-02', 2240, 120, 90),
    ('a18e0193-0000-4000-8000-000000000193', 'BR 248 Dual Mode', '193 281-0', 'frei', 'dual', 100, 100, '2026-07-22', 2400, 160, 90),
    ('a18e0193-0000-4000-8000-000000000194', 'BR 193 (MS-E)', '193 305-8', 'frei', 'elektrik', 100, 100, '2026-08-05', 6400, 200, 85),
    ('a18e0193-0000-4000-8000-000000000195', 'BR 248 Dual Mode', '193 342-1', 'wartung', 'dual', 100, 100, '2026-07-18', 2400, 160, 90);

  INSERT INTO drivers (
    id, name, status, qualifications, hours_worked, max_hours,
    last_rest_end, shift_start, phone, recovery_hours_left
  ) VALUES
    ('a18e0101-0000-4000-8000-000000000101', 'Andreas Fischer', 'verfuegbar', ARRAY['Tf', 'Wagenprüfer Stufe 2'], 18, 48, epoch - interval '15 hours', NULL, '+49 176 3344556', NULL),
    ('a18e0102-0000-4000-8000-000000000102', 'Jürgen Hoffmann', 'verfuegbar', ARRAY['Tf', 'Wagenprüfer Stufe 2'], 12, 48, epoch - interval '17 hours', NULL, '+49 170 4455667', NULL),
    ('a18e0103-0000-4000-8000-000000000103', 'Klaus Bauer', 'krank', ARRAY['Tf', 'Wagenprüfer Stufe 3'], 0, 48, epoch - interval '12 hours', NULL, '+49 171 8899001', 12),
    ('a18e0104-0000-4000-8000-000000000104', 'Markus Bergmann', 'verfuegbar', ARRAY['Tf', 'Wagenprüfer Stufe 1', 'Wagenprüfer Stufe 2'], 34, 48, epoch - interval '11 hours', NULL, '+49 151 2233445', NULL),
    ('a18e0105-0000-4000-8000-000000000105', 'Michael Richter', 'verfuegbar', ARRAY['Tf', 'Wagenprüfer Stufe 1'], 22, 48, epoch - interval '13 hours', NULL, '+49 165 2233114', NULL),
    ('a18e0106-0000-4000-8000-000000000106', 'Peter Schneider', 'im_einsatz', ARRAY['Tf', 'Wagenprüfer Stufe 1'], 39, 48, epoch - interval '7 hours', epoch - interval '5 hours', '+49 159 1122334', NULL),
    ('a18e0107-0000-4000-8000-000000000107', 'Stefan Kohler', 'im_einsatz', ARRAY['Tf', 'Wagenprüfer Stufe 3'], 41, 48, epoch - interval '8 hours', epoch - interval '4 hours', '+49 160 7738890', NULL),
    ('a18e0108-0000-4000-8000-000000000108', 'Thomas Wagner', 'pause', ARRAY['Tf', 'Wagenprüfer Stufe 1'], 28, 48, epoch - interval '5 hours', NULL, '+49 152 6677669', NULL);

  INSERT INTO wagons (
    id, type_code, type_name, category, capacity_t, brake_position,
    tare_weight_t, length_mm, status, frist_level, frist_date, count
  ) VALUES
    ('a18e0301-0000-4000-8000-000000000301', 'Res', 'Flachwagen', 'flach', 60, 'P', 19, 19000, 'verfuegbar', 1, '2027-02-23', 8),
    ('a18e0303-0000-4000-8000-000000000303', 'Res', 'Flachwagen', 'flach', 60, 'P', 19, 19000, 'wartung', 2, '2026-08-15', 2),
    ('a18e0302-0000-4000-8000-000000000302', 'Facns', 'Schüttgutwagen', 'schotter', 70, 'G', 24, 15500, 'verfuegbar', 1, '2027-02-23', 12),
    ('a18e0304-0000-4000-8000-000000000304', 'Facns', 'Schüttgutwagen', 'schotter', 70, 'G', 24, 15500, 'frist_abgelaufen', 3, '2026-06-01', 2),
    ('a18e0305-0000-4000-8000-000000000305', 'Sggrss', 'Containertragwagen', 'container', 90, 'R', 17, 20000, 'verfuegbar', 1, '2027-02-20', 6),
    ('a18e0306-0000-4000-8000-000000000306', 'Sggrss', 'Containertragwagen', 'container', 90, 'R', 17, 20000, 'wartung', 1, '2026-07-01', 1),
    ('a18e0307-0000-4000-8000-000000000307', 'Zans', 'Kesselwagen', 'kessel', 48, 'G', 24, 14000, 'verfuegbar', 2, '2026-12-12', 3),
    ('a18e0308-0000-4000-8000-000000000308', 'Zans', 'Kesselwagen', 'kessel', 48, 'G', 24, 14000, 'frist_abgelaufen', 3, '2026-05-15', 1);

  INSERT INTO orders (
    id, order_number, type, title, origin, destination, distance_km, weight_t,
    yield, penalty, deadline, status, notes, min_brh, required_wagon_type,
    required_wagon_count, sperrpause_start, sperrpause_end, penalty_per_min
  ) VALUES
    ('a18e0501-0000-4000-8000-000000000501', 'EVU-2026-001', 'gueterverkehr', 'Holztransport Bayreuth–Regensburg', 'Bayreuth', 'Regensburg', 120, 800, 18500, 250, epoch + interval '48 hours', 'offen', 'Schnittholz auf Res-Flachwagen, 8 Wagen, Strecke nicht elektrifiziert.', 65, 'Res', 8, NULL, NULL, 0),
    ('a18e0502-0000-4000-8000-000000000502', 'EVU-2026-002', 'gueterverkehr', 'Containerzug Hamburg–München', 'Hamburg Billwerder', 'München-Riem', 790, 1400, 52000, 800, epoch + interval '72 hours', 'zugewiesen', 'Intermodal 6× Sggrss, elektrifizierte Magistrale Hamburg–München.', 72, 'Sggrss', 6, NULL, NULL, 0),
    ('a18e0503-0000-4000-8000-000000000503', 'EVU-2026-003', 'baugleis', 'Schottertransport Baustelle Nürnberg–Ingolstadt', 'Nürnberg Rbf', 'Baugleis Ingolstadt', 95, 1200, 42000, 5000, epoch + interval '24 hours', 'zugewiesen', 'ZEITKRITISCH! Gleisbau ABS 9, 12× Facns, Sperrpause 22:00–04:00 Uhr.', 55, 'Facns', 12, '22:00', '04:00', 150),
    ('a18e0504-0000-4000-8000-000000000504', 'EVU-2026-004', 'gueterverkehr', 'Stahlcoils Salzgitter–Stuttgart', 'Salzgitter', 'Stuttgart-Untertürkheim', 510, 1000, 31000, 450, epoch + interval '96 hours', 'offen', 'Schwertransport Coils, 8× Res, Achslast beachten.', 68, 'Res', 8, NULL, NULL, 0),
    ('a18e0505-0000-4000-8000-000000000505', 'EVU-2026-005', 'baugleis', 'Oberleitungsmaterial Würzburg–Baugleis Fulda', 'Würzburg Hbf', 'Baugleis Fulda', 110, 600, 38000, 4500, epoch + interval '30 hours', 'offen', 'ZEITKRITISCH! Oberleitungsneubau, 8× Res, Sperrpause 23:00–05:00 Uhr.', 58, 'Res', 8, '23:00', '05:00', 120),
    ('a18e0506-0000-4000-8000-000000000506', 'EVU-2026-006', 'gueterverkehr', 'Getreidetransport Passau–Augsburg', 'Passau', 'Augsburg', 230, 900, 16000, 200, epoch + interval '48 hours', 'offen', 'Losschüttgut Getreide, 10× Facns.', 62, 'Facns', 10, NULL, NULL, 0),
    ('a18e0507-0000-4000-8000-000000000507', 'EVU-2026-007', 'baugleis', 'Schwellenlieferung Baustelle Leipzig–Halle', 'Leipzig Hbf', 'Baugleis Halle', 35, 700, 28500, 3200, epoch + interval '18 hours', 'offen', 'ZEITKRITISCH! Schwellenersatz, 6× Res, Sperrpause 20:00–03:00 Uhr.', 62, 'Res', 6, '20:00', '03:00', 180),
    ('a18e0508-0000-4000-8000-000000000508', 'EVU-2026-008', 'gueterverkehr', 'Kesselwagen Chemie Ludwigshafen–Köln', 'Ludwigshafen Chemiepark', 'Köln-Niehl', 280, 600, 24000, 350, epoch - interval '12 hours', 'abgeschlossen', 'Gefahrgut Zans, 3 Wagen, bereits abgewickelt.', 74, 'Zans', 3, NULL, NULL, 0);

  INSERT INTO assignments (id, order_id, locomotive_id, driver_id, assigned_at, status) VALUES
    ('a18e0601-0000-4000-8000-000000000601', 'a18e0502-0000-4000-8000-000000000502', 'a18e0218-0000-4000-8000-000000000219', 'a18e0106-0000-4000-8000-000000000106', epoch - interval '5 hours', 'aktiv'),
    ('a18e0602-0000-4000-8000-000000000602', 'a18e0503-0000-4000-8000-000000000503', 'a18e0272-0000-4000-8000-000000000273', 'a18e0107-0000-4000-8000-000000000107', epoch - interval '4 hours', 'aktiv');

  INSERT INTO company (id, name, balance, reputation, level, xp, xp_next, tick)
  VALUES (1, 'EVU Transport GmbH', 250000, 50, 1, 0, 1000, 0)
  ON CONFLICT (id) DO UPDATE SET
    balance = EXCLUDED.balance,
    reputation = EXCLUDED.reputation,
    level = EXCLUDED.level,
    xp = EXCLUDED.xp,
    xp_next = EXCLUDED.xp_next,
    tick = EXCLUDED.tick,
    updated_at = now();

  INSERT INTO notifications (id, type, title, message, read)
  VALUES (
    'a18e0401-0000-4000-8000-000000000401',
    'info',
    'Betrieb gestartet',
    'Startbestand: 250.000 €, 8 Triebfahrzeuge (3× BR 218, 2× G 2000 BB, 3× BR 193), 35 Wagen (Res/Facns/Sggrss/Zans), 8 Triebfahrzeugführer.',
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    type = EXCLUDED.type,
    title = EXCLUDED.title,
    message = EXCLUDED.message;
END $$;
