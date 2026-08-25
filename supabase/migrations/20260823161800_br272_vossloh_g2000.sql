/*
# BR 272 = Vossloh G 2000 BB (EBA scheme)

Corrects the starter-kit diesel that was stored as a 1.500 kW class with
MaK G 1206 photos. Real EBA class 272 is the Vossloh G 2000 BB:

- designation stays BR 272
- display name: Vossloh G 2000 BB (Baureihe 272)
- power_kw: 2.240 kW (heavy mainline / construction-train diesel)
- fuel_type: diesel

Photos are client-side (locoPhotos.ts). Fleet size unchanged (no BR 275).
Runs even when assignments exist so already-playing DBs get the type data.
*/

UPDATE locomotives
SET
  designation = 'BR 272',
  name = 'G 2000 BB (Baureihe 272)',
  power_kw = 2240,
  fuel_type = 'diesel'
WHERE designation = 'BR 272'
   OR designation ILIKE '%272%'
   OR name ILIKE '272 %';
