import { handle } from "@/server/api";
import { requirePlayer } from "@/server/auth";
import { inventory, rewardsForPlayer } from "@/server/inventory";

export const dynamic = "force-dynamic";
export const GET = handle(async () => {
  const p = await requirePlayer();
  return { inventory: inventory(p.id), rewards: rewardsForPlayer(p.id) };
});
