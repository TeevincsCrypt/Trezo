import { handle, limit } from "@/server/api";
import { requirePlayer } from "@/server/auth";
import { claimQuest } from "@/server/progress";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const p = await requirePlayer();
  limit(req, "quest", 30, p.id);
  return claimQuest(p.id, (await ctx.params).id);
});
