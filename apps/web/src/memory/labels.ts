import type { SeasonLabel } from "@itza/engine/memory";
import type { CopyKey } from "../copy";

export const LABEL_COPY: Record<SeasonLabel, CopyKey> = {
  winter_crop: "memory.label.winter_crop",
  summer_crop: "memory.label.summer_crop",
  double_crop: "memory.label.double_crop",
  fallow_or_bare: "memory.label.fallow_or_bare",
  uncertain: "memory.label.uncertain",
};

export const CONFIDENCE_COPY = {
  high: "confidence.high",
  medium: "confidence.medium",
  low: "confidence.low",
} as const satisfies Record<string, CopyKey>;
