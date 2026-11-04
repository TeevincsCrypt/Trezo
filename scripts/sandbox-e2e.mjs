#!/usr/bin/env node
/**
 * Full-stack on-chain integration test against a LOCAL NEAR node (sandbox).
 *
 * Boots neard in sandbox mode, deploys the real TREZO wasm with the real
 * deploy script, runs the real game server pointed at it, and then drives
 * every on-chain path with real transactions:
 *
 *   wallet login (NEP-413, key checked via RPC) → proximity claim →
 *   oracle ticket → `claim` tx → server-verified settlement → replay/forgery
 *   rejection → NPC mission mint from allocation → soulbound check →
 *   marketplace list/buy (escrow, fee to Merchant) → double-buy rejection →
 *   Merchant bonding-curve buy & treasury-funded buyback → NEP-245 transfer.
 *
 *   npm run contract:build && npm run test:sandbox
 *
 * Nothing here touches testnet/mainnet. All transactions are local.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Sandbox, DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY } from "near-sandbox";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";

const NEAR = 10n ** 24n;
const TGAS = 10n ** 12n;
const PORT = Number(process.env.SANDBOX_APP_PORT || 3200);
const APP = `http://localhost:${PORT}`;
const results = [];
let failures = 0;

const pass = (m, extra = "") => {
  results.push(["✓", m, extra]);
  console.log(`  ✓ ${m}${extra ? `  ${extra}` : ""}`);
};
const fail = (m, extra = "") => {
  failures++;
  results.push(["✗", m, extra]);
  console.log(`  ✗ ${m}${extra ? `  ${extra}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync("contracts/trezo/target/near/trezo_game.wasm")) {
  console.error("Build the contract first: npm run contract:build");
  process.exit(1);
}

// ----------------------------------------------------------------- helpers
async function tx(account, receiverId, method, args, deposit = 0n, gas = 100n) {
  try {
    const r = await account.signAndSendTransaction({ receiverId, actions: [actions.functionCall(method, args, gas * TGAS, deposit)], waitUntil: "FINAL", throwOnFailure: false });
    const hash = r.transaction?.hash ?? r.transaction_outcome?.id;
    const failure = r.status && typeof r.status === "object" && "Failure" in r.status ? JSON.stringify(r.status.Failure) : null;
    let value = null;
    if (r.status?.SuccessValue) value = JSON.parse(Buffer.from(r.status.SuccessValue, "base64").toString() || "null");
    return { ok: !failure, hash, failure, value };
  } catch (e) {
    return { ok: false, hash: null, failure: e.message, value: null };
  }
}

function cookieClient() {
  let cookie = "";
  return async function call(p, opts = {}) {
    const res = await fetch(`${APP}${p}`, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: { ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const kv = c.split(";")[0];
      const name = kv.split("=")[0];
      cookie = [...cookie.split("; ").filter((x) => x && !x.startsWith(`${name}=`)), kv].join("; ");
    }
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  };
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(out))));
  });
}

// ------------------------------------------------------------------- main
try {
  await fetch(`${APP}/api/config`);
  console.error(`Port ${PORT} is already in use — stop that server or set SANDBOX_APP_PORT.`);
  process.exit(1);
} catch {
  /* port free */
}
const sandbox = await Sandbox.start({});
console.log(`Local NEAR sandbox: ${sandbox.rpcUrl}`);
const provider = new JsonRpcProvider({ url: sandbox.rpcUrl });
const root = new Account(DEFAULT_ACCOUNT_ID, provider, DEFAULT_PRIVATE_KEY);
let app;
const dbFile = path.join(os.tmpdir(), `trezo-sandbox-${Date.now()}.db`);

