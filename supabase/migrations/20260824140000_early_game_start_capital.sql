-- Early-game balancing: slightly lower start capital (250k → 210k).
-- Does not rewrite an already progressed company unless it is still at the old seed balance.

ALTER TABLE company ALTER COLUMN balance SET DEFAULT 210000;

UPDATE company
SET balance = 210000
WHERE id = 1 AND balance = 250000;
