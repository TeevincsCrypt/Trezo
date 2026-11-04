import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import { db, now } from "./db";
import { fail } from "./errors";
import { RARITY } from "@/lib/rules";

export function audit(actor: string, action: string, detail: unknown) {
  db().prepare("INSERT INTO admin_log (actor, action, detail, created_at) VALUES (?,?,?,?)").run(actor, action, JSON.stringify(detail).slice(0, 2000), now());
}

const rarity = z.enum(["common", "rare", "epic", "legendary"]);
const itemRef = z.string().max(64).nullable().optional();

export const treasureSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_.:-]{1,48}$/).optional(),
  name: z.string().min(1).max(60),
  description: z.string().max(200).default(""),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  rarity,
  reward_shards: z.number().int().min(0).max(5000).optional(),
  reward_xp: z.number().int().min(0).max(10000).optional(),
  reward_item_id: itemRef,
  reward_item_qty: z.number().int().min(1).max(10).default(1),
  max_claims: z.number().int().min(1).max(100000).optional(),
  claim_radius_m: z.number().int().min(10).max(500).default(40),
  zone: z.enum(["world", "demo"]).default("world"),
  active: z.boolean().default(true),
  expires_at: z.number().int().nullable().optional(),
});

function checkItem(id: string | null | undefined) {
  if (id && !db().prepare("SELECT 1 FROM item_types WHERE id = ?").get(id)) fail("bad_item", `Unknown item ${id}`);
}

export function upsertTreasure(actor: string, input: z.infer<typeof treasureSchema>) {
  checkItem(input.reward_item_id);
  const cfg = RARITY[input.rarity];
  const row = {
    id: input.id ?? `adm-${crypto.randomUUID().slice(0, 8)}`,
    name: input.name,
    description: input.description,
    lat: input.lat,
    lng: input.lng,
    rarity: input.rarity,
    reward_shards: input.reward_shards ?? cfg.shards,
    reward_xp: input.reward_xp ?? cfg.xp,
    reward_item_id: input.reward_item_id ?? null,
    reward_item_qty: input.reward_item_qty,
    max_claims: input.max_claims ?? cfg.maxClaims,
    claim_radius_m: input.claim_radius_m,
    zone: input.zone,
    active: input.active ? 1 : 0,
    expires_at: input.expires_at ?? null,
    created_at: now(),
  };
  const existing = db().prepare("SELECT claim_count FROM treasures WHERE id = ?").get(row.id) as { claim_count: number } | undefined;
  if (existing && row.max_claims < existing.claim_count) fail("bad_supply", "max_claims cannot go below claims already made.");
  db()
    .prepare(
      `INSERT INTO treasures (id,name,description,lat,lng,rarity,reward_shards,reward_xp,reward_item_id,reward_item_qty,max_claims,claim_radius_m,zone,source,active,expires_at,created_at)
       VALUES (@id,@name,@description,@lat,@lng,@rarity,@reward_shards,@reward_xp,@reward_item_id,@reward_item_qty,@max_claims,@claim_radius_m,@zone,'admin',@active,@expires_at,@created_at)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, lat=excluded.lat, lng=excluded.lng, rarity=excluded.rarity,
         reward_shards=excluded.reward_shards, reward_xp=excluded.reward_xp, reward_item_id=excluded.reward_item_id, reward_item_qty=excluded.reward_item_qty,
         max_claims=excluded.max_claims, claim_radius_m=excluded.claim_radius_m, zone=excluded.zone, active=excluded.active, expires_at=excluded.expires_at`,
    )
    .run(row);
  audit(actor, existing ? "treasure.update" : "treasure.create", row);
  return row;
}

export function setTreasureActive(actor: string, id: string, active: boolean) {
  const r = db().prepare("UPDATE treasures SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
  if (r.changes === 0) fail("not_found", "Treasure not found", 404);
  audit(actor, active ? "treasure.enable" : "treasure.disable", { id });
}

export const questSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  category: z.enum(["daily", "weekly", "special"]),
  title: z.string().min(1).max(60),
  description: z.string().max(240),
  difficulty: z.enum(["easy", "medium", "hard", "epic"]),
  metric: z.enum(["treasure", "treasure_common", "treasure_rare_plus", "treasure_epic_plus", "treasure_legendary", "distance", "new_cell", "mission", "streak", "level", "community_treasure"]),
  target: z.number().positive().max(1e7),
  reward_shards: z.number().int().min(0).max(5000),
  reward_xp: z.number().int().min(0).max(10000),
  reward_item_id: itemRef,
  reward_item_qty: z.number().int().min(1).max(10).default(1),
  entry_cost: z.number().int().min(0).max(5000).default(0),
  starts_at: z.number().int().nullable().optional(),
  ends_at: z.number().int().nullable().optional(),
  active: z.boolean().default(true),
});

