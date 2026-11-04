import { body, handle } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { treasureSchema, upsertTreasure } from "@/server/admin";

export const POST = handle(async (req: Request) => {
  const actor = await requireAdmin();
  return { treasure: upsertTreasure(actor, await body(req, treasureSchema)) };
});
