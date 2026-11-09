import "server-only";
/**
 * NEAR Intents (1Click Swap API) — "Add NEAR from any chain".
 *
 * A signed-in wallet player picks a token on another chain (USDC on Base,
 * ETH, BTC, SOL, ...). 1Click returns a one-time deposit address on that
 * chain; once the player sends the quoted amount, NEAR Intents solvers swap
 * it and deliver NEAR to the player's own NEAR account. TREZO never holds the
 * funds: the recipient is always the session's linked account (never taken
 * from the client), and refunds go to the player's own origin-chain address.
 *
 * Mainnet only (1Click has no testnet). API reference: the official
 * `@defuse-protocol/one-click-sdk-typescript` (base https://1click.chaindefuser.com).
 */
import { db, now } from "./db";
import { fail } from "./errors";
import { getPlayer } from "./players";
import { publicConfig } from "@/lib/config";

export const ONECLICK_BASE = process.env.TREZO_ONECLICK_URL || "https://1click.chaindefuser.com";
/** NEAR as a NEP-141 asset inside Intents; withdrawn to the player's NEAR account. */
export const DEST_ASSET = "nep141:wrap.near";
const SLIPPAGE_BPS = 100; // 1%
const DEADLINE_MS = 60 * 60 * 1000;
const POPULAR = new Set(["USDC", "USDT", "ETH", "BTC", "SOL", "BNB", "ZEC", "DOGE", "XRP"]);
const FINAL = new Set(["SUCCESS", "REFUNDED", "FAILED"]);

export interface IntentToken {
  assetId: string;
  symbol: string;
  blockchain: string;
  decimals: number;
  price: number;
}

export function intentsEnabled() {
  return publicConfig.network === "mainnet";
}

async function oneClick<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  // Optional partner JWT (removes the unauthenticated-request fee). Server-side only.
  if (process.env.TREZO_ONECLICK_JWT) headers.Authorization = `Bearer ${process.env.TREZO_ONECLICK_JWT}`;
  let res: Response;
  try {
    res = await fetch(`${ONECLICK_BASE}${path}`, { ...init, headers, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    fail("intents_unreachable", `NEAR Intents is unreachable right now (${(e as Error).message}).`, 502);
  }
  const text = await res!.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res!.ok) {
    const msg = (json as { message?: string } | null)?.message ?? text.slice(0, 200) ?? res!.statusText;
    fail("intents_error", `NEAR Intents: ${msg}`, res!.status === 400 ? 400 : 502);
  }
  return json as T;
}

let tokenCache: { at: number; tokens: IntentToken[] } | null = null;

/** Popular origin tokens on other chains, cached for 10 minutes. */
export async function listTokens(): Promise<IntentToken[]> {
  if (!intentsEnabled()) fail("mainnet_only", "Paying with other chains via NEAR Intents is available on mainnet only.", 400);
  if (tokenCache && Date.now() - tokenCache.at < 10 * 60_000) return tokenCache.tokens;
  const all = await oneClick<IntentToken[]>("/v0/tokens");
  const tokens = (Array.isArray(all) ? all : [])
    .filter((t) => t.blockchain !== "near" && POPULAR.has(t.symbol.toUpperCase()) && typeof t.decimals === "number")
    .map(({ assetId, symbol, blockchain, decimals, price }) => ({ assetId, symbol, blockchain, decimals, price }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol) || a.blockchain.localeCompare(b.blockchain));
  tokenCache = { at: Date.now(), tokens };
  return tokens;
}

/** "12.5" with 6 decimals → "12500000". Rejects anything that isn't a plain positive decimal. */
export function toUnits(amount: string, decimals: number): string {
  const s = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) fail("bad_amount", "Enter a positive amount like 10 or 0.5.");
  const [w, f = ""] = s.split(".");
  if (f.length > decimals) fail("bad_amount", `At most ${decimals} decimal places for this token.`);
  const units = BigInt(w) * 10n ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (units <= 0n) fail("bad_amount", "Amount must be greater than zero.");
  return units.toString();
}

interface QuoteResponse {
  timestamp: string;
  signature: string;
  quote: {
    depositAddress?: string;
    depositMemo?: string;
    amountIn: string;
    amountInFormatted: string;
    amountInUsd: string;
    amountOut: string;
    amountOutFormatted: string;
    amountOutUsd: string;
    minAmountOut: string;
    deadline?: string;
    timeEstimate: number;
  };
}

export interface SwapView {
  depositAddress: string;
  depositMemo: string | null;
  originAsset: string;
  symbol: string;
  blockchain: string;
  amountIn: string;
  amountOut: string;
  amountOutUsd: string | null;
  deadline: string | null;
  timeEstimate: number | null;
  status: string;
  recipient: string;
  createdAt: number;
  destinationTxs?: { hash: string; explorerUrl: string }[];
  refundReason?: string | null;
}

/**
 * Real (non-dry) EXACT_INPUT quote: `amount` of `originAsset` → NEAR delivered
 * to the player's linked NEAR account.
 */
