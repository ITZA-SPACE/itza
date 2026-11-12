import type { Rotation } from "@itza/engine/contracts";
import type { PaletteCrop } from "@itza/engine/worker";
import { t } from "../copy";

export const DESIGN_ID = "design";

/** The farmer's design as a rotation the engine can replay. */
export function designRotation(crops: readonly string[]): Rotation {
  return {
    id: DESIGN_ID,
    name: t("builder.design.name"),
    seasons: crops.map((crop) => ({ crop })),
  } as Rotation;
}

const FAMILY_COLORS = [
  "bg-cat-1",
  "bg-cat-2",
  "bg-cat-3",
  "bg-cat-4",
  "bg-cat-5",
  "bg-cat-6",
  "bg-cat-7",
] as const;

/** One color per crop family, in the order the palette first meets them; fallow stays neutral. */
export function familyColors(palette: readonly PaletteCrop[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const crop of palette) {
    if (crop.family && !colors.has(crop.family)) {
      colors.set(crop.family, FAMILY_COLORS[colors.size % FAMILY_COLORS.length] as string);
    }
  }
  return colors;
}
