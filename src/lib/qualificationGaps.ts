import type { Driver, Locomotive, Order, Wagon } from '@/lib/supabase';
import { calculateTrainBrh, checkWagonAvailability } from '@/lib/brh';
import type { StaffMeta, StaffRank } from '@/lib/jobcenter';
import { seriesDispatchBlock, seriesIdForLoco, seriesLabel } from '@/lib/personal';

export type QualificationGapKind = 'series' | 'wagonInspector' | 'brakeProbe';

export interface QualificationGap {
  kind: QualificationGapKind;
  label: string;
  detail: string;
  /** True only when the live dispatch/runtime check actually blocks departure. */
  blocksDispatch: boolean;
  code: string;
}

export function highestWagonInspectorRank(staffMeta: Record<string, StaffMeta> | null | undefined): StaffRank | 0 {
  let best: StaffRank | 0 = 0;
  for (const entry of Object.values(staffMeta ?? {})) {
    if (entry.role !== 'wagenpruefer') continue;
    if (entry.rank > best) best = entry.rank;
  }
  return best;
}

export function requiredWagonInspectorRank(
  order: Pick<Order, 'required_wagon_type' | 'required_wagon_count'> | null | undefined,
  wagons: Wagon[],
): StaffRank | 0 {
  if (!order?.required_wagon_type || !order.required_wagon_count) return 0;
  const type = order.required_wagon_type.toLowerCase();
  let maxFrist = 0;
  for (const wagon of wagons) {
    if (wagon.type_code.toLowerCase() !== type) continue;
    maxFrist = Math.max(maxFrist, Math.max(0, Number(wagon.frist_level) || 0));
  }
  if (maxFrist >= 3) return 3;
  if (maxFrist >= 2) return 2;
  if (maxFrist >= 1) return 1;
  return 0;
}

/**
 * Visual wagon-inspector gap. There is no dispatch gate that a Prüfer must stand
 * at the train; the rank is compared to Wagenpark-Friststufen only.
 */
export function wagonInspectorGap(
  order: Pick<Order, 'required_wagon_type' | 'required_wagon_count'> | null | undefined,
  wagons: Wagon[],
  staffMeta: Record<string, StaffMeta> | null | undefined,
): QualificationGap | null {
  const required = requiredWagonInspectorRank(order, wagons);
  if (required <= 0) return null;
  const have = highestWagonInspectorRank(staffMeta);
  if (have >= required) return null;
  return {
    kind: 'wagonInspector',
    label: 'Wagenprüfer-Stufe',
    detail:
      have <= 0
        ? `Wagenpark führt Friststufe ${required} — kein Wagenprüfer im Personalstamm (kein Dispo-Zwang).`
        : `Wagenpark-Friststufe ${required} übersteigt Wagenprüfer-Stufe ${have} (Anzeige, kein Abfahrt-Gate).`,
    blocksDispatch: false,
    code: 'wagon_inspector_rank',
  };
}

export function seriesQualificationGap(
  loco: Pick<Locomotive, 'designation'> | null | undefined,
  seriesIds: string[] | null | undefined,
  driverLabel?: string,
): QualificationGap | null {
  const block = seriesDispatchBlock(loco, seriesIds);
  if (!block) return null;
  const series = seriesLabel(seriesIdForLoco(loco));
  return {
    kind: 'series',
    label: 'Baureihenberechtigung',
    detail: driverLabel ? `${driverLabel}: ${block}` : block,
    blocksDispatch: true,
    code: `series_${series}`,
  };
}

/** Maps the live Brh check to the Bremszettel / Bremsprobe clearance shown in Dispo. */
export function brakeProbeGap(
  order: Order | null | undefined,
  loco: Locomotive | null | undefined,
  wagons: Wagon[],
): QualificationGap | null {
  if (!order || !loco) return null;
  const brh = calculateTrainBrh(loco, order, wagons);
  if (brh.passed) return null;
  return {
    kind: 'brakeProbe',
    label: 'Bremsprobenberechtigung / Bremszettel',
    detail: brh.message,
    blocksDispatch: true,
    code: 'brh_failed',
  };
}

export function collectQualificationGaps(input: {
  order: Order | null | undefined;
  loco: Locomotive | null | undefined;
  driver?: Driver | null;
  driver2?: Driver | null;
  wagons: Wagon[];
  staffMeta: Record<string, StaffMeta>;
}): QualificationGap[] {
  const gaps: QualificationGap[] = [];
  const series1 = seriesQualificationGap(
    input.loco,
    input.driver ? input.staffMeta[input.driver.id]?.seriesIds : [],
    input.driver?.name,
  );
  if (series1) gaps.push(series1);
  if (input.driver2) {
    const series2 = seriesQualificationGap(
      input.loco,
      input.staffMeta[input.driver2.id]?.seriesIds,
      input.driver2.name,
    );
    if (series2) gaps.push(series2);
  }
  const inspector = wagonInspectorGap(input.order, input.wagons, input.staffMeta);
  if (inspector) gaps.push(inspector);
  const brake = brakeProbeGap(input.order ?? null, input.loco ?? null, input.wagons);
  if (brake) gaps.push(brake);
  const wagonNeed = input.order ? checkWagonAvailability(input.order, input.wagons) : null;
  if (wagonNeed && !wagonNeed.sufficient && wagonNeed.type) {
    gaps.push({
      kind: 'brakeProbe',
      label: 'Wagenseinheit',
      detail: `Es fehlen ${wagonNeed.missing} Wagen der Gattung ${wagonNeed.type} für den Bremszettel.`,
      blocksDispatch: true,
      code: 'wagon_unit_missing',
    });
  }
  return gaps;
}

export function blockingQualificationGaps(gaps: QualificationGap[]): QualificationGap[] {
  return gaps.filter((gap) => gap.blocksDispatch);
}
