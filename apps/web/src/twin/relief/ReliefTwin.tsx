import { Button, ProvenanceChip, Slider } from "@itza/ui-kit";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../copy";
import type { FieldGeometry } from "../../data/geometry";
import { fmt } from "../../lib/format";
import { chipLabels } from "../../lib/provenance";
import { zoneColor } from "../../zones/overlay";
import { ringsOf } from "../bounds";
import { prefersReducedMotion } from "../camera";
import type { FlatLayers } from "../FlatField";
import { type DataSource, nearestFrame } from "../frames";
import { usePreloadedFrames } from "../preload";
import {
  type BaseMode,
  type DrapeImage,
  type DrapeShape,
  ELEVATION_RAMP,
  elevationPixels,
  paintDrape,
} from "./drapeCanvas";
import { ReliefScene, type ViewPreset } from "./ReliefScene";
import { loadHeights, type Relief } from "./reliefData";
import { createWater, downsample, stableDt, type Water } from "./water";

export interface ReliefTwinProps {
  geometry: FieldGeometry;
  relief: Relief;
  /** Called when the surface cannot be loaded or drawn, so the page can fall back. */
  onFailure: () => void;
  /** The same layers the flat view draws: frames, overlays, zones. */
  layers?: FlatLayers;
  /** Classes of the frame the view sits in, shared with the other views of the field. */
  frameClassName: string;
  /** Fill the height of the parent instead of the height of the view alone. */
  fill?: boolean;
}

const MIN_EXAGGERATION = 1;
const MAX_EXAGGERATION = 10;
const DEFAULT_EXAGGERATION = 4;
/** Longer side of the canvas the terrain wears, in pixels. */
const DRAPE_SIDE = 2048;
const WATER_SIDE = 256;
const NO_FRAMES: never[] = [];

const RAIN = { min: 5, max: 100, step: 5, initial: 25 } as const;
const STORM = { min: 10, max: 120, step: 10, initial: 30 } as const;
const SPEEDS = [60, 300, 900] as const;
type RainSpeed = (typeof SPEEDS)[number];
/** Model steps per drawn frame; above this the model runs slower than the chosen speed. */
const MAX_STEPS = 12;
/** The model stops once the standing water changes by less than this share over two minutes. */
const SETTLED_SHARE = 0.001;
const SETTLED_WINDOW_S = 120;

interface RainStats {
  fallenMm: number;
  leftShare: number;
  standingShare: number;
  minutes: number;
}

interface RainModel {
  water: Water;
  seconds: number;
  mark: number;
  markStanding: number;
}

function statsOf(model: RainModel | null, relief: Relief): RainStats | null {
  if (!model) return null;
  const { rainedM3, leftM3, standingM3 } = model.water.totals();
  const area = relief.sizeM[0] * relief.sizeM[1];
  return {
    fallenMm: (rainedM3 / area) * 1000,
    leftShare: rainedM3 > 0 ? leftM3 / rainedM3 : 0,
    standingShare: rainedM3 > 0 ? standingM3 / rainedM3 : 0,
    minutes: model.seconds / 60,
  };
}

async function loadBitmap(url: string, signal: AbortSignal): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

function useBitmap(url: string | null): ImageBitmap | null {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    setBitmap(null);
    if (!url) return;
    const controller = new AbortController();
    let made: ImageBitmap | null = null;
    void loadBitmap(url, controller.signal).then((result) => {
      if (controller.signal.aborted) {
        result?.close();
        return;
      }
      made = result;
      setBitmap(result);
    });
    return () => {
      controller.abort();
      made?.close();
    };
  }, [url]);
  return bitmap;
}

const year = (iso: string) => iso.slice(0, 4);
const months = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });
const monthYear = (iso: string) => months.format(new Date(`${iso}T00:00:00Z`));

function SourceChip({ label, source }: { label: string; source: DataSource }) {
  const { start, end } = source.period;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-caption text-ink-muted">{label}</span>
      <ProvenanceChip
        source={`${source.source} ${source.product}`}
        resolution={`${Number(source.resolutionM.toFixed(1))} m`}
        period={
          start === end
            ? monthYear(start)
            : year(start) === year(end)
              ? `${monthYear(start)} – ${monthYear(end)}`
              : `${year(start)} – ${year(end)}`
        }
        labels={chipLabels()}
        detail={[source.version, source.method].filter(Boolean).join(". ")}
      />
    </span>
  );
}