try {
  // Accounts
  const keys = { trezo: KeyPair.fromRandom("ed25519"), alice: KeyPair.fromRandom("ed25519"), bob: KeyPair.fromRandom("ed25519") };
  const ids = { trezo: `trezo.${DEFAULT_ACCOUNT_ID}`, alice: `alice.${DEFAULT_ACCOUNT_ID}`, bob: `bob.${DEFAULT_ACCOUNT_ID}` };
  for (const [k, amt] of [["trezo", 40n], ["alice", 15n], ["bob", 15n]]) {
    await root.createSubAccount({ accountOrPrefix: ids[k], publicKey: keys[k].getPublicKey().toString(), nearToTransfer: amt * NEAR });
  }
  const acc = Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, new Account(id, provider, new KeyPairSigner(keys[k]))]));
  pass("created contract + player accounts", Object.values(ids).join(", "));

  // Oracle key (server secret)
  const seed = new Uint8Array(crypto.randomBytes(32));
  const full = new Uint8Array(64);
  full.set(seed);
  full.set(ed25519.getPublicKey(seed), 32);
  const oracleSecret = `ed25519:${bs58.encode(full)}`;

  // Deploy with the real deploy script
  const deployOut = await run("node", ["scripts/deploy-contract.mjs"], {
    NEXT_PUBLIC_TREZO_CONTRACT_ID: ids.trezo,
    NEAR_RPC_URL: sandbox.rpcUrl,
    NEAR_PRIVATE_KEY: keys.trezo.toString(),
    TREZO_ORACLE_SECRET_KEY: oracleSecret,
    TREZO_FUND_MERCHANT_NEAR: "2",
    TREZO_DEPLOY_LABEL: "sandbox",
  });
  const txCount = (deployOut.match(/✓/g) || []).length;
  pass("deployed + configured contract via scripts/deploy-contract.mjs", `${txCount} transactions`);
  const view = (method, args = {}) => provider.callFunction({ contractId: ids.trezo, method, args });
  const stats = await view("get_stats");
  stats.item_types >= 10 ? pass("contract state", `${stats.item_types} NEP-245 item types, owner ${stats.owner_id}`) : fail("item types missing");

  // Game server pointed at the sandbox
  app = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    env: {
      ...process.env,
      TREZO_DB_PATH: dbFile,
      NEXT_PUBLIC_TREZO_CONTRACT_ID: ids.trezo,
      NEXT_PUBLIC_NEAR_RPC_URL: sandbox.rpcUrl,
      NEAR_RPC_URL: sandbox.rpcUrl,
      TREZO_ORACLE_SECRET_KEY: oracleSecret,
      TREZO_SESSION_SECRET: "sandbox-session-secret-123456",
    },
    stdio: "ignore",
    detached: true, // own process group so cleanup also stops the `next` child of npx
  });
  let cfg;
  for (let i = 0; i < 90; i++) {
    try {
      cfg = await (await fetch(`${APP}/api/config`)).json();
      if (cfg) break;
    } catch {}
    await sleep(1000);
  }
  cfg?.onchainSettlement ? pass("game server up with on-chain settlement enabled", cfg.oraclePublicKey) : fail("server not configured", JSON.stringify(cfg));

  // Wallet login: NEP-413 signed message, key verified against chain
  const alice = cookieClient();
  await alice("/api/session/guest", { body: { username: "alice_sb", avatar: "fox" } });
  const nonce = (await alice("/api/auth/nonce")).json;
  const signed = await new KeyPairSigner(keys.alice).signNep413Message(ids.alice, { message: nonce.message, recipient: nonce.recipient, nonce: new Uint8Array(Buffer.from(nonce.nonce, "base64")) });
  const login = await alice("/api/auth/verify", { body: { accountId: ids.alice, publicKey: keys.alice.getPublicKey().toString(), signature: Buffer.from(signed.signature).toString("base64"), nonce: nonce.nonce } });
  login.json.player?.accountId === ids.alice ? pass("NEP-413 wallet login verified against on-chain access key") : fail("wallet login", JSON.stringify(login.json));
  const replayLogin = await alice("/api/auth/verify", { body: { accountId: ids.alice, publicKey: keys.alice.getPublicKey().toString(), signature: Buffer.from(signed.signature).toString("base64"), nonce: nonce.nonce } });
  replayLogin.status === 401 ? pass("login nonce cannot be replayed") : fail("login replay accepted");
  // Wrong key for the account → rejected
  const n2 = (await alice("/api/auth/nonce")).json;
  const bobSig = await new KeyPairSigner(keys.bob).signNep413Message(ids.alice, { message: n2.message, recipient: n2.recipient, nonce: new Uint8Array(Buffer.from(n2.nonce, "base64")) });
  const imp = await alice("/api/auth/verify", { body: { accountId: ids.alice, publicKey: keys.bob.getPublicKey().toString(), signature: Buffer.from(bobSig.signature).toString("base64"), nonce: n2.nonce } });
  imp.status === 401 ? pass("impersonation rejected (key not on account)") : fail("impersonation accepted", JSON.stringify(imp.json));

  // Accept a mission, then claim a treasure (proximity validated server-side)
  await alice("/api/missions/exp-first-steps/accept", { method: "POST" });
  await sleep(5);
  const list = (await alice(`/api/treasures?lat=40.7812&lng=-73.9665&mode=demo`)).json.treasures;
  const tradable = ["gem-glimmer", "coin-wayfarer", "scroll-trailmap", "relic-compass"];
  const t = list.find((x) => tradable.includes(x.rewardItemId));
  const far = await alice(`/api/treasures/${t.id}/claim`, { body: { pos: { lat: t.lat + 0.01, lng: t.lng }, accuracy: null, demo: true } });
  far.json.error === "too_far" ? pass("claim from 1 km away rejected by server") : fail("far claim not rejected", JSON.stringify(far.json));
  const claim = await alice(`/api/treasures/${t.id}/claim`, { body: { pos: { lat: t.lat, lng: t.lng }, accuracy: null, demo: true } });
  claim.json.reward ? pass("treasure claimed off-chain", `${t.name} → ${t.rewardItemId}`) : fail("claim failed", JSON.stringify(claim.json));
  const rewardId = claim.json.reward.id;

  // Ticket → real claim transaction → server settlement
  const ticket = (await alice(`/api/rewards/${rewardId}/ticket`, { method: "POST" })).json;
  const forged = JSON.parse(ticket.ticket);
  forged.items = [[forged.items[0][0], "50"]];
  const f = await tx(acc.alice, ids.trezo, "claim", { ticket: JSON.stringify(forged), signature: ticket.signature });
  !f.ok && /Invalid oracle signature/.test(f.failure) ? pass("forged ticket (50 items) rejected on-chain", f.hash ?? "") : fail("forged ticket accepted", f.failure);
  const stolen = await tx(acc.bob, ids.trezo, "claim", { ticket: ticket.ticket, signature: ticket.signature });
  !stolen.ok && /another account/.test(stolen.failure) ? pass("ticket cannot be used by another account") : fail("stolen ticket accepted", stolen.failure);
  const c = await tx(acc.alice, ids.trezo, "claim", { ticket: ticket.ticket, signature: ticket.signature });
  c.ok ? pass("claim transaction succeeded", c.hash) : fail("claim tx failed", c.failure);
  const replay = await tx(acc.alice, ids.trezo, "claim", { ticket: ticket.ticket, signature: ticket.signature });
  !replay.ok && /already used/.test(replay.failure) ? pass("ticket replay rejected on-chain") : fail("replay accepted", replay.failure);
  const settle = await alice(`/api/rewards/${rewardId}/settle`, { body: { txHash: c.hash } });
  settle.json.settled ? pass("server confirmed settlement by reading get_claim from chain") : fail("settle", JSON.stringify(settle.json));
  const bal = await view("mt_balance_of", { account_id: ids.alice, token_id: t.rewardItemId });
  bal === "1" ? pass(`NEP-245 balance on-chain`, `${ids.alice} holds 1 × ${t.rewardItemId}`) : fail("balance", bal);
  const rec = await view("get_claim", { ticket_id: rewardId });
  rec?.demo === true ? pass("on-chain claim record flagged demo:true (simulated location)") : fail("demo flag", JSON.stringify(rec));

  // NPC mission reward minted from the Explorer's on-chain allocation
  const before = (await view("get_npc", { npc_id: "explorer" })).offers.find((o) => o.offer.token_id === "badge-pioneer").offer.allocation;
  const done = await alice("/api/missions/exp-first-steps/complete", { method: "POST" });
  const mt = (await alice(`/api/rewards/${done.json.reward.id}/ticket`, { method: "POST" })).json;
  const mc = await tx(acc.alice, ids.trezo, "claim", { ticket: mt.ticket, signature: mt.signature });
  const after = (await view("get_npc", { npc_id: "explorer" })).offers.find((o) => o.offer.token_id === "badge-pioneer").offer.allocation;
  mc.ok && BigInt(after) === BigInt(before) - 1n ? pass("mission reward minted from NPC allocation", `${before} → ${after}`) : fail("npc allocation", mc.failure);
  const sb = await tx(acc.alice, ids.trezo, "mt_transfer", { receiver_id: ids.bob, token_id: "badge-pioneer", amount: "1", approval: null, memo: null }, 1n);
  !sb.ok && /soulbound/.test(sb.failure) ? pass("soulbound badge cannot be transferred") : fail("soulbound transfer", sb.failure);

  // Marketplace: list → buy (escrow, payment, fee) → double buy rejected
  const price = NEAR / 2n;
  const l = await tx(acc.alice, ids.trezo, "list_item", { token_id: t.rewardItemId, amount: "1", price: price.toString() }, 1n);
  l.ok ? pass("listed item (moved into contract escrow)", l.hash) : fail("list", l.failure);
  const listingId = l.value.id;
  const escrow = await view("mt_balance_of", { account_id: ids.trezo, token_id: t.rewardItemId });
  escrow === "1" ? pass("escrow holds the listed item") : fail("escrow", escrow);
  const aliceBefore = BigInt((await provider.viewAccount({ accountId: ids.alice })).amount);
  const treasuryBefore = BigInt((await view("get_npc", { npc_id: "merchant" })).npc.treasury);
  const b = await tx(acc.bob, ids.trezo, "buy_listing", { listing_id: listingId }, price);
  b.ok ? pass("bob bought the listing", b.hash) : fail("buy", b.failure);
  const aliceAfter = BigInt((await provider.viewAccount({ accountId: ids.alice })).amount);
  const treasuryAfter = BigInt((await view("get_npc", { npc_id: "merchant" })).npc.treasury);
  const fee = (price * 250n) / 10000n;
  aliceAfter - aliceBefore === price - fee ? pass("seller paid exactly price − 2.5% fee", `${Number(price - fee) / 1e24} NEAR`) : fail("seller proceeds", `${aliceAfter - aliceBefore}`);
  treasuryAfter - treasuryBefore === fee ? pass("fee credited to the Merchant's on-chain treasury") : fail("fee", `${treasuryAfter - treasuryBefore}`);
  (await view("mt_balance_of", { account_id: ids.bob, token_id: t.rewardItemId })) === "1" ? pass("item delivered to buyer atomically") : fail("delivery");
  const b2 = await tx(acc.alice, ids.trezo, "buy_listing", { listing_id: listingId }, price);
  !b2.ok && /already sold/.test(b2.failure) ? pass("double purchase rejected") : fail("double buy", b2.failure);

  // Merchant NPC: bonding curve buy, treasury-funded buyback
  const merchant = await view("get_npc", { npc_id: "merchant" });
  const offer = merchant.offers.find((o) => o.offer.token_id === "gem-glimmer");
  const p0 = BigInt(offer.current_price);
  const nb = await tx(acc.bob, ids.trezo, "npc_buy", { npc_id: "merchant", token_id: "gem-glimmer" }, (p0 * 110n) / 100n);
  const p1 = BigInt((await view("get_npc", { npc_id: "merchant" })).offers.find((o) => o.offer.token_id === "gem-glimmer").current_price);
  nb.ok && p1 > p0 ? pass("Merchant sale: price moved along the curve", `${Number(p0) / 1e24} → ${Number(p1) / 1e24} NEAR`) : fail("npc_buy", nb.failure);
  const bobBefore = BigInt((await provider.viewAccount({ accountId: ids.bob })).amount);
  const ns = await tx(acc.bob, ids.trezo, "npc_sell", { npc_id: "merchant", token_id: "gem-glimmer" }, 1n);
  const bobAfter = BigInt((await provider.viewAccount({ accountId: ids.bob })).amount);
  ns.ok ? pass("Merchant buyback paid from NPC treasury", `${Number(BigInt(ns.value)) / 1e24} NEAR`) : fail("npc_sell", ns.failure);
  if (ns.ok && bobAfter <= bobBefore) console.log("    (note: buyback smaller than gas spent — expected for a 0.01 NEAR item)");

  // NEP-245 transfer + events
  const tr = await tx(acc.bob, ids.trezo, "mt_transfer", { receiver_id: ids.alice, token_id: t.rewardItemId, amount: "1", approval: null, memo: "gift" }, 1n);
  tr.ok && (await view("mt_balance_of", { account_id: ids.alice, token_id: t.rewardItemId })) === "1" ? pass("NEP-245 mt_transfer back to alice") : fail("mt_transfer", tr.failure);

  // NEP-245 transfer_call: receiver has no contract → mt_on_transfer fails → resolve refunds
  const tc = await tx(acc.alice, ids.trezo, "mt_transfer_call", { receiver_id: ids.bob, token_id: t.rewardItemId, amount: "1", approval: null, memo: null, msg: "" }, 1n, 150n);
  const aliceBack = await view("mt_balance_of", { account_id: ids.alice, token_id: t.rewardItemId });
  const bobNone = await view("mt_balance_of", { account_id: ids.bob, token_id: t.rewardItemId });
  tc.ok && aliceBack === "1" && bobNone === "0" ? pass("mt_transfer_call to non-contract refunded by mt_resolve_transfer") : fail("transfer_call refund", `${tc.failure} alice=${aliceBack} bob=${bobNone}`);

  // Authorization
  const adm = await tx(acc.bob, ids.trezo, "add_item_type", { token_id: "hack", name: "x", description: "", media: null, rarity: "Common", category: "x", transferable: true, max_supply: "1" });
  !adm.ok && /Only the contract owner/.test(adm.failure) ? pass("non-owner cannot call admin methods") : fail("auth", adm.failure);

  const final = await view("get_stats");
  console.log(`\nContract stats: ${final.players} players, ${final.claims} claims, volume ${Number(BigInt(final.total_market_volume)) / 1e24} NEAR`);

  if (process.argv.includes("--keep")) {
    // Leave a live listing and keep everything running for manual/UI inspection.
    await tx(acc.alice, ids.trezo, "list_item", { token_id: t.rewardItemId, amount: "1", price: (NEAR / 4n).toString() }, 1n);
    console.log(`\n--keep: app ${APP} ↔ sandbox ${sandbox.rpcUrl} (contract ${ids.trezo}). Ctrl-C to stop.`);
    await new Promise((resolve) => process.on("SIGINT", resolve).on("SIGTERM", resolve));
  }
} catch (e) {
  fail("unexpected error", e.stack || e.message);
} finally {
  if (app?.pid) {
    try {
      process.kill(-app.pid, "SIGTERM");
    } catch {}
  }
  await sandbox.tearDown().catch(() => {});
  fs.rmSync(dbFile, { force: true });
}

console.log(`\n${results.filter((r) => r[0] === "✓").length} passed, ${failures} failed (local sandbox — not testnet)`);
process.exit(failures ? 1 : 0);
