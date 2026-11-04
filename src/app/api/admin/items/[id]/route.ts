import { body, handle } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { itemPatchSchema, patchItem } from "@/server/admin";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const actor = await requireAdmin();
  patchItem(actor, (await ctx.params).id, await body(req, itemPatchSchema));
  return { ok: true };
});
