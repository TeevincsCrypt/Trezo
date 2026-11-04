import { z } from "zod";
import { body, handle, latLng, limit } from "@/server/api";
import { requirePlayer } from "@/server/auth";
import { claimTreasure } from "@/server/game";
import { getPlayer, selfPlayer } from "@/server/players";
import { oracleConfigured } from "@/server/oracle";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const p = await requirePlayer();
  limit(req, "claim", 12, p.id);
  const { id } = await ctx.params;
  const b = await body(req, z.object({ pos: latLng, accuracy: z.number().min(0).max(100000).nullable(), demo: z.boolean() }));
  const res = claimTreasure({ playerId: p.id, treasureId: id, pos: b.pos, accuracyM: b.accuracy, demo: b.demo });
  return { ...res, player: selfPlayer(getPlayer(p.id)!), onchainAvailable: oracleConfigured() && !!p.account_id };
});
