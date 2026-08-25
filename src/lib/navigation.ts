export type AppView =
  | 'zentrale'
  | 'dashboard'
  | 'fuhrpark'
  | 'wagenpark'
  | 'auftragsmarkt'
  | 'disposition'
  | 'personal'
  | 'finanzen'
  | 'auswertungen'
  | 'posteingang'
  | 'vertraege'
  | 'spielerboerse'
  | 'tourenplaner'
  | 'tourenuebersicht'
  | 'haendler'
  | 'werkstatt'
  | 'bank'
  | 'werbung'
  | 'gebaeude';

export type NavCategory = 'zentrale' | 'transport' | 'fleet' | 'finance' | 'firma';

export interface NavSubItem {
  id: AppView;
  label: string;
}

export interface NavCategoryDef {
  id: NavCategory;
  label: string;
  defaultView: AppView;
  items: NavSubItem[];
  hideSubnav?: boolean;
}

export const NAV_CATEGORIES: NavCategoryDef[] = [
  {
    id: 'zentrale',
    label: 'Zentrale',
    defaultView: 'zentrale',
    hideSubnav: true,
    items: [{ id: 'zentrale', label: 'Büro' }],
  },
  {
    id: 'transport',
    label: 'Transport',
    defaultView: 'auftragsmarkt',
    items: [
      { id: 'auftragsmarkt', label: 'Frachtbörse' },
      { id: 'spielerboerse', label: 'Spieler-Börse' },
      { id: 'disposition', label: 'Disposition' },
      { id: 'tourenplaner', label: 'Tourenplaner' },
      { id: 'tourenuebersicht', label: 'Tourenübersicht' },
    ],
  },
  {
    id: 'fleet',
    label: 'Fuhrpark & Händler',
    defaultView: 'fuhrpark',
    items: [
      { id: 'fuhrpark', label: 'Fuhrpark' },
      { id: 'wagenpark', label: 'Wagendienst' },
      { id: 'haendler', label: 'Händler' },
      { id: 'werkstatt', label: 'Werkstatt' },
    ],
  },
  {
    id: 'finance',
    label: 'Finanzen & Bank',
    defaultView: 'bank',
    items: [
      { id: 'bank', label: 'Bank' },
      { id: 'finanzen', label: 'Konto' },
    ],
  },
  {
    id: 'firma',
    label: 'Firma & Personal',
    defaultView: 'personal',
    items: [
      { id: 'personal', label: 'Personal' },
      { id: 'posteingang', label: 'Posteingang' },
      { id: 'werbung', label: 'Werbeagentur' },
      { id: 'vertraege', label: 'Frachtverträge' },
      { id: 'gebaeude', label: 'Gebäude' },
    ],
  },
];

const VIEW_CATEGORY: Record<AppView, NavCategory> = {
  zentrale: 'zentrale',
  dashboard: 'zentrale',
  auswertungen: 'zentrale',
  posteingang: 'firma',
  auftragsmarkt: 'transport',
  spielerboerse: 'transport',
  disposition: 'transport',
  tourenplaner: 'transport',
  tourenuebersicht: 'transport',
  fuhrpark: 'fleet',
  wagenpark: 'fleet',
  haendler: 'fleet',
  werkstatt: 'fleet',
  bank: 'finance',
  finanzen: 'finance',
  personal: 'firma',
  werbung: 'firma',
  vertraege: 'firma',
  gebaeude: 'firma',
};

export function categoryForView(view: AppView): NavCategory {
  return VIEW_CATEGORY[view] ?? 'zentrale';
}

export function categoryDef(id: NavCategory): NavCategoryDef {
  return NAV_CATEGORIES.find((c) => c.id === id) ?? NAV_CATEGORIES[0];
}

export function showsSubnav(view: AppView): boolean {
  return !categoryDef(categoryForView(view)).hideSubnav;
}

/** Views rendered inside the PC desktop chrome (sidebar stays visible). */
export const PC_APP_VIEWS: AppView[] = ['dashboard'];

export function isPcAppView(view: AppView): boolean {
  return PC_APP_VIEWS.includes(view);
}

/** Thematic fullscreen photo behind submenu UI (Zentrale uses the sharp office plate). */
export type SubmenuAtmosphere = 'hall' | 'yard' | 'network' | 'office';

export const ATMOSPHERE_SRC: Record<SubmenuAtmosphere, string> = {
  hall: '/assets/bg-fleet-hall.png',
  yard: '/assets/bg-transport-yard.png',
  network: '/assets/bg-network-stellwerk.png',
  office: '/assets/leitstelle_bg.png',
};

export function atmosphereForView(view: AppView): SubmenuAtmosphere | null {
  if (view === 'zentrale') return null;
  switch (view) {
    case 'fuhrpark':
    case 'wagenpark':
    case 'haendler':
    case 'werkstatt':
      return 'hall';
    case 'disposition':
      return 'network';
    case 'auftragsmarkt':
    case 'spielerboerse':
    case 'tourenplaner':
    case 'tourenuebersicht':
      return 'yard';
    default:
      return 'office';
  }
}
