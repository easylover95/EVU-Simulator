/*
# EVU Spielzustand — Firmen-Daten & Benachrichtigungen

## Neue Tabellen

1. `company` — Firmenprofil und Spielzustand (Singleton, eine Zeile)
   - id (int PK, immer 1)
   - name (text) — Firmenname
   - balance (numeric) — Kontostand in EUR
   - reputation (int) — Reputation/Prestige (0-100)
   - level (int) — Level des Unternehmens
   - xp (int) — Erfahrungspunkte
   - xp_next (int) — XP für nächstes Level
   - tick (int) — Aktueller Spiel-Takt
   - updated_at (timestamptz)

2. `notifications` — Spiel-Benachrichtigungen
   - id (uuid PK)
   - type (text) — 'info', 'success', 'warning', 'error'
   - title (text)
   - message (text)
   - read (boolean, default false)
   - created_at (timestamptz)

## Security
- Beide Tabellen: RLS aktiviert, anon+authenticated CRUD (single-tenant)

## Seed
- Company: "EVU Transport GmbH", Kontostand 1.250.000 €, Reputation 72, Level 5
- Benachrichtigungen: 4 initiale Einträge
*/

CREATE TABLE IF NOT EXISTS company (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL DEFAULT 'EVU Transport GmbH',
  balance numeric NOT NULL DEFAULT 1250000,
  reputation int NOT NULL DEFAULT 72,
  level int NOT NULL DEFAULT 5,
  xp int NOT NULL DEFAULT 4200,
  xp_next int NOT NULL DEFAULT 6000,
  tick int NOT NULL DEFAULT 147,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE company ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_company" ON company;
CREATE POLICY "anon_select_company" ON company FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_company" ON company;
CREATE POLICY "anon_insert_company" ON company FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_company" ON company;
CREATE POLICY "anon_update_company" ON company FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_company" ON company;
CREATE POLICY "anon_delete_company" ON company FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_notifications" ON notifications;
CREATE POLICY "anon_select_notifications" ON notifications FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_notifications" ON notifications;
CREATE POLICY "anon_insert_notifications" ON notifications FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_notifications" ON notifications;
CREATE POLICY "anon_update_notifications" ON notifications FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_notifications" ON notifications;
CREATE POLICY "anon_delete_notifications" ON notifications FOR DELETE
  TO anon, authenticated USING (true);

-- Seed company
INSERT INTO company (id, name, balance, reputation, level, xp, xp_next, tick)
VALUES (1, 'EVU Transport GmbH', 1250000, 72, 5, 4200, 6000, 147)
ON CONFLICT (id) DO NOTHING;

-- Seed notifications
INSERT INTO notifications (type, title, message) VALUES
  ('warning', 'Sperrpause-Näherung', 'Bauzug EVU-2026-003: Sperrpause beginnt in 2h 15m. Abfahrt muss gesichert sein!'),
  ('info', 'Neuer Auftrag eingegangen', 'Auftrag EVU-2026-008 (Kohletransport Köln–Saarbrücken) wurde veröffentlicht.'),
  ('error', 'Frist abgelaufen', '3 Schotterwagen (Fccpps) haben die Frist überschritten — Wagenprüfer Stufe 3 erforderlich.'),
  ('success', 'Auftrag abgeschlossen', 'Auftrag EVU-2026-002 (Containerzug Hamburg–München) wurde erfolgreich abgewickelt. +52.000 € verbucht.')
ON CONFLICT DO NOTHING;
