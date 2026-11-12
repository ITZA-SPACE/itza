import type { CanvasSource, Map as MapLibreMap } from "maplibre-gl";
import { raiseOutline } from "./outline";

type Bounds = [west: number, south: number, east: number, north: number];

const HILLSHADE_LAYER = "terrain-hillshade";
/** Renders that must pass after a frame is painted before the texture is considered uploaded. */
const SETTLE_RENDERS = 3;

export interface Drape {
  /** Paints frame `a`, and `b` fading in over it at `mix` (0 to 1). Either may be missing. */
  draw: (a: ImageBitmap | null, b: ImageBitmap | null, mix: number) => void;
  setOpacity: (opacity: number) => void;
  setVisible: (visible: boolean) => void;
  /** True while frames are changing: the texture then follows the canvas on every render. */
  setPlaying: (playing: boolean) => void;
  destroy: () => void;
}

const toCorners = ([w, s, e, n]: Bounds): [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
] => [
  [w, n],
  [e, n],
  [e, s],
  [w, s],
];

/**
 * A canvas laid over the terrain: MapLibre drapes it on the 3D surface like any raster layer, under
 * the hillshade so relief still shows through. Frames are painted into the canvas from preloaded
 * bitmaps, so changing frame (or fading between two) never waits on the network.
 */
export function createDrape(
  map: MapLibreMap,
  id: string,
  bounds: Bounds,
  size: { width: number; height: number },
  opacity: number,
): Drape {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, size.width);
  canvas.height = Math.max(1, size.height);
  const context = canvas.getContext("2d");
  map.addSource(id, { type: "canvas", canvas, coordinates: toCorners(bounds), animate: false });
  map.addLayer(
    {
      id,
      type: "raster",
      source: id,
      paint: { "raster-opacity": opacity, "raster-fade-duration": 0 },
    },
    map.getLayer(HILLSHADE_LAYER) ? HILLSHADE_LAYER : undefined,
  );
  raiseOutline(map);
  const source = () => map.getSource(id) as CanvasSource | undefined;
  let settle: (() => void) | null = null;
  let following = false;
  let renders = 0;

  const stopPlaying = () => {
    if (settle) map.off("render", settle);
    settle = null;
  };

  return {
    draw: (a, b, mix) => {
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (a) context.drawImage(a, 0, 0, canvas.width, canvas.height);
      if (b && mix > 0) {
        context.globalAlpha = mix;
        context.drawImage(b, 0, 0, canvas.width, canvas.height);
        context.globalAlpha = 1;
      }
      // A still frame is uploaded by the next renders, then the source stops following the canvas.
      // (The map never goes idle while a source follows its canvas, so renders are counted instead.)
      renders = 0;
      if (!following && !settle) {
        source()?.play();
        settle = () => {
          if (++renders < SETTLE_RENDERS) return;
          stopPlaying();
          source()?.pause();
        };
        map.on("render", settle);
      }
    },
    setOpacity: (value) => {
      if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", value);
    },
    setVisible: (visible) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    },
    setPlaying: (playing) => {
      following = playing;
      if (playing) {
        stopPlaying();
        source()?.play();
      } else {
        source()?.pause();
      }
    },
    destroy: () => {
      stopPlaying();
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    },
  };
}
