/*
# EVU Starter Kit — initial company, fleet, wagons, personnel

Replaces the inflated demo inventory with the launch start state so both
fresh databases and unused demo DBs show the same dashboard:

- Company: 250.000 €, Level 1 (0 / 1000 XP), Reputation 50, Takt 0
- Locomotives: 1× BR 218 Diesel, 1× BR 272 Diesel (Vossloh G 2000 BB, 2.240 kW, 100% fuel, frei)
- Wagons: 4× Res (flach), 4× Facns (schotter = closest bulk/Schüttgut category)
- Drivers: 2× Tf, status verfuegbar, class auth BR 218/BR 272, PZB + Sifa

Already-playing guard: if any assignment row exists, fleet/personnel/company
are left untouched (player progress). Unused demo DBs have no assignments.
*/

ALTER TABLE company ALTER COLUMN balance SET DEFAULT 250000;
ALTER TABLE company ALTER COLUMN reputation SET DEFAULT 50;
ALTER TABLE company ALTER COLUMN level SET DEFAULT 1;
ALTER TABLE company ALTER COLUMN xp SET DEFAULT 0;
ALTER TABLE company ALTER COLUMN xp_next SET DEFAULT 1000;
ALTER TABLE company ALTER COLUMN tick SET DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM assignments) THEN
    RAISE NOTICE 'Skipping starter-kit reset: assignments exist (already playing)';
    RETURN;
  END IF;

  DELETE FROM locomotives;
  INSERT INTO locomotives (
    id, designation, name, status, fuel_type, fuel_level, brake_pct,
    last_service, power_kw, max_speed, weight_t
  ) VALUES
    (
      'a18e0218-0000-4000-8000-000000000218',
      'BR 218', '218 312-7', 'frei', 'diesel', 100, 100,
      CURRENT_DATE, 1840, 140, 80
    ),
    (
      'a18e0272-0000-4000-8000-000000000272',
      'BR 272', 'G 2000 BB (Baureihe 272)', 'frei', 'diesel', 100, 100,
      CURRENT_DATE, 2240, 120, 90
    );

  DELETE FROM drivers;
  INSERT INTO drivers (
    id, name, status, qualifications, hours_worked, max_hours,
    last_rest_end, shift_start, phone
  ) VALUES
    (
      'a18e0101-0000-4000-8000-000000000101',
      'Tf 1 (Streckendienst)',
      'verfuegbar',
      ARRAY['Tf', 'BR 218', 'BR 272', 'PZB', 'Sifa'],
      0, 48, now(), NULL, '+49 151 1000101'
    ),
    (
      'a18e0102-0000-4000-8000-000000000102',
      'Tf 2 (Baugleis/Rangierer)',
      'verfuegbar',
      ARRAY['Tf', 'BR 218', 'BR 272', 'PZB', 'Sifa'],
      0, 48, now(), NULL, '+49 151 1000102'
    );

  DELETE FROM wagons;
  INSERT INTO wagons (
    id, type_code, type_name, category, capacity_t, brake_position,
    tare_weight_t, length_mm, status, frist_level, frist_date, count
  ) VALUES
    (
      'a18e0301-0000-4000-8000-000000000301',
      'Res', 'Flachwagen', 'flach', 60, 'P',
      19, 19000, 'verfuegbar', 1, '2027-02-23', 4
    ),
    (
      'a18e0302-0000-4000-8000-000000000302',
      'Facns', 'Schüttgutwagen', 'schotter', 70, 'G',
      24, 15500, 'verfuegbar', 1, '2027-02-23', 4
    );

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
    'Startbestand: 250.000 €, BR 218 + G 2000 BB (BR 272), 4× Res, 4× Facns, 2 Triebfahrzeugführer in Bereitschaft.',
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    type = EXCLUDED.type,
    title = EXCLUDED.title,
    message = EXCLUDED.message;
END $$;
