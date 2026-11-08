"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { distanceM, type LatLng } from "@/lib/geo";
import { publicConfig } from "@/lib/config";
import { useGame } from "./GameProvider";

export type LocMode = "gps" | "demo";
export type GpsState = "idle" | "prompt" | "watching" | "denied" | "unavailable" | "error";

interface LocationCtx {
  mode: LocMode;
  gpsState: GpsState;
  position: LatLng | null;
  accuracy: number | null;
  /** Direction of travel in degrees from GPS (only while moving), else null. */
  heading: number | null;
  /** Ask for permission and start watching real GPS. */
  startGps: () => void;
  /** Switch to the clearly-labelled demo zone with a simulated position. */
  enterDemo: (pos?: LatLng) => void;
  /** Move the simulated explorer (demo mode only). */
  setDemoPosition: (pos: LatLng) => void;
  lastFixAt: number | null;
}

const Ctx = createContext<LocationCtx | null>(null);
const MODE_KEY = "trezo.mode";

export function LocationProvider({ children }: { children: ReactNode }) {
  const { me, notify } = useGame();
  const [mode, setMode] = useState<LocMode>("gps");
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [position, setPosition] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const headingAt = useRef(0);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef<{ pos: LatLng; at: number } | null>(null);

  const stopWatch = () => {
    if (watchId.current != null && typeof navigator !== "undefined") navigator.geolocation?.clearWatch(watchId.current);
    watchId.current = null;
  };

  const startGps = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsState("unavailable");
      return;
    }
    try {
      localStorage.setItem(MODE_KEY, "gps");
    } catch {}
    setMode("gps");
    setPosition(null);
    setGpsState("prompt");
    stopWatch();
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setGpsState("watching");
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        setAccuracy(p.coords.accuracy ?? null);
        // GPS heading is only meaningful while moving; keep the last value for 10 s.
        const h = p.coords.heading;
        if (h != null && Number.isFinite(h) && (p.coords.speed ?? 1) > 0.4) {
          setHeading(h);
          headingAt.current = Date.now();
        } else if (Date.now() - headingAt.current > 10_000) setHeading(null);
        setLastFixAt(Date.now());
      },
      (err) => {
        setGpsState(err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.POSITION_UNAVAILABLE ? "unavailable" : "error");
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  }, []);

  const enterDemo = useCallback((pos?: LatLng) => {
    stopWatch();
    try {
      localStorage.setItem(MODE_KEY, "demo");
    } catch {}
    setMode("demo");
    setGpsState("idle");
    setAccuracy(null);
    setPosition(pos ?? { lat: publicConfig.demoCenter.lat, lng: publicConfig.demoCenter.lng });
    setLastFixAt(Date.now());
  }, []);

  const setDemoPosition = useCallback(
    (pos: LatLng) => {
      if (mode !== "demo") return;
      setPosition(pos);
      setLastFixAt(Date.now());
    },
    [mode],
  );

  // Restore last mode. Real GPS is requested only after the player chose it.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MODE_KEY);
    } catch {}
    if (saved === "demo") enterDemo();
    else if (saved === "gps") startGps();
    return stopWatch;
  }, [enterDemo, startGps]);

  // Report position to the server (throttled): distance, exploration, streak, spawning.
  useEffect(() => {
    if (!me || !position) return;
    const prev = lastSent.current;
    const now = Date.now();
    if (prev && now - prev.at < 12_000 && distanceM(prev.pos, position) < 15) return;
    lastSent.current = { pos: position, at: now };
    api<{ newCell: boolean; reason?: string }>("/api/location", { body: { pos: position, accuracy, demo: mode === "demo" } })
      .then((r) => {
        if (r.newCell) notify({ title: "New ground charted", body: "You explored a new area.", tone: "success" });
      })
      .catch(() => {});
  }, [me, position, accuracy, mode, notify]);

  const value = useMemo(
    () => ({ mode, gpsState, position, accuracy, heading, startGps, enterDemo, setDemoPosition, lastFixAt }),
    [mode, gpsState, position, accuracy, heading, startGps, enterDemo, setDemoPosition, lastFixAt],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocation() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLocation outside LocationProvider");
  return c;
}
