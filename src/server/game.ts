import "server-only";
import crypto from "node:crypto";
import { db, now } from "./db";
import { fail, GameError } from "./errors";
import { getPlayer, type PlayerRow } from "./players";
import { ensureSpawnField, utcDay } from "./spawn";
import { ECONOMY, RARITY, type Rarity } from "@/lib/rules";
import { cellKey, distanceM, isValidLatLng, type LatLng } from "@/lib/geo";
import { publicConfig } from "@/lib/config";

// ---------------------------------------------------------------------------
// Economy primitives
// ---------------------------------------------------------------------------

/**
 * Credit Shards subject to the daily earning cap. Returns the amount actually
 * credited. Must be called inside a transaction.
 */
export function creditShards(playerId: string, amount: number, reason: string, ref?: string): number {
  if (amount <= 0) return 0;
  const p = getPlayer(playerId)!;
  const today = utcDay();
  const earned = p.shards_day === today ? p.shards_earned_day : 0;
  const credit = Math.max(0, Math.min(amount, ECONOMY.dailyShardCap - earned));
  db()
    .prepare("UPDATE players SET shards = shards + ?, shards_day = ?, shards_earned_day = ? WHERE id = ?")
    .run(credit, today, earned + credit, playerId);
  if (credit > 0) {
    db().prepare("INSERT INTO shard_ledger (player_id, delta, reason, ref, created_at) VALUES (?,?,?,?,?)").run(playerId, credit, reason, ref ?? null, now());
  }
  return credit;
}

/** Spend Shards (a sink). Throws if the balance is insufficient. */
export function spendShards(playerId: string, amount: number, reason: string, ref?: string) {
  if (amount <= 0) return;
  const r = db().prepare("UPDATE players SET shards = shards - ? WHERE id = ? AND shards >= ?").run(amount, playerId, amount);
  if (r.changes === 0) fail("insufficient_shards", `You need ${amount} Shards for this.`);
  db().prepare("INSERT INTO shard_ledger (player_id, delta, reason, ref, created_at) VALUES (?,?,?,?,?)").run(playerId, -amount, reason, ref ?? null, now());
}

export function addXp(playerId: string, xp: number) {
  if (xp > 0) db().prepare("UPDATE players SET xp = xp + ? WHERE id = ?").run(xp, playerId);
}

export function logEvent(playerId: string, type: string, value = 1, rarity: string | null = null) {
  db().prepare("INSERT INTO events (player_id, type, value, rarity, created_at) VALUES (?,?,?,?,?)").run(playerId, type, value, rarity, now());
}

export function securityEvent(playerId: string | null, kind: string, detail: Record<string, unknown>) {
  db().prepare("INSERT INTO security_events (player_id, kind, detail, created_at) VALUES (?,?,?,?)").run(playerId, kind, JSON.stringify(detail), now());
  if (playerId) db().prepare("UPDATE players SET flags = flags + 1 WHERE id = ?").run(playerId);
}

function touchStreak(p: PlayerRow) {
  const today = utcDay();
  if (p.last_active_day === today) return;
  const yesterday = utcDay(Date.now() - 86400_000);
  const streak = p.last_active_day === yesterday ? p.streak_days + 1 : 1;
  db().prepare("UPDATE players SET streak_days = ?, last_active_day = ? WHERE id = ?").run(streak, today, p.id);
}

export interface RewardInput {
  playerId: string;
  kind: "treasure" | "mission" | "quest";
  refId: string;
  title: string;
  rarity?: Rarity | null;
  npcId?: string | null;
  maxClaims?: number | null;
  shards: number;
  xp: number;
  items: { itemId: string; qty: number }[];
  demo?: boolean;
}

export interface GrantedReward {
  id: string;
  shards: number;
  shardsCapped: boolean;
  xp: number;
  items: { itemId: string; qty: number }[];
}

/**
 * Grant a reward: Shards (capped), XP, and collectibles into the player's
 * game vault. Collectibles respect each item type's global max supply. Must be
 * called inside a transaction.
 */
