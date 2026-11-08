import type { Database } from "./sqlite";
import crypto from "node:crypto";
import catalog from "@/data/catalog.json";
import { publicConfig } from "@/lib/config";
import { RARITY, type Rarity } from "@/lib/rules";
import { demoTreasures, insertTreasure } from "./spawn";

const iso = (s?: string) => (s ? Date.parse(s) : null);

/**
 * Seeds the catalog (items, NPCs, missions, quests, shop), the demo zone and a
 * set of SAMPLE players for the leaderboard. Sample players are flagged
 * `is_sample = 1` and rendered with a "Sample" tag in the UI.
 */
export function seedDatabase(db: Database) {
  const t0 = Date.now();
  const tx = db.transaction(() => {
    const item = db.prepare(
      `INSERT OR REPLACE INTO item_types (id,name,description,rarity,category,art,transferable,max_supply)
       VALUES (@id,@name,@description,@rarity,@category,@art,@transferable,@max_supply)`,
    );
    for (const i of catalog.items) item.run({ ...i, transferable: i.transferable ? 1 : 0 });

    const npc = db.prepare(
      `INSERT OR REPLACE INTO npcs (id,name,title,avatar,color,personality,greeting,lines)
       VALUES (@id,@name,@title,@avatar,@color,@personality,@greeting,@lines)`,
    );
    for (const n of catalog.npcs) npc.run({ ...n, lines: JSON.stringify(n.lines) });

    const mission = db.prepare(
      `INSERT OR REPLACE INTO npc_missions (id,npc_id,title,description,intro,outro,kind,metric,target,require_item_id,require_item_qty,unlock_cost,reward_shards,reward_xp,reward_item_id,reward_item_qty,repeatable,min_level,sort)
       VALUES (@id,@npc_id,@title,@description,@intro,@outro,@kind,@metric,@target,@require_item_id,@require_item_qty,@unlock_cost,@reward_shards,@reward_xp,@reward_item_id,@reward_item_qty,@repeatable,@min_level,@sort)`,
    );
    for (const m of catalog.missions as Record<string, unknown>[]) {
      mission.run({
        metric: null, target: null, require_item_id: null, require_item_qty: null,
        reward_item_id: null, reward_item_qty: 1, repeatable: 0, ...m,
      });
    }

    const quest = db.prepare(
      `INSERT OR REPLACE INTO quests (id,category,title,description,difficulty,metric,target,reward_shards,reward_xp,reward_item_id,reward_item_qty,entry_cost,starts_at,ends_at,sort)
       VALUES (@id,@category,@title,@description,@difficulty,@metric,@target,@reward_shards,@reward_xp,@reward_item_id,@reward_item_qty,@entry_cost,@starts_at,@ends_at,@sort)`,
    );
    for (const q of catalog.quests as Record<string, unknown>[]) {
      quest.run({
        reward_item_id: null, reward_item_qty: 1, entry_cost: 0, ...q,
        starts_at: iso(q.starts_at as string | undefined),
        ends_at: iso(q.ends_at as string | undefined),
      });
    }

    const shop = db.prepare(
      `INSERT OR REPLACE INTO shop_items (id,name,description,kind,value,price,stock) VALUES (@id,@name,@description,@kind,@value,@price,@stock)`,
    );
    for (const s of catalog.shop) shop.run(s);

    for (const t of demoTreasures(publicConfig.demoCenter)) insertTreasure(db, t);

    seedSamplePlayers(db, t0);
  });
  tx();
}

const SAMPLE_PLAYERS: [string, string, number, number, number, number, number][] = [
  // username, avatar, xp, treasures, quests, rare, missions
  ["NovaRanger", "fox", 9800, 142, 38, 21, 14],
  ["Kestrel_K", "eagle", 8450, 128, 31, 17, 12],
  ["MapleMaps", "owl", 7020, 111, 29, 12, 11],
  ["DuneWalker", "wolf", 6100, 96, 22, 15, 9],
  ["TidePool", "octopus", 4880, 80, 25, 8, 8],
  ["EmberJin", "dragon", 4210, 71, 17, 10, 6],
  ["Quillfeather", "owl", 3300, 58, 15, 6, 6],
  ["StripedSam", "tiger", 2650, 49, 12, 5, 4],
  ["BambooByte", "panda", 1720, 33, 9, 3, 3],
  ["LowTideLu", "octopus", 980, 21, 6, 2, 2],
  ["PathPilot", "eagle", 610, 14, 4, 1, 1],
  ["ZeroToHero", "fox", 240, 6, 2, 0, 1],
];

function seedSamplePlayers(db: Database, t0: number) {
  const ins = db.prepare(
    `INSERT OR IGNORE INTO players (id,username,avatar,is_guest,is_sample,xp,shards,treasures_found,rare_found,missions_completed,quests_completed,distance_m,streak_days,created_at)
     VALUES (@id,@username,@avatar,1,1,@xp,@shards,@treasures,@rare,@missions,@quests,@distance,@streak,@created)`,
  );
  const ev = db.prepare("INSERT INTO events (player_id,type,value,rarity,created_at) VALUES (?,?,?,?,?)");
  const rarities = Object.keys(RARITY) as Rarity[];
  SAMPLE_PLAYERS.forEach(([username, avatar, xp, treasures, quests, rare, missions], i) => {
    const id = `sample-${i + 1}`;
    ins.run({
      id, username, avatar, xp, shards: Math.round(xp / 9), treasures, rare, missions, quests,
      distance: treasures * 310, streak: Math.max(1, 12 - i), created: t0 - (60 - i) * 86400_000,
    });
    // Recent activity so the weekly board is populated (sample data only).
    const weekly = Math.max(1, Math.round(treasures / 6) - (i % 3));
    for (let k = 0; k < weekly; k++) {
      const h = crypto.createHash("sha256").update(`${id}:${k}`).digest();
      ev.run(id, "treasure", 1, rarities[h[0] % 10 === 0 ? 2 : h[0] % 3 === 0 ? 1 : 0], t0 - (h[1] % 144) * 3600_000);
    }
  });
}
