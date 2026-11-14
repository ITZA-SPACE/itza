import { Button, Toggle } from "@itza/ui-kit";
import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MapLibreMap, NavigationControl } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type GeoJSONStoreFeatures,
  TerraDraw,
  TerraDrawCircleMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawRenderMode,
  TerraDrawSelectMode,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { t } from "../copy";
import { areaHa, perimeterM } from "../data/geometry";
import { fmt, formatDistance, formatHectares } from "../lib/format";
import { type FieldPolygon, useFieldStore } from "../state";
import { useZoneOverlay } from "../zones/overlay";
import { addImagery, showImagery, VECTOR_STYLE } from "./basemaps";
import { ClickToField } from "./clickToField/ClickToField";
import { useLayerOverlay } from "./layers/overlay";
import "./worker";
import { boundsOf, fieldMetrics, squareAround } from "./geometry";
import { PlaceSearch } from "./PlaceSearch";
import type { Place } from "./places";

type Tool = "static" | "polygon" | "circle" | "point" | "select";

/** The tools that draw a new outline; the current field is hidden while one is in use. */
const DRAWING: readonly Tool[] = ["polygon", "circle"];

/** Size of the outline being drawn, shown as it grows. */
interface LiveSize {
  areaHa: number;
  perimeterM: number;
  /** Corners placed so far (polygon) or the radius in metres (circle). */
  corners: number;
  radiusM: number | null;
}

const key = (name: string) => ({ key: name, heldKeys: [], preventDefault: () => {} });

/** Figma field outline: leaf green rim over a soft green wash, readable on the dark map and imagery. */
const OUTLINE = "#79ffae";
const FILL = "#34e0a1";
const WORLD_VIEW = { center: [10, 25] as [number, number], zoom: 2 };

const polygonStyles = {
  fillColor: FILL,
  fillOpacity: 0.2,
  outlineColor: OUTLINE,
  outlineWidth: 3,
} as const;

function createDraw(map: MapLibreMap): { draw: TerraDraw; polygon: TerraDrawPolygonMode } {
  const polygon = new TerraDrawPolygonMode({
    styles: {
      ...polygonStyles,
      closingPointColor: "#06060b",
      closingPointWidth: 7,
      closingPointOutlineColor: OUTLINE,
      closingPointOutlineWidth: 3,
    },
  });
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [
      new TerraDrawRenderMode({
        modeName: "static",
        styles: {
          polygonFillColor: FILL,
          polygonFillOpacity: 0.2,
          polygonOutlineColor: OUTLINE,
          polygonOutlineWidth: 3,
        },
      }),
      polygon,
      new TerraDrawCircleMode({
        drawInteraction: "click-move",
        styles: { ...polygonStyles },
      }),
      new TerraDrawPointMode({
        styles: {
          pointColor: FILL,
          pointWidth: 8,
          pointOutlineColor: "#06060b",
          pointOutlineWidth: 2,
        },
      }),
      new TerraDrawSelectMode({
        // Delete is handled by the map region (remove), so the store forgets the field too.
        keyEvents: { deselect: "Escape", delete: null, rotate: null, scale: null },
        flags: {
          polygon: {
            feature: {
              draggable: true,
              coordinates: { draggable: true, midpoints: true, deletable: true },
            },
          },
        },
        styles: {
          selectedPolygonColor: FILL,
          selectedPolygonFillOpacity: 0.2,
          selectedPolygonOutlineColor: OUTLINE,
          selectedPolygonOutlineWidth: 3,
          selectionPointColor: "#06060b",
          selectionPointOutlineColor: OUTLINE,
          selectionPointWidth: 7,
          selectionPointOutlineWidth: 3,
          midPointColor: OUTLINE,
          midPointWidth: 4,
        },
      }),
    ],
  });
  return { draw, polygon };
}

/** Size of the outline being drawn: the polygon or circle the active mode is building. */
function liveSizeOf(draw: TerraDraw, mode: Tool): LiveSize | null {
  const feature = draw
    .getSnapshot()
    .find((f) => f.properties.mode === mode && f.geometry.type === "Polygon");
  if (!feature) return null;
  const outline = feature.geometry as FieldPolygon;
  const ring = outline.coordinates[0] ?? [];
  const area = areaHa(outline);
  return {
    areaHa: area,
    perimeterM: perimeterM(outline),
    // The ring repeats its first corner at the end, and the polygon mode adds the cursor as a corner.
    corners: Math.max(0, ring.length - 2),
    radiusM: mode === "circle" ? Math.sqrt((area * 10_000) / Math.PI) : null,
  };
}

