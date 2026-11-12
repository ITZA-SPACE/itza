import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn, focusRing } from "../cn";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";

export interface ReplayLaneView {
  id: string;
  name: string;
  isBaseline: boolean;
  crop: string;
  /** Share of plant-available water left, 0 to 1, one value per day. */
  soilWater: readonly number[];
  /** How short of water the crop is, 0 to 1, per day. */
  stress: readonly number[];
  /** Ground cover, 0 to 1, per day. */
  cover: readonly number[];
}

export interface ReplayLabels {
  play: string;
  pause: string;
  restart: string;
  /** Accessible name of the day slider. */
  scrubber: string;
  soilWater: string;
  stress: string;
  cover: string;
  ndvi: string;
  rain: string;
  baseline: string;
  /** "model-based counterfactual, not measured yield" */
  counterfactual: string;
  /** A date such as `2022-03-14` as a person reads it. */
  formatDate: (iso: string) => string;
  /** Short month names, January first. */
  months: readonly string[];
  /** The lane's reading at the playhead, as a sentence. */
  readout: (lane: {
    name: string;
    soilWaterPct: number;
    stressPct: number;
    coverPct: number;
  }) => string;
  /** Summary of a whole lane for assistive technology. */
  laneSummary: (lane: { name: string; stressDays: number; minSoilWaterPct: number }) => string;
}

export interface ReplayBarsProps {
  /** First day, ISO. */
  startDate: string;
  days: number;
  /** Daily rain, mm. */
  rain: readonly number[];
  /** Observed greenness inside the window. */
  ndvi: readonly { date: string; value: number }[];
  lanes: readonly ReplayLaneView[];
  labels: ReplayLabels;
  /** Start playing at once; ignored for visitors who prefer reduced motion. */
  autoPlay?: boolean;
  /** Time the whole season takes to play, ms. */
  durationMs?: number;
  className?: string;
}

const WIDTH = 730;
const CHART_H = 64;
const COVER_H = 14;
const RAIN_H = 28;
const MS_PER_DAY = 86_400_000;
const FULL_RAIN_MM = 40;

const yWater = (v: number) => CHART_H - Math.min(1, Math.max(0, v)) * (CHART_H - 4) - 2;
const yStress = (v: number) => CHART_H - Math.min(1, Math.max(0, v)) * (CHART_H * 0.45);

const isoToDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY;
const dayToIso = (day: number) => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);

/** Reduced motion: no autoplay and a slower, coarser pace is the visitor's call, so only autoplay changes. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function line(
  values: readonly number[],
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
}

function area(
  values: readonly number[],
  x: (i: number) => number,
  y: (v: number) => number,
  floor: number,
): string {
  if (values.length === 0) return "";
  return `${line(values, x, y)} L${x(values.length - 1).toFixed(1)} ${floor} L${x(0).toFixed(1)} ${floor} Z`;
}

/**
 * Season Replay (F-07): rotations side by side through one season, day by day. Each lane shows soil
 * water, water stress and ground cover; the observed greenness of the same season runs over every
 * lane. Pure and data-bound: it plays, pauses and scrubs on its own and never computes the science.
 */
