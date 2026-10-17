/** Start-EVUs zur Auswahl (Test-Set). */

export type EmployerId = 'rrc' | 'sfr' | 'tal';

export interface Employer {
  id: EmployerId;
  shortName: string;
  legalName: string;
  hqCity: string;
  regionHint: string;
  accent: string;
}

export const EMPLOYERS: Employer[] = [
  {
    id: 'rrc',
    shortName: 'RRC',
    legalName: 'Rhein-Ruhr Cargo',
    hqCity: 'Dortmund',
    regionHint: 'Ruhrgebiet · Kohle, Stahl, Container',
    accent: '#f5b942',
  },
  {
    id: 'sfr',
    shortName: 'SFR',
    legalName: 'Südwest Freight Rail',
    hqCity: 'Mannheim',
    regionHint: 'Rhein-Neckar · Chemie, Kombiverkehr',
    accent: '#64d2ff',
  },
  {
    id: 'tal',
    shortName: 'TAL',
    legalName: 'TransAlp Logistics GmbH',
    hqCity: 'München',
    regionHint: 'Alpenkorridor · Automotive, Intermodal',
    accent: '#30d158',
  },
];

export function employerById(id: EmployerId): Employer {
  return EMPLOYERS.find((e) => e.id === id) ?? EMPLOYERS[0]!;
}

export const OS_LABEL = 'Disponenten-Leitstelle';
