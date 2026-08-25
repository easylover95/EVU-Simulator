/*
# Realistic min_brh ranges

Replaces inflated seed values (70–90 / 90–110) with operationally realistic
Bremshundertstel:

- Standard Güterverkehr: 60–85 Brh
- Baugleis / Sperrpause: 50–75 Brh
*/

ALTER TABLE orders ALTER COLUMN min_brh SET DEFAULT 70;

-- Catch-all clamp for any existing rows
UPDATE orders
SET min_brh = LEAST(85, GREATEST(60, COALESCE(min_brh, 70)))
WHERE type = 'gueterverkehr';

UPDATE orders
SET min_brh = LEAST(75, GREATEST(50, COALESCE(min_brh, 62)))
WHERE type = 'baugleis';

-- Seed-order specific values inside the new ranges
UPDATE orders SET min_brh = 68 WHERE order_number = 'EVU-2026-001';
UPDATE orders SET min_brh = 82 WHERE order_number = 'EVU-2026-002';
UPDATE orders SET min_brh = 70 WHERE order_number = 'EVU-2026-003';
UPDATE orders SET min_brh = 74 WHERE order_number = 'EVU-2026-004';
UPDATE orders SET min_brh = 58 WHERE order_number = 'EVU-2026-005';
UPDATE orders SET min_brh = 64 WHERE order_number = 'EVU-2026-006';
UPDATE orders SET min_brh = 62 WHERE order_number = 'EVU-2026-007';
UPDATE orders SET min_brh = 78 WHERE order_number = 'EVU-2026-008';