export function ReplayBars({
  startDate,
  days,
  rain,
  ndvi,
  lanes,
  labels,
  autoPlay = false,
  durationMs = 12_000,
  className,
}: ReplayBarsProps) {
  const reduced = usePrefersReducedMotion();
  const clipId = useId();
  const [day, setDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frame = useRef<number | null>(null);
  const last = useRef(0);
  const lastDay = Math.max(1, days - 1);

  // Autoplay once, unless the visitor asked for less motion.
  const started = useRef(false);
  useEffect(() => {
    if (autoPlay && !reduced && !started.current) {
      started.current = true;
      setPlaying(true);
    }
  }, [autoPlay, reduced]);

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const step = (now: number) => {
      const elapsed = now - last.current;
      last.current = now;
      let reachedEnd = false;
      setDay((d) => {
        const next = d + (elapsed / durationMs) * lastDay;
        if (next >= lastDay) {
          reachedEnd = true;
          return lastDay;
        }
        return next;
      });
      if (reachedEnd) setPlaying(false);
      else frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [playing, durationMs, lastDay]);

  const x = useCallback((i: number) => (i / lastDay) * WIDTH, [lastDay]);

  const startDay = isoToDay(startDate);
  const index = Math.min(lastDay, Math.max(0, Math.floor(day)));
  const currentIso = dayToIso(startDay + index);
  const playheadX = x(day);

  const monthTicks = useMemo(() => {
    const ticks: { x: number; label: string }[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date((startDay + i) * MS_PER_DAY);
      if (i === 0 || date.getUTCDate() === 1) {
        ticks.push({ x: x(i), label: labels.months[date.getUTCMonth()] ?? "" });
      }
    }
    return ticks;
  }, [days, startDay, x, labels.months]);

  const ndviPoints = useMemo(
    () =>
      ndvi
        .map((p) => ({ i: isoToDay(p.date) - startDay, value: p.value }))
        .filter((p) => p.i >= 0 && p.i < days),
    [ndvi, startDay, days],
  );
  const ndviPath = ndviPoints
    .map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)} ${yWater(p.value).toFixed(1)}`)
    .join(" ");

  const rainPath = useMemo(
    () =>
      rain
        .map((mm, i) => {
          const h = Math.min(1, mm / FULL_RAIN_MM) * RAIN_H;
          return h > 0.3 ? `M${x(i).toFixed(1)} ${RAIN_H}V${(RAIN_H - h).toFixed(1)}` : "";
        })
        .join(""),
    [rain, x],
  );

  const lanePaths = useMemo(
    () =>
      lanes.map((lane) => ({
        id: lane.id,
        water: line(lane.soilWater, x, yWater),
        waterArea: area(lane.soilWater, x, yWater, CHART_H),
        stress: area(lane.stress, x, yStress, CHART_H),
        cover: area(
          lane.cover,
          x,
          (v) => COVER_H - Math.min(1, Math.max(0, v)) * (COVER_H - 2),
          COVER_H,
        ),
      })),
    [lanes, x],
  );

  const togglePlay = () => {
    if (!playing && day >= lastDay) setDay(0);
    setPlaying((p) => !p);
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={togglePlay}>{playing ? labels.pause : labels.play}</Button>
        <Button
          variant="secondary"
          onClick={() => {
            setPlaying(false);
            setDay(0);
          }}
        >
          {labels.restart}
        </Button>
        <span className="text-body font-medium tabular-nums text-ink">
          {labels.formatDate(currentIso)}
        </span>
        <Badge tone="warn" className="ml-auto">
          {labels.counterfactual}
        </Badge>
      </div>
      <input
        type="range"
        min={0}
        max={lastDay}
        value={index}
        aria-label={labels.scrubber}
        aria-valuetext={labels.formatDate(currentIso)}
        onChange={(event) => {
          setPlaying(false);
          setDay(Number(event.target.value));
        }}
        className={cn("h-11 w-full accent-accent", focusRing)}
      />

      <svg
        aria-hidden="true"
        viewBox={`0 0 ${WIDTH} ${RAIN_H + 14}`}
        preserveAspectRatio="none"
        className="h-12 w-full"
      >
        <path d={rainPath} className="stroke-cat-5" strokeWidth={1.4} fill="none" />
        {monthTicks.map((tick) => (
          <text
            key={`${tick.x}-${tick.label}`}
            x={tick.x + 2}
            y={RAIN_H + 11}
            fontSize={9}
            className="fill-ink-muted"
          >
            {tick.label}
          </text>
        ))}
        <line
          x1={playheadX}
          x2={playheadX}
          y1={0}
          y2={RAIN_H + 14}
          className="stroke-ink"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <p className="text-caption text-ink-muted">{labels.rain}</p>

      <ul className="space-y-4">
        {lanes.map((lane, k) => {
          const paths = lanePaths[k];
          const water = lane.soilWater[index] ?? 0;
          const stress = lane.stress[index] ?? 0;
          const cover = lane.cover[index] ?? 0;
          const stressDays = lane.stress.filter((s) => s > 0.05).length;
          const minWater = lane.soilWater.length > 0 ? Math.min(...lane.soilWater) : 0;
          return (
            <li key={lane.id} className="space-y-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <h4 className="text-body font-semibold text-ink">{lane.name}</h4>
                <span className="text-caption text-ink-muted">{lane.crop}</span>
                {lane.isBaseline ? <Badge>{labels.baseline}</Badge> : null}
              </div>
              <p className="sr-only">
                {labels.laneSummary({
                  name: lane.name,
                  stressDays,
                  minSoilWaterPct: Math.round(minWater * 100),
                })}
              </p>
              <p className="text-caption tabular-nums text-ink-muted">
                {labels.readout({
                  name: lane.name,
                  soilWaterPct: Math.round(water * 100),
                  stressPct: Math.round(stress * 100),
                  coverPct: Math.round(cover * 100),
                })}
              </p>
              <svg
                aria-hidden="true"
                viewBox={`0 0 ${WIDTH} ${CHART_H + COVER_H + 4}`}
                preserveAspectRatio="none"
                className="h-24 w-full rounded-control bg-surface-muted"
              >
                <defs>
                  <clipPath id={`${clipId}-${lane.id}`}>
                    <rect
                      x={0}
                      y={0}
                      width={Math.max(0, playheadX)}
                      height={CHART_H + COVER_H + 4}
                    />
                  </clipPath>
                </defs>
                {[0, 0.5, 1].map((g) => (
                  <line
                    key={g}
                    x1={0}
                    x2={WIDTH}
                    y1={yWater(g)}
                    y2={yWater(g)}
                    className="stroke-line-soft"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <path d={paths?.waterArea} className="fill-cat-1" opacity={0.12} />
                <path
                  d={paths?.water}
                  className="fill-none stroke-cat-1"
                  opacity={0.3}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
                <g clipPath={`url(#${clipId}-${lane.id})`}>
                  <path d={paths?.waterArea} className="fill-cat-1" opacity={0.22} />
                  <path
                    d={paths?.water}
                    className="fill-none stroke-cat-1"
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <path d={paths?.stress} className="fill-cat-6" opacity={0.75} />
                </g>
                {ndviPath ? (
                  <path
                    d={ndviPath}
                    className="fill-none stroke-ink"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                <g transform={`translate(0 ${CHART_H + 4})`}>
                  <path d={paths?.cover} className="fill-cat-3" opacity={0.3} />
                  <g clipPath={`url(#${clipId}-${lane.id})`}>
                    <path d={paths?.cover} className="fill-cat-3" opacity={0.85} />
                  </g>
                </g>
                <line
                  x1={playheadX}
                  x2={playheadX}
                  y1={0}
                  y2={CHART_H + COVER_H + 4}
                  className="stroke-ink"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </li>
          );
        })}
      </ul>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-muted">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4 bg-cat-1" />
          {labels.soilWater}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 bg-cat-6" />
          {labels.stress}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 bg-cat-3" />
          {labels.cover}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-ink" />
          {labels.ndvi}
        </li>
      </ul>
    </div>
  );
}
