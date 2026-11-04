import { z } from "zod";
import { body, handle } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { setTreasureActive, treasureSchema, upsertTreasure } from "@/server/admin";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const actor = await requireAdmin();
  const b = await body(req, treasureSchema);
  return { treasure: upsertTreasure(actor, { ...b, id: (await ctx.params).id }) };
});

export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const actor = await requireAdmin();
  const b = await body(req, z.object({ active: z.boolean() }));
  setTreasureActive(actor, (await ctx.params).id, b.active);
  return { ok: true };
});
