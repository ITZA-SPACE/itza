import type { SeasonResult } from "@itza/engine/memory";
import type { KnowledgePack } from "@itza/knowledge";
import { useId } from "react";
import { type CopyKey, t } from "../copy";
import { fmt } from "../lib/format";
import type { ConfirmedSeason } from "../state";
import { CONFIDENCE_COPY, LABEL_COPY } from "./labels";
import { SeasonIcon } from "./SeasonIcon";

/**
 * The proposed history: one button per season with an icon, the label and its confidence. Tapping
 * a season opens it. Confirmed seasons say so in words and show the crop the farmer chose.
 */
export function Timeline({
  seasons,
  confirmed,
  selected,
  onSelect,
  pack,
}: {
  seasons: readonly SeasonResult[];
  confirmed: readonly ConfirmedSeason[];
  selected: string | null;
  onSelect: (season: string) => void;
  pack: KnowledgePack;
}) {
  const id = useId();
  const names = new Map(pack.crops.map((c) => [c.id, c.name]));
  const choice = new Map(confirmed.map((c) => [c.season, c.crop]));
  return (
    <ul
      aria-labelledby={`${id}-title`}
      className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2"
    >
      <li id={`${id}-title`} className="sr-only">
        {t("memory.timeline.label")}
      </li>
      {seasons.map((s) => {
        const label = s.phenology.season;
        const crop = choice.get(label);
        const isSelected = label === selected;
        const confidence = t(CONFIDENCE_COPY[s.phenology.inferred.confidence] as CopyKey);
        return (
          <li key={label}>
            <button
              type="button"
              aria-pressed={isSelected}
              aria-label={fmt(t("memory.timeline.item"), {
                season: label,
                label: t(LABEL_COPY[s.label]),
                confidence,
                status: crop ? t("memory.status.confirmed") : t("memory.status.proposed"),
              })}
              onClick={() => onSelect(label)}
              className={`flex min-h-11 w-full flex-col items-start gap-1 rounded-card border bg-surface p-2 text-left hover:border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                isSelected ? "border-2 border-ink" : "border-line-soft"
              }`}
            >
              <span className="flex w-full items-center justify-between gap-1">
                <span className="text-body font-semibold text-ink">{label}</span>
                <SeasonIcon label={s.label} className="shrink-0 text-accent-strong" />
              </span>
              <span className="text-caption text-ink">{t(LABEL_COPY[s.label])}</span>
              <span className="text-caption text-ink-muted">{confidence}</span>
              <span className="text-caption font-medium text-ink">
                {crop
                  ? fmt(t("memory.timeline.confirmedAs"), { crop: names.get(crop) ?? crop })
                  : t("memory.status.proposed")}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
