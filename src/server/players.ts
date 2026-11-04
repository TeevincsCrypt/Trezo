import "server-only";
import crypto from "node:crypto";
import { db, now } from "./db";
import { fail } from "./errors";
import { AVATARS, USERNAME_RE, levelForXp } from "@/lib/rules";

export interface PlayerRow {
  id: string;
  username: string;
  avatar: string;
  frame: string | null;
  account_id: string | null;
  is_guest: number;
  is_sample: number;
  xp: number;
  shards: number;
  treasures_found: number;
  rare_found: number;
  missions_completed: number;
  quests_completed: number;
  distance_m: number;
  streak_days: number;
  last_active_day: string | null;
  shards_day: string | null;
  shards_earned_day: number;
  last_claim_at: number | null;
  last_lat: number | null;
  last_lng: number | null;
  last_loc_at: number | null;
  flags: number;
  radar_until: number | null;
  created_at: number;
}

export function getPlayer(id: string): PlayerRow | undefined {
  return db().prepare("SELECT * FROM players WHERE id = ?").get(id) as PlayerRow | undefined;
}

export function getPlayerByUsername(username: string): PlayerRow | undefined {
  return db().prepare("SELECT * FROM players WHERE username = ? COLLATE NOCASE").get(username) as PlayerRow | undefined;
}

export function getPlayerByAccount(accountId: string): PlayerRow | undefined {
  return db().prepare("SELECT * FROM players WHERE account_id = ?").get(accountId) as PlayerRow | undefined;
}

function validateUsername(username: string) {
  if (!USERNAME_RE.test(username)) fail("bad_username", "Usernames are 3–20 letters, numbers or underscores.");
}
function validateAvatar(avatar: string) {
  if (!AVATARS.some((a) => a.id === avatar)) fail("bad_avatar", "Unknown avatar.");
}

export function usernameAvailable(username: string, exceptId?: string) {
  const p = getPlayerByUsername(username);
  return !p || p.id === exceptId;
}

export function createPlayer(input: { username: string; avatar: string; accountId?: string }): PlayerRow {
  validateUsername(input.username);
  validateAvatar(input.avatar);
  if (!usernameAvailable(input.username)) fail("username_taken", "That username is taken.", 409);
  const id = crypto.randomUUID();
  db()
    .prepare("INSERT INTO players (id, username, avatar, account_id, is_guest, created_at) VALUES (?,?,?,?,?,?)")
    .run(id, input.username, input.avatar, input.accountId ?? null, input.accountId ? 0 : 1, now());
  return getPlayer(id)!;
}

export function updateProfile(id: string, input: { username?: string; avatar?: string; frame?: string | null }) {
  const p = getPlayer(id) ?? fail("not_found", "Player not found", 404);
  const username = input.username ?? p.username;
  const avatar = input.avatar ?? p.avatar;
  validateUsername(username);
  validateAvatar(avatar);
  if (!usernameAvailable(username, id)) fail("username_taken", "That username is taken.", 409);
  let frame = p.frame;
  if (input.frame !== undefined) {
    if (input.frame === null) frame = null;
    else {
      const owned = db()
        .prepare(
          `SELECT 1 FROM purchases pu JOIN shop_items s ON s.id = pu.shop_item_id WHERE pu.player_id = ? AND s.kind='frame' AND s.value = ?`,
        )
        .get(id, input.frame);
      if (!owned) fail("not_owned", "You don't own that frame yet.");
      frame = input.frame;
    }
  }
  db().prepare("UPDATE players SET username=?, avatar=?, frame=? WHERE id=?").run(username, avatar, frame, id);
  return getPlayer(id)!;
}

/**
 * Attach a verified NEAR account to a player. If the account already has a
 * TREZO profile, that profile wins (we return it) and the caller switches
 * session to it. Otherwise the current (guest) profile is upgraded in place,
 * keeping all progress.
 */
export function linkAccount(currentPlayerId: string | null, accountId: string): PlayerRow {
  const existing = getPlayerByAccount(accountId);
  if (existing) return existing;
  if (currentPlayerId) {
    const cur = getPlayer(currentPlayerId);
    if (cur && !cur.account_id && !cur.is_sample) {
      db().prepare("UPDATE players SET account_id = ?, is_guest = 0 WHERE id = ?").run(accountId, cur.id);
      return getPlayer(cur.id)!;
    }
  }
  // Fresh wallet with no session: derive a default username from the account.
  let base = accountId.split(".")[0].replace(/[^A-Za-z0-9_]/g, "_").slice(0, 16);
  if (base.length < 3) base = `hunter_${base}`;
  let username = base;
  for (let i = 1; !usernameAvailable(username); i++) username = `${base.slice(0, 15)}_${i}`;
  return createPlayer({ username, avatar: "fox", accountId });
}

export function publicPlayer(p: PlayerRow) {
  return {
    id: p.id,
    username: p.username,
    avatar: p.avatar,
    frame: p.frame,
    accountId: p.account_id,
    isGuest: !!p.is_guest,
    isSample: !!p.is_sample,
    xp: p.xp,
    level: levelForXp(p.xp),
    treasuresFound: p.treasures_found,
    rareFound: p.rare_found,
    missionsCompleted: p.missions_completed,
    questsCompleted: p.quests_completed,
    distanceM: Math.round(p.distance_m),
    streakDays: p.streak_days,
    createdAt: p.created_at,
  };
}

export function selfPlayer(p: PlayerRow) {
  return {
    ...publicPlayer(p),
    shards: p.shards,
    shardsEarnedToday: p.shards_day === new Date().toISOString().slice(0, 10) ? p.shards_earned_day : 0,
    radarUntil: p.radar_until,
  };
}

export type PublicPlayer = ReturnType<typeof publicPlayer>;
export type SelfPlayer = ReturnType<typeof selfPlayer>;
