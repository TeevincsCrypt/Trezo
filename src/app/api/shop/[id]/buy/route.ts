import { handle, limit } from "@/server/api";
import { requirePlayer } from "@/server/auth";
import { buyShopItem } from "@/server/inventory";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const p = await requirePlayer();
  limit(req, "shop", 20, p.id);
  return buyShopItem(p.id, (await ctx.params).id);
});
