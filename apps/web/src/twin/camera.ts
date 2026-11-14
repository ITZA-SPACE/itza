import type { Map as MapLibreMap } from "maplibre-gl";
import { type Bounds, centerOf } from "./bounds";

const PADDING = 70;
const CLOSEUP_PITCH = 60;
const ORBIT_DEGREES_PER_SECOND = 6;

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function fit([w, s, e, n]: Bounds) {
  return {
    bounds: [
      [w, s],
      [e, n],
    ] as [[number, number], [number, number]],
    padding: PADDING,
    maxZoom: 17,
  };
}

/** The field fills the view from an oblique angle. */
export function closeUp(map: MapLibreMap, bounds: Bounds): void {
  const { bounds: box, padding, maxZoom } = fit(bounds);
  map.fitBounds(box, {
    padding,
    maxZoom,
    pitch: CLOSEUP_PITCH,
    bearing: 0,
    duration: prefersReducedMotion() ? 0 : 1600,
  });
}

/** High above and to the south, then a swooping descent onto the field. Jumps when motion is reduced. */
export function flyIn(map: MapLibreMap, bounds: Bounds): void {
  if (prefersReducedMotion()) {
    closeUp(map, bounds);
    return;
  }
  const [lon, lat] = centerOf(bounds);
  map.jumpTo({ center: [lon, lat - 0.04], zoom: 11, pitch: 25, bearing: 0 });
  const target = map.cameraForBounds(fit(bounds).bounds, {
    padding: PADDING,
    maxZoom: 17,
  });
  map.flyTo({
    center: [lon, lat],
    zoom: target?.zoom ?? 15,
    pitch: 68,
    bearing: 25,
    curve: 1.6,
    duration: 7000,
    essential: false,
  });
}

/** Turns the view slowly around the field until `stop` is called or the user touches the map. */
export function startOrbit(map: MapLibreMap, onStop: () => void): () => void {
  if (prefersReducedMotion()) {
    map.easeTo({ bearing: map.getBearing() + 90, duration: 0 });
    onStop();
    return () => {};
  }
  let frame = 0;
  let last = performance.now();
  let stopped = false;
  const interrupts = ["mousedown", "touchstart", "wheel"] as const;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    for (const event of interrupts) map.off(event, stop);
    onStop();
  };
  const tick = (now: number) => {
    map.setBearing(map.getBearing() + ((now - last) / 1000) * ORBIT_DEGREES_PER_SECOND);
    last = now;
    frame = requestAnimationFrame(tick);
  };
  for (const event of interrupts) map.on(event, stop);
  frame = requestAnimationFrame(tick);
  return stop;
}

const OPENING_MS = 4200;
const OPENING_GRACE_MS = 1500;

/**
 * Opening shot: the globe, then a flight to the field. Resolves when the camera has landed.
 * Under reduced motion the map jumps straight to the field.
 */
export function openingShot(map: MapLibreMap, bounds: Bounds): Promise<void> {
  const [lon, lat] = centerOf(bounds);
  if (prefersReducedMotion()) {
    closeUp(map, bounds);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      map.off("moveend", onEnd);
      // The map may have been removed (page left) before the timer fired.
      if (map.getContainer().isConnected) map.setProjection({ type: "mercator" });
      resolve();
    };
    // The flight's own end; a missed or interrupted flight (hidden tab, user drag) must not leave
    // the view loading forever, so a timer finishes the opening shot as well.
    const onEnd = () => finish();
    const timer = setTimeout(finish, OPENING_MS + OPENING_GRACE_MS);
    map.setProjection({ type: "globe" });
    map.jumpTo({ center: [lon, lat], zoom: 1.2, pitch: 0, bearing: 0 });
    map.on("moveend", onEnd);
    map.flyTo({ center: [lon, lat], zoom: 9, duration: OPENING_MS, essential: false });
  });
}
