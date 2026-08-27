/**
 * Responsive local photo derivatives for fleet, dealer and depot cards.
 * `scripts/generateResponsiveAssets.py` produces the 320w/640w/960w AVIF and
 * WebP files from the locally archived, attribution-documented source photos.
 * The 640w WebP is the universal fallback; `LocoPhoto` selects a smaller or
 * modern-format source through `<picture>` whenever the browser supports it.
 */
export const LOCO_PHOTO_URLS = {
  kof3: ['/locos/responsive/koef3-clean-640.webp'],
  v60: ['/locos/responsive/v60-clean-640.webp'],
  v90: ['/locos/responsive/v90-clean-640.webp'],
  br218: ['/locos/responsive/br218-clean-640.webp'],
  br232: ['/locos/responsive/br232-clean-640.webp'],
  g1206: ['/locos/responsive/g1206-640.webp'],
  g2000: ['/locos/responsive/g2000-640.webp'],
  de18: ['/locos/responsive/de18-640.webp'],
  br140: ['/locos/responsive/br140-clean-640.webp'],
  traxx: ['/locos/responsive/traxx185-clean-640.webp'],
  vectron: ['/locos/responsive/vectron193-640.webp'],
  smartron: ['/locos/responsive/smartron-640.webp'],
  vectronDm: ['/locos/responsive/vectron248-640.webp'],
  eurodual: ['/locos/responsive/eurodual159-640.webp'],
} as const;

/** Wikimedia HD fallback when the packaged Hbbillns derivative is unavailable. */
export const HBBILLNS_WIKIMEDIA_FALLBACK =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/21_RIV_85_245_7_502-2_Hbbillns_Ch%C3%A2tillens_28.02.2012.jpg/1920px-21_RIV_85_245_7_502-2_Hbbillns_Ch%C3%A2tillens_28.02.2012.jpg';

export const WAGON_PHOTO_URLS = {
  facns: ['/locos/responsive/facns-640.webp'],
  zans: ['/locos/responsive/zans-640.webp'],
  sggrss: ['/locos/responsive/sggrss-640.webp'],
  res: ['/locos/responsive/res-640.webp'],
  eanos: ['/locos/responsive/facns-640.webp'],
  tads: ['/locos/responsive/facns-640.webp'],
  hbbillns: ['/wagons/responsive/hbbillns-640.webp', HBBILLNS_WIKIMEDIA_FALLBACK],
} as const;

export interface ResponsivePhotoSources {
  avifSrcSet: string;
  webpSrcSet: string;
  sizes: string;
}

/** Returns responsive source sets only for packaged local vehicle derivatives. */
export function responsivePhotoSources(src: string): ResponsivePhotoSources | null {
  const match = src.match(/^(.*)-640\.webp$/);
  if (!match || (!src.startsWith('/locos/responsive/') && !src.startsWith('/wagons/responsive/'))) return null;

  const base = match[1];
  const srcSet = (extension: 'avif' | 'webp') =>
    [320, 640, 960].map((width) => `${base}-${width}.${extension} ${width}w`).join(', ');

  return {
    avifSrcSet: srcSet('avif'),
    webpSrcSet: srcSet('webp'),
    sizes: '(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) 33vw, 20rem',
  };
}

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
  facns: [...WAGON_PHOTO_URLS.facns],
  res: [...WAGON_PHOTO_URLS.res],
  zans: [...WAGON_PHOTO_URLS.zans],
  sggrss: [...WAGON_PHOTO_URLS.sggrss],
  eanos: [...WAGON_PHOTO_URLS.eanos],
  tads: [...WAGON_PHOTO_URLS.tads],
  hbbillns: [...WAGON_PHOTO_URLS.hbbillns],
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
