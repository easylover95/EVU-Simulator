/*
# Game tick personnel recovery

- drivers.recovery_hours_left: remaining recovery hours (1 tick = 1 hour)
- Seed Klaus Bauer as krank with 12h remaining if missing
- Backfill recovery timers for existing krank/pause/urlaub rows
*/

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS recovery_hours_left int;

UPDATE drivers
SET recovery_hours_left = 12
WHERE status = 'krank' AND recovery_hours_left IS NULL;

UPDATE drivers
SET recovery_hours_left = 3
WHERE status = 'pause' AND recovery_hours_left IS NULL;

UPDATE drivers
SET recovery_hours_left = 24
WHERE status = 'urlaub' AND recovery_hours_left IS NULL;

INSERT INTO drivers (
  id, name, status, qualifications, hours_worked, max_hours,
  last_rest_end, shift_start, phone, recovery_hours_left
)
SELECT
  'a18e0103-0000-4000-8000-000000000103',
  'Klaus Bauer',
  'krank',
  ARRAY['Tf', 'BR 218', 'BR 272', 'PZB', 'Sifa', 'Wagenprüfer Stufe 3'],
  0,
  48,
  now(),
  NULL,
  '+49 173 8899001',
  12
WHERE NOT EXISTS (SELECT 1 FROM drivers WHERE name = 'Klaus Bauer');

UPDATE drivers
SET recovery_hours_left = 12
WHERE name = 'Klaus Bauer' AND status = 'krank' AND recovery_hours_left IS NULL;
