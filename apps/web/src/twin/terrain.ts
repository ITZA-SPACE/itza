import type { Map as MapLibreMap, RasterDEMSourceSpecification } from "maplibre-gl";

const DEM_SOURCE = "terrain-dem";
const HILLSHADE_SOURCE = "terrain-hillshade-dem";
const HILLSHADE_LAYER = "terrain-hillshade";

export const MIN_EXAGGERATION = 1;
export const MAX_EXAGGERATION = 3;
export const DEFAULT_EXAGGERATION = 1.5;

/** AWS Terrain Tiles (Terrarium encoding): elevation from NASA SRTM, USGS 3DEP and others. */
const DEM: RasterDEMSourceSpecification = {
  type: "raster-dem",
  tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  encoding: "terrarium",
  tileSize: 256,
  maxzoom: 15,
  attribution:
    '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Terrain Tiles on AWS</a> (SRTM, USGS 3DEP, GMTED)',
};

/** Adds the elevation source, a hillshade under the labels, and turns on 3D terrain. */
export function addTerrain(map: MapLibreMap, exaggeration: number): void {
  // Separate sources: MapLibre renders hillshade and 3D terrain better when they do not share one.
  if (!map.getSource(DEM_SOURCE)) map.addSource(DEM_SOURCE, DEM);
  if (!map.getSource(HILLSHADE_SOURCE)) map.addSource(HILLSHADE_SOURCE, DEM);
  if (!map.getLayer(HILLSHADE_LAYER)) {
    const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id: HILLSHADE_LAYER,
        type: "hillshade",
        source: HILLSHADE_SOURCE,
        paint: { "hillshade-exaggeration": 0.45, "hillshade-shadow-color": "#1f2933" },
      },
      firstLabel,
    );
  }
  map.setTerrain({ source: DEM_SOURCE, exaggeration });
}

export function setExaggeration(map: MapLibreMap, exaggeration: number): void {
  map.setTerrain({ source: DEM_SOURCE, exaggeration });
}