/** The field as one 3D surface from its relief package, with elevation colours and rain. */
export default function ReliefTwin({
  geometry,
  relief,
  onFailure,
  layers,
  frameClassName,
  fill = false,
}: ReliefTwinProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReliefScene | null>(null);
  const drape = useMemo(() => {
    const canvas = document.createElement("canvas");
    const scale = DRAPE_SIDE / Math.max(relief.width, relief.height);
    canvas.width = Math.round(relief.width * scale);
    canvas.height = Math.round(relief.height * scale);
    return canvas;
  }, [relief]);
  const [heights, setHeights] = useState<Float32Array | null>(null);
  const [ready, setReady] = useState(false);
  const [base, setBase] = useState<BaseMode>(relief.imageryUrl ? "imagery" : "elevation");
  const [exaggeration, setExaggeration] = useState(DEFAULT_EXAGGERATION);
  const [view, setView] = useState<ViewPreset>("tilt");
  const [orbit, setOrbit] = useState(false);
  // The satellite frames cover the field itself, so the picture under them can be uncovered.
  const [greenness, setGreenness] = useState(true);
  const failure = useRef(onFailure);
  failure.current = onFailure;

  // The heights: one small image, decoded once per field.
  useEffect(() => {
    setHeights(null);
    const controller = new AbortController();
    loadHeights(relief, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setHeights(result);
      },
      () => {
        if (!controller.signal.aborted) failure.current();
      },
    );
    return () => controller.abort();
  }, [relief]);

  // The scene: created once the heights are in, removed with the field.
  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box || !heights) return;
    let scene: ReliefScene;
    try {
      scene = new ReliefScene(canvas, relief, heights, drape, () => failure.current());
    } catch {
      failure.current();
      return;
    }
    sceneRef.current = scene;
    scene.setBackground(getComputedStyle(box).backgroundColor);
    const observer = new ResizeObserver(() => scene.resize(box.clientWidth, box.clientHeight));
    observer.observe(box);
    scene.resize(box.clientWidth, box.clientHeight);
    setReady(true);
    return () => {
      observer.disconnect();
      sceneRef.current = null;
      setReady(false);
      scene.dispose();
    };
  }, [relief, heights, drape]);

  useEffect(() => {
    if (ready) sceneRef.current?.setOutline(ringsOf(geometry));
  }, [ready, geometry]);
  useEffect(() => {
    if (ready) sceneRef.current?.setExaggeration(exaggeration);
  }, [ready, exaggeration]);
  useEffect(() => {
    if (ready) sceneRef.current?.setOrbit(orbit);
  }, [ready, orbit]);

  // What the surface wears.
  const imagery = useBitmap(relief.imageryUrl);
  const [elevation, setElevation] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    setElevation(null);
    if (!heights) return;
    let made: ImageBitmap | null = null;
    let cancelled = false;
    const pixels = new ImageData(relief.width, relief.height);
    pixels.data.set(elevationPixels(heights, relief));
    void createImageBitmap(pixels).then((bitmap) => {
      if (cancelled) bitmap.close();
      else {
        made = bitmap;
        setElevation(bitmap);
      }
    });
    return () => {
      cancelled = true;
      made?.close();
    };
  }, [relief, heights]);

  const ndvi = usePreloadedFrames(layers?.frames.ndvi ?? NO_FRAMES);
  const moisture = usePreloadedFrames(layers?.moisture ? layers.frames.moisture : NO_FRAMES);
  const terrain = layers?.terrain?.available ? layers.terrain : undefined;
  const slope = useBitmap((layers?.overlays.slope && terrain?.images.slope_class) || null);
  const frost = useBitmap((layers?.overlays.frost && terrain?.images.concavity) || null);

  useEffect(() => {
    const context = drape.getContext("2d");
    if (!ready || !context) return;
    const images: DrapeImage[] = [];
    const frame = layers?.frames.ndvi[layers.index];
    const frameBitmap = layers ? ndvi.bitmaps[layers.index] : null;
    if (greenness && frame && frameBitmap) {
      images.push({ image: frameBitmap, bounds: frame.bounds, opacity: 0.75, crisp: true });
    }
    if (greenness && layers?.moisture && frame) {
      const index = nearestFrame(layers.frames.moisture, frame.date);
      const wet = layers.frames.moisture[index];
      const wetBitmap = moisture.bitmaps[index];
      if (wet && wetBitmap) {
        images.push({ image: wetBitmap, bounds: wet.bounds, opacity: 0.5, crisp: true });
      }
    }
    const display = terrain?.displayBounds;
    if (display && slope) images.push({ image: slope, bounds: display, opacity: 0.6, crisp: true });
    if (display && frost)
      images.push({ image: frost, bounds: display, opacity: 0.65, crisp: true });
    const shapes: DrapeShape[] = [];
    const pixel = drape.width / relief.sizeM[0];
    if (layers?.overlays.zones && layers.zones?.enabled) {
      for (const feature of layers.zones.features) {
        const polygons =
          feature.geometry.type === "Polygon"
            ? [feature.geometry.coordinates]
            : feature.geometry.coordinates;
        shapes.push({
          rings: polygons.flat() as [number, number][][],
          color: zoneColor(feature.properties.zone),
          fill: 0.45,
          width: 2 * pixel,
          closed: true,
        });
      }
    }
    if (layers?.overlays.flow && terrain) {
      for (const line of terrain.flowLines.features) {
        shapes.push({
          rings: [line.geometry.coordinates],
          color: "#1d4ed8",
          fill: 0,
          width: Math.min(6, 1.5 + 1.5 * Math.log10(line.properties.upstream_cells)) * pixel,
          closed: false,
        });
      }
    }
    paintDrape(context, relief, {
      base: base === "imagery" ? (imagery ?? elevation) : elevation,
      ground: "#8a8f7a",
      images,
      shapes,
    });
    sceneRef.current?.drapeChanged();
  }, [
    ready,
    drape,
    relief,
    base,
    greenness,
    imagery,
    elevation,
    layers,
    ndvi,
    moisture,
    slope,
    frost,
    terrain,
  ]);

  // Rain.
  const [intensity, setIntensity] = useState<number>(RAIN.initial);
  const [storm, setStorm] = useState<number>(STORM.initial);
  const [speed, setSpeed] = useState<RainSpeed>(300);
  const [raining, setRaining] = useState(false);
  const [stats, setStats] = useState<RainStats | null>(null);
  const [settings, setSettings] = useState(false);
  const rain = useRef({ intensity, storm, speed });
  rain.current = { intensity, storm, speed };
  const model = useRef<RainModel | null>(null);

  // The rain starts once on its own, so the land is alive on arrival (unless motion is unwelcome).
  const autoRained = useRef(false);
  useEffect(() => {
    if (!ready || !heights || autoRained.current) return;
    autoRained.current = true;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setRaining(true);
  }, [ready, heights]);

  // The water grid belongs to the field: gone when the field or the scene goes.
  useEffect(() => {
    if (!ready || !heights) return;
    return () => {
      sceneRef.current?.setLoop(null);
      sceneRef.current?.setWater(null, null);
      model.current = null;
      setRaining(false);
      setStats(null);
    };
  }, [ready, heights]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !ready || !heights) return;
    if (!raining) {
      scene.setLoop(null);
      setStats(statsOf(model.current, relief));
      return;
    }
    if (!model.current) {
      const grid = downsample(heights, relief.width, relief.height, WATER_SIDE);
      const water = createWater(
        grid.heights,
        grid.width,
        grid.height,
        relief.sizeM[0] / grid.width,
      );
      model.current = { water, seconds: 0, mark: 0, markStanding: 0 };
      scene.setWater(water, grid.heights);
    }
    const current = model.current;
    const dt = stableDt(current.water.cellM);
    let sinceReadout = 1;
    scene.setLoop((elapsed) => {
      const { intensity: mmPerHour, storm: minutes, speed: factor } = rain.current;
      const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil((elapsed * factor) / dt)));
      for (let i = 0; i < steps; i++) {
        const falling = current.seconds < minutes * 60;
        current.water.step(dt, falling ? mmPerHour / 1000 / 3600 : 0);
        current.seconds += dt;
      }
      scene.waterChanged();
      sinceReadout += elapsed;
      if (sinceReadout >= 1) {
        sinceReadout = 0;
        setStats(statsOf(model.current, relief));
      }
      if (current.seconds >= minutes * 60 && current.seconds - current.mark >= SETTLED_WINDOW_S) {
        const { rainedM3, standingM3 } = current.water.totals();
        const settled = Math.abs(standingM3 - current.markStanding) <= SETTLED_SHARE * rainedM3;
        current.mark = current.seconds;
        current.markStanding = standingM3;
        if (settled) setRaining(false);
      }
    });
    return () => scene.setLoop(null);
  }, [ready, raining, heights, relief]);

  const resetRain = () => {
    setRaining(false);
    model.current?.water.reset();
    if (model.current) {
      model.current.seconds = 0;
      model.current.mark = 0;
      model.current.markStanding = 0;
    }
    sceneRef.current?.waterChanged();
    setStats(null);
  };

  const show = (preset: ViewPreset) => {
    setOrbit(false);
    setView(preset);
    sceneRef.current?.setView(preset);
  };
  const reducedMotion = prefersReducedMotion();
  const percent = (share: number) => `${Math.round(share * 100)}%`;

  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col gap-2" : "flex flex-col gap-2"}>
      <div ref={boxRef} className={frameClassName}>
        <canvas
          ref={canvasRef}
          aria-label={t("twin.relief.region")}
          className="block h-full w-full touch-none"
        />
        {ready ? null : (
          <p
            role="status"
            className="absolute left-3 top-3 rounded-control border border-rim-strong bg-surface/80 px-3 py-2 text-body text-ink shadow-glass backdrop-blur-md"
          >
            {t("twin.loading")}
          </p>
        )}
        <fieldset
          disabled={!ready}
          className="absolute left-3 top-3 m-0 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-panel border border-rim-strong bg-surface/80 p-1.5 shadow-glass backdrop-blur-md"
        >
          <legend className="sr-only">{t("twin.relief.controls")}</legend>
          <Button
            variant="secondary"
            aria-pressed={view === "tilt" && !orbit}
            onClick={() => show("tilt")}
          >
            {t("twin.relief.view.tilt")}
          </Button>
          <Button
            variant="secondary"
            aria-pressed={view === "top" && !orbit}
            onClick={() => show("top")}
          >
            {t("twin.relief.view.top")}
          </Button>
          {reducedMotion ? null : (
            <Button variant="secondary" aria-pressed={orbit} onClick={() => setOrbit(!orbit)}>
              {orbit ? t("twin.camera.orbit.stop") : t("twin.camera.orbit")}
            </Button>
          )}
          <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
          {relief.imageryUrl ? (
            <Button
              variant="secondary"
              aria-pressed={base === "imagery"}
              onClick={() => setBase("imagery")}
            >
              {t("twin.relief.base.imagery")}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            aria-pressed={base === "elevation"}
            onClick={() => setBase("elevation")}
          >
            {t("twin.relief.base.elevation")}
          </Button>
          {layers && layers.frames.ndvi.length > 0 ? (
            <Button
              variant="secondary"
              aria-pressed={greenness}
              onClick={() => setGreenness(!greenness)}
            >
              {t("twin.relief.greenness")}
            </Button>
          ) : null}
        </fieldset>
        <section
          aria-labelledby="twin-rain-title"
          className="absolute bottom-3 left-3 flex w-80 max-w-[calc(100%-1.5rem)] flex-col gap-1 rounded-panel border border-rim-strong bg-surface/80 p-2 shadow-glass backdrop-blur-md"
        >
          <h2 id="twin-rain-title" className="sr-only">
            {t("twin.rain.title")}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!ready} aria-pressed={raining} onClick={() => setRaining(!raining)}>
              {raining ? t("twin.rain.pause") : t("twin.rain.start")}
            </Button>
            <Button variant="secondary" disabled={!ready || !stats} onClick={resetRain}>
              {t("twin.rain.reset")}
            </Button>
            <Button
              variant="ghost"
              aria-expanded={settings}
              aria-controls="twin-rain-settings"
              onClick={() => setSettings(!settings)}
            >
              {t("twin.rain.settings")}
            </Button>
          </div>
          <div id="twin-rain-settings" hidden={!settings} className="flex flex-col gap-1">
            <label htmlFor="twin-rain-intensity" className="text-caption text-ink">
              {fmt(t("twin.rain.intensity"), { n: intensity })}
            </label>
            <Slider
              id="twin-rain-intensity"
              thumbLabels={[t("twin.rain.intensity.label")]}
              min={RAIN.min}
              max={RAIN.max}
              step={RAIN.step}
              value={[intensity]}
              disabled={!ready}
              onValueChange={([value]) => setIntensity(value ?? RAIN.initial)}
            />
            <label htmlFor="twin-rain-storm" className="text-caption text-ink">
              {fmt(t("twin.rain.length"), { n: storm })}
            </label>
            <Slider
              id="twin-rain-storm"
              thumbLabels={[t("twin.rain.length.label")]}
              min={STORM.min}
              max={STORM.max}
              step={STORM.step}
              value={[storm]}
              disabled={!ready}
              onValueChange={([value]) => setStorm(value ?? STORM.initial)}
            />
            <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0">
              <legend className="sr-only">{t("twin.rain.speed")}</legend>
              {SPEEDS.map((option) => (
                <Button
                  key={option}
                  variant="secondary"
                  aria-pressed={speed === option}
                  onClick={() => setSpeed(option)}
                >
                  {fmt(t("twin.rain.speed.option"), { n: option })}
                </Button>
              ))}
            </fieldset>
          </div>
        </section>
        {stats ? (
          <dl
            aria-live="polite"
            className="absolute bottom-3 right-3 m-0 grid grid-cols-[auto_auto] gap-x-3 rounded-panel border border-rim-strong bg-surface/80 p-2 text-caption tabular-nums text-ink shadow-glass backdrop-blur-md"
          >
            <dt>{t("twin.rain.fallen")}</dt>
            <dd className="m-0 text-right">
              {fmt(t("twin.rain.mm"), { n: stats.fallenMm.toFixed(1) })}
            </dd>
            <dt>{t("twin.rain.left")}</dt>
            <dd className="m-0 text-right">{percent(stats.leftShare)}</dd>
            <dt>{t("twin.rain.standing")}</dt>
            <dd className="m-0 text-right">{percent(stats.standingShare)}</dd>
            <dt>{t("twin.rain.time")}</dt>
            <dd className="m-0 text-right">
              {fmt(t("twin.rain.minutes"), { n: Math.round(stats.minutes) })}
            </dd>
          </dl>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex min-w-56 flex-1 items-center gap-3">
          <label htmlFor="twin-relief-exaggeration" className="shrink-0 text-body text-ink">
            {fmt(t("twin.relief.exaggeration"), { n: exaggeration })}
          </label>
          <Slider
            id="twin-relief-exaggeration"
            thumbLabels={[t("twin.exaggeration.label")]}
            min={MIN_EXAGGERATION}
            max={MAX_EXAGGERATION}
            step={0.5}
            value={[exaggeration]}
            disabled={!ready}
            onValueChange={([value]) => setExaggeration(value ?? DEFAULT_EXAGGERATION)}
          />
        </div>
        {base === "elevation" ? (
          <div className="text-caption text-ink">
            <p className="font-semibold">{t("twin.relief.legend")}</p>
            <div
              className="my-1 h-2 w-40 rounded-full"
              style={{ background: `linear-gradient(90deg, ${ELEVATION_RAMP.join(", ")})` }}
            />
            <p className="flex justify-between gap-3 tabular-nums">
              <span>{fmt(t("twin.relief.metres"), { n: relief.minElevationM.toFixed(1) })}</span>
              <span>{fmt(t("twin.relief.metres"), { n: relief.maxElevationM.toFixed(1) })}</span>
            </p>
          </div>
        ) : null}
        <SourceChip label={t("twin.relief.source.elevation")} source={relief.elevationSource} />
        {relief.imagerySource ? (
          <SourceChip label={t("twin.relief.source.imagery")} source={relief.imagerySource} />
        ) : null}
      </div>
      <p className="max-w-prose text-caption text-ink-muted">
        {t("twin.rain.caution")}
        {relief.elevationCoarse ? ` ${t("twin.relief.coarse")}` : ""}
      </p>
    </div>
  );
}
