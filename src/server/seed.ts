import type { Database } from "./sqlite";
import crypto from "node:crypto";
import catalog from "@/data/catalog.json";
import { publicConfig } from "@/lib/config";
import { RARITY, type Rarity } from "@/lib/rules";
import { demoTreasures, insertTreasure } from "./spawn";

const iso = (s?: string) => (s ? Date.parse(s) : null);

/**
 * Seeds the catalog (items, NPCs, missions, quests, shop) and the demo zone.
 * No fake players: the leaderboard only ever shows real explorers.
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

  });
  tx();
}
