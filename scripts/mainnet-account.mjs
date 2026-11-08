#!/usr/bin/env node
/**
 * Creates the TREZO contract account from a one-time funding address.
 *
 *   node scripts/mainnet-account.mjs funder
 *       Generates a fresh key and prints its implicit account id (64 hex chars).
 *       Send NEAR to that address from any wallet or exchange; the transfer
 *       creates the account.
 *
 *   node scripts/mainnet-account.mjs create <name>.near <near-amount>
 *       Uses the funder to register <name>.near (via the `near` registrar's
 *       create_account) with a NEW key, sending it <near-amount> NEAR.
 *
 *   node scripts/mainnet-account.mjs close <funder-id> <beneficiary>
 *       Deletes the funder account and sends everything left to <beneficiary>.
 *
 * Network comes from NEXT_PUBLIC_NEAR_NETWORK (testnet registrar: `testnet`,
 * mainnet: `near`). Keys are written to ~/.near-credentials/<network>/ with
 * mode 600 and are never printed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions } from "near-api-js";

const network = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
const rpcUrl = process.env.NEAR_RPC_URL || (network === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");
const registrar = network === "mainnet" ? "near" : "testnet";
const explorer = network === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";
const NEAR = 10n ** 24n;
const TGAS = 10n ** 12n;
const provider = new JsonRpcProvider({ url: rpcUrl });
const dir = path.join(os.homedir(), ".near-credentials", network);

const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};
const toYocto = (near) => {
  const [w, f = ""] = String(near).split(".");
  return BigInt(w || "0") * NEAR + BigInt((f + "0".repeat(24)).slice(0, 24));
};
const fmt = (y) => (Number(BigInt(y) / 10n ** 20n) / 1e4).toFixed(4);

function saveKey(accountId, kp) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${accountId}.json`);
  if (fs.existsSync(file)) die(`${file} already exists; refusing to overwrite a key`);
  fs.writeFileSync(file, JSON.stringify({ account_id: accountId, public_key: kp.getPublicKey().toString(), private_key: kp.toString() }), { mode: 0o600 });
  return file;
}
function loadAccount(accountId) {
  const file = path.join(dir, `${accountId}.json`);
  if (!fs.existsSync(file)) die(`No key for ${accountId} in ${dir}`);
  return new Account(accountId, provider, KeyPairSigner.fromSecretKey(JSON.parse(fs.readFileSync(file, "utf8")).private_key));
}
function latestFunder() {
  const f = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /^[0-9a-f]{64}\.json$/.test(n)) : [];
  if (!f.length) die("No funder yet. Run: node scripts/mainnet-account.mjs funder");
  return f.map((n) => [n, fs.statSync(path.join(dir, n)).mtimeMs]).sort((a, b) => b[1] - a[1])[0][0].replace(".json", "");
}
async function balance(id) {
  try {
    return BigInt((await provider.viewAccount({ accountId: id })).amount);
  } catch {
    return null;
  }
}
function failure(r) {
  return r.status && typeof r.status === "object" && "Failure" in r.status ? JSON.stringify(r.status.Failure) : null;
}

const [cmd, a1, a2] = process.argv.slice(2);

if (cmd === "funder") {
  const kp = KeyPair.fromRandom("ed25519");
  const id = Buffer.from(kp.getPublicKey().data).toString("hex");
  saveKey(id, kp);
  console.log(`Funding address (${network}):\n\n  ${id}\n\nSend NEAR to it, then run: node scripts/mainnet-account.mjs create <name>.${registrar} <amount>`);
} else if (cmd === "status") {
  const id = a1 || latestFunder();
  const b = await balance(id);
  console.log(b === null ? `${id}: not created yet (no NEAR received)` : `${id}: ${fmt(b)} NEAR`);
} else if (cmd === "create") {
  const name = a1;
  if (!name || !name.endsWith(`.${registrar}`) || name.split(".").length !== 2) die(`Usage: create <name>.${registrar} <near-amount>`);
  if (!/^[a-z0-9]+([-_][a-z0-9]+)*$/.test(name.split(".")[0])) die("Invalid account name");
  const amount = toYocto(a2 || "0");
  if (amount < toYocto("0.1")) die("Send at least 0.1 NEAR to the new account");
  if ((await balance(name)) !== null) die(`${name} already exists`);
  const funderId = latestFunder();
  const fb = await balance(funderId);
  if (fb === null) die(`Funder ${funderId} has not received NEAR yet`);
  if (fb < amount + toYocto("0.01")) die(`Funder has ${fmt(fb)} NEAR; need ${fmt(amount)} + fees`);
  const kp = KeyPair.fromRandom("ed25519");
  const file = saveKey(name, kp);
  const funder = loadAccount(funderId);
  const r = await funder.signAndSendTransaction({
    receiverId: registrar,
    actions: [actions.functionCall("create_account", { new_account_id: name, new_public_key: kp.getPublicKey().toString() }, 50n * TGAS, amount)],
    waitUntil: "FINAL",
  });
  const hash = r.transaction?.hash ?? r.transaction_outcome?.id;
  const fail = failure(r);
  // The registrar returns false (and refunds) when the name is taken.
  const created = (await balance(name)) !== null;
  if (fail || !created) {
    fs.rmSync(file);
    die(`create_account failed (${fail ?? "name unavailable"}) ${explorer}/txns/${hash}`);
  }
  console.log(`✓ created ${name} with ${fmt(amount)} NEAR  ${explorer}/txns/${hash}\n  key saved to ${file}`);
} else if (cmd === "close") {
  const funderId = a1;
  const beneficiary = a2;
  if (!funderId || !beneficiary) die("Usage: close <funder-id> <beneficiary>");
  if ((await balance(beneficiary)) === null) die(`${beneficiary} does not exist`);
  const r = await loadAccount(funderId).signAndSendTransaction({ receiverId: funderId, actions: [actions.deleteAccount(beneficiary)], waitUntil: "FINAL" });
  const hash = r.transaction?.hash ?? r.transaction_outcome?.id;
  if (failure(r)) die(`close failed: ${failure(r)}`);
  console.log(`✓ closed ${funderId}; remaining NEAR sent to ${beneficiary}  ${explorer}/txns/${hash}`);
} else {
  console.log("Usage: funder | status [id] | create <name> <near> | close <funder-id> <beneficiary>");
}
