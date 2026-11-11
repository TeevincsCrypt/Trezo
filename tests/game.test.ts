import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDbForTests, db } from "@/server/db";
import { createPlayer, getPlayer, linkAccount, updateProfile } from "@/server/players";
import { claimTreasure, creditShards, nearbyTreasures, recordLocation, getTreasure } from "@/server/game";
import { ensureSpawnField } from "@/server/spawn";
import { GameError } from "@/server/errors";
import { ECONOMY, RARITY } from "@/lib/rules";
import { offsetM } from "@/lib/geo";
import { publicConfig } from "@/lib/config";

const center = publicConfig.demoCenter;

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(GameError);
    expect((e as GameError).code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

function addTreasure(id: string, pos: { lat: number; lng: number }, extra: Record<string, unknown> = {}) {
  db()
    .prepare(
      `INSERT INTO treasures (id,name,description,lat,lng,rarity,reward_shards,reward_xp,reward_item_id,max_claims,claim_radius_m,zone,source,created_at)
       VALUES (@id,'Test Cache','t',@lat,@lng,@rarity,@shards,@xp,@item,@max,@radius,@zone,'test',0)`,
    )
    .run({ id, lat: pos.lat, lng: pos.lng, rarity: "rare", shards: 30, xp: 60, item: "relic-compass", max: 5, radius: 40, zone: "world", ...extra });
}

const HOME = { lat: 51.5007, lng: -0.1246 };

beforeEach(() => {
  resetDbForTests();
  vi.useRealTimers();
});

describe("seed", () => {
  it("seeds catalog and demo zone, and no fake players", () => {
    const n = (sql: string) => (db().prepare(sql).get() as { n: number }).n;
    expect(n("SELECT COUNT(*) n FROM item_types")).toBeGreaterThanOrEqual(10);
    expect(n("SELECT COUNT(*) n FROM npcs")).toBe(4);
    expect(n("SELECT COUNT(*) n FROM quests WHERE category='daily'")).toBe(4);
    expect(n("SELECT COUNT(*) n FROM quests WHERE category='weekly'")).toBe(4);
    expect(n("SELECT COUNT(*) n FROM treasures WHERE zone='demo'")).toBeGreaterThan(10);
    expect(n("SELECT COUNT(*) n FROM players")).toBe(0);
  });
});

describe("profiles", () => {
  it("creates guests, enforces unique usernames and validates input", () => {
    const p = createPlayer({ username: "Explorer_1", avatar: "owl" });
    expect(p.is_guest).toBe(1);
    expectCode(() => createPlayer({ username: "explorer_1", avatar: "fox" }), "username_taken");
    expectCode(() => createPlayer({ username: "a!", avatar: "fox" }), "bad_username");
    expectCode(() => createPlayer({ username: "valid_name", avatar: "unicorn" }), "bad_avatar");
    const u = updateProfile(p.id, { username: "Renamed", avatar: "wolf" });
    expect(u.username).toBe("Renamed");
  });

  it("upgrades a guest in place when a wallet is linked, keeping progress", () => {
    const p = createPlayer({ username: "guesty", avatar: "fox" });
    db().prepare("UPDATE players SET xp = 500 WHERE id = ?").run(p.id);
    const linked = linkAccount(p.id, "guesty.testnet");
    expect(linked.id).toBe(p.id);
    expect(linked.account_id).toBe("guesty.testnet");
    expect(linked.is_guest).toBe(0);
    expect(linked.xp).toBe(500);
    // Same wallet from a fresh session returns the same profile
    expect(linkAccount(null, "guesty.testnet").id).toBe(p.id);
    // Fresh wallet gets an auto-generated profile
    const fresh = linkAccount(null, "brand-new.testnet");
    expect(fresh.username).toBe("brand_new");
  });
});

describe("treasure claims (server-side proximity & anti-cheat)", () => {
  it("claims a treasure within radius and grants shards, xp, item", () => {
    const p = createPlayer({ username: "hunter", avatar: "fox" });
    addTreasure("t1", HOME);
    const res = claimTreasure({ playerId: p.id, treasureId: "t1", pos: offsetM(HOME, 10, 5), accuracyM: 8, demo: false });
    expect(res.reward.shards).toBe(30);
    expect(res.reward.items).toEqual([{ itemId: "relic-compass", qty: 1 }]);
    const after = getPlayer(p.id)!;
    expect(after.shards).toBe(30);
    expect(after.xp).toBe(60);
    expect(after.treasures_found).toBe(1);
    expect(after.rare_found).toBe(1);
    expect(getTreasure("t1")!.claim_count).toBe(1);
    const ri = db().prepare("SELECT status FROM reward_items WHERE player_id = ?").get(p.id) as { status: string };
    expect(ri.status).toBe("vault");
  });

  it("rejects players outside the claim radius", () => {
    const p = createPlayer({ username: "faraway", avatar: "fox" });
    addTreasure("t1", HOME);
    expectCode(() => claimTreasure({ playerId: p.id, treasureId: "t1", pos: offsetM(HOME, 45, 0), accuracyM: 5, demo: false }), "too_far");
  });

  it("prevents duplicate claims", () => {
    const p = createPlayer({ username: "dupe", avatar: "fox" });
    addTreasure("t1", HOME);
    claimTreasure({ playerId: p.id, treasureId: "t1", pos: HOME, accuracyM: 5, demo: false });
    db().prepare("UPDATE players SET last_claim_at = 0 WHERE id = ?").run(p.id);
    expectCode(() => claimTreasure({ playerId: p.id, treasureId: "t1", pos: HOME, accuracyM: 5, demo: false }), "duplicate");
  });

  it("enforces per-player cooldown between claims", () => {
    const p = createPlayer({ username: "speedy", avatar: "fox" });
    addTreasure("t1", HOME);
    addTreasure("t2", offsetM(HOME, 5, 5));
    claimTreasure({ playerId: p.id, treasureId: "t1", pos: HOME, accuracyM: 5, demo: false });
    expectCode(() => claimTreasure({ playerId: p.id, treasureId: "t2", pos: HOME, accuracyM: 5, demo: false }), "cooldown");
  });

  it("enforces limited treasure supply across players", () => {
    addTreasure("t1", HOME, { max: 1 });
    const a = createPlayer({ username: "first", avatar: "fox" });
    const b = createPlayer({ username: "second", avatar: "fox" });
    claimTreasure({ playerId: a.id, treasureId: "t1", pos: HOME, accuracyM: 5, demo: false });
    expectCode(() => claimTreasure({ playerId: b.id, treasureId: "t1", pos: HOME, accuracyM: 5, demo: false }), "exhausted");
  });

  it("rejects weak GPS, disabled and expired treasures", () => {
    const p = createPlayer({ username: "gpsy", avatar: "fox" });
    addTreasure("t1", HOME);
    expectCode(() => claimTreasure({ playerId: p.id, treasureId: "t1", pos: HOME, accuracyM: ECONOMY.maxGpsAccuracyM + 1, demo: false }), "weak_gps");
    db().prepare("UPDATE treasures SET active = 0 WHERE id='t1'").run();
    expectCode(() => claimTreasure({ playerId: p.id, treasureId: "t1", pos: HOME, accuracyM: 5, demo: false }), "inactive");
    addTreasure("t2", HOME, { id: "t2" });
    db().prepare("UPDATE treasures SET expires_at = 1 WHERE id='t2'").run();
    expectCode(() => claimTreasure({ playerId: p.id, treasureId: "t2", pos: HOME, accuracyM: 5, demo: false }), "expired");
  });

  it("detects impossible location jumps and logs a security event", () => {
    const p = createPlayer({ username: "teleporter", avatar: "fox" });
    recordLocation(p.id, HOME, 5, false);
    const paris = { lat: 48.8584, lng: 2.2945 };
    addTreasure("t-paris", paris);
    expectCode(() => claimTreasure({ playerId: p.id, treasureId: "t-paris", pos: paris, accuracyM: 5, demo: false }), "suspicious_movement");
    const ev = db().prepare("SELECT COUNT(*) n FROM security_events WHERE player_id = ?").get(p.id) as { n: number };
    expect(ev.n).toBe(1);
    expect(getPlayer(p.id)!.flags).toBe(1);
  });

  it("keeps demo and real zones separate", () => {
    const p = createPlayer({ username: "demoer", avatar: "fox" });
    const demo = db().prepare("SELECT * FROM treasures WHERE zone='demo' LIMIT 1").get() as { id: string; lat: number; lng: number };
    expectCode(() => claimTreasure({ playerId: p.id, treasureId: demo.id, pos: demo, accuracyM: 5, demo: false }), "mode_mismatch");
    const ok = claimTreasure({ playerId: p.id, treasureId: demo.id, pos: demo, accuracyM: null, demo: true });
    expect(ok.treasure.zone).toBe("demo");
    const r = db().prepare("SELECT demo FROM rewards WHERE id = ?").get(ok.reward.id) as { demo: number };
    expect(r.demo).toBe(1);
    addTreasure("real", HOME);
    db().prepare("UPDATE players SET last_claim_at = 0").run();
    expectCode(() => claimTreasure({ playerId: p.id, treasureId: "real", pos: HOME, accuracyM: 5, demo: true }), "mode_mismatch");
  });

  it("serialises concurrent claims on a single-supply treasure", () => {
    addTreasure("t1", HOME, { max: 1 });
    const players = Array.from({ length: 5 }, (_, i) => createPlayer({ username: `racer${i}`, avatar: "fox" }));
    let ok = 0;
    for (const p of players) {
      try {
        claimTreasure({ playerId: p.id, treasureId: "t1", pos: HOME, accuracyM: 5, demo: false });
        ok++;
      } catch {}
    }
    expect(ok).toBe(1);
    expect(getTreasure("t1")!.claim_count).toBe(1);
  });
});

describe("economy", () => {
  it("caps daily shard earnings", () => {
    const p = createPlayer({ username: "grinder", avatar: "fox" });
    const a = db().transaction(() => creditShards(p.id, ECONOMY.dailyShardCap - 10, "test"))();
    const b = db().transaction(() => creditShards(p.id, 100, "test"))();
    expect(a).toBe(ECONOMY.dailyShardCap - 10);
    expect(b).toBe(10);
    expect(getPlayer(p.id)!.shards).toBe(ECONOMY.dailyShardCap);
    const ledger = db().prepare("SELECT SUM(delta) s FROM shard_ledger WHERE player_id = ?").get(p.id) as { s: number };
    expect(ledger.s).toBe(ECONOMY.dailyShardCap);
  });

  it("does not grant collectibles beyond the item's max supply", () => {
    db().prepare("UPDATE item_types SET max_supply = 1 WHERE id = 'relic-compass'").run();
    addTreasure("t1", HOME);
    addTreasure("t2", offsetM(HOME, 3, 3), { id: "t2" });
    const a = createPlayer({ username: "aa1", avatar: "fox" });
    const b = createPlayer({ username: "bb1", avatar: "fox" });
    expect(claimTreasure({ playerId: a.id, treasureId: "t1", pos: HOME, accuracyM: 5, demo: false }).reward.items).toHaveLength(1);
    expect(claimTreasure({ playerId: b.id, treasureId: "t2", pos: HOME, accuracyM: 5, demo: false }).reward.items).toHaveLength(0);
  });
});

describe("location & procedural spawning", () => {
  it("spawns a deterministic, bounded daily field per cell", () => {
    const n1 = ensureSpawnField(db(), HOME);
    const n2 = ensureSpawnField(db(), offsetM(HOME, 20, 20));
    expect(n1).toBe(ECONOMY.spawnPerCell);
    expect(n2).toBe(0); // same cell same day: no new supply
    const list = nearbyTreasures(null, HOME, "world");
    expect(list.length).toBeGreaterThan(0);
    for (const t of list) expect(t.maxClaims).toBe(RARITY[t.rarity].maxClaims);
  });

  it("accumulates real distance and exploration cells, ignoring jitter", () => {
    const p = createPlayer({ username: "walker", avatar: "fox" });
    recordLocation(p.id, HOME, 5, false);
    db().prepare("UPDATE players SET last_loc_at = last_loc_at - 120000 WHERE id = ?").run(p.id);
    const r = recordLocation(p.id, offsetM(HOME, 300, 0), 5, false);
    expect(r.movedM).toBeGreaterThan(290);
    expect(r.newCell).toBe(true);
    const jitter = recordLocation(p.id, offsetM(HOME, 303, 0), 5, false);
    expect(jitter.movedM).toBe(0);
    // demo fixes never count
    const d = recordLocation(p.id, center, null, true);
    expect(d.movedM).toBe(0);
  });
});
