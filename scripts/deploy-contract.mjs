#!/usr/bin/env node
/**
 * Deploys and configures the TREZO contract (idempotent).
 *
 * Required env (put them in .env.local or export them; NEVER commit keys):
 *   NEXT_PUBLIC_NEAR_NETWORK         testnet | mainnet           (default testnet)
 *   NEXT_PUBLIC_TREZO_CONTRACT_ID    e.g. trezo-game.testnet      (the account to deploy to)
 *   TREZO_ORACLE_SECRET_KEY          from `npm run oracle:keygen`
 *   One of:
 *     NEAR_PRIVATE_KEY               ed25519:... full-access key of the contract account
 *     (or a near-cli legacy keychain file ~/.near-credentials/<network>/<account>.json)
 * Optional:
 *   TREZO_OWNER_ID                   final owner/admin account (default: the contract account).
 *                                    The contract is initialised with itself as owner so this
 *                                    script can configure it, then ownership is transferred.
 *   TREZO_APP_URL                    public app URL, used for NEP-245 media links
 *   TREZO_FUND_MERCHANT_NEAR         seed the Merchant treasury (default 0.5)
 *   TREZO_LOCK_ECONOMY               1 (default) = call lock_economy at the end, which
 *                                    IRREVERSIBLY freezes NPCs, offers and the market fee;
 *                                    0 = leave them editable (development only)
 *   NEAR_RPC_URL                     custom RPC endpoint
 *
 * Usage:  npm run contract:build && node scripts/deploy-contract.mjs [--upgrade] [--delete-keys]
 *   --delete-keys  (mainnet hardening) after ownership is transferred, DELETE every
 *                  access key of the contract account. Irreversible: the code can
 *                  never be redeployed and the account's NEAR can only move through
 *                  contract rules. Requires TREZO_OWNER_ID ≠ the contract account.
 * Writes deployments/<network>.json with the transactions it sent.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Account, JsonRpcProvider, KeyPairSigner, PublicKey, actions } from "near-api-js";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";

// --- tiny .env loader (no dependency) -------------------------------------
for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const network = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
const contractId = process.env.NEXT_PUBLIC_TREZO_CONTRACT_ID;
const rpcUrl = process.env.NEAR_RPC_URL || (network === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");
const label = process.env.TREZO_DEPLOY_LABEL || network; // e.g. "sandbox" for local runs
const explorer = label === "sandbox" ? "sandbox://local" : network === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";
const wasmPath = "contracts/trezo/target/near/trezo_game.wasm";
const NEAR = 10n ** 24n;
const TGAS = 10n ** 12n;

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
if (!contractId) die("Set NEXT_PUBLIC_TREZO_CONTRACT_ID");
if (!fs.existsSync(wasmPath)) die(`Missing ${wasmPath}. Run: npm run contract:build`);

// --- signer ---------------------------------------------------------------
let privateKey = process.env.NEAR_PRIVATE_KEY;
if (!privateKey) {
  const cred = path.join(os.homedir(), ".near-credentials", network, `${contractId}.json`);
  if (fs.existsSync(cred)) privateKey = JSON.parse(fs.readFileSync(cred, "utf8")).private_key;
}
if (!privateKey) die("No signing key. Set NEAR_PRIVATE_KEY or create the account with near-cli (save-to-legacy-keychain).");

// --- oracle public key ----------------------------------------------------
function oraclePubB64() {
  const k = (process.env.TREZO_ORACLE_SECRET_KEY || "").trim();
  if (!k) die("Set TREZO_ORACLE_SECRET_KEY (npm run oracle:keygen)");
  const seed = k.startsWith("ed25519:") ? bs58.decode(k.slice(8)).slice(0, 32) : new Uint8Array(Buffer.from(k, "base64"));
  return Buffer.from(ed25519.getPublicKey(seed)).toString("base64");
}

const toYocto = (near) => {
  const [w, f = ""] = String(near).split(".");
  return BigInt(w || "0") * NEAR + BigInt((f + "0".repeat(24)).slice(0, 24));
};

const provider = new JsonRpcProvider({ url: rpcUrl });
const account = new Account(contractId, provider, KeyPairSigner.fromSecretKey(privateKey));
const catalog = JSON.parse(fs.readFileSync("src/data/catalog.json", "utf8"));
const appUrl = (process.env.TREZO_APP_URL || "").replace(/\/$/, "");
const log = { network: label, contractId, rpcUrl, deployedAt: new Date().toISOString(), transactions: [] };

async function view(method, args = {}) {
  return provider.callFunction({ contractId, method, args });
}

async function send(label, acts) {
  const r = await account.signAndSendTransaction({ receiverId: contractId, actions: acts, waitUntil: "FINAL" });
  const hash = r.transaction?.hash ?? r.transaction_outcome?.id;
  const failed = r.status && typeof r.status === "object" && "Failure" in r.status;
  if (failed) die(`${label} failed: ${JSON.stringify(r.status.Failure)} (tx ${hash})`);
  console.log(`  ✓ ${label}  ${explorer}/txns/${hash}`);
  log.transactions.push({ label, hash, url: `${explorer}/txns/${hash}` });
  return r;
}

const call = (method, args, deposit = 0n, gas = 30n) => actions.functionCall(method, args, gas * TGAS, deposit);

(async () => {
  console.log(`TREZO contract deploy → ${contractId} on ${label} (${rpcUrl})`);
  const acct = await provider.viewAccount({ accountId: contractId }).catch((e) => die(`Account ${contractId} not found: ${e.message}`));
  console.log(`  balance: ${(BigInt(acct.amount) / 10n ** 21n) / 1000n} NEAR`);

  // 1. Deploy code (+ init if needed)
  let initialised = true;
  try {
    await view("get_stats");
  } catch {
    initialised = false;
  }
  const code = new Uint8Array(fs.readFileSync(wasmPath));
  const owner = process.env.TREZO_OWNER_ID || contractId;
  const deleteKeys = process.argv.includes("--delete-keys");
  if (deleteKeys && owner === contractId) die("--delete-keys needs TREZO_OWNER_ID set to a different account, or nobody could ever administer the contract");
  if (!initialised) {
    await send("deploy + init", [actions.deployContract(code), call("new", { owner_id: contractId, oracle_public_key: oraclePubB64() }, 0n, 100n)]);
  } else if (process.argv.includes("--upgrade")) {
    await send("redeploy code (upgrade)", [actions.deployContract(code)]);
  } else {
    console.log("  • already initialised (pass --upgrade to redeploy code)");
    const stats = await view("get_stats");
    if (stats.owner_id !== contractId) {
      console.log(`  • ownership already transferred to ${stats.owner_id}; configuration is up to the owner now`);
      return finish(stats.owner_id);
    }
    if (stats.oracle_public_key !== oraclePubB64()) await send("set_oracle_key", [call("set_oracle_key", { oracle_public_key: oraclePubB64() })]);
  }

  // 2. Item types (NEP-245 token ids)
  const pending = [];
  for (const it of catalog.items) {
    const existing = await view("get_item_type", { token_id: it.id });
    if (existing) continue;
    pending.push(
      call("add_item_type", {
        token_id: it.id,
        name: it.name,
        description: it.description,
        media: appUrl ? `${appUrl}/api/art/${it.id}.svg` : null,
        rarity: it.rarity[0].toUpperCase() + it.rarity.slice(1),
        category: it.category,
        transferable: it.transferable,
        max_supply: String(it.max_supply),
      }),
    );
  }
  for (let i = 0; i < pending.length; i += 8) await send(`add_item_type ×${pending.slice(i, i + 8).length}`, pending.slice(i, i + 8));
  if (!pending.length) console.log("  • item types already configured");

  // 3. NPCs and their on-chain offers / allocations (frozen once locked)
  const locked = !!(await view("get_stats")).economy_locked;
  if (locked) console.log("  • economy is locked: NPCs and offers are frozen");
  else await send(
    "upsert NPCs",
    catalog.npcs.map((n) => call("upsert_npc", { npc_id: n.id, name: n.name, role: n.title, daily_spend_limit: toYocto(n.onchain.daily_spend_limit_near).toString() })),
  );
  const offers = catalog.npc_offers.map((o) =>
    call("set_npc_offer", { npc_id: o.npc_id, token_id: o.token_id, allocation: String(o.allocation), base_price: toYocto(o.base_price_near).toString(), buyback_bps: o.buyback_bps }),
  );
  for (let i = 0; i < offers.length && !locked; i += 8) await send(`set_npc_offer ×${offers.slice(i, i + 8).length}`, offers.slice(i, i + 8));

  // 4. Seed the Merchant's treasury so buybacks work from day one
  const fund = toYocto(process.env.TREZO_FUND_MERCHANT_NEAR ?? "0.5");
  if (fund > 0n) {
    const m = await view("get_npc", { npc_id: "merchant" });
    if (BigInt(m.npc.treasury) < fund) await send(`fund_npc merchant (${process.env.TREZO_FUND_MERCHANT_NEAR ?? "0.5"} NEAR)`, [call("fund_npc", { npc_id: "merchant" }, fund)]);
  }

  // 5. Lock the economy (one-way): no one can change NPC prices/allocations
  //    or the market fee again, so treasuries follow only the contract's rules.
  if (!locked && (process.env.TREZO_LOCK_ECONOMY ?? "1") !== "0") await send("lock_economy (irreversible)", [call("lock_economy", {})]);

  // 6. Hand the contract to its real owner (C-2: owner ≠ contract account)
  if (owner !== contractId) await send(`transfer_ownership → ${owner}`, [call("transfer_ownership", { new_owner_id: owner })]);
  await finish(owner);
})().catch((e) => die(e.message ?? String(e)));

async function finish(owner) {
  // 7. Optional: remove every access key so the contract can never be changed.
  if (process.argv.includes("--delete-keys")) {
    const stats0 = await view("get_stats");
    if (stats0.owner_id === contractId) die("refusing --delete-keys: the contract still owns itself");
    if (!stats0.economy_locked) die("refusing --delete-keys: lock the economy first");
    const { keys } = await provider.viewAccessKeyList({ accountId: contractId, finalityQuery: { finality: "final" } });
    if (keys.length) await send(`delete ${keys.length} access key(s): contract is now immutable`, keys.map((k) => actions.deleteKey(PublicKey.fromString(k.public_key))));
    const after = await provider.viewAccessKeyList({ accountId: contractId, finalityQuery: { finality: "final" } });
    if (after.keys.length) die(`${after.keys.length} key(s) still present`);
    log.keysDeleted = true;
  }
  const stats = await view("get_stats");
  log.stats = stats;
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(`deployments/${label}.json`, JSON.stringify(log, null, 2));
  console.log(`\nDone. ${stats.item_types} item types, owner ${stats.owner_id}, economy ${stats.economy_locked ? "LOCKED" : "unlocked"}.`);
  console.log(`Explorer: ${explorer}/address/${contractId}`);
  console.log(`Saved deployments/${label}.json`);
}
