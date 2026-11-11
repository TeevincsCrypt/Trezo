import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp } from "@/server/api";

const req = (h: Record<string, string>) => new Request("http://x/", { headers: h });

describe("clientIp (S-2)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("ignores client-supplied left-most X-Forwarded-For entries", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("honours TREZO_TRUSTED_PROXY_HOPS", () => {
    vi.stubEnv("TREZO_TRUSTED_PROXY_HOPS", "2");
    expect(clientIp(req({ "x-forwarded-for": "spoof, 5.5.5.5, 10.0.0.1" }))).toBe("5.5.5.5");
    vi.stubEnv("TREZO_TRUSTED_PROXY_HOPS", "0");
    expect(clientIp(req({ "x-forwarded-for": "spoof", "x-real-ip": "7.7.7.7" }))).toBe("7.7.7.7");
  });

  it("falls back when no proxy header is present", () => {
    expect(clientIp(req({}))).toBe("local");
  });
});

async function demoRewardSetup() {
  const { resetDbForTests, db } = await import("@/server/db");
  const { createPlayer, linkAccount } = await import("@/server/players");
  const { claimTreasure } = await import("@/server/game");
  resetDbForTests();
  const p = createPlayer({ username: "demoer", avatar: "fox" });
  linkAccount(p.id, "demoer.testnet");
  const demo = db().prepare("SELECT * FROM treasures WHERE zone='demo' AND reward_item_id IS NOT NULL LIMIT 1").get() as { id: string; lat: number; lng: number };
  const ok = claimTreasure({ playerId: p.id, treasureId: demo.id, pos: demo, accuracyM: null, demo: true });
  return { playerId: p.id, rewardId: ok.reward.id };
}

describe("demo rewards (S-1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("can be minted on testnet", async () => {
    vi.resetModules();
    const { playerId, rewardId } = await demoRewardSetup();
    const { issueTicket } = await import("@/server/oracle");
    const t = issueTicket(playerId, rewardId);
    expect(JSON.parse(t.ticket).demo).toBe(true);
  });

  it("are refused by the oracle on mainnet", async () => {
    vi.stubEnv("NEXT_PUBLIC_NEAR_NETWORK", "mainnet");
    vi.resetModules();
    const { playerId, rewardId } = await demoRewardSetup();
    const { issueTicket } = await import("@/server/oracle");
    const { GameError } = await import("@/server/errors");
    try {
      issueTicket(playerId, rewardId);
      throw new Error("expected demo_offchain");
    } catch (e) {
      expect(e).toBeInstanceOf(GameError);
      expect((e as InstanceType<typeof GameError>).code).toBe("demo_offchain");
    }
  });
});

describe("storage persistence check", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("flags Railway without a volume", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT", "production");
    vi.stubEnv("RAILWAY_VOLUME_MOUNT_PATH", "");
    const { storageStatus } = await import("@/server/db");
    const s = storageStatus("/data/trezo.db");
    expect(s.persistent).toBe(false);
    expect(s.warning).toMatch(/No Railway volume/);
  });

  it("moves a database configured outside the volume onto it", async () => {
    vi.stubEnv("RAILWAY_VOLUME_MOUNT_PATH", "/data");
    vi.stubEnv("TREZO_DB_PATH", "data/trezo.db");
    vi.resetModules();
    const { serverEnv } = await import("@/server/env");
    expect(serverEnv.dbPath).toBe("/data/trezo.db");
    vi.stubEnv("TREZO_DB_PATH", "/data/game/trezo.db");
    vi.resetModules();
    expect((await import("@/server/env")).serverEnv.dbPath).toBe("/data/game/trezo.db");
    vi.resetModules();
  });

  it("accepts a database on the mounted volume", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT", "production");
    vi.stubEnv("RAILWAY_VOLUME_MOUNT_PATH", "/data");
    const { storageStatus } = await import("@/server/db");
    expect(storageStatus("/data/trezo.db")).toMatchObject({ persistent: true, warning: null });
    expect(storageStatus("/app/data/trezo.db").warning).toMatch(/not on the attached volume/);
  });
});
