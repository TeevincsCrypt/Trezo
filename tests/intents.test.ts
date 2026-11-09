import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKENS = [
  { assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", symbol: "USDC", blockchain: "base", decimals: 6, price: 1 },
  { assetId: "nep141:eth.omft.near", symbol: "ETH", blockchain: "eth", decimals: 18, price: 3000 },
  { assetId: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", symbol: "USDC", blockchain: "near", decimals: 6, price: 1 },
  { assetId: "nep141:some-meme.omft.near", symbol: "MEME", blockchain: "sol", decimals: 9, price: 0.01 },
];
const USDC = TOKENS[0].assetId;

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

function mockOneClick(status = "PENDING_DEPOSIT") {
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (url.endsWith("/v0/tokens")) return json(TOKENS);
    if (url.endsWith("/v0/quote")) {
      const req = JSON.parse(String(init!.body));
      return json({
        timestamp: "t",
        signature: "sig",
        quoteRequest: req,
        quote: {
          depositAddress: req.dry ? undefined : "0xDEPOSIT000000000000000000000000000000001",
          amountIn: req.amount,
          amountInFormatted: "10",
          amountInUsd: "10",
          amountOut: "4000000000000000000000000",
          amountOutFormatted: "4.0",
          amountOutUsd: "9.9",
          minAmountOut: "3960000000000000000000000",
          deadline: req.deadline,
          timeEstimate: 60,
        },
      });
    }
    if (url.includes("/v0/status")) return json({ status, swapDetails: { amountOutFormatted: "4.01", destinationChainTxHashes: [{ hash: "abc", explorerUrl: "https://nearblocks.io/txns/abc" }] } });
    return new Response("{}", { status: 404 });
  });
}

async function load(network: "mainnet" | "testnet") {
  vi.stubEnv("NEXT_PUBLIC_NEAR_NETWORK", network);
  vi.resetModules();
  const dbm = await import("@/server/db");
  const players = await import("@/server/players");
  const intents = await import("@/server/intents");
  const { GameError } = await import("@/server/errors");
  dbm.resetDbForTests();
  return { ...dbm, ...players, ...intents, GameError };
}

async function code(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return "no-error";
}

beforeEach(() => mockOneClick());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("NEAR Intents (1Click)", () => {
  it("is mainnet-only", async () => {
    const m = await load("testnet");
    expect(m.intentsEnabled()).toBe(false);
    expect(await code(m.listTokens())).toBe("mainnet_only");
  });

  it("lists popular tokens from other chains only", async () => {
    const m = await load("mainnet");
    const t = await m.listTokens();
    expect(t.map((x) => `${x.symbol}:${x.blockchain}`)).toEqual(["ETH:eth", "USDC:base"]);
  });

  it("converts amounts to smallest units", async () => {
    const m = await load("mainnet");
    expect(m.toUnits("12.5", 6)).toBe("12500000");
    expect(m.toUnits("1", 18)).toBe("1000000000000000000");
    expect(() => m.toUnits("1.1234567", 6)).toThrow();
    expect(() => m.toUnits("-1", 6)).toThrow();
    expect(() => m.toUnits("0", 6)).toThrow();
  });

  it("requires a linked NEAR wallet", async () => {
    const m = await load("mainnet");
    const p = m.createPlayer({ username: "guesty", avatar: "fox" });
    expect(await code(m.createSwap(p.id, { originAsset: USDC, amount: "10", refundTo: "0x1111111111111111111111111111111111111111" }))).toBe("wallet_required");
  });

  it("always delivers to the session's own NEAR account and stores the signed quote", async () => {
    const m = await load("mainnet");
    const g = m.createPlayer({ username: "walleter", avatar: "fox" });
    const p = m.linkAccount(g.id, "walleter.near");
    const s = await m.createSwap(p.id, { originAsset: USDC, amount: "10", refundTo: "0x1111111111111111111111111111111111111111" });
    const q = JSON.parse(String(calls.find((c) => c.url.endsWith("/v0/quote"))!.init!.body));
    expect(q).toMatchObject({ recipient: "walleter.near", recipientType: "DESTINATION_CHAIN", destinationAsset: "nep141:wrap.near", amount: "10000000", swapType: "EXACT_INPUT", depositType: "ORIGIN_CHAIN", refundType: "ORIGIN_CHAIN", dry: false });
    expect(s.depositAddress).toMatch(/^0xDEPOSIT/);
    const row = m.db().prepare("SELECT * FROM intent_swaps").get() as { account_id: string; quote_json: string };
    expect(row.account_id).toBe("walleter.near");
    expect(JSON.parse(row.quote_json).signature).toBe("sig");
  });

  it("dry previews are not stored", async () => {
    const m = await load("mainnet");
    const g = m.createPlayer({ username: "previewer", avatar: "fox" });
    const p = m.linkAccount(g.id, "previewer.near");
    const s = await m.createSwap(p.id, { originAsset: USDC, amount: "10", refundTo: "0x1111111111111111111111111111111111111111", dry: true });
    expect(s.amountOut).toBe("4.0");
    expect((m.db().prepare("SELECT COUNT(*) n FROM intent_swaps").get() as { n: number }).n).toBe(0);
  });

  it("rejects unknown tokens and bad refund addresses", async () => {
    const m = await load("mainnet");
    const p = m.linkAccount(m.createPlayer({ username: "badinput", avatar: "fox" }).id, "badinput.near");
    expect(await code(m.createSwap(p.id, { originAsset: "nep141:some-meme.omft.near", amount: "1", refundTo: "0x1111111111111111111111111111111111111111" }))).toBe("bad_token");
    expect(await code(m.createSwap(p.id, { originAsset: USDC, amount: "1", refundTo: "short" }))).toBe("bad_refund");
  });

  it("status is only visible to the swap's owner and is updated from 1Click", async () => {
    const m = await load("mainnet");
    const a = m.linkAccount(m.createPlayer({ username: "owner1", avatar: "fox" }).id, "owner1.near");
    const b = m.linkAccount(m.createPlayer({ username: "other1", avatar: "fox" }).id, "other1.near");
    const s = await m.createSwap(a.id, { originAsset: USDC, amount: "10", refundTo: "0x1111111111111111111111111111111111111111" });
    expect(await code(m.swapStatus(b.id, s.depositAddress))).toBe("not_found");
    mockOneClick("SUCCESS");
    const st = await m.swapStatus(a.id, s.depositAddress);
    expect(st.status).toBe("SUCCESS");
    expect(st.amountOut).toBe("4.01");
    expect(st.destinationTxs?.[0].hash).toBe("abc");
    expect(m.listSwaps(a.id)[0].status).toBe("SUCCESS");
  });
});
