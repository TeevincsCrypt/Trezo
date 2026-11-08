import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db, now } from "./db";
import { fail } from "./errors";
import { getPlayer, linkAccount, type PlayerRow } from "./players";
import { serverEnv, hmac } from "./env";
import { verifyNep413 } from "./near";
import { publicConfig } from "@/lib/config";

const SESSION_COOKIE = "trezo_session";
const ADMIN_COOKIE = "trezo_admin";
const SESSION_TTL_MS = 30 * 86400_000;
const NONCE_TTL_MS = 10 * 60_000;

export const LOGIN_MESSAGE = "Sign in to TREZO. This signature proves you own this account. It does not send a transaction or cost anything.";
export const loginRecipient = () => publicConfig.contractId || "trezo.game";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("base64url");

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function createSessionToken(playerId: string): string {
  const token = crypto.randomBytes(32).toString("base64url");
  db().prepare("INSERT INTO sessions (token_hash, player_id, created_at, expires_at) VALUES (?,?,?,?)").run(sha(token), playerId, now(), now() + SESSION_TTL_MS);
  return token;
}

export function playerForToken(token: string | undefined): PlayerRow | null {
  if (!token) return null;
  const s = db().prepare("SELECT player_id, expires_at FROM sessions WHERE token_hash = ?").get(sha(token)) as { player_id: string; expires_at: number } | undefined;
  if (!s || s.expires_at < now()) return null;
  return getPlayer(s.player_id) ?? null;
}

export async function startSession(playerId: string) {
  const jar = await cookies();
  // Rotate: the previous session token (e.g. a guest session) stops working.
  const previous = jar.get(SESSION_COOKIE)?.value;
  if (previous) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(previous));
  const token = createSessionToken(playerId);
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: serverEnv.isProd,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(token));
  jar.delete(SESSION_COOKIE);
}

export async function currentPlayer(): Promise<PlayerRow | null> {
  return playerForToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requirePlayer(): Promise<PlayerRow> {
  return (await currentPlayer()) ?? fail("unauthenticated", "Create a profile or connect a wallet to play.", 401);
}

// ---------------------------------------------------------------------------
// NEAR wallet login (NEP-413)
// ---------------------------------------------------------------------------

export function createNonce() {
  const nonce = crypto.randomBytes(32).toString("base64");
  db().prepare("INSERT INTO auth_nonces (nonce, created_at) VALUES (?, ?)").run(nonce, now());
  db().prepare("DELETE FROM auth_nonces WHERE created_at < ?").run(now() - NONCE_TTL_MS * 6);
  return { nonce, message: LOGIN_MESSAGE, recipient: loginRecipient() };
}

export async function verifyWalletLogin(
  input: { accountId: string; publicKey: string; signature: string; nonce: string },
  currentPlayerId: string | null,
) {
  if (!/^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(input.accountId) || input.accountId.length > 64) {
    fail("bad_account", "Invalid NEAR account id.");
  }
  // Single-use, short-lived nonce (replay protection).
  const used = db().prepare("UPDATE auth_nonces SET used = 1 WHERE nonce = ? AND used = 0 AND created_at > ?").run(input.nonce, now() - NONCE_TTL_MS);
  if (used.changes === 0) fail("bad_nonce", "Login request expired. Please try again.", 401);
  const nonceBytes = new Uint8Array(Buffer.from(input.nonce, "base64"));
  try {
    await verifyNep413({
      accountId: input.accountId,
      publicKey: input.publicKey,
      signature: input.signature,
      message: LOGIN_MESSAGE,
      recipient: loginRecipient(),
      nonce: nonceBytes,
    });
  } catch (e) {
    fail("bad_signature", `Wallet signature could not be verified: ${(e as Error).message}`, 401);
  }
  return linkAccount(currentPlayerId, input.accountId);
}

// ---------------------------------------------------------------------------
// Admin (server-side authorisation)
// ---------------------------------------------------------------------------

export async function isAdmin(): Promise<{ ok: boolean; actor: string }> {
  const jar = await cookies();
  const adminCookie = jar.get(ADMIN_COOKIE)?.value;
  if (serverEnv.adminToken && adminCookie && adminCookie === hmac(`admin:${serverEnv.adminToken}`)) return { ok: true, actor: "admin-token" };
  const p = await currentPlayer();
  if (p?.account_id && serverEnv.adminAccounts.includes(p.account_id)) return { ok: true, actor: p.account_id };
  return { ok: false, actor: "" };
}

export async function requireAdmin() {
  const a = await isAdmin();
  if (!a.ok) fail("forbidden", "Admin access required.", 403);
  return a.actor;
}

export async function adminLogin(token: string) {
  if (!serverEnv.adminToken) fail("admin_disabled", "Admin token login is disabled on this server.", 403);
  const a = Buffer.from(token);
  const b = Buffer.from(serverEnv.adminToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) fail("forbidden", "Wrong admin token.", 403);
  (await cookies()).set(ADMIN_COOKIE, hmac(`admin:${serverEnv.adminToken}`), {
    httpOnly: true,
    sameSite: "strict",
    secure: serverEnv.isProd,
    path: "/",
    maxAge: 8 * 3600,
  });
}

export async function adminLogout() {
  (await cookies()).delete(ADMIN_COOKIE);
}
