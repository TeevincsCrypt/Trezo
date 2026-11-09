"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker, StyleSpecification } from "maplibre-gl";
import { publicConfig } from "@/lib/config";
import { satelliteStyle, type MapMode } from "@/lib/map-styles";
import { chestSvg } from "@/lib/art";
import { RARITY } from "@/lib/rules";
import type { LatLng } from "@/lib/geo";
import type { NearbyTreasure } from "@/server/game";

const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#eceae6" } }],
};

function circlePolygon(c: LatLng, radiusM: number, steps = 48) {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const dLat = (radiusM / 111_320) * Math.cos(a);
    const dLng = (radiusM / (111_320 * Math.cos((c.lat * Math.PI) / 180))) * Math.sin(a);
    coords.push([c.lng + dLng, c.lat + dLat]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [coords] } };
}

export interface GameMapProps {
  center: LatLng;
  player: LatLng | null;
  demo: boolean;
  accuracy: number | null;
  treasures: NearbyTreasure[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMapClick?: (p: LatLng) => void;
  recenterKey: number;
  /** Keep the camera on the player as they move. */
  follow: boolean;
  /** Called when the player drags the map (follow mode should pause). */
  onUserPan?: () => void;
  /** Direction of travel in degrees (from GPS), or null when unknown/stationary. */
  heading: number | null;
  /** Treasures the player is currently close enough to open. */
  inRangeIds: Set<string>;
  /** Satellite imagery with labels (default) or the street map. */
  mapMode: MapMode;
  /** Treasure being hunted: a dashed guide line is drawn from the player to it. */
  guide: (LatLng & { color: string }) | null;
}

export function GameMap(props: GameMapProps) {
  const { center, player, demo, accuracy, treasures, selectedId, onSelect, onMapClick, recenterKey, follow, onUserPan, heading, inRangeIds, mapMode, guide } = props;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef<Map<string, Marker>>(new Map());
  const playerMarker = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(false);
  // Bumped on every style (re)load so overlay data is re-applied after a mode switch.
  const [styleRev, setStyleRev] = useState(0);
  const modeRef = useRef(mapMode);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const panRef = useRef(onUserPan);
  panRef.current = onUserPan;

  // Init
  useEffect(() => {
    let disposed = false;
    let styleIdx = 0;
    let loaded = false;
    (async () => {
      const ml = await import("maplibre-gl");
      ml.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      if (disposed || !el.current) return;
      const styles = publicConfig.mapStyles;
      const m = new ml.Map({
        container: el.current,
        style: mapMode === "satellite" ? satelliteStyle() : (styles[0] ?? OFFLINE_STYLE),
        center: [center.lng, center.lat],
        zoom: 16,
        pitch: 35,
        attributionControl: { compact: true },
        maxPitch: 60,
      });
      map.current = m;
      const tryNext = () => {
        if (loaded || disposed || modeRef.current === "satellite") return;
        styleIdx++;
        if (styleIdx < styles.length) m.setStyle(styles[styleIdx]);
        else {
          setOffline(true);
          m.setStyle(OFFLINE_STYLE);
        }
      };
      // If a style can't be fetched (blocked network, outage), fall through the list.
      const timer = setTimeout(() => !loaded && tryNext(), 6000);
      m.on("error", (e: { error?: { message?: string } }) => {
        const msg = String(e.error?.message ?? "");
        if (!loaded && /style|fetch|Failed|NetworkError|AJAXError/i.test(msg)) tryNext();
      });
      m.on("style.load", () => {
        loaded = true;
        clearTimeout(timer);
        setOffline(false);
        if (!m.getSource("radius")) {
          m.addSource("radius", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          m.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.16 } });
          m.addLayer({ id: "radius-line", type: "line", source: "radius", paint: { "line-color": ["get", "color"], "line-width": 2, "line-dasharray": [2, 2] } });
        }
        if (!m.getSource("guide")) {
          m.addSource("guide", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          m.addLayer({ id: "guide-casing", type: "line", source: "guide", layout: { "line-cap": "round" }, paint: { "line-color": "rgba(0,0,0,0.45)", "line-width": 6 } });
          m.addLayer({ id: "guide-line", type: "line", source: "guide", layout: { "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": 3.5, "line-dasharray": [1.2, 1.6] } });
        }
        setStyleRev((v) => v + 1);
        setReady(true);
      });
      m.on("click", (e: { lngLat: { lat: number; lng: number } }) => clickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng }));
      // dragstart only fires for user gestures (not for easeTo), so it cleanly pauses follow mode.
      m.on("dragstart", () => panRef.current?.());
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      markers.current.clear();
      playerMarker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Satellite ⇄ street map
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || modeRef.current === mapMode) return;
    modeRef.current = mapMode;
    m.setStyle(mapMode === "satellite" ? satelliteStyle() : (publicConfig.mapStyles[0] ?? OFFLINE_STYLE));
  }, [mapMode, ready]);

  // Explicit recenter (button, search result, mode switch)
  useEffect(() => {
    if (!map.current) return;
    const target = follow && player ? player : center;
    map.current.easeTo({ center: [target.lng, target.lat], duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterKey, ready]);

  // Follow mode: keep the camera on the player as they walk (including the first GPS fix).
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !follow || !player) return;
    m.easeTo({ center: [player.lng, player.lat], duration: 650 });
  }, [player, follow, ready]);

  // Player marker
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (async () => {
      const ml = await import("maplibre-gl");
      if (!player) {
        playerMarker.current?.remove();
        playerMarker.current = null;
        return;
      }
      if (!playerMarker.current) {
        // MapLibre owns the outer element's classes/positioning; we style the inner dot.
        const d = document.createElement("div");
        d.className = "trz-player-wrap";
        const arrow = document.createElement("div");
        arrow.className = "trz-beam";
        d.appendChild(arrow);
        d.appendChild(document.createElement("div"));
        playerMarker.current = new ml.Marker({ element: d }).setLngLat([player.lng, player.lat]).addTo(m);
      }
      const pm = playerMarker.current!;
      const wrap = pm.getElement();
      (wrap.lastChild as HTMLElement).className = `trz-player${demo ? " demo" : ""}`;
      const arrow = wrap.firstChild as HTMLElement;
      arrow.style.display = heading == null ? "none" : "block";
      if (heading != null) arrow.style.transform = `rotate(${heading}deg)`;
      pm.setLngLat([player.lng, player.lat]);
    })();
  }, [player, demo, ready, heading]);

  // Treasure markers (diffed)
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (async () => {
      const ml = await import("maplibre-gl");
      const keep = new Set<string>();
      for (const t of treasures) {
        keep.add(t.id);
        let mk: Marker | undefined = markers.current.get(t.id);
        if (!mk) {
          const d = document.createElement("div");
          const btn = document.createElement("button");
          btn.setAttribute("aria-label", `${RARITY[t.rarity].label} treasure: ${t.name}`);
          btn.innerHTML = `<span class="halo"></span><span class="glyph">${chestSvg(t.rarity, t.claimedByMe)}</span>`;
          btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            selectRef.current(t.id);
          });
          d.appendChild(btn);
          const created = new ml.Marker({ element: d }).setLngLat([t.lng, t.lat]).addTo(m);
          markers.current.set(t.id, created);
          mk = created;
        }
        const outer = mk!.getElement();
        const e = outer.firstChild as HTMLElement;
        outer.style.zIndex = selectedId === t.id ? "5" : String({ common: 1, rare: 2, epic: 3, legendary: 4 }[t.rarity]);
        e.className = `trz-marker ${t.rarity}${t.claimedByMe || t.remaining === 0 ? " claimed" : ""}${selectedId === t.id ? " selected" : ""}${inRangeIds.has(t.id) ? " inrange" : ""}`;
        e.style.setProperty("--c", RARITY[t.rarity].color);
      }
      for (const [id, mk] of markers.current) {
        if (!keep.has(id)) {
          mk.remove();
          markers.current.delete(id);
        }
      }
    })();
  }, [treasures, selectedId, ready, inRangeIds]);

  // Claim radius of the selected treasure + accuracy ring
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const src = m.getSource("radius") as { setData?: (d: unknown) => void } | undefined;
    const sel = treasures.find((t) => t.id === selectedId);
    const features = [];
    if (sel) features.push({ ...circlePolygon(sel, sel.claimRadiusM), properties: { color: RARITY[sel.rarity].color } });
    if (player && accuracy && !demo && accuracy < 500) features.push({ ...circlePolygon(player, accuracy), properties: { color: "#0A84FF" } });
    src?.setData?.({ type: "FeatureCollection", features });
  }, [selectedId, treasures, player, accuracy, demo, ready, styleRev]);

  // Guide line: player → hunted treasure
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const src = m.getSource("guide") as { setData?: (d: unknown) => void } | undefined;
    const features =
      player && guide
        ? [{ type: "Feature", properties: { color: guide.color }, geometry: { type: "LineString", coordinates: [[player.lng, player.lat], [guide.lng, guide.lat]] } }]
        : [];
    src?.setData?.({ type: "FeatureCollection", features });
  }, [player, guide, ready, styleRev]);

  return (
    <div className="absolute inset-0 isolate">
      {/* Inline style: maplibre's unlayered `.maplibregl-map{position:relative}` would beat Tailwind's layered utilities. */}
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
      {offline && (
        <>
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage: "radial-gradient(rgba(14,14,16,.22) 1px, transparent 1.4px)",
              backgroundSize: "22px 22px",
            }}
          />
          <div className="pointer-events-none absolute left-4 top-[calc(var(--safe-top)+128px)] max-w-[60%] rounded-2xl bg-white/80 px-3 py-1.5 text-[11px] leading-snug text-muted">
            Map tiles unreachable — offline grid. Treasures still work.
          </div>
        </>
      )}
      {!ready && <div className="skeleton absolute inset-0 rounded-none" />}
    </div>
  );
}
