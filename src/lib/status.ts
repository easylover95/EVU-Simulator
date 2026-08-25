import type {
  LocoStatus,
  DriverStatus,
  OrderStatus,
  OrderType,
  AssignmentStatus,
  WagonStatus,
  WagonCategory,
  BrakePosition,
  NotificationType,
} from '@/lib/supabase';
import { getLocoPhotoUrls } from '@/lib/locoPhotos';

export const locoStatusConfig: Record<
  LocoStatus,
  { label: string; color: string; dot: string; text: string; border: string }
> = {
  frei: {
    label: 'Frei',
    color: 'bg-emerald-500/15',
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
  },
  einsatz: {
    label: 'Im Einsatz',
    color: 'bg-sky-500/15',
    dot: 'bg-sky-400',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
  },
  v1: {
    label: 'V1-Dienst',
    color: 'bg-amber-500/15',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
  },
  wartung: {
    label: 'Wartung',
    color: 'bg-rose-500/15',
    dot: 'bg-rose-400',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
  },
  stillgelegt: {
    label: 'Stillgelegt',
    color: 'bg-slate-500/15',
    dot: 'bg-slate-400',
    text: 'text-slate-300',
    border: 'border-slate-500/40',
  },
};

export const driverStatusConfig: Record<
  DriverStatus,
  { label: string; color: string; dot: string; text: string }
> = {
  verfuegbar: {
    label: 'Verfügbar',
    color: 'bg-emerald-500/15',
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
  },
  im_einsatz: {
    label: 'Im Einsatz',
    color: 'bg-sky-500/15',
    dot: 'bg-sky-400',
    text: 'text-sky-300',
  },
  pause: {
    label: 'Pause',
    color: 'bg-amber-500/15',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
  },
  urlaub: {
    label: 'Urlaub',
    color: 'bg-slate-500/15',
    dot: 'bg-slate-400',
    text: 'text-slate-300',
  },
  krank: {
    label: 'Krank',
    color: 'bg-rose-500/15',
    dot: 'bg-rose-400',
    text: 'text-rose-300',
  },
};

export const orderStatusConfig: Record<
  OrderStatus,
  { label: string; color: string; text: string; border: string }
> = {
  offen: {
    label: 'Offen',
    color: 'bg-amber-500/15',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
  },
  zugewiesen: {
    label: 'Zuweisung/Dispo',
    color: 'bg-sky-500/15',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
  },
  abgeschlossen: {
    label: 'Abgeschlossen',
    color: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
  },
  abgelehnt: {
    label: 'Abgelehnt',
    color: 'bg-rose-500/15',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
  },
};

export const orderTypeConfig: Record<
  OrderType,
  { label: string; color: string; text: string; icon: string }
> = {
  gueterverkehr: {
    label: 'Güterverkehr',
    color: 'bg-sky-500/15',
    text: 'text-sky-300',
    icon: 'freight',
  },
  baugleis: {
    label: 'Baustelleneinsatz',
    color: 'bg-orange-500/15',
    text: 'text-orange-300',
    icon: 'construction',
  },
};

export const assignmentStatusConfig: Record<
  AssignmentStatus,
  { label: string; color: string; text: string }
> = {
  geplant: {
    label: 'Geplant',
    color: 'bg-amber-500/15',
    text: 'text-amber-300',
  },
  aktiv: {
    label: 'Aktiv',
    color: 'bg-sky-500/15',
    text: 'text-sky-300',
  },
  abgeschlossen: {
    label: 'Abgeschlossen',
    color: 'bg-emerald-500/15',
    text: 'text-emerald-300',
  },
  abgebrochen: {
    label: 'Abgebrochen',
    color: 'bg-rose-500/15',
    text: 'text-rose-300',
  },
};

export const wagonStatusConfig: Record<
  WagonStatus,
  { label: string; color: string; text: string; border: string }
