import { handle } from "@/server/api";
import { currentPlayer, isAdmin } from "@/server/auth";
import { selfPlayer } from "@/server/players";
import { rankOf } from "@/server/inventory";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const p = await currentPlayer();
  const admin = await isAdmin();
  return { player: p ? { ...selfPlayer(p), rank: rankOf(p.id, "xp") } : null, isAdmin: admin.ok };
});
