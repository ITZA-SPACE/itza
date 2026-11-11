import { Button, Toggle } from "@itza/ui-kit";
import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MapLibreMap, NavigationControl } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type GeoJSONStoreFeatures,
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawRenderMode,
  TerraDrawSelectMode,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { t } from "../copy";
import { type FieldPolygon, useFieldStore } from "../state";
import { addImagery, showImagery, VECTOR_STYLE } from "./basemaps";
import "./worker";
import { boundsOf, fieldMetrics, squareAround } from "./geometry";
import { PlaceSearch } from "./PlaceSearch";
import type { Place } from "./places";

type Tool = "static" | "polygon" | "point" | "select";

const OUTLINE = "#08437f";
const FILL = "#0b5cad";
const WORLD_VIEW = { center: [10, 25] as [number, number], zoom: 2 };

const polygonStyles = {
  fillColor: FILL,
  fillOpacity: 0.28,
  outlineColor: OUTLINE,
  outlineWidth: 3,
} as const;

function createDraw(map: MapLibreMap): TerraDraw {
  return new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [
      new TerraDrawRenderMode({
        modeName: "static",
        styles: {
          polygonFillColor: FILL,
          polygonFillOpacity: 0.28,
          polygonOutlineColor: OUTLINE,
          polygonOutlineWidth: 3,
        },
      }),
      new TerraDrawPolygonMode({
        styles: {
          ...polygonStyles,
          closingPointColor: "#ffffff",
          closingPointWidth: 7,
          closingPointOutlineColor: OUTLINE,
          closingPointOutlineWidth: 3,
        },
      }),
      new TerraDrawPointMode({
        styles: {
          pointColor: FILL,
          pointWidth: 8,
          pointOutlineColor: "#ffffff",
          pointOutlineWidth: 2,
        },
      }),
      new TerraDrawSelectMode({
        keyEvents: { deselect: "Escape", delete: "Delete", rotate: null, scale: null },
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
          selectedPolygonFillOpacity: 0.28,
          selectedPolygonOutlineColor: OUTLINE,
          selectedPolygonOutlineWidth: 3,
          selectionPointColor: "#ffffff",
          selectionPointOutlineColor: OUTLINE,
          selectionPointWidth: 7,
          selectionPointOutlineWidth: 3,
          midPointColor: OUTLINE,
          midPointWidth: 4,
        },
      }),
    ],
  });
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
  const ownGeometry = useRef<FieldPolygon | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tool, setToolState] = useState<Tool>("static");
  const [imagery, setImagery] = useState(false);
  const [notice, setNotice] = useState("");
  const geometry = useFieldStore((s) => s.field?.geometry ?? null);
  const hasField = geometry !== null;

  const setTool = useCallback((next: Tool) => {
    const draw = drawRef.current;
    if (!draw) return;
    draw.setMode(next);
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
      const draw = createDraw(map);
      draw.start();
      draw.on("finish", (id, context) => {
        if (context.mode === "polygon" && context.action === "draw") {
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
        if (draw.getMode() === "select") syncEdit(draw);
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

  const hint =
    tool === "polygon"
      ? t("map.draw.hint.polygon")
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
        <p
          aria-live="polite"
          className="pointer-events-auto rounded-control bg-surface/95 px-3 py-2 text-caption text-ink shadow-sm"
        >
          {notice && tool === "static" ? notice : hint}
        </p>
      </div>
      {/* After the controls in the DOM, so keyboard users reach search and tools before the map. */}
      <section ref={container} aria-label={t("map.region")} className="h-full w-full" />
    </div>
  );
}
