import { z } from "zod";
import { body, handle, limit } from "@/server/api";
import { requirePlayer } from "@/server/auth";
import { submitDepositTx, swapStatus } from "@/server/intents";

type Ctx = { params: Promise<{ address: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const p = await requirePlayer();
  limit(req, "intents-status", 30, p.id);
  return { swap: await swapStatus(p.id, decodeURIComponent((await ctx.params).address)) };
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const p = await requirePlayer();
  limit(req, "intents-submit", 10, p.id);
  const { txHash } = await body(req, z.object({ txHash: z.string().min(10).max(140) }));
  return { swap: await submitDepositTx(p.id, decodeURIComponent((await ctx.params).address), txHash) };
});
