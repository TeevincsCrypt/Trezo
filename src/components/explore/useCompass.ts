"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type IOSOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type PermissionAPI = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Device compass heading in degrees (0 = north), or null when unavailable.
 * iOS needs `enable()` to be called from a user gesture (tap) once.
 */
export function useCompass() {
  const [heading, setHeading] = useState<number | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const listening = useRef(false);
  const last = useRef(0);

  const onOrient = useCallback((e: Event) => {
    const ev = e as IOSOrientationEvent;
    let h: number | null = null;
    if (typeof ev.webkitCompassHeading === "number") h = ev.webkitCompassHeading;
    else if (ev.absolute && typeof ev.alpha === "number") h = (360 - ev.alpha) % 360;
    if (h == null || Number.isNaN(h)) return;
    // Correct for screen rotation (landscape).
    const angle = typeof screen !== "undefined" && screen.orientation ? screen.orientation.angle : 0;
    h = (h + angle + 360) % 360;
    const now = performance.now();
    if (now - last.current < 60) return; // ~16 fps is plenty
    last.current = now;
    setHeading(Math.round(h));
  }, []);

  const listen = useCallback(() => {
    if (listening.current || typeof window === "undefined") return;
    listening.current = true;
    const w: Window = window;
    // Android Chrome: absolute (true-north) orientation; iOS: webkitCompassHeading on deviceorientation.
    w.addEventListener(("ondeviceorientationabsolute" in w ? "deviceorientationabsolute" : "deviceorientation") as "deviceorientation", onOrient);
  }, [onOrient]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") return;
    const api = DeviceOrientationEvent as unknown as PermissionAPI;
    if (typeof api.requestPermission === "function") setNeedsPermission(true);
    else listen();
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrient);
      window.removeEventListener("deviceorientation", onOrient);
      listening.current = false;
    };
  }, [listen, onOrient]);

  /** Call from a tap handler. Safe to call repeatedly. */
  const enable = useCallback(async () => {
    if (typeof DeviceOrientationEvent === "undefined") return;
    const api = DeviceOrientationEvent as unknown as PermissionAPI;
    if (typeof api.requestPermission === "function") {
      try {
        if ((await api.requestPermission()) === "granted") {
          setNeedsPermission(false);
          listen();
        }
      } catch {
        /* dismissed */
      }
    } else listen();
  }, [listen]);

  return { heading, needsPermission, enable };
}