export function grantReward(r: RewardInput): GrantedReward {
  const id = `r-${crypto.randomUUID()}`;
  const shards = creditShards(r.playerId, r.shards, r.kind, id);
  addXp(r.playerId, r.xp);
  const t = now();
  const granted: { itemId: string; qty: number }[] = [];
  for (const it of r.items) {
    if (it.qty <= 0) continue;
    // Atomic supply check: only increments when supply remains.
    const ok = db()
      .prepare("UPDATE item_types SET issued = issued + ? WHERE id = ? AND active = 1 AND issued + ? <= max_supply")
      .run(it.qty, it.itemId, it.qty);
    if (ok.changes === 0) continue; // sold out: reward continues without the item
    granted.push(it);
  }
  db()
    .prepare(
      `INSERT INTO rewards (id, player_id, kind, ref_id, npc_id, max_claims, title, rarity, shards, xp, demo, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(id, r.playerId, r.kind, r.refId, r.npcId ?? null, r.maxClaims ?? null, r.title, r.rarity ?? null, shards, r.xp, r.demo ? 1 : 0, t);
  const ins = db().prepare("INSERT INTO reward_items (reward_id, player_id, item_id, qty, status, acquired_at) VALUES (?,?,?,?, 'vault', ?)");
  for (const it of granted) ins.run(id, r.playerId, it.itemId, it.qty, t);
  return { id, shards, shardsCapped: shards < r.shards, xp: r.xp, items: granted };
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export interface LocationResult {
  accepted: boolean;
  reason?: string;
  movedM: number;
  newCell: boolean;
  spawned: number;
}

/**
 * Process a location fix. Real GPS fixes accumulate distance, unlock new
 * exploration cells, keep the streak alive and seed treasure fields. Demo
 * fixes (simulated position) only affect the demo zone and never count
 * towards distance or exploration.
 */
export function recordLocation(playerId: string, pos: LatLng, accuracyM: number | null, demo: boolean): LocationResult {
  if (!isValidLatLng(pos)) fail("bad_location", "Invalid coordinates.");
  const res: LocationResult = { accepted: true, movedM: 0, newCell: false, spawned: 0 };
  if (demo) return res;

  const tx = db().transaction(() => {
    const p = getPlayer(playerId) ?? fail("not_found", "Player not found", 404);
    const t = now();
    if (p.last_lat != null && p.last_lng != null && p.last_loc_at != null) {
      const d = distanceM({ lat: p.last_lat, lng: p.last_lng }, pos);
      const dt = Math.max(1, (t - p.last_loc_at) / 1000);
      if (d / dt > ECONOMY.maxSpeedMps && d > 500) {
        // Implausible jump: do not credit distance; record but accept the new
        // position so a genuine flight/train trip doesn't lock the player out.
        securityEvent(playerId, "location_jump", { from: [p.last_lat, p.last_lng], to: [pos.lat, pos.lng], meters: Math.round(d), seconds: Math.round(dt) });
        res.reason = "jump";
      } else if (d >= 8 && (accuracyM ?? 0) <= ECONOMY.maxGpsAccuracyM * 2) {
        // Ignore GPS jitter below 8 m; cap credited distance per fix.
        res.movedM = Math.min(d, 2000);
        db().prepare("UPDATE players SET distance_m = distance_m + ? WHERE id = ?").run(res.movedM, playerId);
        logEvent(playerId, "distance", res.movedM);
      }
    }
    db().prepare("UPDATE players SET last_lat = ?, last_lng = ?, last_loc_at = ? WHERE id = ?").run(pos.lat, pos.lng, t, playerId);
    const cell = cellKey(pos, ECONOMY.visitCellDeg);
    const ins = db().prepare("INSERT OR IGNORE INTO visited_cells (player_id, cell, first_at) VALUES (?,?,?)").run(playerId, cell, t);
    if (ins.changes > 0) {
      res.newCell = true;
      logEvent(playerId, "new_cell");
    }
    touchStreak(p);
    res.spawned = ensureSpawnField(db(), pos, t);
  });
  tx();
  return res;
}

// ---------------------------------------------------------------------------
// Treasures
// ---------------------------------------------------------------------------

export interface TreasureRow {
  id: string;
  name: string;
  description: string;
  lat: number;
  lng: number;
  rarity: Rarity;
  reward_shards: number;
  reward_xp: number;
  reward_item_id: string | null;
  reward_item_qty: number;
  max_claims: number;
  claim_count: number;
  claim_radius_m: number;
  zone: "world" | "demo";
  source: string;
  active: number;
  expires_at: number | null;
  created_at: number;
}

export function getTreasure(id: string) {
  return db().prepare("SELECT * FROM treasures WHERE id = ?").get(id) as TreasureRow | undefined;
}

export function effectiveRadius(t: TreasureRow, p: PlayerRow) {
  const boosted = p.radar_until && p.radar_until > now();
  return t.claim_radius_m * (boosted ? 2 : 1);
}

export function nearbyTreasures(playerId: string | null, pos: LatLng, zone: "world" | "demo", radiusM: number = ECONOMY.nearbyRadiusM) {
  if (!isValidLatLng(pos)) fail("bad_location", "Invalid coordinates.");
  const dLat = radiusM / 111_000;
  const dLng = radiusM / (111_000 * Math.max(0.1, Math.cos((pos.lat * Math.PI) / 180)));
  const rows = db()
    .prepare(
      `SELECT t.*, ${playerId ? "EXISTS(SELECT 1 FROM claims c WHERE c.treasure_id = t.id AND c.player_id = @pid)" : "0"} AS claimed_by_me
       FROM treasures t
       WHERE t.zone = @zone AND t.active = 1 AND (t.expires_at IS NULL OR t.expires_at > @now)
         AND t.lat BETWEEN @minLat AND @maxLat AND t.lng BETWEEN @minLng AND @maxLng`,
    )
    .all({ pid: playerId, zone, now: now(), minLat: pos.lat - dLat, maxLat: pos.lat + dLat, minLng: pos.lng - dLng, maxLng: pos.lng + dLng }) as (TreasureRow & { claimed_by_me: number })[];
  const player = playerId ? getPlayer(playerId) : undefined;
  return rows
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      lat: t.lat,
      lng: t.lng,
      rarity: t.rarity,
      rewardShards: t.reward_shards,
      rewardXp: t.reward_xp,
      rewardItemId: t.reward_item_id,
      rewardItemQty: t.reward_item_qty,
      maxClaims: t.max_claims,
      claimCount: t.claim_count,
      remaining: Math.max(0, t.max_claims - t.claim_count),
      claimRadiusM: player ? effectiveRadius(t, player) : t.claim_radius_m,
      zone: t.zone,
      expiresAt: t.expires_at,
      claimedByMe: !!t.claimed_by_me,
      distanceM: distanceM(pos, t),
    }))
    .filter((t) => t.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

export type NearbyTreasure = ReturnType<typeof nearbyTreasures>[number];

export interface ClaimInput {
  playerId: string;
  treasureId: string;
  pos: LatLng;
  accuracyM: number | null;
  demo: boolean;
}

/**
 * Server-authoritative treasure claim. Every rule is evaluated inside one
 * SQLite transaction (serialised writes), so two concurrent requests cannot
 * both pass the supply or duplicate checks.
 */
export function claimTreasure(input: ClaimInput) {
  const { playerId, treasureId, pos, accuracyM, demo } = input;
  if (!isValidLatLng(pos)) fail("bad_location", "Invalid coordinates.");

  const tx = db().transaction(() => {
    const p = getPlayer(playerId) ?? fail("not_found", "Player not found", 404);
    const t = getTreasure(treasureId) ?? fail("not_found", "Treasure not found.", 404);
    const ts = now();

    // 1. Availability
    if (!t.active) fail("inactive", "This treasure has been disabled.");
    if (t.expires_at && t.expires_at <= ts) fail("expired", "This treasure has expired.");
    if (t.claim_count >= t.max_claims) fail("exhausted", "Every reward in this treasure has already been claimed.");

    // 2. Zone / mode consistency
    if (demo && t.zone !== "demo") fail("mode_mismatch", "Demo mode can only open demo-zone treasures.");
    if (!demo && t.zone === "demo") fail("mode_mismatch", "Switch to demo mode to open demo-zone treasures.");

    // 3. Duplicate claim
    const dup = db().prepare("SELECT 1 FROM claims WHERE player_id = ? AND treasure_id = ?").get(playerId, treasureId);
    if (dup) fail("duplicate", "You've already opened this treasure.");

    // 4. Cooldown
    if (p.last_claim_at && ts - p.last_claim_at < ECONOMY.claimCooldownSec * 1000) {
      const wait = Math.ceil((ECONOMY.claimCooldownSec * 1000 - (ts - p.last_claim_at)) / 1000);
      fail("cooldown", `Catch your breath — try again in ${wait}s.`, 429, { retryAfterSec: wait });
    }

    // 5. GPS quality (real mode)
    if (!demo && accuracyM != null && accuracyM > ECONOMY.maxGpsAccuracyM) {
      fail("weak_gps", `Your GPS accuracy is ±${Math.round(accuracyM)} m. Move to open sky and try again.`);
    }

    // 6. Location jump (real mode): compare with last known fix
    if (!demo && p.last_lat != null && p.last_lng != null && p.last_loc_at != null) {
      const d = distanceM({ lat: p.last_lat, lng: p.last_lng }, pos);
      const dt = Math.max(1, (ts - p.last_loc_at) / 1000);
      if (d > 500 && d / dt > ECONOMY.maxSpeedMps) {
        // Logged after the transaction rolls back (see below).
        fail("suspicious_movement", "Your location changed impossibly fast. Wait a moment and try again.", 403, {
          audit: { treasureId, meters: Math.round(d), seconds: Math.round(dt) },
        });
      }
    }

    // 7. Proximity
    const dist = distanceM(pos, t);
    const radius = effectiveRadius(t, p);
    if (dist > radius) fail("too_far", `You're ${Math.round(dist)} m away. Get within ${radius} m to open it.`, 400, { distanceM: dist, radiusM: radius });

    // --- all checks passed: record ---
    const claimId = crypto.randomUUID();
    db().prepare("UPDATE treasures SET claim_count = claim_count + 1 WHERE id = ? AND claim_count < max_claims").run(t.id);
    const items = t.reward_item_id ? [{ itemId: t.reward_item_id, qty: t.reward_item_qty }] : [];
    const reward = grantReward({
      playerId,
      kind: "treasure",
      refId: t.id,
      title: t.name,
      rarity: t.rarity,
      maxClaims: t.max_claims,
      shards: t.reward_shards,
      xp: t.reward_xp,
      items,
      demo,
    });
    db()
      .prepare("INSERT INTO claims (id, player_id, treasure_id, reward_id, lat, lng, accuracy_m, distance_m, demo, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(claimId, playerId, t.id, reward.id, pos.lat, pos.lng, accuracyM, dist, demo ? 1 : 0, ts);
    const rarePlus = t.rarity !== "common" ? 1 : 0;
    db()
      .prepare("UPDATE players SET treasures_found = treasures_found + 1, rare_found = rare_found + ?, last_claim_at = ? WHERE id = ?")
      .run(rarePlus, ts, playerId);
    if (!demo) db().prepare("UPDATE players SET last_lat = ?, last_lng = ?, last_loc_at = ? WHERE id = ?").run(pos.lat, pos.lng, ts, playerId);
    logEvent(playerId, "treasure", 1, t.rarity);
    touchStreak(p);

    const after = getPlayer(playerId)!;
    return {
      claimId,
      reward,
      treasure: { id: t.id, name: t.name, rarity: t.rarity, zone: t.zone },
      distanceM: dist,
      player: { xp: after.xp, shards: after.shards, treasuresFound: after.treasures_found },
      levelBefore: p.xp,
    };
  });
  try {
    return tx();
  } catch (e) {
    if (e instanceof GameError && e.code === "suspicious_movement" && e.extra?.audit) {
      securityEvent(playerId, "claim_jump", e.extra.audit as Record<string, unknown>);
      delete e.extra.audit;
    }
    throw e;
  }
}

export const RARITY_ORDER: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
export const rarityCfg = RARITY;
export const demoCenter = publicConfig.demoCenter;
