import { beforeEach, describe, expect, it, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { KeyPair, KeyPairSigner } from "near-api-js";
import { resetDbForTests, db } from "@/server/db";
import { createPlayer, getPlayer, linkAccount } from "@/server/players";
import { claimTreasure, recordLocation } from "@/server/game";
import { acceptMission, claimQuest, completeMission, joinQuest, listNpcs, listQuests } from "@/server/progress";
import { buyShopItem, inventory, leaderboard } from "@/server/inventory";
import { issueTicket, oraclePublicKey, settleReward } from "@/server/oracle";
import { setNearProviderForTests, verifyNep413 } from "@/server/near";
import { GameError } from "@/server/errors";
import { offsetM } from "@/lib/geo";

const HOME = { lat: 51.5007, lng: -0.1246 };

async function expectCodeAsync(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof GameError && e.code === code);
}
function expectCode(fn: () => unknown, code: string) {
  expect(fn).toThrowError(expect.objectContaining({ code }));
}

let n = 0;
function addTreasure(rarity = "common", item: string | null = "gem-glimmer") {
  const id = `tt${++n}`;
  db()
    .prepare(
      `INSERT INTO treasures (id,name,description,lat,lng,rarity,reward_shards,reward_xp,reward_item_id,max_claims,claim_radius_m,zone,source,created_at)
       VALUES (?, 'Cache', 'd', ?, ?, ?, 10, 20, ?, 10, 40, 'world', 'test', 0)`,
    )
    .run(id, HOME.lat, HOME.lng, rarity, item);
  return id;
}
function claim(playerId: string, rarity = "common", item: string | null = "gem-glimmer") {
  db().prepare("UPDATE players SET last_claim_at = 0 WHERE id = ?").run(playerId);
  return claimTreasure({ playerId, treasureId: addTreasure(rarity, item), pos: HOME, accuracyM: 5, demo: false });
}

beforeEach(() => {
  resetDbForTests();
  setNearProviderForTests(null);
});

describe("quests", () => {
  it("tracks daily progress and pays out exactly once", () => {
    const p = createPlayer({ username: "quester", avatar: "fox" });
    let q = listQuests(p.id).find((x) => x.id === "d-common-2")!;
    expect(q.status).toBe("active");
    expectCode(() => claimQuest(p.id, "d-common-2"), "incomplete");
    claim(p.id);
    claim(p.id);
    q = listQuests(p.id).find((x) => x.id === "d-common-2")!;
    expect(q.progress).toBe(2);
    expect(q.status).toBe("complete");
    const before = getPlayer(p.id)!.shards;
    claimQuest(p.id, "d-common-2");
    expect(getPlayer(p.id)!.shards).toBe(before + 25);
    expectCode(() => claimQuest(p.id, "d-common-2"), "already_claimed");
    expect(getPlayer(p.id)!.quests_completed).toBe(1);
  });

  it("requires a Shard entry fee for special hunts and only counts after joining", () => {
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
    const p = createPlayer({ username: "eventer", avatar: "fox" });
    claim(p.id); // before joining: does not count
    let q = listQuests(p.id).find((x) => x.id === "s-harvest-moon")!;
    expect(q.status).toBe("locked");
    db().prepare("UPDATE players SET shards = 50 WHERE id = ?").run(p.id);
    expectCode(() => joinQuest(p.id, "s-harvest-moon"), "insufficient_shards");
    db().prepare("UPDATE players SET shards = 150 WHERE id = ?").run(p.id);
    vi.setSystemTime(new Date("2026-11-10T12:00:01Z"));
    joinQuest(p.id, "s-harvest-moon");
    expect(getPlayer(p.id)!.shards).toBe(50);
    q = listQuests(p.id).find((x) => x.id === "s-harvest-moon")!;
    expect(q.progress).toBe(0);
    vi.setSystemTime(new Date("2026-11-10T12:05:00Z"));
    claim(p.id);
    q = listQuests(p.id).find((x) => x.id === "s-harvest-moon")!;
    expect(q.progress).toBe(1);
    vi.useRealTimers();
  });
});

