import { handle } from "@/server/api";
import { currentPlayer } from "@/server/auth";
import { leaderboard, rankOf, type BoardCategory } from "@/server/inventory";

export const dynamic = "force-dynamic";
const CATS: BoardCategory[] = ["xp", "treasures", "quests", "rare", "weekly"];

export const GET = handle(async (req: Request) => {
  const c = new URL(req.url).searchParams.get("category") as BoardCategory;
  const category = CATS.includes(c) ? c : "xp";
  const p = await currentPlayer();
  return { category, entries: leaderboard(category), myRank: p ? rankOf(p.id, category) : null };
});