function polygonFeature(geometry: FieldPolygon): GeoJSONStoreFeatures {
  return {
    id: crypto.randomUUID(),
    type: "Feature",
    geometry: geometry as GeoJSONStoreFeatures["geometry"],
    properties: { mode: "polygon" },
  };
}

/** The only polygon the farmer has on the map: the field. */
function fieldOf(draw: TerraDraw): GeoJSONStoreFeatures | undefined {
  return draw
    .getSnapshot()
    .find((f) => f.geometry.type === "Polygon" && f.properties.mode === "polygon");
}

export default function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const polygonModeRef = useRef<TerraDrawPolygonMode | null>(null);
  const ownGeometry = useRef<FieldPolygon | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tool, setToolState] = useState<Tool>("static");
  const [imagery, setImagery] = useState(false);
  const [notice, setNotice] = useState("");
  const [live, setLive] = useState<LiveSize | null>(null);
  const [straight, setStraight] = useState(false);
  const geometry = useFieldStore((s) => s.field?.geometry ?? null);
  const hasField = geometry !== null;
  // The layers and zones belong to the current field, so they step aside while a new one is drawn.
  const drawing = DRAWING.includes(tool);
  useLayerOverlay(mapRef.current, ready, drawing);
  useZoneOverlay(mapRef.current, ready, drawing);

  const setTool = useCallback((next: Tool) => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.setMode(next);
    setLive(null);
    if (DRAWING.includes(next)) {
      // A new outline replaces the field, so the old one steps aside while it is drawn.
      draw.clear();
    } else if (!fieldOf(draw)) {
      // Leaving a drawing tool without finishing brings the field back as it was.
      const saved = useFieldStore.getState().field?.geometry;
      if (saved) draw.addFeatures([polygonFeature(saved)]);
    }
    const field = fieldOf(draw);
    if (next === "select" && field?.id !== undefined) draw.selectFeature(field.id);
    setToolState(next);
  }, []);

  /** Puts a polygon on the map as the field and shows its area and centre at once. */
  const placeField = useCallback(
    (polygon: FieldPolygon, origin: "drawn" | "point") => {
      const draw = drawRef.current;
      if (!draw) return;
      draw.clear();
      const feature = polygonFeature(polygon);
      draw.addFeatures([feature]);
      ownGeometry.current = polygon;
      useFieldStore.getState().selectField({ ...fieldMetrics(polygon, origin), id: null });
      setTool("select");
    },
    [setTool],
  );

  // Map and drawing: created once, removed on unmount.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const saved = useFieldStore.getState().field;
    const map = new MapLibreMap({
      container: element,
      style: VECTOR_STYLE,
      center: saved?.centroid ?? WORLD_VIEW.center,
      zoom: saved ? 15 : WORLD_VIEW.zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    let loaded = false;
    map.on("error", () => {
      if (!loaded) setFailed(true);
    });
    map.on("load", () => {
      loaded = true;
      addImagery(map);
      const { draw, polygon } = createDraw(map);
      polygonModeRef.current = polygon;
      setStraight(false);
      draw.start();
      draw.on("finish", (id, context) => {
        if (
          (context.mode === "polygon" || context.mode === "circle") &&
          context.action === "draw"
        ) {
          const feature = draw.getSnapshotFeature(id);
          if (feature?.geometry.type === "Polygon")
            placeField(feature.geometry as FieldPolygon, "drawn");
        } else if (context.mode === "point" && context.action === "draw") {
          const feature = draw.getSnapshotFeature(id);
          if (feature?.geometry.type === "Point") {
            const [lon, lat] = feature.geometry.coordinates as [number, number];
            placeField(squareAround([lon, lat]), "point");
          }
        } else if (context.mode === "select") {
          syncEdit(draw);
        }
      });
      draw.on("change", () => {
        const mode = draw.getMode();
        if (mode === "select") syncEdit(draw);
        else if (mode === "polygon" || mode === "circle") setLive(liveSizeOf(draw, mode));
      });
      drawRef.current = draw;
      setReady(true);
      const field = useFieldStore.getState().field;
      if (field) {
        draw.addFeatures([polygonFeature(field.geometry)]);
        ownGeometry.current = field.geometry;
      }
      draw.setMode("static");
    });

    /** Live area and centre while a corner is dragged. */
    function syncEdit(draw: TerraDraw) {
      const feature = fieldOf(draw);
      if (feature?.geometry.type !== "Polygon") return;
      const polygon = feature.geometry as FieldPolygon;
      ownGeometry.current = polygon;
      useFieldStore.getState().updateField({ ...fieldMetrics(polygon, "drawn"), id: null });
    }

    return () => {
      drawRef.current?.stop();
      drawRef.current = null;
      polygonModeRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [placeField]);

  // A field that changed elsewhere (restored from the browser, or cleared) is shown on the map.
  useEffect(() => {
    const draw = drawRef.current;
    const map = mapRef.current;
    if (!ready || !draw || !map || geometry === ownGeometry.current) return;
    draw.clear();
    ownGeometry.current = geometry;
    if (geometry) {
      draw.addFeatures([polygonFeature(geometry)]);
      const [w, s, e, n] = boundsOf(geometry);
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: 80, maxZoom: 17, duration: 0 },
      );
    }
    draw.setMode("static");
    setToolState("static");
  }, [ready, geometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (ready && map) showImagery(map, imagery);
  }, [ready, imagery]);

  // Straight edges: each new side snaps to a multiple of 45 degrees from the previous one.
  const setStraightEdges = (on: boolean) => {
    setStraight(on);
    polygonModeRef.current?.updateOptions({ snapping: on ? { toDegree: { degree: 45 } } : {} });
  };

  const finishOutline = () => polygonModeRef.current?.onKeyUp(key("Enter"));
  const undoCorner = () => {
    const mode = polygonModeRef.current;
    if (mode && mode.undoSize() > 0) mode.undo();
    const draw = drawRef.current;
    if (draw) setLive(liveSizeOf(draw, "polygon"));
  };
  const cancelDrawing = () => {
    setTool("static");
    setNotice(t("map.draw.cancelled"));
  };

  const goTo = (place: Place) => {
    const map = mapRef.current;
    if (!map) return;
    if (place.extent) {
      const [w, s, e, n] = place.extent;
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: 40, maxZoom: 15, duration: 800 },
      );
    } else {
      map.flyTo({ center: [place.lon, place.lat], zoom: 14, duration: 800 });
    }
  };

  const addAtCenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const { lng, lat } = map.getCenter();
    placeField(squareAround([lng, lat]), "point");
    setNotice(t("map.draw.updated"));
  };

  const remove = () => {
    drawRef.current?.clear();
    ownGeometry.current = null;
    useFieldStore.getState().selectField(null);
    setTool("static");
    setNotice(t("map.draw.deleted"));
  };

  const size = live
    ? fmt(t(live.radiusM === null ? "map.draw.live.polygon" : "map.draw.live.circle"), {
        area: `${formatHectares(live.areaHa)} ${t("map.field.unit.ha")}`,
        perimeter: `${formatDistance(live.perimeterM).value} ${formatDistance(live.perimeterM).unit}`,
        radius:
          live.radiusM === null
            ? ""
            : `${formatDistance(live.radiusM).value} ${formatDistance(live.radiusM).unit}`,
      })
    : "";
  const hint =
    tool === "polygon"
      ? t("map.draw.hint.polygon")
      : tool === "circle"
        ? t("map.draw.hint.circle")
        : tool === "point"
          ? t("map.draw.hint.point")
          : tool === "select"
            ? t("map.draw.hint.select")
            : t("map.draw.hint.idle");

  return (
    <div className="absolute inset-0">
      {failed ? (
        <p
          role="alert"
          className="absolute inset-x-3 top-24 z-10 rounded-control bg-risk-soft p-3 text-body text-risk-ink"
        >
          {t("map.error")}
        </p>
      ) : null}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col gap-2 sm:max-w-sm">
        <div className="pointer-events-auto">
          <PlaceSearch onSelect={goTo} />
        </div>
        <fieldset className="pointer-events-auto flex gap-2 rounded-card bg-surface/95 p-2 shadow-sm m-0 border-0">
          <legend className="sr-only">{t("map.layers.label")}</legend>
          <Toggle
            pressed={!imagery}
            onPressedChange={(on) => on && setImagery(false)}
            disabled={!ready}
          >
            {t("map.layers.map")}
          </Toggle>
          <Toggle
            pressed={imagery}
            onPressedChange={(on) => on && setImagery(true)}
            disabled={!ready}
          >
            {t("map.layers.imagery")}
          </Toggle>
        </fieldset>
        <fieldset className="pointer-events-auto m-0 flex gap-2 overflow-x-auto rounded-card border-0 bg-surface/95 p-2 shadow-sm sm:flex-wrap">
          <legend className="sr-only">{t("map.draw.label")}</legend>
          <Toggle
            className="shrink-0"
            pressed={tool === "polygon"}
            onPressedChange={(on) => setTool(on ? "polygon" : "static")}
            disabled={!ready}
          >
            {t("map.draw.polygon")}
          </Toggle>
          <Toggle
            className="shrink-0"
            pressed={tool === "circle"}
            onPressedChange={(on) => setTool(on ? "circle" : "static")}
            disabled={!ready}
          >
            {t("map.draw.circle")}
          </Toggle>
          <Toggle
            className="shrink-0"
            pressed={tool === "point"}
            onPressedChange={(on) => setTool(on ? "point" : "static")}
            disabled={!ready}
          >
            {t("map.draw.point")}
          </Toggle>
          <Toggle
            className="shrink-0"
            pressed={tool === "select"}
            onPressedChange={(on) => setTool(on ? "select" : "static")}
            disabled={!ready || !hasField}
          >
            {t("map.draw.edit")}
          </Toggle>
          <Button className="shrink-0" variant="secondary" onClick={addAtCenter} disabled={!ready}>
            {t("map.draw.center")}
          </Button>
          <Button
            className="shrink-0"
            variant="secondary"
            onClick={remove}
            disabled={!ready || !hasField}
          >
            {t("map.draw.delete")}
          </Button>
        </fieldset>
        {DRAWING.includes(tool) ? (
          <fieldset className="pointer-events-auto m-0 flex flex-wrap items-center gap-2 rounded-card border-0 bg-surface/95 p-2 shadow-sm">
            <legend className="sr-only">{t("map.draw.session")}</legend>
            {tool === "polygon" ? (
              <>
                <Button onClick={finishOutline} disabled={(live?.corners ?? 0) < 3}>
                  {t("map.draw.finish")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={undoCorner}
                  disabled={(live?.corners ?? 0) < 1}
                >
                  {t("map.draw.undo")}
                </Button>
                <Toggle pressed={straight} onPressedChange={setStraightEdges}>
                  {t("map.draw.straight")}
                </Toggle>
              </>
            ) : null}
            <Button variant="secondary" onClick={cancelDrawing}>
              {t("map.draw.cancel")}
            </Button>
          </fieldset>
        ) : null}
        <ClickToField
          map={mapRef.current}
          ready={ready}
          suspended={tool !== "static"}
          onStart={() => setTool("static")}
          onAccept={(polygon) => {
            placeField(polygon, "drawn");
            setTool("static");
            setNotice(t("clickToField.accepted"));
          }}
          onEdit={(polygon) => placeField(polygon, "drawn")}
        />
        <p
          aria-live="polite"
          className="pointer-events-auto rounded-control bg-surface/95 px-3 py-2 text-caption text-ink shadow-sm"
        >
          {notice && tool === "static" ? notice : hint}
          {size ? (
            <span className="mt-1 block font-semibold text-ink" aria-live="off">
              {size}
            </span>
          ) : null}
        </p>
      </div>
      {/* After the controls in the DOM, so keyboard users reach search and tools before the map. */}
      <section
        ref={container}
        aria-label={t("map.region")}
        className="h-full w-full"
        onKeyDown={(event) => {
          if (event.key === "Delete" && tool === "select" && hasField) remove();
          if (event.key === "Escape" && DRAWING.includes(tool)) cancelDrawing();
        }}
      />
    </div>
  );
}
