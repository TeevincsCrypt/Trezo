import { body, handle } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { questSchema, upsertQuest } from "@/server/admin";

export const POST = handle(async (req: Request) => {
  const actor = await requireAdmin();
  upsertQuest(actor, await body(req, questSchema));
  return { ok: true };
});