> = {
  verfuegbar: {
    label: 'Verfügbar',
    color: 'bg-emerald-500/15',
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
  },
  im_einsatz: {
    label: 'Im Einsatz',
    color: 'bg-sky-500/15',
    text: 'text-sky-300',
    border: 'border-sky-500/30',
  },
  wartung: {
    label: 'Wartung',
    color: 'bg-amber-500/15',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
  },
  frist_abgelaufen: {
    label: 'Frist abgelaufen',
    color: 'bg-rose-500/15',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
  },
};

export const wagonCategoryConfig: Record<
  WagonCategory,
  { label: string; color: string; text: string }
> = {
  schotter: {
    label: 'Schüttgut',
    color: 'bg-orange-500/15',
    text: 'text-orange-300',
  },
  flach: {
    label: 'Flachwagen',
    color: 'bg-sky-500/15',
    text: 'text-sky-300',
  },
  container: {
    label: 'Containerwagen',
    color: 'bg-emerald-500/15',
    text: 'text-emerald-300',
  },
  kessel: {
    label: 'Kesselwagen',
    color: 'bg-amber-500/15',
    text: 'text-amber-300',
  },
  offen: {
    label: 'Offener Wagen',
    color: 'bg-stone-500/15',
    text: 'text-stone-300',
  },
  schiebewand: {
    label: 'Schiebewandwagen',
    color: 'bg-teal-500/15',
    text: 'text-teal-300',
  },
  gedeckt: {
    label: 'Gedeckter Schüttgutwagen',
    color: 'bg-lime-500/15',
    text: 'text-lime-300',
  },
};

export const brakePositionConfig: Record<
  BrakePosition,
  { label: string; description: string; color: string }
> = {
  G: {
    label: 'Stellung G',
    description: 'Güterzugbremsung (langsames Lösen)',
    color: 'text-sky-300',
  },
  P: {
    label: 'Stellung P',
    description: 'Personenzugbremsung (schnelles Lösen)',
    color: 'text-amber-300',
  },
  R: {
    label: 'Stellung R',
    description: 'Reisezugbremsung (Rapid)',
    color: 'text-emerald-300',
  },
};

export const notificationConfig: Record<
  NotificationType,
  { label: string; color: string; text: string; dot: string }
> = {
  info: {
    label: 'Info',
    color: 'bg-sky-900/40',
    text: 'text-sky-300',
    dot: 'bg-sky-400',
  },
  success: {
    label: 'Erfolg',
    color: 'bg-emerald-900/40',
    text: 'text-emerald-300',
    dot: 'bg-emerald-400',
  },
  warning: {
    label: 'Warnung',
    color: 'bg-amber-900/40',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
  },
  error: {
    label: 'Fehler',
    color: 'bg-rose-900/40',
    text: 'text-rose-300',
    dot: 'bg-rose-400',
  },
};

export const MIN_BRH_RANGE: Record<OrderType, { min: number; max: number }> = {
  gueterverkehr: { min: 60, max: 75 },
  baugleis: { min: 50, max: 65 },
};

export function clampOrderMinBrh(type: string, minBrh: number): number {
  const range = MIN_BRH_RANGE[type as OrderType] ?? MIN_BRH_RANGE.gueterverkehr;
  const n = Number.isFinite(minBrh) ? minBrh : range.min;
  return Math.min(range.max, Math.max(range.min, Math.round(n)));
}

export function getLocoStatusConfig(status: string) {
  return locoStatusConfig[status as LocoStatus] ?? locoStatusConfig.frei;
}

export function getDriverStatusConfig(status: string) {
  return driverStatusConfig[status as DriverStatus] ?? driverStatusConfig.verfuegbar;
}

export function getOrderStatusConfig(status: string) {
  return orderStatusConfig[status as OrderStatus] ?? orderStatusConfig.offen;
}

export function getOrderTypeConfig(type: string) {
  return orderTypeConfig[type as OrderType] ?? orderTypeConfig.gueterverkehr;
}

export function getAssignmentStatusConfig(status: string) {
  return assignmentStatusConfig[status as AssignmentStatus] ?? assignmentStatusConfig.geplant;
}

export function getWagonStatusConfig(status: string) {
  return wagonStatusConfig[status as WagonStatus] ?? wagonStatusConfig.verfuegbar;
}

