import { z } from "zod";
import { body, handle, limit } from "@/server/api";
import { currentPlayer } from "@/server/auth";
import { db } from "@/server/db";

/**
 * Activity feed for the admin dashboard. Clients report the tx hash of a
 * marketplace action they signed; this is display-only bookkeeping. Balances
 * and listings are always read from the contract itself.
 */
export const POST = handle(async (req: Request) => {
  limit(req, "market-ev", 30);
  const p = await currentPlayer();
  const b = await body(req, z.object({ txHash: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/), kind: z.enum(["list", "buy", "cancel", "npc_buy", "npc_sell", "transfer"]), detail: z.record(z.string(), z.unknown()) }));
  db().prepare("INSERT OR IGNORE INTO market_events (tx_hash, player_id, kind, detail, created_at) VALUES (?,?,?,?,?)").run(b.txHash, p?.id ?? null, b.kind, JSON.stringify(b.detail).slice(0, 1000), Date.now());
  return { ok: true };
});
