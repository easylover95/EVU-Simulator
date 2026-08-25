import assert from 'node:assert/strict';
import {
  coverRepairFromMaintenanceFund,
  depositMaintenanceFund,
  withdrawMaintenanceFund,
  type MaintenanceFundState,
} from '../src/lib/maintenanceFund';

let fund: MaintenanceFundState = { balance: 0, movements: [] };
fund = depositMaintenanceFund(fund, 30_000, 24);
assert.equal(fund.balance, 30_000, 'Die Einzahlung muss vollständig im Fonds ankommen.');

const firstRepair = coverRepairFromMaintenanceFund(fund, 9_600, 48);
assert.equal(firstRepair.covered, 9_600, 'Der Fonds muss den ersten Lokschaden vollständig decken.');
assert.equal(firstRepair.cashDue, 0, 'Bei ausreichendem Fonds darf der Kontostand nicht belastet werden.');
assert.equal(firstRepair.state.balance, 20_400, 'Die Fondsrestdeckung muss korrekt bleiben.');

const secondRepair = coverRepairFromMaintenanceFund(firstRepair.state, 25_000, 72);
assert.equal(secondRepair.covered, 20_400, 'Der Fonds darf nur den vorhandenen Restbetrag decken.');
assert.equal(secondRepair.cashDue, 4_600, 'Nur der ungedeckte Reparaturrest darf den regulären Cashflow belasten.');
assert.equal(secondRepair.state.balance, 0, 'Der Fonds darf nicht negativ werden.');

const restored = withdrawMaintenanceFund(depositMaintenanceFund(secondRepair.state, 12_000, 96), 5_000, 120);
assert.equal(restored.balance, 7_000, 'Eine Freigabe muss die verbleibende Rücklage korrekt ausweisen.');

console.log('Maintenance-Fund-Logik geprüft: Einzahlen, Schadensdeckung und Freigabe sind konsistent.');
