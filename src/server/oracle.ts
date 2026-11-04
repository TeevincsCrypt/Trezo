import "server-only";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { db, now } from "./db";
import { fail } from "./errors";
import { getPlayer } from "./players";
import { serverEnv } from "./env";
import { viewContract } from "./near";
import { publicConfig } from "@/lib/config";
import { ECONOMY } from "@/lib/rules";

/**
 * The TREZO oracle signs *claim tickets* after the server has validated a
 * claim (proximity, anti-cheat, quest progress…). It holds no NEAR and cannot
 * move funds; the contract only accepts its signature as proof that the game
 * server approved a specific reward for a specific account.
 */
function oracleSeed(): Uint8Array | null {
  const k = serverEnv.oracleSecretKey.trim();
  if (!k) return null;
  if (k.startsWith("ed25519:")) {
    const raw = bs58.decode(k.slice(8));
    if (raw.length !== 64 && raw.length !== 32) throw new Error("TREZO_ORACLE_SECRET_KEY: expected 64-byte ed25519 key");
    return raw.slice(0, 32);
  }
  const raw = Buffer.from(k, "base64");
  if (raw.length !== 32) throw new Error("TREZO_ORACLE_SECRET_KEY: expected base64 32-byte seed");
  return new Uint8Array(raw);
}

export function oracleConfigured() {
  return !!serverEnv.oracleSecretKey && !!publicConfig.contractId;
}

export function oraclePublicKey() {
  const seed = oracleSeed();
  if (!seed) return null;
  const pub = ed25519.getPublicKey(seed);
  return { near: `ed25519:${bs58.encode(pub)}`, base64: Buffer.from(pub).toString("base64") };
}

export function signTicket(ticket: string): string {
  const seed = oracleSeed() ?? fail("oracle_off", "On-chain settlement is not configured on this server.", 503);
  return Buffer.from(ed25519.sign(new TextEncoder().encode(ticket), seed)).toString("base64");
}

interface RewardRow {
  id: string;
  player_id: string;
  kind: "treasure" | "mission" | "quest";
  ref_id: string;
  npc_id: string | null;
  max_claims: number | null;
  demo: number;
  onchain_status: string;
}

/** Build and sign a claim ticket for one of the player's rewards. */
export function issueTicket(playerId: string, rewardId: string) {
  if (!oracleConfigured()) fail("oracle_off", "On-chain settlement is not configured on this server.", 503);
  return db().transaction(() => {
    const p = getPlayer(playerId) ?? fail("not_found", "Player not found", 404);
    if (!p.account_id) fail("wallet_required", "Connect a NEAR wallet to mint rewards on-chain.", 401);
    const r = (db().prepare("SELECT * FROM rewards WHERE id = ? AND player_id = ?").get(rewardId, playerId) as RewardRow | undefined) ?? fail("not_found", "Reward not found", 404);
    if (r.onchain_status === "settled") fail("settled", "This reward is already on-chain.");
    const items = db()
      .prepare("SELECT item_id, SUM(qty) AS qty FROM reward_items WHERE reward_id = ? AND status IN ('vault','minting') GROUP BY item_id")
      .all(r.id) as { item_id: string; qty: number }[];
    if (r.kind !== "treasure" && items.length === 0) fail("nothing", "This reward has no collectibles to mint.");
    const ticket = JSON.stringify({
      id: r.id,
      contract_id: publicConfig.contractId,
      account_id: p.account_id,
      kind: r.kind,
      ref_id: r.ref_id,
      max_claims: r.kind === "treasure" ? r.max_claims : null,
      npc_id: r.kind === "mission" ? r.npc_id : null,
      items: items.map((i) => [i.item_id, String(i.qty)]),
      demo: !!r.demo,
      expires_at_ms: String(now() + ECONOMY.ticketTtlMs),
    });
    const signature = signTicket(ticket);
    db().prepare("UPDATE rewards SET onchain_status = 'ticket_issued' WHERE id = ?").run(r.id);
    db().prepare("UPDATE reward_items SET status = 'minting' WHERE reward_id = ? AND status = 'vault'").run(r.id);
    return { ticket, signature, contractId: publicConfig.contractId, method: "claim", rewardId: r.id };
  })();
}

interface OnchainClaimRecord {
  ticket_id: string;
  account_id: string;
  items: [string, string][];
}

/**
 * Confirm settlement by reading the contract: a reward is only marked
 * on-chain if `get_claim(ticket_id)` returns a record for this player's
 * account. The tx hash is stored for display only; it is never trusted.
 */
export async function settleReward(playerId: string, rewardId: string, txHash: string | null) {
  const p = getPlayer(playerId) ?? fail("not_found", "Player not found", 404);
  if (!p.account_id) fail("wallet_required", "Connect a NEAR wallet first.", 401);
  const r = db().prepare("SELECT * FROM rewards WHERE id = ? AND player_id = ?").get(rewardId, playerId) as RewardRow | undefined;
  if (!r) fail("not_found", "Reward not found", 404);
  if (txHash && !/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash)) fail("bad_tx", "Invalid transaction hash.");
  let record: OnchainClaimRecord | undefined;
  try {
    record = await viewContract<OnchainClaimRecord>("get_claim", { ticket_id: rewardId });
  } catch (e) {
    fail("rpc_error", `Could not reach NEAR RPC to confirm: ${(e as Error).message}`, 502);
  }
  if (!record) fail("not_found_onchain", "The claim is not on-chain yet. If your transaction succeeded, try again in a few seconds.", 409);
  if (record!.account_id !== p.account_id) fail("account_mismatch", "On-chain record belongs to a different account.", 409);
  db().transaction(() => {
    db().prepare("UPDATE rewards SET onchain_status = 'settled', tx_hash = COALESCE(?, tx_hash), settled_at = ? WHERE id = ?").run(txHash, now(), rewardId);
    db().prepare("UPDATE reward_items SET status = 'onchain' WHERE reward_id = ? AND status IN ('vault','minting')").run(rewardId);
  })();
  return { settled: true, record };
}
