import assert from 'node:assert/strict';
import type { Driver, Locomotive, Order, Wagon } from '../src/lib/supabase';
import { seriesDispatchBlock } from '../src/lib/personal';
import {
  brakeProbeGap,
  collectQualificationGaps,
  seriesQualificationGap,
  wagonInspectorGap,
} from '../src/lib/qualificationGaps';
import { collectDispatchBlockers, canConfirmDispatch } from '../src/lib/dispatchPlan';
import { MAX_OVERDRAFT, defaultOverdraftForLevel, normalizeOverdraftLimit } from '../src/lib/bank';
import { CORE_LEVEL_CAP, grantCompanyXp } from '../src/lib/progression';
import { SEED_COMPANY } from '../src/lib/seed';
import { restoreGameStorage, snapshotGameStorage, saveJson, loadJson } from '../src/lib/storage';
import { awardCorporateMilestoneXp } from '../src/lib/corporateMilestones';
import { CORPORATE_MILESTONE_XP_STEP } from '../src/lib/progression';
import type { StaffMeta } from '../src/lib/jobcenter';
import { buildOrderContractCard } from '../src/lib/contractCard';

const memory = new Map<string, string>();
const ls = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memory.set(k, v);
  },
  removeItem: (k: string) => {
    memory.delete(k);
  },
  clear: () => memory.clear(),
  key: (i: number) => [...memory.keys()][i] ?? null,
  get length() {
    return memory.size;
  },
};
(globalThis as { localStorage?: typeof ls }).localStorage = ls;

function loco(partial: Partial<Locomotive> = {}): Locomotive {
  return {
    id: 'loco-1',
    designation: 'BR 218',
    name: '218 001',
    status: 'frei',
    fuel_type: 'diesel',
    fuel_level: 80,
    brake_pct: 100,
    last_service: null,
    power_kw: 1840,
    max_speed: 140,
    weight_t: 80,
    created_at: '2020-01-01T00:00:00.000Z',
    ...partial,
  };
}

function order(partial: Partial<Order> = {}): Order {
  return {
    id: 'ord-1',
    order_number: 'GV-1',
    type: 'gueterverkehr',
    title: 'Coil',
    origin: 'Duisburg',
    destination: 'Dortmund',
    distance_km: 55,
    weight_t: 360,
    yield: 8000,
    penalty: 1200,
    deadline: null,
    status: 'offen',
    notes: null,
    min_brh: 65,
    required_wagon_type: 'Res',
    required_wagon_count: 6,
    sperrpause_start: null,
    sperrpause_end: null,
    penalty_per_min: 0,
    created_at: '2020-01-01T00:00:00.000Z',
    ...partial,
  };
}

function driver(partial: Partial<Driver> = {}): Driver {
  return {
    id: 'tf-1',
    name: 'Test Tf',
    status: 'verfuegbar',
    qualifications: ['Tf'],
    hours_worked: 4,
    max_hours: 48,
    last_rest_end: '2019-01-01T00:00:00.000Z',
    shift_start: null,
    phone: null,
    created_at: '2020-01-01T00:00:00.000Z',
    recovery_hours_left: null,
    ...partial,
  };
}

function wagon(partial: Partial<Wagon> = {}): Wagon {
  return {
    id: 'w-1',
    type_code: 'Res',
    type_name: 'Flachwagen',
    category: 'flach',
    capacity_t: 60,
    brake_position: 'P',
    tare_weight_t: 22,
    length_mm: 19000,
    status: 'verfuegbar',
    frist_level: 2,
    frist_date: null,
    count: 8,
    created_at: '2020-01-01T00:00:00.000Z',
    ...partial,
  };
}

const meta: Record<string, StaffMeta> = {
  'tf-1': {
    driverId: 'tf-1',
    role: 'tf',
    rank: 1,
    salary: 3200,
    trainingUntilTick: null,
    xp: 0,
    seriesIds: [],
    trainingKind: null,
    trainingSeriesId: null,
  },
};

