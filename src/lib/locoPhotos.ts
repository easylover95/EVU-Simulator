/**
 * Local Wikimedia-sourced JPEGs in /public/locos (1280px thumbs, HTTP 200 verified).
 * LocoPhoto walks the list on img onError, then falls back to a glass technical badge (lucide icons).
 *
 * Sources (Commons Special:FilePath?width=1280):
 *   v60.jpg         363 200 Frankfurt-Hauptbahnhof 09052009.JPG
 *   v90.jpg         294 845-3 Köln-Gremberg 2015-10-10-02.JPG
 *   br218.jpg       DB 218 835 in Stuttgart Hbf.jpg
 *   g1206.jpg       Vossloh G 1206 (52510680855).jpg
 *   g2000.jpg       Vossloh G2000-1BB.jpg
 *   br140.jpg       Eilenburg Baureihe 140.jpg
 *   traxx185.jpg    Königswinter DB Raillion 185 152 (52184320574).jpg
 *   vectron193.jpg  Siemens Vectron 193 837.jpg
 *   vectron248.jpg  Siemens Vectron Dual Mode 248 001 in Brake (Utw.).jpg
 *   eurodual159.jpg Regensburg Hbf - Stadler Eurodual - VTG 159 222 - 002.jpg
 *   smartron.jpg    Egoo 192 001 Oldenburg Hbf.jpg
 *   koef3.jpg       DB 333.jpg
 *   br232.jpg       DB-BR 232 (8148176075).jpg
 *   de18.jpg        Vossloh DE 18 (52783883020).jpg
 *   facns.jpg       Schotterzug (4631470229).jpg
 *   zans.jpg        33 80 7844 588-3, 1, Bitterfeld, Bitterfeld-Wolfen, Landkreis Anhalt-Bitterfeld.jpg
 *   sggrss.jpg      Nagykőrös D-VTGCH Sggrss 37 80 4980 208-5 teherkocsi 2022-06-21.JPG
 *   res.jpg         J41 849 Bf Gröbers, Flachwagen Gattung Res.jpg
 *   /wagons/hbbillns.jpg  21 RIV 85 245 7 502-2 Hbbillns Châtillens 28.02.2012.jpg
 */
/**
 * Photo previews for fleet / dealer / depot cards.
 * Dirty Wikimedia JPEGs with DB / Railion cookies stay on disk unused.
 * Clean rasters: original private-operator JPEGs, or *-clean.jpg without those marks.
 */
export const LOCO_PHOTO_URLS = {
  kof3: ['/locos/koef3-clean.jpg'],
  v60: ['/locos/v60-clean.jpg'],
  v90: ['/locos/v90-clean.jpg'],
  br218: ['/locos/br218-clean.jpg'],
  br232: ['/locos/br232-clean.jpg'],
  g1206: ['/locos/g1206.jpg'],
  g2000: ['/locos/g2000.jpg'],
  de18: ['/locos/de18.jpg'],
  br140: ['/locos/br140-clean.jpg'],
  traxx: ['/locos/traxx185-clean.jpg'],
  vectron: ['/locos/vectron193.jpg'],
  smartron: ['/locos/smartron.jpg'],
  vectronDm: ['/locos/vectron248.jpg'],
  eurodual: ['/locos/eurodual159.jpg'],
} as const;

/** Wikimedia HD fallback when /public/wagons/hbbillns.jpg is missing at runtime. */
export const HBBILLNS_WIKIMEDIA_FALLBACK =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/21_RIV_85_245_7_502-2_Hbbillns_Ch%C3%A2tillens_28.02.2012.jpg/1920px-21_RIV_85_245_7_502-2_Hbbillns_Ch%C3%A2tillens_28.02.2012.jpg';

export const WAGON_PHOTO_URLS = {
  facns: ['/locos/facns.jpg'],
  zans: ['/locos/zans.jpg'],
  sggrss: ['/locos/sggrss.jpg'],
  res: ['/locos/res.jpg'],
  eanos: ['/locos/facns.jpg'],
  tads: ['/locos/facns.jpg'],
  hbbillns: ['/wagons/hbbillns.jpg', HBBILLNS_WIKIMEDIA_FALLBACK],
} as const;

