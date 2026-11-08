import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { GameError } from "./errors";

// ---------------------------------------------------------------------------
// Rate limiting (in-memory token bucket; per process). Adequate for a single
// Node instance; swap for Redis/Upstash when horizontally scaling.
// ---------------------------------------------------------------------------
const buckets = new Map<string, { tokens: number; at: number }>();

export function rateLimit(key: string, perMinute: number): boolean {
  const t = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, at: t };
  b.tokens = Math.min(perMinute, b.tokens + ((t - b.at) / 60_000) * perMinute);
  b.at = t;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 50_000) buckets.clear();
  return true;
}

/**
 * Client IP for rate limiting. Proxies append the address they saw to
 * `X-Forwarded-For`, so the left-most entries are client-controlled. We take
 * the entry added by the N-th trusted proxy from the right
 * (`TREZO_TRUSTED_PROXY_HOPS`, default 1 = Railway's edge).
 */
export function clientIp(req: Request) {
  const hops = Math.max(0, Number.parseInt(process.env.TREZO_TRUSTED_PROXY_HOPS ?? "1", 10) || 0);
  const xff = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (hops > 0 && xff.length > 0) return xff[Math.max(0, xff.length - hops)];
  return (req.headers.get("x-real-ip") ?? "local").trim();
}

export function limit(req: Request, scope: string, perMinute: number, extraKey = "") {
  if (!rateLimit(`${scope}:${clientIp(req)}:${extraKey}`, perMinute)) {
    throw new GameError("rate_limited", "Too many requests — slow down a little.", 429);
  }
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new GameError("bad_json", "Request body must be JSON.");
  }
  const r = schema.safeParse(json);
  if (!r.success) throw new GameError("validation", r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return r.data;
}

/** Wrap a route handler: JSON errors, no stack traces leaked. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof GameError) {
        return NextResponse.json({ error: e.code, message: e.message, ...e.extra }, { status: e.status });
      }
      console.error("[api]", e);
      return NextResponse.json({ error: "internal", message: "Something went wrong on our side." }, { status: 500 });
    }
  };
}

export const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
