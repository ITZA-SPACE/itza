import type { Provenance } from "@itza/engine/contracts";
import { hasCopy, t } from "../copy";
import { formatDistance } from "./format";

/** A readable name for a source id: this feature's names, then the loader's, else the id itself. */
function sourceName(id: string): string {
  if (hasCopy(`memory.source.${id}`)) return t(`memory.source.${id}` as never);
  if (hasCopy(`data.source.${id}`)) return t(`data.source.${id}` as never);
  return id;
}

const month = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });
const monthYear = (iso: string) => month.format(new Date(`${iso}T00:00:00Z`));

/**
 * The fields of a provenance chip (source, resolution, period) from a contract `Provenance`. The
 * chip names the first source and counts the rest; `detail` lists them all.
 */
export function chipFields(p: Provenance): {
  source: string;
  resolution: string;
  period: string;
  detail?: string;
} {
  const distance = formatDistance(p.resolution_m);
  const names = (p.derived_from?.length ? p.derived_from : [p.source]).map(sourceName);
  const [first = "", ...rest] = names;
  return {
    source: rest.length ? `${first} +${rest.length}` : first,
    resolution: `${distance.value} ${distance.unit}`,
    period: `${monthYear(p.period.start)} – ${monthYear(p.period.end)}`,
    ...(rest.length ? { detail: names.join(", ") } : {}),
  };
}

export const chipLabels = () => ({
  source: t("memory.provenance.label.source"),
  resolution: t("memory.provenance.label.resolution"),
  period: t("memory.provenance.label.period"),
});
