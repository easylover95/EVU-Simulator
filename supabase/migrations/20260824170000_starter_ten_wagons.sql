-- Starter wagon park: exactly 10 Güterwagen (6× Res, 4× Eanos), all verfuegbar.
-- Replaces the 35-wagon large-fleet seed on unused DBs (no assignments).
-- Purchased extra wagons use other IDs (local extra-fleet) and are not touched.

DO $$
DECLARE
  seed_wagon_ids uuid[] := ARRAY[
    'a18e0301-0000-4000-8000-000000000301'::uuid,
    'a18e0302-0000-4000-8000-000000000302'::uuid,
    'a18e0303-0000-4000-8000-000000000303'::uuid,
    'a18e0304-0000-4000-8000-000000000304'::uuid,
    'a18e0305-0000-4000-8000-000000000305'::uuid,
    'a18e0306-0000-4000-8000-000000000306'::uuid,
    'a18e0307-0000-4000-8000-000000000307'::uuid,
    'a18e0308-0000-4000-8000-000000000308'::uuid,
    'a18e0309-0000-4000-8000-000000000309'::uuid
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM assignments) THEN
    RAISE NOTICE 'Skipping starter wagon shrink: assignments exist (already playing)';
  ELSE
    DELETE FROM wagons WHERE id = ANY (seed_wagon_ids);

    INSERT INTO wagons (
      id, type_code, type_name, category, capacity_t, brake_position,
      tare_weight_t, length_mm, status, frist_level, frist_date, count
    ) VALUES
      (
        'a18e0301-0000-4000-8000-000000000301',
        'Res', 'Flachwagen', 'flach', 60, 'P',
        19, 19000, 'verfuegbar', 1, '2027-02-23', 6
      ),
      (
        'a18e0309-0000-4000-8000-000000000309',
        'Eanos', 'Offener Güterwagen', 'offen', 61, 'G',
        22, 14000, 'verfuegbar', 1, '2027-03-15', 4
      );
  END IF;

  UPDATE notifications
  SET
    title = 'Betrieb gestartet',
    message = 'Start: 210.000 €, 2 Dieselloks (BR 218), 10 Güterwagen (6× Res, 4× Eanos), 2 Triebfahrzeugführer. Bekanntheit 0. Dispo 20.000 €. Weitere Tf und AZF/RB über die Jobbörse, Loks beim Händler.'
  WHERE id = 'a18e0401-0000-4000-8000-000000000401'
    AND (
      message LIKE '%35 Wagen%'
      OR message LIKE '%Wagenpark Res/Facns%'
    );
END $$;
