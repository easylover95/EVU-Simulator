import assert from 'node:assert/strict';
import { createTimetableEntry, buildRoutePlan, plannedTravelTicks } from '../src/lib/routeNetwork';
import { processBankTick, summarizePnl, type BankState } from '../src/lib/bank';
import { computeBalanceSheet } from '../src/lib/financialStatements';
import { TICKS_PER_DAY } from '../src/lib/storage';
import type { Company } from '../src/lib/supabase';

const route = buildRoutePlan('West–Süd', 'duisburg', 'muenchen', 12);
assert(route, 'Die kanonische Route Duisburg–München muss konstruiert werden können.');
assert(route.stationKeys.length >= 2, 'Eine Route benötigt mindestens zwei Knoten.');
assert(route.distanceKm > 0, 'Eine Route benötigt eine positive Distanz.');
assert(plannedTravelTicks(route.distanceKm) >= 2, 'Eine Route benötigt eine positive Mindestfahrzeit.');

const timetable = createTimetableEntry({
  routePlan: route,
  orderId: 'order-1',
  orderNumber: 'FI-0001',
  label: 'Testlauf',
  departureTick: 8,
  tick: 12,
});
assert(timetable && timetable.arrivalTick > timetable.departureTick, 'Der Fahrplan muss ein gültiges Zeitfenster speichern.');

const company: Company = {
  id: 1,
  name: 'Prüfungsbahn GmbH',
  hq_location: 'Duisburg',
  balance: 10_000,
  reputation: 50,
  level: 2,
  xp: 0,
  xp_next: 100,
  tick: 0,
  updated_at: '2026-01-01T00:00:00.000Z',
};

const bank: BankState = {
  overdraftLimit: 20_000,
  overdraftDailyRate: 0.0003,
  loans: [{
    id: 'loan-1',
    principal: 100_000,
    remaining: 103_600,
    principalRemaining: 100_000,
    interestRemaining: 3_600,
    termDays: 30,
    dailyPayment: 3_454,
    interestLabel: '30 Tage · 5,2 % p.a.',
    startedTick: 0,
  }],
  insurances: { gueterschaden: false, haftpflicht: false },
  bookings: [],
  lastProcessedTick: 0,
  sanierungStartTick: null,
  insolvent: false,
};

const afterTick = processBankTick(bank, company, TICKS_PER_DAY);
const loanAfter = afterTick.state.loans[0];
assert(loanAfter.principalRemaining < 100_000, 'Der Tagesdienst muss die Kreditrestschuld reduzieren.');
assert(loanAfter.interestRemaining < 3_600, 'Der Tagesdienst muss einen Zinsanteil erfassen.');

const pnl = summarizePnl(afterTick.state.bookings, 0, TICKS_PER_DAY);
assert(pnl.principalRepayments < 0, 'Tilgung muss als separater Finanzierungscashflow gebucht werden.');
assert(pnl.interest < 0, 'Zinsen müssen als Finanzaufwand in der GuV gebucht werden.');
assert.equal(pnl.net, pnl.interest + pnl.insurance, 'Die GuV darf die Tilgung nicht als Aufwand enthalten.');

const balanceSheet = computeBalanceSheet({ company: afterTick.company, bank: afterTick.state, locomotives: [], wagons: [] });
assert.equal(balanceSheet.difference, 0, 'Die Managementbilanz muss rechnerisch ausgeglichen sein.');
assert.equal(balanceSheet.loanPrincipal, loanAfter.principalRemaining, 'Die Bilanz muss die offene Kreditrestschuld verwenden.');

console.log('route-finance-smoke: ok');