export function upsertQuest(actor: string, q: z.infer<typeof questSchema>) {
  checkItem(q.reward_item_id);
  db()
    .prepare(
      `INSERT INTO quests (id,category,title,description,difficulty,metric,target,reward_shards,reward_xp,reward_item_id,reward_item_qty,entry_cost,starts_at,ends_at,active,sort)
       VALUES (@id,@category,@title,@description,@difficulty,@metric,@target,@reward_shards,@reward_xp,@reward_item_id,@reward_item_qty,@entry_cost,@starts_at,@ends_at,@active,99)
       ON CONFLICT(id) DO UPDATE SET category=excluded.category,title=excluded.title,description=excluded.description,difficulty=excluded.difficulty,metric=excluded.metric,
         target=excluded.target,reward_shards=excluded.reward_shards,reward_xp=excluded.reward_xp,reward_item_id=excluded.reward_item_id,reward_item_qty=excluded.reward_item_qty,
         entry_cost=excluded.entry_cost,starts_at=excluded.starts_at,ends_at=excluded.ends_at,active=excluded.active`,
    )
    .run({ ...q, reward_item_id: q.reward_item_id ?? null, starts_at: q.starts_at ?? null, ends_at: q.ends_at ?? null, active: q.active ? 1 : 0 });
  audit(actor, "quest.upsert", q);
}

export const missionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  npc_id: z.string(),
  title: z.string().min(1).max(60),
  description: z.string().max(240),
  intro: z.string().max(240),
  outro: z.string().max(240),
  kind: z.enum(["progress", "exchange"]),
  metric: z.string().max(40).nullable().optional(),
  target: z.number().positive().nullable().optional(),
  require_item_id: itemRef,
  require_item_qty: z.number().int().min(1).max(100).nullable().optional(),
  unlock_cost: z.number().int().min(0).max(5000).default(0),
  reward_shards: z.number().int().min(0).max(5000).default(0),
  reward_xp: z.number().int().min(0).max(10000).default(0),
  reward_item_id: itemRef,
  reward_item_qty: z.number().int().min(1).max(10).default(1),
  repeatable: z.boolean().default(false),
  min_level: z.number().int().min(1).max(100).default(1),
  active: z.boolean().default(true),
});

export function upsertMission(actor: string, m: z.infer<typeof missionSchema>) {
  if (!db().prepare("SELECT 1 FROM npcs WHERE id = ?").get(m.npc_id)) fail("bad_npc", "Unknown NPC");
  checkItem(m.reward_item_id);
  checkItem(m.require_item_id);
  if (m.kind === "progress" && (!m.metric || !m.target)) fail("validation", "Progress missions need metric and target.");
  if (m.kind === "exchange" && (!m.require_item_id || !m.require_item_qty)) fail("validation", "Exchanges need a required item and quantity.");
  db()
    .prepare(
      `INSERT INTO npc_missions (id,npc_id,title,description,intro,outro,kind,metric,target,require_item_id,require_item_qty,unlock_cost,reward_shards,reward_xp,reward_item_id,reward_item_qty,repeatable,min_level,active,sort)
       VALUES (@id,@npc_id,@title,@description,@intro,@outro,@kind,@metric,@target,@require_item_id,@require_item_qty,@unlock_cost,@reward_shards,@reward_xp,@reward_item_id,@reward_item_qty,@repeatable,@min_level,@active,99)
       ON CONFLICT(id) DO UPDATE SET npc_id=excluded.npc_id,title=excluded.title,description=excluded.description,intro=excluded.intro,outro=excluded.outro,kind=excluded.kind,
         metric=excluded.metric,target=excluded.target,require_item_id=excluded.require_item_id,require_item_qty=excluded.require_item_qty,unlock_cost=excluded.unlock_cost,
         reward_shards=excluded.reward_shards,reward_xp=excluded.reward_xp,reward_item_id=excluded.reward_item_id,reward_item_qty=excluded.reward_item_qty,
         repeatable=excluded.repeatable,min_level=excluded.min_level,active=excluded.active`,
    )
    .run({
      ...m,
      metric: m.metric ?? null,
      target: m.target ?? null,
      require_item_id: m.require_item_id ?? null,
      require_item_qty: m.require_item_qty ?? null,
      reward_item_id: m.reward_item_id ?? null,
      repeatable: m.repeatable ? 1 : 0,
      active: m.active ? 1 : 0,
    });
  audit(actor, "mission.upsert", m);
}

