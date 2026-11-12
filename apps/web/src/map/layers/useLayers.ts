import type { FieldBundle } from "@itza/engine/contracts";
import { useMemo } from "react";
import { useFieldBundle } from "../../data/useFieldBundle";
import { useSettled } from "../../lib/useSettled";
import { useFieldStore } from "../../state";
import { type DateRange, labelFor, periodFor, shiftYears } from "../timeline/periods";
import { useTimeline } from "../timeline/timelineStore";
import "./builtin";
import { useLayerState } from "./layerStore";
import { getLayer, type LayerDef, listLayers, type Reading, rampColor } from "./registry";
import { coverage } from "./series";

const SETTLE_MS = 800;

/** The days the bundle's series cover, or null while there is no data. */
function boundsOf(bundle: FieldBundle | undefined): DateRange | null {
  const covers = (bundle?.series ?? []).filter((s) => s.cadence !== "static").map(coverage);
  if (covers.length === 0) return null;
  const starts = covers.map((c) => c.start).sort();
  const ends = covers.map((c) => c.end).sort();
  return { start: starts[0] as string, end: ends[ends.length - 1] as string };
}

export interface Side {
  def: LayerDef;
  reading: Reading | null;
  color: string | null;
  /** Date or layer name, for the legend and screen readers. */
  label: string;
  period: DateRange;
}

/** The bundle, the data's date span and what the active layer (and its comparison) reads. */
export function useLayers() {
  const geometry = useSettled(
    useFieldStore((s) => s.field?.geometry),
    SETTLE_MS,
  );
  const { bundle, isComplete } = useFieldBundle(geometry);
  const bounds = useMemo(() => boundsOf(bundle), [bundle]);
  const date = useTimeline((s) => s.date) ?? bounds?.end ?? null;
  const granularity = useTimeline((s) => s.granularity);
  const { activeId, compare, dateB, layerB } = useLayerState();

  const sides = useMemo<{ a: Side | null; b: Side | null }>(() => {
    const all = listLayers();
    const def = getLayer(activeId) ?? all[0];
    if (!bundle || !bounds || !date || !def) return { a: null, b: null };
    const side = (d: LayerDef, on: string, label: string): Side => {
      const period = periodFor(on, granularity);
      const reading = d.compute({ bundle, period });
      return {
        def: d,
        reading,
        color: reading ? rampColor(d.colors, reading.fraction) : null,
        label,
        period,
      };
    };
    const a = side(def, date, labelFor(date, granularity));
    if (compare === "dates") {
      const earlier = shiftYears({ start: date, end: date }, -1).start;
      const on = dateB ?? (earlier.localeCompare(bounds.start) < 0 ? bounds.start : earlier);
      return { a, b: side(def, on, labelFor(on, granularity)) };
    }
    if (compare === "layers") {
      const chosen = layerB === def.id ? undefined : getLayer(layerB ?? "");
      const other = chosen ?? all.find((l) => l.id !== def.id);
      return other ? { a, b: side(other, date, other.id) } : { a, b: null };
    }
    return { a, b: null };
  }, [bundle, bounds, date, granularity, activeId, compare, dateB, layerB]);

  return { bundle, isComplete, bounds, date, granularity, ...sides };
}
