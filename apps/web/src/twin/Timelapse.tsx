import { IconButton, ProvenanceChip, Slider, Tabs, TabsList, TabsTrigger } from "@itza/ui-kit";
import { Droplets, History, Pause, Play, Repeat } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { chipLabels } from "../lib/provenance";
import { MapTool } from "../map/MapTool";
import { useTimeline } from "../map/timeline";
import { createDrape, type Drape } from "./drape";
import { type FrameSet, nearestFrame } from "./frames";
import { Playback, SPEEDS, type Speed } from "./playback";
import { decodedSize, usePreloadedFrames } from "./preload";
import { useReplaySeason } from "./replaySeason";

const NDVI_OPACITY = 0.85;
const MOISTURE_OPACITY = 0.45;

const month = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });
const short = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });
const label = (iso: string) => month.format(new Date(`${iso}T00:00:00Z`));
const shortLabel = (iso: string) => short.format(new Date(`${iso}T00:00:00Z`));

const SPEED_LABEL: Record<Speed, "slow" | "normal" | "fast"> = {
  4: "slow",
  8: "normal",
  12: "fast",
};

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The time-lapse: every satellite frame of the field draped on the terrain, played with a cross-fade,
 * and following the app's timeline. Frames are decoded before they are needed.
 */
export function Timelapse({
  map,
  frames,
  onView,
}: {
  map: MapLibreMap | null;
  frames: FrameSet;
  /** Tells the page which frame is showing and whether moisture is on (the 2D view draws them itself). */
  onView?: (view: { index: number; moisture: boolean }) => void;
}) {
  const ndvi = usePreloadedFrames(frames.ndvi);
  const moisture = usePreloadedFrames(frames.moisture);
  const season = useReplaySeason((s) => s.season);
  const [index, setIndex] = useState(Math.max(0, frames.ndvi.length - 1));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(4);
  const [loop, setLoop] = useState(true);
  const [showMoisture, setShowMoisture] = useState(false);
  const [replayOn, setReplayOn] = useState(false);

  const drapes = useRef<{ ndvi: Drape; moisture: Drape } | null>(null);
  const player = useRef<Playback | null>(null);
  const bitmaps = useRef({ ndvi: ndvi.bitmaps, moisture: moisture.bitmaps });
  bitmaps.current = { ndvi: ndvi.bitmaps, moisture: moisture.bitmaps };
  const indexNow = useRef(index);
  indexNow.current = index;
  const lastDate = useRef<string | null>(null);
  const moistureOn = useRef(false);
  moistureOn.current = showMoisture;
  const onViewNow = useRef(onView);
  onViewNow.current = onView;
  const framesNow = useRef(frames);
  framesNow.current = frames;

  const first = frames.ndvi[0];
  const bounds = first?.bounds;
  const width = first?.width;
  const height = first?.height;

  /** Frames that fall in the replayed season, or all of them. */
  const range = useMemo<[number, number]>(() => {
    const last = frames.ndvi.length - 1;
    if (!replayOn || !season) return [0, Math.max(0, last)];
    const inside = frames.ndvi.flatMap((f, i) =>
      f.date >= season.start && f.date <= season.end ? [i] : [],
    );
    return inside.length > 0
      ? [inside[0] as number, inside[inside.length - 1] as number]
      : [0, Math.max(0, last)];
  }, [frames, replayOn, season]);
  const seasonEmpty =
    season !== null && !frames.ndvi.some((f) => f.date >= season.start && f.date <= season.end);

  // The drapes: a canvas over the terrain for NDVI, and a translucent one for moisture.
  useEffect(() => {
    if (!map || !bounds || !width || !height) return;
    const make = (id: string, opacity: number) =>
      createDrape(map, id, bounds, decodedSize(width, height), opacity);
    const next = {
      ndvi: make("twin-ndvi", NDVI_OPACITY),
      moisture: make("twin-moisture", MOISTURE_OPACITY),
    };
    next.moisture.setVisible(moistureOn.current);
    drapes.current = next;
    queueMicrotask(() => {
      const clock = player.current;
      if (clock && !clock.playing) clock.seek(clock.position);
    });
    return () => {
      next.ndvi.destroy();
      next.moisture.destroy();
      drapes.current = null;
    };
  }, [map, bounds, width, height]);

  // The clock.
  useEffect(() => {
    const fadeOff = reducedMotion();
    const clock = new Playback({
      onFrame: (a, b, mix) => {
        const d = drapes.current;
        if (!d) return;
        const current = bitmaps.current.ndvi;
        d.ndvi.draw(current[a] ?? null, current[b] ?? null, fadeOff ? 0 : mix);
        const set = framesNow.current;
        const day = set.ndvi[a]?.date;
        if (day && set.moisture.length > 0) {
          d.moisture.draw(
            bitmaps.current.moisture[nearestFrame(set.moisture, day)] ?? null,
            null,
            0,
          );
        }
      },
      onIndex: (i) => {
        setIndex(i);
        onViewNow.current?.({ index: i, moisture: moistureOn.current });
        const day = framesNow.current.ndvi[i]?.date;
        if (day) {
          lastDate.current = day;
          useTimeline.getState().setDate(day);
        }
      },
      onEnd: () => {
        setPlaying(false);
        drapes.current?.ndvi.setPlaying(false);
        drapes.current?.moisture.setPlaying(false);
      },
    });
    const last = Math.max(0, framesNow.current.ndvi.length - 1);
    clock.setRange(0, last);
    clock.seek(last);
    player.current = clock;
    return () => {
      clock.destroy();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    const clock = player.current;
    if (!clock) return;
    clock.fps = speed;
    clock.loop = loop;
    clock.setRange(range[0], range[1]);
    if (!clock.playing) clock.seek(clock.position);
  }, [speed, loop, range]);

  // Paint again as frames arrive, and when the moisture layer is turned on.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the counts are the signal that new bitmaps arrived
  useEffect(() => {
    const clock = player.current;
    if (clock && !clock.playing) clock.seek(clock.position);
  }, [ndvi.loaded, moisture.loaded, showMoisture]);

  useEffect(() => {
    drapes.current?.moisture.setVisible(showMoisture);
  }, [showMoisture]);

  // Another part of the app moved the timeline: show the nearest frame.
  const date = useTimeline((s) => s.date);
  useEffect(() => {
    if (!date || date === lastDate.current) return;
    const i = nearestFrame(framesNow.current.ndvi, date);
    if (i >= 0 && i !== indexNow.current) player.current?.seek(i);
  }, [date]);

  const ready = ndvi.done || ndvi.loaded > 0;
  const toggle = () => {
    const clock = player.current;
    // The relief view has no MapLibre drapes: it follows the clock through `onView`, so play anyway.
    const d = drapes.current;
    if (!clock) return;
    if (clock.playing) {
      clock.pause();
      d?.ndvi.setPlaying(false);
      d?.moisture.setPlaying(false);
      setPlaying(false);
    } else {
      d?.ndvi.setPlaying(true);
      d?.moisture.setPlaying(showMoisture);
      clock.play();
      setPlaying(true);
    }
  };

  const frame = frames.ndvi[index];
  const total = frames.ndvi.length;
  return (
    <section aria-labelledby="twin-lapse-title" className="space-y-3">
      <div className="flex items-center gap-3">
        <IconButton
          variant="primary"
          label={playing ? t("twin.lapse.pause") : t("twin.lapse.play")}
          aria-pressed={playing}
          onClick={toggle}
          disabled={!ndvi.done}
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </IconButton>
        <div className="min-w-0 flex-1">
          <h2 id="twin-lapse-title" className="sr-only">
            {t("twin.lapse.title")}
          </h2>
          <p
            aria-live={playing ? "off" : "polite"}
            className="font-display text-title font-bold text-ink tabular-nums"
          >
            {frame ? label(frame.date) : t("twin.lapse.date.empty")}
          </p>
          <p className="text-caption text-ink-muted tabular-nums">
            {ndvi.done
              ? fmt(t("twin.lapse.frame"), { n: index + 1, total })
              : fmt(t("twin.lapse.loading"), { loaded: ndvi.loaded, total: ndvi.total })}
          </p>
        </div>
        {frame ? (
          <ProvenanceChip
            compact
            source={frame.source.product}
            resolution={`${frame.source.resolutionM} m`}
            period={`${shortLabel(frame.source.period.start)} – ${shortLabel(frame.source.period.end)}`}
            labels={chipLabels()}
            detail={[t("twin.lapse.ndvi.caption"), frame.source.method ?? ""]
              .filter(Boolean)
              .join(" ")}
          />
        ) : null}
      </div>
      <Slider
        min={range[0]}
        max={Math.max(range[0], range[1])}
        step={1}
        value={[Math.min(Math.max(index, range[0]), range[1])]}
        disabled={!ready}
        onValueChange={([i]) => {
          if (playing) toggle();
          player.current?.seek(i ?? 0);
        }}
        thumbLabels={[t("twin.lapse.scrub")]}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={String(speed)} onValueChange={(v) => setSpeed(Number(v) as Speed)}>
          <TabsList aria-label={t("twin.lapse.speed")}>
            {SPEEDS.map((s) => (
              <TabsTrigger key={s} value={String(s)}>
                {t(`twin.lapse.speed.${SPEED_LABEL[s]}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex gap-1">
          <MapTool
            side="top"
            label={t("twin.lapse.loop")}
            hint={t("twin.lapse.loop.hint")}
            icon={<Repeat aria-hidden />}
            pressed={loop}
            onClick={() => setLoop(!loop)}
          />
          {frames.moisture.length > 0 ? (
            <MapTool
              side="top"
              label={t("twin.lapse.moisture")}
              hint={t("twin.lapse.moisture.caption")}
              icon={<Droplets aria-hidden />}
              pressed={showMoisture}
              onClick={() => {
                setShowMoisture(!showMoisture);
                onView?.({ index, moisture: !showMoisture });
              }}
            />
          ) : null}
          <MapTool
            side="top"
            label={t("twin.lapse.replay")}
            hint={
              season === null
                ? t("twin.lapse.replay.none")
                : seasonEmpty
                  ? fmt(t("twin.lapse.replay.empty"), { season: season.label })
                  : fmt(t("twin.lapse.replay.on"), { season: season.label })
            }
            icon={<History aria-hidden />}
            pressed={replayOn}
            onClick={() => setReplayOn(!replayOn)}
            disabled={season === null || seasonEmpty}
          />
        </div>
      </div>
    </section>
  );
}