const seriesGap = seriesQualificationGap(loco(), []);
assert.ok(seriesGap);
assert.equal(seriesGap.blocksDispatch, true);
assert.equal(seriesDispatchBlock(loco(), []), seriesGap.detail);

const withSeries = seriesQualificationGap(loco(), ['br218']);
assert.equal(withSeries, null);

const inspector = wagonInspectorGap(order(), [wagon()], meta);
assert.ok(inspector);
assert.equal(inspector.blocksDispatch, false);
assert.match(inspector.label, /Wagenprüfer/);

const brake = brakeProbeGap(order({ min_brh: 100, weight_t: 8_000, required_wagon_count: 2 }), loco({ brake_pct: 5, weight_t: 16 }), [
  wagon({ brake_position: 'G', tare_weight_t: 80, capacity_t: 20, count: 2 }),
]);
assert.ok(brake, 'Brh-Unterschreitung muss als Bremszettel-Lücke erscheinen');
assert.equal(brake.blocksDispatch, true);

const gaps = collectQualificationGaps({
  order: order(),
  loco: loco(),
  driver: driver(),
  wagons: [wagon()],
  staffMeta: meta,
});
assert.ok(gaps.some((g) => g.kind === 'series' && g.blocksDispatch));

const emptyPlan = collectDispatchBlockers({
  order: null,
  loco: null,
  driver: null,
  driver2: null,
  azfMode: 'none',
  azfId: '',
  availableAzfIds: [],
  wagons: [],
  staffMeta: {},
  tick: 1,
});
assert.equal(emptyPlan[0]?.code, 'order');
assert.equal(canConfirmDispatch(emptyPlan), false);

const noLoco = collectDispatchBlockers({
  order: order(),
  loco: null,
  driver: driver(),
  driver2: null,
  azfMode: 'none',
  azfId: '',
  availableAzfIds: [],
  wagons: [wagon()],
  staffMeta: { 'tf-1': { ...meta['tf-1']!, seriesIds: ['br218'] } },
  tick: 1,
});
assert.ok(noLoco.some((row) => row.code === 'loco'));

assert.equal(MAX_OVERDRAFT, 175_000);
assert.equal(normalizeOverdraftLimit(250_000), 175_000);
assert.equal(normalizeOverdraftLimit(1_000_000), 175_000);
assert.equal(defaultOverdraftForLevel(20), 175_000);
assert.equal(defaultOverdraftForLevel(99), 175_000);

const before = { ...SEED_COMPANY, level: CORE_LEVEL_CAP, xp: 10, xp_next: 250_000, balance: 88_000, reputation: 40 };
const after = grantCompanyXp(before, 400);
assert.equal(after.company.level, CORE_LEVEL_CAP);
assert.equal(after.company.balance, 88_000);
assert.equal(after.milestoneXpGain, 400);

const milestones = awardCorporateMilestoneXp({ totalXp: 0, completedMilestones: 0 }, CORPORATE_MILESTONE_XP_STEP);
assert.equal(milestones.completedMilestones, 1);

saveJson('evu-save-test', { ok: true, balance: 123 });
assert.deepEqual(loadJson('evu-save-test', null), { ok: true, balance: 123 });
const snap = snapshotGameStorage();
memory.delete('evu-save-test');
assert.equal(loadJson('evu-save-test', null), null);
restoreGameStorage(snap);
assert.deepEqual(loadJson('evu-save-test', null), { ok: true, balance: 123 });

const card = buildOrderContractCard(order(), [wagon()]);
assert.equal(card.kind, 'spot');
assert.ok(card.tonnageT === 360);
assert.ok((card.usableLengthM ?? 0) > 0);
assert.ok(card.clearances.some((row) => row.id === 'bremszettel'));
assert.ok(card.clearances.some((row) => row.id === 'wagenseinheit'));

console.log('Pakete 2–6 Gameplay-Checks: ok');