export const itemPatchSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().max(280).optional(),
  max_supply: z.number().int().min(1).optional(),
  active: z.boolean().optional(),
});

export function patchItem(actor: string, id: string, p: z.infer<typeof itemPatchSchema>) {
  const it = db().prepare("SELECT * FROM item_types WHERE id = ?").get(id) as { issued: number; max_supply: number } | undefined;
  if (!it) fail("not_found", "Item not found", 404);
  if (p.max_supply !== undefined && p.max_supply < it!.issued) fail("bad_supply", `Supply cannot go below the ${it!.issued} already issued.`);
  const sets: string[] = [];
  const vals: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined) continue;
    sets.push(`${k} = @${k}`);
    vals[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
  }
  if (sets.length) db().prepare(`UPDATE item_types SET ${sets.join(", ")} WHERE id = @id`).run(vals);
  audit(actor, "item.patch", { id, ...p });
}

export function overview() {
  const q = <T,>(sql: string, ...a: unknown[]) => db().prepare(sql).all(...a) as T[];
  const one = (sql: string) => (db().prepare(sql).get() as { n: number }).n;
  return {
    stats: {
      players: one("SELECT COUNT(*) n FROM players WHERE is_sample = 0"),
      wallets: one("SELECT COUNT(*) n FROM players WHERE account_id IS NOT NULL"),
      claims: one("SELECT COUNT(*) n FROM claims"),
      claims24h: (db().prepare("SELECT COUNT(*) n FROM claims WHERE created_at > ?").get(now() - 86400_000) as { n: number }).n,
      activeTreasures: (db().prepare("SELECT COUNT(*) n FROM treasures WHERE active = 1 AND (expires_at IS NULL OR expires_at > ?)").get(now()) as { n: number }).n,
      shardsCirculating: one("SELECT COALESCE(SUM(shards),0) n FROM players WHERE is_sample = 0"),
      shardsMinted: one("SELECT COALESCE(SUM(delta),0) n FROM shard_ledger WHERE delta > 0"),
      shardsBurned: -one("SELECT COALESCE(SUM(delta),0) n FROM shard_ledger WHERE delta < 0"),
      rewardsSettled: one("SELECT COUNT(*) n FROM rewards WHERE onchain_status = 'settled'"),
      securityEvents: one("SELECT COUNT(*) n FROM security_events"),
    },
    treasures: q("SELECT * FROM treasures WHERE source != 'spawn' OR claim_count > 0 ORDER BY created_at DESC LIMIT 200"),
    quests: q("SELECT * FROM quests ORDER BY category, sort"),
    missions: q("SELECT * FROM npc_missions ORDER BY npc_id, sort"),
    npcs: q("SELECT id, name, title FROM npcs"),
    items: q("SELECT * FROM item_types"),
    players: q("SELECT id, username, account_id, is_guest, is_sample, xp, shards, treasures_found, flags, created_at FROM players ORDER BY created_at DESC LIMIT 200"),
    claims: q(
      `SELECT c.id, c.created_at, c.distance_m, c.accuracy_m, c.demo, p.username, t.name AS treasure, t.rarity, r.onchain_status, r.tx_hash
       FROM claims c JOIN players p ON p.id = c.player_id JOIN treasures t ON t.id = c.treasure_id LEFT JOIN rewards r ON r.id = c.reward_id
       ORDER BY c.created_at DESC LIMIT 200`,
    ),
    security: q("SELECT s.*, p.username FROM security_events s LEFT JOIN players p ON p.id = s.player_id ORDER BY s.created_at DESC LIMIT 200"),
    market: q("SELECT m.*, p.username FROM market_events m LEFT JOIN players p ON p.id = m.player_id ORDER BY m.created_at DESC LIMIT 200"),
    log: q("SELECT * FROM admin_log ORDER BY created_at DESC LIMIT 100"),
  };
}
