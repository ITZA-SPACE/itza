import type { Layer } from "@deck.gl/core";
import { Button, Slider, Toggle } from "@itza/ui-kit";
import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../copy";
import type { FieldGeometry } from "../data/geometry";
import { addImagery, showImagery, VECTOR_STYLE } from "../map/basemaps";
import "../map/worker";
import { boundsOf, centerOf } from "./bounds";
import { closeUp, flyIn, openingShot, startOrbit } from "./camera";
import { createOverlay, outlineLayers } from "./overlay";
import {
  addTerrain,
  DEFAULT_EXAGGERATION,
  MAX_EXAGGERATION,
  MIN_EXAGGERATION,
  setExaggeration,
} from "./terrain";

export interface Twin3DProps {
  geometry: FieldGeometry;
  /** Extra deck.gl layers drawn above the field outline (draped imagery and frames land here). */
  layers?: Layer[];
  /** Called when the map cannot start, so the page can show the flat view instead. */
  onFailure: () => void;
}

type Status =
  | "twin.status.globe"
  | "twin.status.ready"
  | "twin.status.orbit"
  | "twin.status.orbit.stopped"
  | "twin.status.closeup"
  | "twin.status.flyin";

const NO_LAYERS: Layer[] = [];

export default function Twin3D({ geometry, layers = NO_LAYERS, onFailure }: Twin3DProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const overlayRef = useRef<ReturnType<typeof createOverlay> | null>(null);
  const stopOrbit = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [exaggeration, setHeight] = useState(DEFAULT_EXAGGERATION);
  const [imagery, setImagery] = useState(true);
  const [orbiting, setOrbiting] = useState(false);
  const [status, setStatus] = useState<Status>("twin.status.globe");
  const bounds = useMemo(() => boundsOf(geometry), [geometry]);
  const exaggerationNow = useRef(exaggeration);
  exaggerationNow.current = exaggeration;
  const layersNow = useRef(layers);
  layersNow.current = layers;
  const geometryNow = useRef(geometry);
  geometryNow.current = geometry;

  // The map: created once per field, removed on unmount.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: element,
        style: VECTOR_STYLE,
        center: centerOf(bounds),
        zoom: 3,
        maxPitch: 85,
        attributionControl: { compact: true },
      });
    } catch {
      onFailure();
      return;
    }
    mapRef.current = map;
    let cancelled = false;
    let lastElevations = "";

    /** Redraws the outline when the terrain under it has changed (tiles arrive after the camera). */
    const refreshOverlay = () => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const outline = outlineLayers(map, geometryNow.current);
      const signature = JSON.stringify(
        outline.map((layer) => (layer as { props: { data: unknown } }).props.data),
      );
      if (signature === lastElevations) return;
      lastElevations = signature;
      overlay.setProps({ layers: [...outline, ...layersNow.current] });
    };

    let loaded = false;
    map.on("error", () => {
      if (!loaded) onFailure();
    });
    map.on("load", async () => {
      loaded = true;
      addImagery(map);
      await openingShot(map, bounds);
      if (cancelled) return;
      addTerrain(map, exaggerationNow.current);
      overlayRef.current = createOverlay(map);
      map.on("idle", refreshOverlay);
      closeUp(map, bounds);
      setStatus("twin.status.ready");
      setReady(true);
    });

    return () => {
      cancelled = true;
      stopOrbit.current?.();
      stopOrbit.current = null;
      overlayRef.current?.finalize();
      overlayRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [bounds, onFailure]);

  useEffect(() => {
    const map = mapRef.current;
    if (ready && map) setExaggeration(map, exaggeration);
  }, [ready, exaggeration]);

  useEffect(() => {
    const map = mapRef.current;
    if (ready && map) showImagery(map, imagery);
  }, [ready, imagery]);

  useEffect(() => {
    overlayRef.current?.setProps({
      layers: [...(mapRef.current ? outlineLayers(mapRef.current, geometry) : []), ...layers],
    });
  }, [layers, geometry]);

  const interrupt = () => {
    stopOrbit.current?.();
    stopOrbit.current = null;
  };

  const run = (preset: "closeup" | "flyin") => {
    const map = mapRef.current;
    if (!map) return;
    interrupt();
    if (preset === "closeup") {
      closeUp(map, bounds);
      setStatus("twin.status.closeup");
    } else {
      flyIn(map, bounds);
      setStatus("twin.status.flyin");
    }
  };

  const toggleOrbit = () => {
    const map = mapRef.current;
    if (!map) return;
    if (orbiting) {
      interrupt();
      return;
    }
    setOrbiting(true);
    setStatus("twin.status.orbit");
    stopOrbit.current = startOrbit(map, () => {
      stopOrbit.current = null;
      setOrbiting(false);
      setStatus("twin.status.orbit.stopped");
    });
  };

  return (
    <div className="relative h-full min-h-[24rem] w-full">
      <div className="absolute inset-0">
        <section
          ref={container}
          aria-label={t("twin.region")}
          className="h-full w-full bg-surface-muted"
        />
      </div>
      {ready ? null : (
        <p className="absolute left-3 top-3 z-10 rounded-control bg-surface/95 px-3 py-2 text-body text-ink shadow-sm">
          {t("twin.loading")}
        </p>
      )}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col gap-2 sm:max-w-xs">
        <fieldset
          disabled={!ready}
          className="pointer-events-auto m-0 flex flex-wrap gap-2 rounded-card border-0 bg-surface/95 p-2 shadow-sm"
        >
          <legend className="sr-only">{t("twin.camera.label")}</legend>
          <Button variant="secondary" onClick={toggleOrbit} aria-pressed={orbiting}>
            {orbiting ? t("twin.camera.orbit.stop") : t("twin.camera.orbit")}
          </Button>
          <Button variant="secondary" onClick={() => run("closeup")}>
            {t("twin.camera.closeup")}
          </Button>
          <Button variant="secondary" onClick={() => run("flyin")}>
            {t("twin.camera.flyin")}
          </Button>
        </fieldset>
        <div className="pointer-events-auto rounded-card bg-surface/95 p-3 shadow-sm">
          <label htmlFor="twin-exaggeration" className="text-body font-semibold text-ink">
            {t("twin.exaggeration.label")}
          </label>
          <p id="twin-exaggeration-hint" className="text-caption text-ink-muted">
            {t("twin.exaggeration.hint")}
          </p>
          <Slider
            id="twin-exaggeration"
            aria-describedby="twin-exaggeration-hint"
            thumbLabels={[t("twin.exaggeration.label")]}
            min={MIN_EXAGGERATION}
            max={MAX_EXAGGERATION}
            step={0.1}
            value={[exaggeration]}
            disabled={!ready}
            onValueChange={([value]) => setHeight(value ?? DEFAULT_EXAGGERATION)}
          />
          <p className="text-caption text-ink">
            {t("twin.exaggeration.value").replace("{n}", exaggeration.toFixed(1))}
          </p>
        </div>
        <div className="pointer-events-auto">
          <Toggle pressed={imagery} onPressedChange={setImagery} disabled={!ready}>
            {t("twin.imagery")}
          </Toggle>
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {t(status)}
      </p>
    </div>
  );
}
