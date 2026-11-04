import { body, handle } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { missionSchema, upsertMission } from "@/server/admin";

export const POST = handle(async (req: Request) => {
  const actor = await requireAdmin();
  upsertMission(actor, await body(req, missionSchema));
  return { ok: true };
});