/** Dealer catalog IDs → photo thumbs (locos / wagons). */
export const PHOTO_BY_CATALOG_ID: Record<string, string[]> = {
  kof3: [...LOCO_PHOTO_URLS.kof3],
  v60: [...LOCO_PHOTO_URLS.v60],
  v90: [...LOCO_PHOTO_URLS.v90],
  br218: [...LOCO_PHOTO_URLS.br218],
  br232: [...LOCO_PHOTO_URLS.br232],
  g1206: [...LOCO_PHOTO_URLS.g1206],
  br272: [...LOCO_PHOTO_URLS.g2000],
  de18: [...LOCO_PHOTO_URLS.de18],
  br140: [...LOCO_PHOTO_URLS.br140],
  br151: [...LOCO_PHOTO_URLS.br140],
  smartron: [...LOCO_PHOTO_URLS.smartron],
  traxx: [...LOCO_PHOTO_URLS.traxx],
  vectron: [...LOCO_PHOTO_URLS.vectron],
  'vectron-dm': [...LOCO_PHOTO_URLS.vectronDm],
  eurodual: [...LOCO_PHOTO_URLS.eurodual],
  facns: ['/locos/facns.jpg'],
  res: ['/locos/res.jpg'],
  zans: ['/locos/zans.jpg'],
  sggrss: ['/locos/sggrss.jpg'],
  eanos: ['/locos/facns.jpg'],
  tads: ['/locos/facns.jpg'],
  hbbillns: ['/wagons/hbbillns.jpg', HBBILLNS_WIKIMEDIA_FALLBACK],
};

/** EBA class BR 272 = Vossloh G 2000 BB (heavy mainline / construction-train diesel). */
export const BR272_DISPLAY_NAME = 'G 2000 BB (Baureihe 272)';

export function isKof3(designation: string): boolean {
  const d = designation.toLowerCase();
  return d.includes('köf') || d.includes('kof') || d.includes('koef');
}

export function isBr232(designation: string): boolean {
  const d = designation.toLowerCase();
  return d.includes('232') || d.includes('ludmilla');
}

export function isDe18(designation: string): boolean {
  const d = designation.toLowerCase();
  return d.includes('de18') || d.includes('de 18');
}

export function isBr151(designation: string): boolean {
  return designation.toLowerCase().includes('151');
}

export function isBr272(designation: string): boolean {
  const d = designation.toLowerCase();
  return d.includes('272') || d.includes('g 2000') || d.includes('g2000');
}

export function isVectronDualMode(designation: string): boolean {
  const d = designation.toLowerCase();
  return d.includes('248') || d.includes('dual-mode') || d.includes('dual mode') || (d.includes('dual') && d.includes('vectron'));
}

export function isEuroDual(designation: string): boolean {
  const d = designation.toLowerCase();
  return d.includes('159') || d.includes('eurodual') || d.includes('euro dual');
}

export function isVectron(designation: string): boolean {
  const d = designation.toLowerCase();
  return d.includes('vectron') || d.includes('193');
}

export function isSmartron(designation: string): boolean {
  const d = designation.toLowerCase();
  return d.includes('smartron') || d.includes('192');
}

export function getLocoDisplayName(designation: string): string {
  const d = designation.toLowerCase();
  if (isKof3(designation)) return 'Köf III (BR 333)';
  if (d.includes('360') || d.includes('363') || d.includes('365') || d.includes('v 60') || d.includes('v60')) {
    return 'V 60 (BR 360/365)';
  }
  if (d.includes('290') || d.includes('294') || d.includes('v 90') || d.includes('v90')) return 'V 90 (BR 290/294)';
  if (d.includes('218')) return 'BR 218';
  if (isBr232(designation)) return 'BR 232 Ludmilla';
  if (d.includes('1206')) return 'G 1206';
  if (isBr272(designation)) return BR272_DISPLAY_NAME;
  if (isDe18(designation)) return 'DE 18';
  if (isEuroDual(designation)) return 'BR 159 Dual';
  if (isVectronDualMode(designation)) return 'BR 248 Dual Mode';
  if (d.includes('185') || d.includes('186') || d.includes('traxx') || d.includes('f140')) {
    return 'BR 185 / 186 (MS-E)';
  }
  if (isSmartron(designation)) return 'BR 192 (MS-E)';
  if (isVectron(designation)) return 'BR 193 (MS-E)';
  if (isBr151(designation)) return 'BR 151';
  if (d.includes('140') || d.includes('143')) return 'BR 140 / 143';
  return designation;
}

function catalogPhoto(id: string | undefined): string[] | null {
  if (!id) return null;
  const paths = PHOTO_BY_CATALOG_ID[id];
  return paths?.length ? [...paths] : null;
}

