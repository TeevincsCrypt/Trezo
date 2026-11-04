import "server-only";
import { db, now } from "./db";
import { fail } from "./errors";
import { getPlayer, publicPlayer, type PlayerRow } from "./players";
import { spendShards } from "./game";
import type { Rarity } from "@/lib/rules";

export interface ItemTypeRow {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  category: string;
  art: string;
  transferable: number;
  max_supply: number;
  issued: number;
  active: number;
}

export function itemTypes(): ItemTypeRow[] {
  return db().prepare("SELECT * FROM item_types ORDER BY CASE rarity WHEN 'legendary' THEN 0 WHEN 'epic' THEN 1 WHEN 'rare' THEN 2 ELSE 3 END, name").all() as ItemTypeRow[];
}

export function itemType(id: string) {
  return db().prepare("SELECT * FROM item_types WHERE id = ?").get(id) as ItemTypeRow | undefined;
}

export const itemTypeView = (i: ItemTypeRow) => ({
  id: i.id,
  name: i.name,
  description: i.description,
  rarity: i.rarity,
  category: i.category,
  art: i.art,
  transferable: !!i.transferable,
  maxSupply: i.max_supply,
  issued: i.issued,
});
export type ItemTypeView = ReturnType<typeof itemTypeView>;

/**
 * The player's game-side inventory: items held in the TREZO vault (not yet
 * on-chain), items being minted, and items already settled on-chain. On-chain
 * *current* balances are read live from the contract by the client, because a
 * player may have traded them since.
 */
export function inventory(playerId: string) {
  const rows = db()
    .prepare(
      `SELECT ri.item_id, ri.status, SUM(ri.qty) AS qty, MIN(ri.acquired_at) AS first_at, MAX(ri.acquired_at) AS last_at
       FROM reward_items ri WHERE ri.player_id = ? AND ri.status != 'spent'
       GROUP BY ri.item_id, ri.status`,
    )
    .all(playerId) as { item_id: string; status: string; qty: number; first_at: number; last_at: number }[];
  const byItem = new Map<string, { vault: number; minting: number; onchain: number; firstAt: number; lastAt: number }>();
  for (const r of rows) {
    const e = byItem.get(r.item_id) ?? { vault: 0, minting: 0, onchain: 0, firstAt: r.first_at, lastAt: r.last_at };
    (e as Record<string, number>)[r.status] += r.qty;
    e.firstAt = Math.min(e.firstAt, r.first_at);
    e.lastAt = Math.max(e.lastAt, r.last_at);
    byItem.set(r.item_id, e);
  }
  const types = new Map(itemTypes().map((t) => [t.id, t]));
  return [...byItem.entries()]
    .filter(([id]) => types.has(id))
    .map(([id, e]) => ({ item: itemTypeView(types.get(id)!), ...e }))
    .sort((a, b) => b.lastAt - a.lastAt);
}

export type InventoryEntry = ReturnType<typeof inventory>[number];

/** Rewards with pending on-chain settlement. */
export function rewardsForPlayer(playerId: string) {
  const rewards = db()
    .prepare("SELECT * FROM rewards WHERE player_id = ? ORDER BY created_at DESC LIMIT 100")
    .all(playerId) as {
    id: string;
    kind: string;
    ref_id: string;
    title: string;
    rarity: string | null;
    shards: number;
    xp: number;
    demo: number;
    onchain_status: string;
    tx_hash: string | null;
    created_at: number;
  }[];
  const items = db().prepare("SELECT reward_id, item_id, qty, status FROM reward_items WHERE player_id = ?").all(playerId) as {
    reward_id: string;
    item_id: string;
    qty: number;
    status: string;
  }[];
  return rewards.map((r) => ({
    id: r.id,
    kind: r.kind,
    refId: r.ref_id,
    title: r.title,
    rarity: r.rarity,
    shards: r.shards,
    xp: r.xp,
    demo: !!r.demo,
    onchainStatus: r.onchain_status,
    txHash: r.tx_hash,
    createdAt: r.created_at,
    items: items.filter((i) => i.reward_id === r.id).map((i) => ({ itemId: i.item_id, qty: i.qty, status: i.status })),
  }));
}

export type RewardView = ReturnType<typeof rewardsForPlayer>[number];

// ---------------------------------------------------------------------------
// Shard shop (off-chain sink)
// ---------------------------------------------------------------------------

export function shop(playerId: string | null) {
  const items = db().prepare("SELECT * FROM shop_items WHERE active = 1 ORDER BY price").all() as {
    id: string;
    name: string;
    description: string;
    kind: string;
    value: string;
    price: number;
    stock: number | null;
    sold: number;
  }[];
  const owned = new Set(
    playerId ? (db().prepare("SELECT shop_item_id FROM purchases WHERE player_id = ?").all(playerId) as { shop_item_id: string }[]).map((r) => r.shop_item_id) : [],
  );
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    kind: i.kind,
    value: i.value,
    price: i.price,
    remaining: i.stock == null ? null : Math.max(0, i.stock - i.sold),
    owned: i.kind === "frame" && owned.has(i.id),
  }));
}

