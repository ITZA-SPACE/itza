import type { EconomicsInput } from "@itza/engine/economics";
import type { CompareResult, TimelineResult, Weighted } from "@itza/engine/worker";
import {
  Card,
  ClimateStrip,
  type ClimateStripItem,
  ReplayBars,
  type ReplayLabels,
  SeasonSnapshot,
  Skeleton,
} from "@itza/ui-kit";
import { useId, useMemo, useState } from "react";
import { t } from "../copy";
import { fmt, formatDate } from "../lib/format";
import { SeasonMargins } from "./economics/SeasonMargins";
import { useTimeline } from "./useCompare";

export function replayLabels(): ReplayLabels {
  return {
    play: t("compare.replay.play"),
    pause: t("compare.replay.pause"),
    restart: t("compare.replay.restart"),
    scrubber: t("compare.replay.scrubber"),
    soilWater: t("compare.replay.soilWater"),
    stress: t("compare.replay.stress"),
    cover: t("compare.replay.cover"),
    ndvi: t("compare.replay.ndvi"),
    rain: t("compare.replay.rain"),
    baseline: t("compare.baseline.badge"),
    counterfactual: t("compare.label"),
    formatDate,
    months: Array.from({ length: 12 }, (_, m) => t(`compare.month.${m}` as never)),
    readout: ({ name, soilWaterPct, stressPct, coverPct }) =>
      fmt(t("compare.replay.readout"), {
        name,
        water: soilWaterPct,
        stress: stressPct,
        cover: coverPct,
      }),
    laneSummary: ({ name, stressDays, minSoilWaterPct }) =>
      fmt(t("compare.replay.laneSummary"), { name, stressDays, min: minSoilWaterPct }),
  };
}

/**
 * The Season Replay view (F-07): pick a season, which opens on the hardest one, and watch every
 * rotation go through it day by day beside the greenness the satellites observed that season.
 */
export function ReplayView({
  data,
  compareKey,
  economics,
}: {
  data: CompareResult & Weighted;
  compareKey: string | null;
  economics: EconomicsInput;
}) {
  const id = useId();
  const [chosen, setChosen] = useState<string | null>(null);
  const season = chosen ?? data.worstSeason;
  const timeline = useTimeline(compareKey, season);

  const strip: ClimateStripItem[] = data.seasons.map((s) => ({
    id: s.label,
    label: s.label,
    value: s.meanScore,
    caption: fmt(t("compare.season.caption"), { season: s.label, score: s.meanScore.toFixed(2) }),
  }));
  if (data.seasons.length === 0) {
    return <p className="text-body text-ink-muted">{t("compare.seasons.empty")}</p>;
  }
  return (
    <Card aria-labelledby={`${id}-title`} className="space-y-4">
      <div className="space-y-1">
        <h3 id={`${id}-title`} className="text-title font-semibold text-ink">
          {t("compare.replay.title")}
        </h3>
        <p className="text-body text-ink-muted">{t("compare.replay.body")}</p>
      </div>
      <ClimateStrip
        items={strip}
        label={t("compare.seasons.label")}
        {...(season ? { selectedId: season } : {})}
        onSelect={setChosen}
      />
      {timeline.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : timeline.data ? (
        <ReplayBody
          data={data}
          timeline={timeline.data}
          economics={economics}
          isWorst={timeline.data.season === data.worstSeason}
        />
      ) : null}
    </Card>
  );
}

function ReplayBody({
  data,
  timeline,
  economics,
  isWorst,
}: {
  data: CompareResult & Weighted;
  timeline: TimelineResult;
  economics: EconomicsInput;
  isWorst: boolean;
}) {
  const names = useMemo(() => new Map(data.rotations.map((r) => [r.id, r.name])), [data.rotations]);
  return (
    <div className="space-y-4">
      <SeasonSnapshot
        season={timeline.season}
        isWorst={isWorst}
        rows={timeline.lanes.map((lane) => {
          const score = timeline.scores.find((s) => s.rotation_id === lane.rotation_id);
          return {
            id: lane.rotation_id,
            name: names.get(lane.rotation_id) ?? lane.name,
            isBaseline: lane.rotation_id === data.baselineId,
            crop: lane.crop,
            score: score?.composite ?? 0,
            band: score?.band ?? null,
          };
        })}
        labels={{
          heading: fmt(t("compare.season.heading"), { season: timeline.season }),
          score: t("compare.season.score"),
          band: (p10, p90) => fmt(t("compare.season.band"), { p10, p90 }),
          baseline: t("compare.baseline.badge"),
          worst: t("compare.season.worst"),
        }}
      />
      <SeasonMargins
        season={timeline.season}
        economics={economics}
        rotations={data.rotations.map((r) => ({
          id: r.id,
          name: r.name,
          result: data.output.results.find((x) => x.rotation_id === r.id),
        }))}
      />
      <ReplayBars
        key={timeline.season}
        startDate={timeline.startDate}
        days={timeline.days}
        rain={timeline.rain}
        ndvi={timeline.ndvi}
        autoPlay
        labels={replayLabels()}
        lanes={timeline.lanes.map((lane) => ({
          id: lane.rotation_id,
          name: names.get(lane.rotation_id) ?? lane.name,
          isBaseline: lane.rotation_id === data.baselineId,
          crop: lane.crop,
          soilWater: lane.soilWater,
          stress: lane.stress,
          cover: lane.cover,
        }))}
      />
    </div>
  );
}