export function getWagonCategoryConfig(category: string) {
  return wagonCategoryConfig[category as WagonCategory] ?? wagonCategoryConfig.flach;
}

export function getBrakePositionConfig(position: string) {
  return brakePositionConfig[position as BrakePosition] ?? brakePositionConfig.G;
}

export function getNotificationConfig(type: string) {
  return notificationConfig[type as NotificationType] ?? notificationConfig.info;
}

export function getLocoPillClass(status: string): string {
  switch (status) {
    case 'frei':
      return 'fi-pill fi-pill-green';
    case 'einsatz':
      return 'fi-pill fi-pill-blue';
    case 'v1':
      return 'fi-pill fi-pill-orange';
    case 'wartung':
      return 'fi-pill fi-pill-red';
    case 'stillgelegt':
      return 'fi-pill fi-pill-red';
    default:
      return 'fi-pill fi-pill-green';
  }
}

export function getDriverPillClass(status: string): string {
  switch (status) {
    case 'verfuegbar':
      return 'fi-pill fi-pill-green';
    case 'im_einsatz':
      return 'fi-pill fi-pill-blue';
    case 'pause':
    case 'urlaub':
      return 'fi-pill fi-pill-orange';
    case 'krank':
      return 'fi-pill fi-pill-red';
    default:
      return 'fi-pill fi-pill-green';
  }
}

export function getWagonPillClass(status: string): string {
  switch (status) {
    case 'verfuegbar':
      return 'fi-pill fi-pill-green';
    case 'im_einsatz':
      return 'fi-pill fi-pill-blue';
    case 'wartung':
      return 'fi-pill fi-pill-orange';
    case 'frist_abgelaufen':
      return 'fi-pill fi-pill-red';
    default:
      return 'fi-pill fi-pill-green';
  }
}

export function getOrderPillClass(status: string): string {
  switch (status) {
    case 'offen':
      return 'fi-pill fi-pill-orange';
    case 'zugewiesen':
      return 'fi-pill fi-pill-blue';
    case 'abgeschlossen':
      return 'fi-pill fi-pill-green';
    case 'abgelehnt':
      return 'fi-pill fi-pill-red';
    default:
      return 'fi-pill fi-pill-orange';
  }
}

export function getAssignmentPillClass(status: string): string {
  switch (status) {
    case 'geplant':
      return 'fi-pill fi-pill-orange';
    case 'aktiv':
      return 'fi-pill fi-pill-blue';
    case 'abgeschlossen':
      return 'fi-pill fi-pill-green';
    case 'abgebrochen':
      return 'fi-pill fi-pill-red';
    default:
      return 'fi-pill fi-pill-blue';
  }
}

export function locoPreviewSrc(designation: string): string {
  return getLocoPhotoUrls(designation)[0];
}

export function formatEuro(value: number): string {
  const n = Number(value);
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

export function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
}

export function driverStatusWithRecovery(status: string, recoveryHoursLeft: number | null | undefined): string {
  const cfg = getDriverStatusConfig(status);
  if (
    (status === 'krank' || status === 'pause' || status === 'urlaub') &&
    recoveryHoursLeft != null &&
    recoveryHoursLeft > 0
  ) {
    return `${cfg.label} (noch ${recoveryHoursLeft}h)`;
  }
  return cfg.label;
}

export function timeRemaining(
  deadline: string,
  now: Date | number = Date.now(),
  options?: { accepted?: boolean },
): {
  text: string;
  urgent: boolean;
  critical: boolean;
} {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const diff = new Date(deadline).getTime() - nowMs;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (diff <= 0) {
    // Überfällig is only for accepted contracts that missed departure.
    if (options?.accepted === false) {
      return { text: 'Abgelaufen', urgent: true, critical: true };
    }
    return { text: 'Überfällig', urgent: true, critical: true };
  }
  if (hours < 12) return { text: `${hours}h ${minutes}m`, urgent: true, critical: true };
  if (hours < 24) return { text: `${hours}h ${minutes}m`, urgent: true, critical: false };
  const days = Math.floor(hours / 24);
  return { text: `${days}T ${hours % 24}h`, urgent: false, critical: false };
}