export async function createSwap(playerId: string, input: { originAsset: string; amount: string; refundTo: string; dry?: boolean }): Promise<SwapView> {
  const p = getPlayer(playerId) ?? fail("not_found", "Player not found", 404);
  if (!p.account_id) fail("wallet_required", "Connect your NEAR wallet first: that's where the NEAR is delivered.", 401);
  const token = (await listTokens()).find((t) => t.assetId === input.originAsset) ?? fail("bad_token", "Unsupported token.");
  const refundTo = input.refundTo.trim();
  if (refundTo.length < 20 || refundTo.length > 128 || /\s/.test(refundTo)) fail("bad_refund", `Enter your ${token.symbol} address on ${token.blockchain.toUpperCase()} for refunds.`);
  const body = {
    dry: !!input.dry,
    swapType: "EXACT_INPUT",
    slippageTolerance: SLIPPAGE_BPS,
    originAsset: token.assetId,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: DEST_ASSET,
    amount: toUnits(input.amount, token.decimals),
    refundTo,
    refundType: "ORIGIN_CHAIN",
    recipient: p.account_id, // never from the client
    recipientType: "DESTINATION_CHAIN",
    deadline: new Date(Date.now() + DEADLINE_MS).toISOString(),
    referral: "trezo",
    quoteWaitingTimeMs: 3000,
  };
  const r = await oneClick<QuoteResponse>("/v0/quote", { method: "POST", body: JSON.stringify(body) });
  const view: SwapView = {
    depositAddress: r.quote.depositAddress ?? "",
    depositMemo: r.quote.depositMemo ?? null,
    originAsset: token.assetId,
    symbol: token.symbol,
    blockchain: token.blockchain,
    amountIn: r.quote.amountInFormatted,
    amountOut: r.quote.amountOutFormatted,
    amountOutUsd: r.quote.amountOutUsd ?? null,
    deadline: r.quote.deadline ?? null,
    timeEstimate: r.quote.timeEstimate ?? null,
    status: input.dry ? "QUOTE" : "PENDING_DEPOSIT",
    recipient: p.account_id!,
    createdAt: now(),
  };
  if (!input.dry) {
    if (!view.depositAddress) fail("intents_error", "NEAR Intents did not return a deposit address.", 502);
    // Keep the full signed quote: 1Click asks integrators to store it for disputes.
    db()
      .prepare(
        `INSERT OR REPLACE INTO intent_swaps (deposit_address, deposit_memo, player_id, account_id, origin_asset, amount_in, amount_out, status, quote_json, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(view.depositAddress, view.depositMemo ?? "", p.id, p.account_id, token.assetId, view.amountIn, view.amountOut, view.status, JSON.stringify(r), view.createdAt, view.createdAt);
  }
  return view;
}

interface SwapRow {
  deposit_address: string;
  deposit_memo: string;
  player_id: string;
  account_id: string;
  origin_asset: string;
  amount_in: string;
  amount_out: string;
  status: string;
  quote_json: string;
  created_at: number;
}

function rowToView(r: SwapRow): SwapView {
  const q = JSON.parse(r.quote_json) as QuoteResponse;
  const [, rest = ""] = r.origin_asset.split(":");
  return {
    depositAddress: r.deposit_address,
    depositMemo: r.deposit_memo || null,
    originAsset: r.origin_asset,
    symbol: tokenCache?.tokens.find((t) => t.assetId === r.origin_asset)?.symbol ?? rest.split(".")[0].toUpperCase(),
    blockchain: tokenCache?.tokens.find((t) => t.assetId === r.origin_asset)?.blockchain ?? "",
    amountIn: r.amount_in,
    amountOut: r.amount_out,
    amountOutUsd: q.quote.amountOutUsd ?? null,
    deadline: q.quote.deadline ?? null,
    timeEstimate: q.quote.timeEstimate ?? null,
    status: r.status,
    recipient: r.account_id,
    createdAt: r.created_at,
  };
}

function ownSwap(playerId: string, depositAddress: string): SwapRow {
  const r = db().prepare("SELECT * FROM intent_swaps WHERE deposit_address = ? AND player_id = ?").get(depositAddress, playerId) as SwapRow | undefined;
  return r ?? fail("not_found", "Swap not found.", 404);
}

export function listSwaps(playerId: string): SwapView[] {
  const rows = db().prepare("SELECT * FROM intent_swaps WHERE player_id = ? ORDER BY created_at DESC LIMIT 10").all(playerId) as SwapRow[];
  return rows.map(rowToView);
}

interface StatusResponse {
  status: string;
  swapDetails?: {
    destinationChainTxHashes?: { hash: string; explorerUrl: string }[];
    amountOutFormatted?: string;
    refundReason?: string;
  };
}

/** Live status from 1Click for one of the player's own swaps. */
export async function swapStatus(playerId: string, depositAddress: string): Promise<SwapView> {
  const row = ownSwap(playerId, depositAddress);
  const view = rowToView(row);
  if (FINAL.has(row.status)) return view;
  const qs = new URLSearchParams({ depositAddress });
  if (row.deposit_memo) qs.set("depositMemo", row.deposit_memo);
  const s = await oneClick<StatusResponse>(`/v0/status?${qs}`);
  const amountOut = s.swapDetails?.amountOutFormatted || row.amount_out;
  db().prepare("UPDATE intent_swaps SET status = ?, amount_out = ?, updated_at = ? WHERE deposit_address = ? AND deposit_memo = ?").run(s.status, amountOut, now(), row.deposit_address, row.deposit_memo);
  return { ...view, status: s.status, amountOut, destinationTxs: s.swapDetails?.destinationChainTxHashes ?? [], refundReason: s.swapDetails?.refundReason ?? null };
}

/** Optional: tell 1Click the deposit tx hash so it picks the deposit up faster. */
export async function submitDepositTx(playerId: string, depositAddress: string, txHash: string) {
  const row = ownSwap(playerId, depositAddress);
  const tx = txHash.trim();
  if (!/^[A-Za-z0-9]{20,128}$/.test(tx.replace(/^0x/, ""))) fail("bad_tx", "That doesn't look like a transaction hash.");
  await oneClick("/v0/deposit/submit", { method: "POST", body: JSON.stringify({ txHash: tx, depositAddress, ...(row.deposit_memo ? { memo: row.deposit_memo } : {}) }) });
  return swapStatus(playerId, depositAddress);
}
