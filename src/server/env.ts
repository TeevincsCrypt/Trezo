import "server-only";
import crypto from "node:crypto";

const isProd = process.env.NODE_ENV === "production";

let cachedSecret: string | null = null;
function sessionSecret(): string {
  if (cachedSecret) return cachedSecret;
  const s = process.env.TREZO_SESSION_SECRET;
  if (s && s.length >= 16) cachedSecret = s;
  else if (isProd) {
    // Never fall back to a known value in production: use an unguessable
    // per-process secret (sessions reset on restart) and warn loudly.
    console.warn("[trezo] TREZO_SESSION_SECRET is not set — using a random per-process secret. Set it in production.");
    cachedSecret = crypto.randomBytes(32).toString("base64url");
  } else cachedSecret = "dev-only-insecure-session-secret"; // documented in README
  return cachedSecret;
}

export const serverEnv = {
  isProd,
  // Built at runtime on purpose: Turbopack traces static file paths passed to
  // node:sqlite as build dependencies, so a literal "data/trezo.db" made every DB
  // write trigger a dev rebuild/reload loop.
  dbPath: process.env.TREZO_DB_PATH || ["data", "trezo.db"].join("/"),
  get sessionSecret() {
    return sessionSecret();
  },
  /**
   * Admin access: either a NEAR account listed here (wallet-authenticated)
   * or the shared ADMIN_TOKEN. In development a default token is used when
   * none is configured so judges can open /admin immediately.
   */
  adminAccounts: (process.env.TREZO_ADMIN_ACCOUNTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  adminToken: process.env.TREZO_ADMIN_TOKEN || (isProd ? "" : "trezo-admin-dev"),
  /** ed25519 oracle secret: "ed25519:<base58 64-byte key>" (NEAR format) or base64 32-byte seed. */
  oracleSecretKey: process.env.TREZO_ORACLE_SECRET_KEY ?? "",
  rpcUrl: process.env.NEAR_RPC_URL || process.env.NEXT_PUBLIC_NEAR_RPC_URL || "",
};

export function hmac(value: string): string {
  return crypto.createHmac("sha256", serverEnv.sessionSecret).update(value).digest("base64url");
}
