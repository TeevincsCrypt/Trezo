import "server-only";
import crypto from "node:crypto";

const isProd = process.env.NODE_ENV === "production";

function sessionSecret(): string {
  const s = process.env.TREZO_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (isProd) throw new Error("TREZO_SESSION_SECRET (>=16 chars) is required in production");
  // Development fallback: stable per process. Documented in README.
  return "dev-only-insecure-session-secret";
}

export const serverEnv = {
  isProd,
  dbPath: process.env.TREZO_DB_PATH || "data/trezo.db",
  sessionSecret: sessionSecret(),
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
