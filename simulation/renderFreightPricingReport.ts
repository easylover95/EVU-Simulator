import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Spot = {
  id: string;
  distanceKm: number;
  weightT: number;
  grossYield: number;
  tkm: number;
  eurPerTkm: number;
  operatingCost: number;
  netProfit: number;
};

type Baugleis = {
  id: string;
  distanceKm: number;
  weightT: number;
  dailyRate: number;
  operatingCostPerDay: number;
  netProfitPerDay: number;
  pathCost: number;
  energyCost: number;
  pdlCost: number;
  formulaOperatingBaseline: number;
  formulaOperatingMargin: number;
};

type Report = { model: string; standing: { level: number; reputation: number }; spot: Spot[]; baugleis: Baugleis[] };

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'simulation/output');
const oldReport = JSON.parse(readFileSync(resolve(output, 'freight-pricing-current.json'), 'utf8')) as Report;
const newReport = JSON.parse(readFileSync(resolve(output, 'freight-pricing-rebalanced.json'), 'utf8')) as Report;

function eur(value: number): string {
  return `${Math.round(value).toLocaleString('de-DE')} €`;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1).replace('.', ',')} %`;
}

function byId<T extends { id: string }>(list: T[], id: string): T {
  const value = list.find((item) => item.id === id);
  if (!value) throw new Error(`Fehlender Testfall: ${id}`);
  return value;
}

const oldShort = byId(oldReport.spot, 'duisburg-dortmund-55km');
const oldLong = byId(oldReport.spot, 'bayreuth-regensburg-120km');
const newShort = byId(newReport.spot, 'duisburg-dortmund-55km');
const newLong = byId(newReport.spot, 'bayreuth-regensburg-120km');
const oldB120 = byId(oldReport.baugleis, 'baugleis-120km');
const oldB285 = byId(oldReport.baugleis, 'baugleis-285km');
const newB120 = byId(newReport.baugleis, 'baugleis-120km');
const newB285 = byId(newReport.baugleis, 'baugleis-285km');

const markdown = `# Fracht- und Baugleis-Kalkulation: Rebalancing

## Zweck und Geltungsbereich

