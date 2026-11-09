import type { StyleSpecification } from "maplibre-gl";
import { publicConfig } from "./config";

export type MapMode = "satellite" | "map";

const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];
const HALO = "rgba(0,0,0,0.75)";

/**
 * Apple-Maps-like hybrid: satellite imagery, with roads and place names from
 * OpenMapTiles-schema vector tiles drawn on top. If the label tiles can't be
 * reached, the imagery still shows.
 */
export function satelliteStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: publicConfig.mapGlyphs,
    sources: {
      sat: {
        type: "raster",
        tiles: [publicConfig.satelliteTiles],
        tileSize: 256,
        maxzoom: 19,
        attribution: publicConfig.satelliteAttribution,
      },
      omt: { type: "vector", url: publicConfig.labelTiles, attribution: "© OpenMapTiles © OpenStreetMap contributors" },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#1f2a1c" } },
      { id: "sat", type: "raster", source: "sat", paint: { "raster-saturation": 0.08, "raster-contrast": 0.05 } },
      {
        id: "roads-major",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
        paint: { "line-color": "#ffe9a8", "line-opacity": 0.85, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.8, 12, 2, 16, 5, 19, 12] },
      },
      {
        id: "roads",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 9,
        filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary", "minor", "service", "track", "path"]]],
        paint: {
          "line-color": "#ffffff",
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.35, 15, 0.6],
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 14, 1.4, 17, 4, 19, 9],
        },
      },
      {
        id: "road-names",
        type: "symbol",
        source: "omt",
        "source-layer": "transportation_name",
        minzoom: 13,
        layout: { "symbol-placement": "line", "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]], "text-font": FONT, "text-size": 12 },
        paint: { "text-color": "#ffffff", "text-halo-color": HALO, "text-halo-width": 1.4 },
      },
      {
        id: "water-names",
        type: "symbol",
        source: "omt",
        "source-layer": "water_name",
        layout: { "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]], "text-font": FONT, "text-size": 12 },
        paint: { "text-color": "#bfe3ff", "text-halo-color": HALO, "text-halo-width": 1.2 },
      },
      {
        id: "poi",
        type: "symbol",
        source: "omt",
        "source-layer": "poi",
        minzoom: 15,
        filter: ["<=", ["get", "rank"], 20],
        layout: { "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]], "text-font": FONT, "text-size": 11.5, "text-max-width": 8 },
        paint: { "text-color": "#ffffff", "text-halo-color": HALO, "text-halo-width": 1.3, "text-opacity": 0.9 },
      },
      {
        id: "places",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town", "village", "suburb", "hamlet", "neighbourhood"]]],
        layout: {
          "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"]],
          "text-font": ["match", ["get", "class"], ["city", "town"], ["literal", FONT_BOLD], ["literal", FONT]],
          "text-size": ["match", ["get", "class"], "city", 17, "town", 15, "village", 13.5, 12],
          "text-max-width": 8,
        },
        paint: { "text-color": "#ffffff", "text-halo-color": HALO, "text-halo-width": 1.6 },
      },
    ],
  };
}
