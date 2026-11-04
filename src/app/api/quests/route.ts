import { handle } from "@/server/api";
import { currentPlayer } from "@/server/auth";
import { listQuests } from "@/server/progress";

export const dynamic = "force-dynamic";
export const GET = handle(async () => ({ quests: listQuests((await currentPlayer())?.id ?? null) }));