describe("NPC missions", () => {
  it("progress missions: accept → progress since acceptance → complete", () => {
    const p = createPlayer({ username: "missioner", avatar: "fox" });
    claim(p.id); // before accepting — must not count
    acceptMission(p.id, "exp-first-steps");
    let m = listNpcs(p.id).find((x) => x.id === "explorer")!.missions.find((x) => x.id === "exp-first-steps")!;
    expect(m.status).toBe("accepted");
    expect(m.progress).toBe(0);
    expectCode(() => completeMission(p.id, "exp-first-steps"), "not_ready");
    claim(p.id);
    m = listNpcs(p.id).find((x) => x.id === "explorer")!.missions.find((x) => x.id === "exp-first-steps")!;
    expect(m.status).toBe("ready");
    const r = completeMission(p.id, "exp-first-steps");
    expect(r.reward.items[0].itemId).toBe("badge-pioneer");
    expectCode(() => acceptMission(p.id, "exp-first-steps"), "completed");
    expect(getPlayer(p.id)!.missions_completed).toBe(1);
  });

  it("charges unlock costs (Shard sink)", () => {
    const p = createPlayer({ username: "keeperfan", avatar: "fox" });
    expectCode(() => acceptMission(p.id, "keeper-trial"), "insufficient_shards");
    db().prepare("UPDATE players SET shards = 60 WHERE id = ?").run(p.id);
    acceptMission(p.id, "keeper-trial");
    expect(getPlayer(p.id)!.shards).toBe(10);
  });

  it("merchant exchanges consume vault items and return supply", () => {
    const p = createPlayer({ username: "trader", avatar: "fox" });
    for (let i = 0; i < 3; i++) claim(p.id, "common", "gem-glimmer");
    const issuedBefore = (db().prepare("SELECT issued FROM item_types WHERE id='gem-glimmer'").get() as { issued: number }).issued;
    const r = completeMission(p.id, "merchant-fair-trade");
    expect(r.reward.items[0].itemId).toBe("scroll-trailmap");
    const inv = inventory(p.id);
    expect(inv.find((i) => i.item.id === "gem-glimmer")).toBeUndefined();
    expect(inv.find((i) => i.item.id === "scroll-trailmap")!.vault).toBe(1);
    const issuedAfter = (db().prepare("SELECT issued FROM item_types WHERE id='gem-glimmer'").get() as { issued: number }).issued;
    expect(issuedAfter).toBe(issuedBefore - 3);
    expectCode(() => completeMission(p.id, "merchant-fair-trade"), "not_ready");
  });

  it("level-gated missions are locked", () => {
    const p = createPlayer({ username: "newbie", avatar: "fox" });
    const m = listNpcs(p.id).find((x) => x.id === "keeper")!.missions.find((x) => x.id === "keeper-echoes")!;
    expect(m.status).toBe("locked");
    expectCode(() => acceptMission(p.id, "keeper-echoes"), "level");
  });

  it("exploration missions count new cells from real GPS", () => {
    const p = createPlayer({ username: "mapper", avatar: "fox" });
    vi.setSystemTime(new Date("2026-11-04T10:00:00Z"));
    acceptMission(p.id, "carto-chart");
    for (let i = 1; i <= 3; i++) {
      vi.setSystemTime(new Date(Date.parse("2026-11-04T10:00:00Z") + i * 600_000));
      recordLocation(p.id, offsetM(HOME, i * 400, 0), 5, false);
    }
    const m = listNpcs(p.id).find((x) => x.id === "cartographer")!.missions.find((x) => x.id === "carto-chart")!;
    expect(m.status).toBe("ready");
    vi.useRealTimers();
  });
});

describe("shard shop", () => {
  it("frames are one-per-player; boosts extend radius", () => {
    const p = createPlayer({ username: "shopper", avatar: "fox" });
    db().prepare("UPDATE players SET shards = 1000 WHERE id = ?").run(p.id);
    buyShopItem(p.id, "frame-teal");
    expect(getPlayer(p.id)!.frame).toBe("teal");
    expectCode(() => buyShopItem(p.id, "frame-teal"), "owned");
    buyShopItem(p.id, "boost-radar");
    buyShopItem(p.id, "boost-radar");
    const after = getPlayer(p.id)!;
    expect(after.shards).toBe(1000 - 150 - 80 - 80);
    expect(after.radar_until! - Date.now()).toBeGreaterThan(3500_000);
  });
});

describe("leaderboard", () => {
  it("ranks real players only", () => {
    const a = createPlayer({ username: "alpha", avatar: "fox" });
    const b = createPlayer({ username: "bravo", avatar: "owl" });
    db().prepare("UPDATE players SET xp = ? WHERE id = ?").run(500, b.id);
    db().prepare("UPDATE players SET xp = ? WHERE id = ?").run(200, a.id);
    const board = leaderboard("xp");
    expect(board.map((e) => e.player.username).slice(0, 2)).toEqual(["bravo", "alpha"]);
    expect(board.every((e) => !e.player.isSample)).toBe(true);
  });
});

