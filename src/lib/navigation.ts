export type AppView =
  | 'zentrale'
  | 'terminalalerts'
  | 'dashboard'
  | 'fuhrpark'
  | 'wagenpark'
  | 'auftragsmarkt'
  | 'terminal'
  | 'terminalmanagement'
  | 'terminalanalytics'
  | 'zugbildung'
  | 'disposition'
  | 'personal'
  | 'finanzen'
  | 'auswertungen'
  | 'statistikarchiv'
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
    items: [
      { id: 'zentrale', label: 'Büro' },
      { id: 'terminalalerts', label: 'Warnzentrale' },
    ],
  },
  {
    id: 'transport',
    label: 'Transport',
    defaultView: 'auftragsmarkt',
    items: [
      { id: 'auftragsmarkt', label: 'Frachtbörse' },
      { id: 'terminal', label: 'Terminal' },
      { id: 'terminalmanagement', label: 'Management' },
      { id: 'terminalanalytics', label: 'Terminal-Analyse' },
      { id: 'zugbildung', label: 'Baugleis-Zug' },
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
  terminalalerts: 'zentrale',
  dashboard: 'zentrale',
  auswertungen: 'zentrale',
  statistikarchiv: 'zentrale',
  posteingang: 'firma',
  auftragsmarkt: 'transport',
  terminal: 'transport',
  terminalmanagement: 'transport',
  terminalanalytics: 'transport',
  zugbildung: 'transport',
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

/** Compact universal fallbacks for predictive cache warming; the renderer itself uses CSS image-set(). */
export const ATMOSPHERE_SRC: Record<SubmenuAtmosphere, string> = {
  hall: '/assets/responsive/bg-fleet-hall-1536.webp',
  yard: '/assets/responsive/bg-transport-yard-1536.webp',
  network: '/assets/responsive/bg-network-stellwerk-1536.webp',
  office: '/assets/leitstelle_bg.webp',
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
    case 'terminal':
    case 'terminalmanagement':
    case 'terminalanalytics':
    case 'zugbildung':
    case 'spielerboerse':
    case 'tourenplaner':
    case 'tourenuebersicht':
      return 'yard';
    default:
      return 'office';
  }
}

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

const prefetchedAssets = new Set<string>();

function shouldSkipAssetPrefetch(): boolean {
  if (typeof window === 'undefined') return true;
  if (document.documentElement.dataset.performanceMode === 'power-saver') return true;

  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return Boolean(connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g');
}

function browserPrefersAvif(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('background-image', "image-set(url('asset.avif') type('image/avif') 1x)");
}

function responsiveAtmosphereAsset(theme: SubmenuAtmosphere): string | null {
  if (theme === 'office') return null;
  const nameByTheme: Record<Exclude<SubmenuAtmosphere, 'office'>, string> = {
    hall: 'bg-fleet-hall',
    yard: 'bg-transport-yard',
    network: 'bg-network-stellwerk',
  };
  const width = window.matchMedia('(max-width: 767px)').matches ? 768 : 1536;
  const extension = browserPrefersAvif() ? 'avif' : 'webp';
  return `/assets/responsive/${nameByTheme[theme]}-${width}.${extension}`;
}

function vehiclePreviewAssets(view: AppView): string[] {
  const extension = browserPrefersAvif() ? 'avif' : 'webp';
  if (view === 'fuhrpark' || view === 'haendler') {
    return [
      `/locos/responsive/br218-clean-640.${extension}`,
      `/locos/responsive/v90-clean-640.${extension}`,
    ];
  }
  if (view === 'wagenpark') {
    return [
      `/locos/responsive/facns-640.${extension}`,
      `/wagons/responsive/hbbillns-640.${extension}`,
    ];
  }
  return [];
}

/**
 * Warm only the likely next local images after a navigation intent. The low
 * priority browser prefetch is purposely disabled for the user's power-saver
 * mode and metered or very slow connections.
 */
export function prefetchAssetsForView(view: AppView): void {
  if (shouldSkipAssetPrefetch()) return;

  const atmosphere = atmosphereForView(view);
  const assets = [
    ...(atmosphere ? [responsiveAtmosphereAsset(atmosphere)].filter((asset): asset is string => Boolean(asset)) : []),
    ...vehiclePreviewAssets(view),
  ];

  for (const asset of assets) {
    if (prefetchedAssets.has(asset)) continue;
    prefetchedAssets.add(asset);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'image';
    link.href = asset;
    if (asset.endsWith('.avif')) link.type = 'image/avif';
    document.head.append(link);
  }
}
