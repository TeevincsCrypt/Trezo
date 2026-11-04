import { z } from "zod";
import { body, handle, limit } from "@/server/api";
import { requirePlayer } from "@/server/auth";
import { settleReward } from "@/server/oracle";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const p = await requirePlayer();
  limit(req, "settle", 30, p.id);
  const b = await body(req, z.object({ txHash: z.string().max(64).nullable() }));
  return settleReward(p.id, (await ctx.params).id, b.txHash);
});