export function getLocoPhotoUrls(designation: string, catalogId?: string): string[] {
  const fromCatalog = catalogPhoto(catalogId);
  if (fromCatalog) return fromCatalog;
  const d = designation.toLowerCase();
  if (PHOTO_BY_CATALOG_ID[d]) return [...PHOTO_BY_CATALOG_ID[d]];
  if (isKof3(designation)) return [...LOCO_PHOTO_URLS.kof3];
  if (isBr232(designation)) return [...LOCO_PHOTO_URLS.br232];
  if (isDe18(designation)) return [...LOCO_PHOTO_URLS.de18];
  if (d.includes('360') || d.includes('363') || d.includes('365') || d.includes('v 60') || d.includes('v60')) {
    return [...LOCO_PHOTO_URLS.v60];
  }
  if (d.includes('290') || d.includes('294') || d.includes('v 90') || d.includes('v90')) return [...LOCO_PHOTO_URLS.v90];
  if (d.includes('1206')) return [...LOCO_PHOTO_URLS.g1206];
  if (isBr272(designation)) return [...LOCO_PHOTO_URLS.g2000];
  if (d.includes('185') || d.includes('186') || d.includes('traxx') || d.includes('f140')) {
    return [...LOCO_PHOTO_URLS.traxx];
  }
  if (isEuroDual(designation)) return [...LOCO_PHOTO_URLS.eurodual];
  if (isVectronDualMode(designation)) return [...LOCO_PHOTO_URLS.vectronDm];
  if (isSmartron(designation)) return [...LOCO_PHOTO_URLS.smartron];
  if (isVectron(designation)) return [...LOCO_PHOTO_URLS.vectron];
  if (isBr151(designation) || d.includes('140') || d.includes('143')) return [...LOCO_PHOTO_URLS.br140];
  if (d.includes('218')) return [...LOCO_PHOTO_URLS.br218];
  return [...LOCO_PHOTO_URLS.br218];
}

export function getWagonPhotoUrls(typeCode: string, catalogId?: string): string[] {
  const fromId = catalogPhoto(catalogId);
  if (fromId) return fromId;

  const t = typeCode.toLowerCase();
  if (t.includes('eanos') || t.includes('offen')) return [...WAGON_PHOTO_URLS.eanos];
  if (t.includes('tads') || t.includes('gedeckt')) return [...WAGON_PHOTO_URLS.tads];
  if (t.includes('hbbillns') || t.includes('hbb') || t.includes('schiebewand')) return [...WAGON_PHOTO_URLS.hbbillns];
  if (t.includes('facns') || t.includes('fcs') || t.includes('schotter')) return [...WAGON_PHOTO_URLS.facns];
  if (t.includes('zans') || t.includes('kessel')) return [...WAGON_PHOTO_URLS.zans];
  if (t.includes('sggrss') || t.includes('container')) return [...WAGON_PHOTO_URLS.sggrss];
  if (t.includes('res') || t.includes('flach')) return [...WAGON_PHOTO_URLS.res];
  return [...WAGON_PHOTO_URLS.res];
}

export type DriveKind = 'diesel' | 'elektrik' | 'dual';

export function inferDriveKind(designation: string): DriveKind {
  if (isVectronDualMode(designation) || isEuroDual(designation)) return 'dual';
  const d = designation.toLowerCase();
  if (
    d.includes('140') ||
    d.includes('143') ||
    isBr151(designation) ||
    d.includes('185') ||
    d.includes('186') ||
    d.includes('traxx') ||
    d.includes('f140') ||
    d.includes('192') ||
    d.includes('smartron') ||
    (d.includes('193') && !d.includes('248')) ||
    (d.includes('vectron') && !d.includes('dual'))
  ) {
    return 'elektrik';
  }
  return 'diesel';
}

export function locoGlassTone(designation: string): { from: string; to: string; accent: string } {
  const d = designation.toLowerCase();
  if (
    isKof3(designation) ||
    d.includes('360') ||
    d.includes('363') ||
    d.includes('365') ||
    d.includes('v 60') ||
    d.includes('v60')
  ) {
    return { from: 'from-amber-800', to: 'to-slate-950', accent: 'text-amber-200' };
  }
  if (d.includes('290') || d.includes('294') || d.includes('v 90') || d.includes('v90')) {
    return { from: 'from-orange-800', to: 'to-slate-950', accent: 'text-orange-200' };
  }
  if (d.includes('218') || isBr232(designation) || d.includes('1206') || isBr272(designation) || isDe18(designation)) {
    return { from: 'from-red-900', to: 'to-slate-950', accent: 'text-red-200' };
  }
  if (isVectronDualMode(designation) || isEuroDual(designation)) {
    return { from: 'from-violet-900', to: 'to-slate-950', accent: 'text-violet-200' };
  }
  return { from: 'from-sky-900', to: 'to-slate-950', accent: 'text-sky-200' };
}