Dieser Vergleich dokumentiert eine **lokale Spielbalance-Änderung**. Es werden keine externen Markt-, Infrastruktur- oder Energiepreise verwendet. Alle Werte stammen aus dem reproduzierbaren Testlauf \`simulation/analyzeFreightPricing.ts\` mit EVU-Stufe 1, Bekanntheit 0, 1.000 t Frachtgewicht für die beiden Referenzkorridore und Dieseltraktion.

> Ziel der Änderung: Der Bruttoerlös von Spot-Fracht besteht sichtbar aus einer Sockelpauschale plus einem distanzproportionalen Tonnenkilometer-Anteil. Baugleis-Tagespauschalen decken ihre tägliche Trassen-, Energie- und PDL-Basis und enthalten anschließend eine wirtschaftliche Einsatzmarge.

## Neue Formel

Für Güterverkehr gilt je Segment: **Bruttoerlös = (Sockelpauschale + Tonnenkilometer × €/tkm) × EVU-Multiplikator**. Der Multiplikator beträgt in diesem Test bei Stufe 1 **52 %**. Die reifen Segmentparameter lauten: Bulk 3.500 € + 0,090 €/tkm, Block 4.000 € + 0,100 €/tkm und Intermodal 4.800 € + 0,110 €/tkm.

Für einen Baugleis-Einsatz gilt: **Tagespauschale = geschätzte Trasse + Dieselenergie + AZF/PDL-Basis + Einsatzmarge**. Die Einsatzmarge ergibt sich aus 1.600 € Grundmarge, 7 €/Streckenkilometer, 55 €/100 t und 180 € Risikopuffer; anschließend wirkt der Baugleis-Multiplikator. Die bisherige enge Obergrenze von 8.500 € wurde durch eine reine Sicherheitsgrenze von 25.000 € ersetzt und begrenzt keine regulären Angebote mehr.

## Vergleich Güterverkehr

| Referenzfall | Bisheriger Bruttoerlös | Neuer Bruttoerlös | Bisherige Betriebskosten | Neuer Netto-Gewinn | Veränderung Netto | Effektiver €/tkm neu |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Duisburg–Dortmund, 55 km / 1.000 t | ${eur(oldShort.grossYield)} | ${eur(newShort.grossYield)} | ${eur(newShort.operatingCost)} | ${eur(newShort.netProfit)} | ${eur(newShort.netProfit - oldShort.netProfit)} | ${newShort.eurPerTkm.toFixed(4).replace('.', ',')} € |
| Bayreuth–Regensburg, 120 km / 1.000 t | ${eur(oldLong.grossYield)} | ${eur(newLong.grossYield)} | ${eur(newLong.operatingCost)} | ${eur(newLong.netProfit)} | ${eur(newLong.netProfit - oldLong.netProfit)} | ${newLong.eurPerTkm.toFixed(4).replace('.', ',')} € |

Der 120-km-Lauf bringt nun **${eur(newLong.netProfit - newShort.netProfit)} mehr Netto-Gewinn** als der 55-km-Lauf. Sein effektiver Erlös pro Tonnenkilometer liegt bei **${pct(newLong.eurPerTkm / newShort.eurPerTkm)}** des kurzen Referenzlaufs; zuvor waren es nur ${pct(oldLong.eurPerTkm / oldShort.eurPerTkm)}. Damit ist die unerwünschte Distanzdegression deutlich reduziert und der absolute Langstreckenvorteil gesichert.

## Vergleich Baugleis-Tagespauschale

| Baugleis-Fall | Bisherige Tagespauschale | Neue Tagespauschale | Tageskosten | Neue Tagesmarge | Veränderung Tagesmarge |
| --- | ---: | ---: | ---: | ---: | ---: |
| 120 km / 1.000 t | ${eur(oldB120.dailyRate)} | ${eur(newB120.dailyRate)} | ${eur(newB120.operatingCostPerDay)} | ${eur(newB120.netProfitPerDay)} | ${eur(newB120.netProfitPerDay - oldB120.netProfitPerDay)} |
| 285 km / 1.400 t | ${eur(oldB285.dailyRate)} | ${eur(newB285.dailyRate)} | ${eur(newB285.operatingCostPerDay)} | ${eur(newB285.netProfitPerDay)} | ${eur(newB285.netProfitPerDay - oldB285.netProfitPerDay)} |

Der 285-km-Baugleisfall war zuvor mit **${eur(oldB285.netProfitPerDay)} pro Tag** defizitär. Nun deckt die Tagespauschale die vollständige Kostenbasis aus Trasse (${eur(newB285.pathCost)}), Diesel (${eur(newB285.energyCost)}) und PDL/AZF (${eur(newB285.pdlCost)}) und lässt eine Einsatzmarge von **${eur(newB285.netProfitPerDay)} pro Tag**.

## Automatische Regressionstests

Der Test bricht mit einem Fehler ab, falls der 120-km-Referenzlauf nicht mehr absolut rentabler als der 55-km-Lauf ist, falls sein effektiver €/tkm-Satz unter 75 % des Kurzlaufs fällt oder falls einer der beiden Baugleis-Testfälle negativ wird. Damit bleiben die gewünschten wirtschaftlichen Eigenschaften bei weiteren Balance-Änderungen reproduzierbar abgesichert.

## Grenzen

Die dargestellten Margen beinhalten die streckenabhängigen Trassen-, Energie- und optionalen PDL-Kosten. Sie enthalten keine weiteren unternehmensweiten Fixkosten wie Depot, Versicherungen, Festgehalt oder Kreditdienst. Die Berechnung ist deshalb eine **auftragsbezogene Deckungsbeitragsrechnung innerhalb der Spielsimulation**, keine reale EVU-Kalkulation oder Finanzberatung.
`;

writeFileSync(resolve(root, 'simulation/FREIGHT_PRICING_REBALANCE.md'), `${markdown}\n`, 'utf8');
console.log('Bericht geschrieben: simulation/FREIGHT_PRICING_REBALANCE.md');