export function buyShopItem(playerId: string, shopItemId: string) {
  return db().transaction(() => {
    const it = (db().prepare("SELECT * FROM shop_items WHERE id = ? AND active = 1").get(shopItemId) as
      | { id: string; kind: string; value: string; price: number; stock: number | null; sold: number }
      | undefined) ?? fail("not_found", "Item not found", 404);
    if (it.kind === "frame") {
      const has = db().prepare("SELECT 1 FROM purchases WHERE player_id = ? AND shop_item_id = ?").get(playerId, it.id);
      if (has) fail("owned", "You already own this.");
    }
    if (it.stock != null) {
      const ok = db().prepare("UPDATE shop_items SET sold = sold + 1 WHERE id = ? AND sold < stock").run(it.id);
      if (ok.changes === 0) fail("sold_out", "Sold out.");
    } else db().prepare("UPDATE shop_items SET sold = sold + 1 WHERE id = ?").run(it.id);
    spendShards(playerId, it.price, "shop", it.id);
    db().prepare("INSERT INTO purchases (player_id, shop_item_id, price, created_at) VALUES (?,?,?,?)").run(playerId, it.id, it.price, now());
    if (it.kind === "boost" && it.value.startsWith("radar:")) {
      const secs = Number(it.value.split(":")[1]);
      const p = getPlayer(playerId)!;
      const base = Math.max(now(), p.radar_until ?? 0);
      db().prepare("UPDATE players SET radar_until = ? WHERE id = ?").run(base + secs * 1000, playerId);
    }
    if (it.kind === "frame") db().prepare("UPDATE players SET frame = ? WHERE id = ?").run(it.value, playerId);
    return { ok: true };
  })();
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export type BoardCategory = "xp" | "treasures" | "quests" | "rare" | "weekly";

export function leaderboard(category: BoardCategory, limit = 50) {
  if (category === "weekly") {
    const since = now() - 7 * 86400_000;
    const rows = db()
      .prepare(
        `SELECT p.*, COUNT(e.id) AS score FROM players p JOIN events e ON e.player_id = p.id AND e.type='treasure' AND e.created_at >= ?
         GROUP BY p.id ORDER BY score DESC, p.xp DESC LIMIT ?`,
      )
      .all(since, limit) as (PlayerRow & { score: number })[];
    return rows.map((r, i) => ({ rank: i + 1, score: r.score, player: publicPlayer(r) }));
  }
  const col = { xp: "xp", treasures: "treasures_found", quests: "quests_completed + missions_completed", rare: "rare_found" }[category];
  const rows = db().prepare(`SELECT *, (${col}) AS score FROM players ORDER BY score DESC, xp DESC LIMIT ?`).all(limit) as (PlayerRow & { score: number })[];
  return rows.map((r, i) => ({ rank: i + 1, score: r.score, player: publicPlayer(r) }));
}

export function rankOf(playerId: string, category: BoardCategory) {
  const board = leaderboard(category, 1000);
  return board.find((e) => e.player.id === playerId)?.rank ?? null;
}

export function playerProfile(username: string) {
  const p = db().prepare("SELECT * FROM players WHERE username = ? COLLATE NOCASE").get(username) as PlayerRow | undefined;
  if (!p) return null;
  const inv = inventory(p.id);
  const recent = db()
    .prepare("SELECT title, rarity, kind, created_at, onchain_status, demo FROM rewards WHERE player_id = ? ORDER BY created_at DESC LIMIT 10")
    .all(p.id) as { title: string; rarity: string | null; kind: string; created_at: number; onchain_status: string; demo: number }[];
  return {
    player: publicPlayer(p),
    collection: inv,
    recent: recent.map((r) => ({ title: r.title, rarity: r.rarity, kind: r.kind, createdAt: r.created_at, onchain: r.onchain_status === "settled", demo: !!r.demo })),
    achievements: achievements(p),
  };
}

export function achievements(p: PlayerRow) {
  const list = [
    { id: "first-find", title: "First Find", description: "Open your first treasure", done: p.treasures_found >= 1, icon: "sparkles" },
    { id: "ten-finds", title: "Treasure Hunter", description: "Open 10 treasures", done: p.treasures_found >= 10, icon: "gem" },
    { id: "fifty-finds", title: "Hoarder", description: "Open 50 treasures", done: p.treasures_found >= 50, icon: "crown" },
    { id: "rare-eye", title: "Rare Eye", description: "Find 5 Rare+ treasures", done: p.rare_found >= 5, icon: "eye" },
    { id: "walker", title: "Wayfarer", description: "Travel 10 km", done: p.distance_m >= 10_000, icon: "footprints" },
    { id: "guild", title: "Guild Friend", description: "Complete 5 NPC missions", done: p.missions_completed >= 5, icon: "handshake" },
    { id: "streak", title: "Unstoppable", description: "Reach a 7-day streak", done: p.streak_days >= 7, icon: "flame" },
    { id: "wallet", title: "On-Chain Explorer", description: "Connect a NEAR wallet", done: !!p.account_id, icon: "link" },
  ];
  return list;
}
