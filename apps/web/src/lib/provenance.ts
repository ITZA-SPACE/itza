import type { Provenance } from "@itza/engine/contracts";
import { hasCopy, t } from "../copy";
import { formatDate, formatDistance } from "./format";

const sourceName = (id: string) =>
  hasCopy(`data.source.${id}`) ? t(`data.source.${id}` as never) : id;

/** The three fields of a provenance chip (source, resolution, period) from a contract `Provenance`. */
export function chipFields(p: Provenance): { source: string; resolution: string; period: string } {
  const distance = formatDistance(p.resolution_m);
  const sources = p.derived_from?.length ? p.derived_from : [p.source];
  return {
    source: sources.map(sourceName).join(", "),
    resolution: `${distance.value} ${distance.unit}`,
    period: `${formatDate(p.period.start)} – ${formatDate(p.period.end)}`,
  };
}

export const chipLabels = () => ({
  source: t("memory.provenance.label.source"),
  resolution: t("memory.provenance.label.resolution"),
  period: t("memory.provenance.label.period"),
});
