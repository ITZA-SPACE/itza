import type { CropIdMap, MemoryCalendar } from "@itza/engine/memory";
import { packForLocation } from "@itza/knowledge";

/** The region's typical crops, written on seasons whose NDVI shows a crop class (NDVI cannot tell species apart). */
const TYPICAL_CROPS: Record<string, CropIdMap> = {
  "dz-high-plains": { winter_crop: "durum_wheat", summer_crop: "spring_sunflower" },
  "us-central-great-plains": { winter_crop: "winter_wheat", summer_crop: "proso_millet" },
  generic: { winter_crop: "generic_winter_cereal", summer_crop: "generic_oilseed" },
};

/** Knowledge pack, calendar and typical crops for a field, by its centre. */
export function regionFor(lon: number, lat: number) {
  const { pack, fallback } = packForLocation(lon, lat);
  const calendar: MemoryCalendar = {
    agriculturalYearStartMonth: pack.calendar.agricultural_year_start_month.value,
    bareNdviThreshold: pack.calendar.bare_ndvi_threshold.value,
  };
  return { pack, fallback, calendar, crops: TYPICAL_CROPS[pack.id] ?? {} };
}

export type Region = ReturnType<typeof regionFor>;
