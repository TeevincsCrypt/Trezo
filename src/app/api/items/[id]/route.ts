import { handle } from "@/server/api";
import { itemType, itemTypeView } from "@/server/inventory";
import { GameError } from "@/server/errors";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const it = itemType((await ctx.params).id);
  if (!it) throw new GameError("not_found", "Item not found", 404);
  return { item: itemTypeView(it) };
});
