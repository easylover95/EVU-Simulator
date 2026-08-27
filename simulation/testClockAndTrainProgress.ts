import { strict as assert } from 'node:assert';
import { BASE_TICK_INTERVAL_MS, GAME_EPOCH_ISO, MINUTES_PER_HOUR, type ClockSpeed } from '../src/lib/gameTime';
import { buildTrackedTrain, assignmentProgress, etaFromProgress, isAssignmentArrived } from '../src/lib/tracking';
import { SEED_DRIVERS, SEED_LOCOMOTIVES, SEED_ORDERS, SEED_WAGONS } from '../src/lib/seed';
import type { AssignmentWithDetails } from '../src/lib/supabase';

type ClockSnapshot = {
  tick: number;
  minute: number;
  running: boolean;
  speed: ClockSpeed;
};

function advanceRealtimeSeconds(snapshot: ClockSnapshot, seconds: number): ClockSnapshot {
  let tick = snapshot.tick;
  let minute = snapshot.minute;
  for (let second = 0; second < seconds; second += 1) {
    if (!snapshot.running) continue;
    let nextMinute = minute + snapshot.speed;
    while (nextMinute >= MINUTES_PER_HOUR) {
      nextMinute -= MINUTES_PER_HOUR;
      tick += 1;
    }
    minute = nextMinute;
  }
  return { ...snapshot, tick, minute };
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  assert.equal(actual, expected, `${label}: erwartet ${expected}, erhalten ${actual}`);
}

function assertNear(actual: number, expected: number, label: string): void {
  assert.ok(Math.abs(actual - expected) < 0.001, `${label}: erwartet ${expected}, erhalten ${actual}`);
}

const at1x = advanceRealtimeSeconds({ tick: 0, minute: 0, running: true, speed: 1 }, 60);
const at2x = advanceRealtimeSeconds({ tick: 0, minute: 0, running: true, speed: 2 }, 30);
const at5x = advanceRealtimeSeconds({ tick: 0, minute: 0, running: true, speed: 5 }, 12);
const paused = advanceRealtimeSeconds({ tick: 7, minute: 18, running: false, speed: 5 }, 60);

assertEqual(BASE_TICK_INTERVAL_MS, 1_000, 'Taktintervall');
assertEqual(at1x.tick, 1, '1× nach 60 Real-Sekunden');
assertEqual(at2x.tick, 1, '2× nach 30 Real-Sekunden');
assertEqual(at5x.tick, 1, '5× nach 12 Real-Sekunden');
assertEqual(paused.tick, 7, 'Pause hält Stunden-Tick');
assertEqual(paused.minute, 18, 'Pause hält Spielminute');

const assignment: AssignmentWithDetails = {
  id: 'clock-progress-test',
  order_id: SEED_ORDERS[0].id,
  locomotive_id: SEED_LOCOMOTIVES[0].id,
  driver_id: SEED_DRIVERS[0].id,
  assigned_at: GAME_EPOCH_ISO,
  status: 'aktiv',
  delay_ticks: 0,
  crew_xp: 0,
  crew_rank: 1,
  order: { ...SEED_ORDERS[0], deadline: null, status: 'zugewiesen' },
  locomotive: { ...SEED_LOCOMOTIVES[0], status: 'einsatz' },
  driver: { ...SEED_DRIVERS[0], status: 'im_einsatz' },
};

const progress0 = assignmentProgress(assignment, 0);
const progress4 = assignmentProgress(assignment, 4);
const progress8 = assignmentProgress(assignment, 8);
assertNear(progress0, 0, 'Fahrplanfortschritt beim Start');
assertNear(progress4, 50, 'Fahrplanfortschritt nach vier Stunden');
assertNear(progress8, 100, 'Fahrplanfortschritt nach acht Stunden');
assertEqual(etaFromProgress(assignment, progress4), 4, 'ETA nach vier Stunden');
assertEqual(isAssignmentArrived(assignment, 7), false, 'Zug vor Ankunft');
assertEqual(isAssignmentArrived(assignment, 8), true, 'Zug bei Ankunft');

const trackedAt4 = buildTrackedTrain(assignment, 4, SEED_WAGONS);
const trackedAt8 = buildTrackedTrain(assignment, 8, SEED_WAGONS);
assert.ok(trackedAt4, 'Aktiver Zug wird für Live-Tracking gebaut');
assert.ok(trackedAt8, 'Ankunftszustand wird für Live-Tracking gebaut');
assertNear(trackedAt4!.progress, 50, 'Live-Tracking-Fortschritt');
assertEqual(trackedAt4!.etaTicks, 4, 'Live-Tracking-ETA');
assertEqual(trackedAt4!.currentSpeed, 98, 'Fahrgeschwindigkeit der BR 218 im Lauf');
assertEqual(trackedAt8!.currentSpeed, 0, 'Fahrgeschwindigkeit bei Ankunft');

console.log(JSON.stringify({
  result: 'PASS',
  clock: {
    oneX: at1x,
    twoX: at2x,
    fiveX: at5x,
    paused,
  },
  train: {
    progress: { tick0: progress0, tick4: progress4, tick8: progress8 },
    etaAtTick4: trackedAt4!.etaTicks,
    speedAtTick4: trackedAt4!.currentSpeed,
    speedAtArrival: trackedAt8!.currentSpeed,
  },
}, null, 2));
