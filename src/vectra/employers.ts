/** Festes EVU-Branding — Hub-Wahl separat in hubs.ts. */

export type EmployerId = 'rrc';

export interface Employer {
  id: EmployerId;
  shortName: string;
  legalName: string;
  regionHint: string;
  accent: string;
}

/** Einziges EVU laut Handout v2.0. */
export const RRC: Employer = {
  id: 'rrc',
  shortName: 'RRC',
  legalName: 'Rhein-Ruhr Cargo GmbH',
  regionHint: 'Freie Hub-Wahl · CTS-Style Expansion',
  accent: '#f5b942',
};

/** @deprecated — nur noch RRC; Array für Legacy-UI-Schleifen. */
export const EMPLOYERS: Employer[] = [RRC];

export function employerById(_id?: string | null): Employer {
  return RRC;
}

export const OS_LABEL = 'Disponenten-Leitstelle';
