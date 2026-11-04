import "server-only";
import type Database from "better-sqlite3";
import { ECONOMY, RARITY, type Rarity } from "@/lib/rules";
import { cellKey, offsetM, type LatLng } from "@/lib/geo";
import { rng } from "@/lib/rng";
import { treasureName } from "./treasure-names";

/** Which collectibles a treasure of each rarity can drop. */
export const DROP_TABLE: Record<Rarity, string[]> = {
  common: ["gem-glimmer", "coin-wayfarer"],
  rare: ["scroll-trailmap", "relic-compass", "coin-wayfarer"],
  epic: ["relic-hourglass", "scroll-trailmap"],
  legendary: ["crown-tide"],
};

export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export interface TreasureSpec {
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
  claim_radius_m: number;
  zone: "world" | "demo";
  source: string;
  expires_at: number | null;
}

export function makeTreasure(
  id: string,
  pos: LatLng,
  rarity: Rarity,
  r: ReturnType<typeof rng>,
  opts: Partial<TreasureSpec> = {},
): TreasureSpec {
  const cfg = RARITY[rarity];
  const { name, description } = treasureName(rarity, r);
  const drops = r.next() < cfg.itemDropChance;
  return {
    id,
    name,
    description,
    lat: pos.lat,
    lng: pos.lng,
    rarity,
    reward_shards: cfg.shards,
    reward_xp: cfg.xp,
    reward_item_id: drops ? r.pick(DROP_TABLE[rarity]) : null,
    reward_item_qty: 1,
    max_claims: cfg.maxClaims,
    claim_radius_m: ECONOMY.defaultClaimRadiusM,
    zone: "world",
    source: "spawn",
    expires_at: null,
    ...opts,
  };
}

export function insertTreasure(db: Database.Database, t: TreasureSpec) {
  db.prepare(
    `INSERT OR IGNORE INTO treasures (id,name,description,lat,lng,rarity,reward_shards,reward_xp,reward_item_id,reward_item_qty,max_claims,claim_radius_m,zone,source,expires_at,created_at)
     VALUES (@id,@name,@description,@lat,@lng,@rarity,@reward_shards,@reward_xp,@reward_item_id,@reward_item_qty,@max_claims,@claim_radius_m,@zone,@source,@expires_at,@created_at)`,
  ).run({ ...t, created_at: Date.now() });
}

/**
 * Configurable treasure seeding: guarantees that every ~1.1 km grid cell a
 * player stands in gets a deterministic daily treasure field. Same cell + same
 * day always yields the same treasures (shared by all players), so supply is
 * bounded: spawnPerCell treasures per cell per day, each with limited claims.
 * Returns the number of treasures created.
 */
export function ensureSpawnField(db: Database.Database, p: LatLng, t = Date.now()): number {
  const day = utcDay(t);
  const size = ECONOMY.spawnCellDeg;
  const cell = cellKey(p, size);
  const inserted = db.prepare("INSERT OR IGNORE INTO spawn_cells (cell, day) VALUES (?, ?)").run(cell, day);
  if (inserted.changes === 0) return 0;

  const [cy, cx] = cell.split(":").map(Number);
  const r = rng(`spawn:${cell}:${day}`);
  const expires = t + ECONOMY.spawnTtlHours * 3600_000;
  const weights = Object.fromEntries(Object.entries(RARITY).map(([k, v]) => [k, v.spawnWeight])) as Record<Rarity, number>;
  let n = 0;
  const tx = db.transaction(() => {
    for (let i = 0; i < ECONOMY.spawnPerCell; i++) {
      const pos = { lat: (cy + 0.05 + r.next() * 0.9) * size, lng: (cx + 0.05 + r.next() * 0.9) * size };
      const rarity = r.weighted(weights);
      insertTreasure(db, makeTreasure(`sp-${day}-${cell.replace(":", "_")}-${i}`, pos, rarity, r, { expires_at: expires }));
      n++;
    }
  });
  tx();
  return n;
}

/** Fixed, clearly-labelled demo field around the demo centre. */
export function demoTreasures(center: LatLng): TreasureSpec[] {
  const r = rng("trezo-demo-zone-v1");
  const layout: [number, number, Rarity][] = [
    [60, 40, "common"], [-80, 120, "common"], [150, -60, "common"], [-160, -140, "common"],
    [240, 200, "common"], [-260, 60, "common"], [330, -220, "common"],
    [120, 260, "rare"], [-220, -300, "rare"], [380, 90, "rare"],
    [-420, 280, "epic"], [480, -360, "epic"],
    [-560, -80, "legendary"],
    [20, -120, "rare"],
  ];
  return layout.map(([n, e, rarity], i) =>
    makeTreasure(`demo-${i + 1}`, offsetM(center, n, e), rarity, r, {
      zone: "demo",
      source: "demo",
      // Demo treasures are shared by every judge/visitor, so supply is generous.
      max_claims: rarity === "legendary" ? 100 : 1000,
      reward_item_id: r.next() < 0.85 ? r.pick(DROP_TABLE[rarity]) : null,
      claim_radius_m: 50,
    }),
  );
}