describe("on-chain settlement (oracle tickets)", () => {
  it("requires a wallet", () => {
    const p = createPlayer({ username: "noWallet", avatar: "fox" });
    const r = claim(p.id);
    expectCode(() => issueTicket(p.id, r.reward.id), "wallet_required");
  });

  it("issues a ticket the contract can verify", () => {
    const p = createPlayer({ username: "minter", avatar: "fox" });
    linkAccount(p.id, "minter.testnet");
    const r = claim(p.id, "rare", "relic-compass");
    const t = issueTicket(p.id, r.reward.id);
    const parsed = JSON.parse(t.ticket);
    expect(parsed).toMatchObject({
      id: r.reward.id,
      contract_id: "trezo-game.testnet",
      account_id: "minter.testnet",
      kind: "treasure",
      max_claims: 10,
      items: [["relic-compass", "1"]],
      demo: false,
    });
    expect(Number(parsed.expires_at_ms)).toBeGreaterThan(Date.now());
    const pub = Buffer.from(oraclePublicKey()!.base64, "base64");
    expect(ed25519.verify(Buffer.from(t.signature, "base64"), new TextEncoder().encode(t.ticket), pub)).toBe(true);
    const status = db().prepare("SELECT status FROM reward_items WHERE reward_id = ?").get(r.reward.id) as { status: string };
    expect(status.status).toBe("minting");
  });

  it("only settles when the contract has the claim for this account", async () => {
    const p = createPlayer({ username: "settler", avatar: "fox" });
    linkAccount(p.id, "settler.testnet");
    const r = claim(p.id);
    issueTicket(p.id, r.reward.id);
    const onchain = new Map<string, unknown>();
    setNearProviderForTests({
      callFunction: (async ({ method, args }: { method: string; args: { ticket_id: string } }) => (method === "get_claim" ? onchain.get(args.ticket_id) : undefined)) as never,
      viewAccessKey: (async () => ({})) as never,
    });
    await expectCodeAsync(settleReward(p.id, r.reward.id, null), "not_found_onchain");
    onchain.set(r.reward.id, { ticket_id: r.reward.id, account_id: "someone-else.testnet", items: [] });
    await expectCodeAsync(settleReward(p.id, r.reward.id, null), "account_mismatch");
    onchain.set(r.reward.id, { ticket_id: r.reward.id, account_id: "settler.testnet", items: [["gem-glimmer", "1"]] });
    await settleReward(p.id, r.reward.id, "4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM6");
    const rw = db().prepare("SELECT onchain_status, tx_hash FROM rewards WHERE id = ?").get(r.reward.id) as { onchain_status: string; tx_hash: string };
    expect(rw.onchain_status).toBe("settled");
    expect(inventory(p.id)[0].onchain).toBe(1);
    expectCode(() => issueTicket(p.id, r.reward.id), "settled");
  });
});

describe("NEP-413 wallet login verification", () => {
  it("verifies a real NEP-413 signature and checks the key is FullAccess", async () => {
    const kp = KeyPair.fromRandom("ed25519");
    const signer = new KeyPairSigner(kp);
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    const payload = { message: "Sign in to TREZO", recipient: "trezo-game.testnet", nonce };
    const signed = await signer.signNep413Message("alice.testnet", payload);
    const sigB64 = Buffer.from(signed.signature).toString("base64");
    let permission: unknown = "FullAccess";
    setNearProviderForTests({
      viewAccessKey: (async () => ({ permission, nonce: 0n })) as never,
      callFunction: (async () => undefined) as never,
    });
    await verifyNep413({ accountId: "alice.testnet", publicKey: kp.getPublicKey().toString(), signature: sigB64, ...payload });
    // Wrong message → rejected
    await expect(verifyNep413({ accountId: "alice.testnet", publicKey: kp.getPublicKey().toString(), signature: sigB64, ...payload, message: "other" })).rejects.toThrow();
    // Function-call key → rejected
    permission = { FunctionCall: { receiver_id: "x", method_names: [] } };
    await expect(verifyNep413({ accountId: "alice.testnet", publicKey: kp.getPublicKey().toString(), signature: sigB64, ...payload })).rejects.toThrow(/FullAccess/);
  });
});
