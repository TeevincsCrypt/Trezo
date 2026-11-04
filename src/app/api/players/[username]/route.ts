import { handle } from "@/server/api";
import { playerProfile } from "@/server/inventory";
import { GameError } from "@/server/errors";

export const dynamic = "force-dynamic";
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ username: string }> }) => {
  const prof = playerProfile(decodeURIComponent((await ctx.params).username));
  if (!prof) throw new GameError("not_found", "Player not found", 404);
  return prof;
});
