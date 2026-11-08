#!/usr/bin/env node
/**
 * Real on-chain demo against a deployed TREZO contract (testnet).
 *
 * Creates two faucet-funded player accounts, starts the game server pointed at
 * the contract, and plays the full loop with real transactions:
 *   NEP-413 login → proximity claim → oracle ticket → `claim` (mint NEP-245)
 *   → server settlement → list on market → second player buys
 *   → Merchant bonding-curve buy → treasury-funded buyback.
 *
 * Players sign with keys generated here (what a wallet does after the user
 * approves); keys are stored in ~/.near-credentials/testnet and never logged.
 * Writes deployments/testnet-demo.json with every transaction link.
 *
 *   node scripts/testnet-demo.mjs        (reads .env.local for contract + oracle)
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";

for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const CONTRACT = process.env.NEXT_PUBLIC_TREZO_CONTRACT_ID;
const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const EXPLORER = "https://testnet.nearblocks.io";
const PORT = Number(process.env.DEMO_APP_PORT || 3300);
const APP = `http://localhost:${PORT}`;
const NEAR = 10n ** 24n;
const TGAS = 10n ** 12n;
if (!CONTRACT || !process.env.TREZO_ORACLE_SECRET_KEY) {
  console.error("Set NEXT_PUBLIC_TREZO_CONTRACT_ID and TREZO_ORACLE_SECRET_KEY (.env.local)");
  process.exit(1);
}

const provider = new JsonRpcProvider({ url: RPC });
const view = (method, args = {}) => provider.callFunction({ contractId: CONTRACT, method, args });
const log = { network: "testnet", contract: CONTRACT, ranAt: new Date().toISOString(), steps: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const record = (step, hash, extra = {}) => {
  const url = hash ? `${EXPLORER}/txns/${hash}` : null;
  log.steps.push({ step, hash, url, ...extra });
  console.log(`  ✓ ${step}${url ? `\n      ${url}` : ""}`);
};
const die = (m) => {
  console.error(`  ✗ ${m}`);
  throw new Error(m);
};

async function faucetAccount(prefix) {
  const id = `${prefix}-${crypto.randomBytes(3).toString("hex")}.testnet`;
  const kp = KeyPair.fromRandom("ed25519");
  const dir = path.join(os.homedir(), ".near-credentials", "testnet");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ account_id: id, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }), { mode: 0o600 });
  const r = await fetch("https://helper.nearprotocol.com/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newAccountId: id, newAccountPublicKey: kp.getPublicKey().toString() }),
  });
  if (!r.ok) die(`faucet ${r.status}: ${(await r.text()).slice(0, 200)}`);
  for (let i = 0; i < 20; i++) {
    try {
      await provider.viewAccount({ accountId: id });
      return { id, kp, acc: new Account(id, provider, new KeyPairSigner(kp)) };
    } catch {
      await sleep(1500);
    }
  }
  die(`account ${id} not visible`);
}

async function tx(acc, method, args, deposit = 0n, gas = 100n) {
  const r = await acc.signAndSendTransaction({ receiverId: CONTRACT, actions: [actions.functionCall(method, args, gas * TGAS, deposit)], waitUntil: "FINAL", throwOnFailure: false });
  const hash = r.transaction?.hash ?? r.transaction_outcome?.id;
  if (r.status && typeof r.status === "object" && "Failure" in r.status) die(`${method} failed: ${JSON.stringify(r.status.Failure)} (${EXPLORER}/txns/${hash})`);
  const value = r.status?.SuccessValue ? JSON.parse(Buffer.from(r.status.SuccessValue, "base64").toString() || "null") : null;
  return { hash, value };
}

function client() {
  let cookie = "";
  return async (p, opts = {}) => {
    const res = await fetch(`${APP}${p}`, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: { ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const kv = c.split(";")[0];
      cookie = [...cookie.split("; ").filter((x) => x && !x.startsWith(`${kv.split("=")[0]}=`)), kv].join("; ");
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) die(`${p} → ${res.status} ${JSON.stringify(json)}`);
    return json;
  };
}

async function login(api, who, username) {
  await api("/api/session/guest", { body: { username, avatar: "fox" } });
  const n = await api("/api/auth/nonce");
  const s = await new KeyPairSigner(who.kp).signNep413Message(who.id, { message: n.message, recipient: n.recipient, nonce: new Uint8Array(Buffer.from(n.nonce, "base64")) });
  const r = await api("/api/auth/verify", { body: { accountId: who.id, publicKey: who.kp.getPublicKey().toString(), signature: Buffer.from(s.signature).toString("base64"), nonce: n.nonce } });
  if (r.player.accountId !== who.id) die("login mismatch");
}

let app;
const dbFile = path.join(os.tmpdir(), `trezo-testnet-demo-${Date.now()}.db`);
try {
  console.log(`TREZO testnet demo → ${CONTRACT}`);
  const stats0 = await view("get_stats");
  console.log(`  contract ok: ${stats0.item_types} item types, owner ${stats0.owner_id}`);

  const alice = await faucetAccount("trezo-alice");
  const bob = await faucetAccount("trezo-bob");
  log.players = [alice.id, bob.id];
  record(`created faucet-funded players ${alice.id}, ${bob.id}`);

  app = spawn("npx", ["next", "dev", "-p", String(PORT)], { env: { ...process.env, TREZO_DB_PATH: dbFile }, stdio: "ignore", detached: true });
  for (let i = 0; i < 120; i++) {
    try {
      const c = await (await fetch(`${APP}/api/config`)).json();
      if (c.onchainSettlement) break;
    } catch {}
    await sleep(1000);
  }
  const a = client();
  await login(a, alice, `alice_${crypto.randomBytes(2).toString("hex")}`);
  record("alice signed in with NEP-413 (key verified against testnet)");

  // Proximity-validated claim in the demo zone, choose a treasure that drops a tradable item.
  const list = (await a(`/api/treasures?lat=40.7812&lng=-73.9665&mode=demo`)).treasures;
  const t = list.find((x) => ["relic-compass", "scroll-trailmap", "gem-glimmer", "coin-wayfarer"].includes(x.rewardItemId));
  const claim = await a(`/api/treasures/${t.id}/claim`, { body: { pos: { lat: t.lat, lng: t.lng }, accuracy: null, demo: true } });
  record(`server validated claim: ${t.name} (${t.rarity}) → ${t.rewardItemId}`, null);

  const ticket = await a(`/api/rewards/${claim.reward.id}/ticket`, { method: "POST" });
  const c = await tx(alice.acc, "claim", { ticket: ticket.ticket, signature: ticket.signature });
  record(`alice minted ${t.rewardItemId} (NEP-245) via oracle-signed claim ticket`, c.hash);
  const settled = await a(`/api/rewards/${claim.reward.id}/settle`, { body: { txHash: c.hash } });
  if (!settled.settled) die("settlement");
  record("game server confirmed settlement by reading get_claim on-chain");

  // Players prepay their own storage (the contract never pays for state they create)
  const sd = await tx(alice.acc, "storage_deposit", {}, NEAR / 50n);
  record("alice prepaid 0.02 NEAR storage deposit (withdrawable)", sd.hash);
  const sdb = await tx(bob.acc, "storage_deposit", {}, NEAR / 50n);
  record("bob prepaid 0.02 NEAR storage deposit (withdrawable)", sdb.hash);

  const price = NEAR / 10n; // 0.1 NEAR
  const l = await tx(alice.acc, "list_item", { token_id: t.rewardItemId, amount: "1", price: price.toString() }, 1n);
  record(`alice listed 1 × ${t.rewardItemId} for 0.1 NEAR (escrowed, listing #${l.value.id})`, l.hash);
  const b = await tx(bob.acc, "buy_listing", { listing_id: l.value.id }, price);
  record("bob bought it: payment, 2.5% fee to Merchant treasury and delivery in one receipt", b.hash);
  const bobBal = await view("mt_balance_of", { account_id: bob.id, token_id: t.rewardItemId });
  if (bobBal !== "1") die(`bob balance ${bobBal}`);

  const m = await view("get_npc", { npc_id: "merchant" });
  const o = m.offers.find((x) => x.offer.token_id === "gem-glimmer");
  const nb = await tx(bob.acc, "npc_buy", { npc_id: "merchant", token_id: "gem-glimmer" }, (BigInt(o.current_price) * 110n) / 100n);
  const p1 = (await view("get_npc", { npc_id: "merchant" })).offers.find((x) => x.offer.token_id === "gem-glimmer").current_price;
  record(`bob bought a Glimmer Shard from the Merchant at ${Number(BigInt(o.current_price)) / 1e24} NEAR (price now ${Number(BigInt(p1)) / 1e24})`, nb.hash);
  const ns = await tx(bob.acc, "npc_sell", { npc_id: "merchant", token_id: "gem-glimmer" }, 1n);
  record(`bob sold it back; Merchant paid ${Number(BigInt(ns.value)) / 1e24} NEAR from its on-chain treasury`, ns.hash);

  const stats = await view("get_stats");
  if (stats.economy_locked) record("economy is locked: NPC prices, allocations and the market fee can no longer be changed by anyone", null);
  const merchant = (await view("get_npc", { npc_id: "merchant" })).npc;
  log.final = { players: stats.players, claims: stats.claims, volumeYocto: stats.total_market_volume, merchantTreasuryYocto: merchant.treasury };
  console.log(`\n  contract: ${stats.players} players, ${stats.claims} claims, volume ${Number(BigInt(stats.total_market_volume)) / 1e24} NEAR, Merchant treasury ${Number(BigInt(merchant.treasury)) / 1e24} NEAR`);
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync("deployments/testnet-demo.json", JSON.stringify(log, null, 2));
  console.log("  saved deployments/testnet-demo.json");
} finally {
  if (app?.pid) {
    try {
      process.kill(-app.pid, "SIGTERM");
    } catch {}
  }
  fs.rmSync(dbFile, { force: true });
}
