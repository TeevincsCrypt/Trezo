import { handle } from "@/server/api";
import { currentPlayer } from "@/server/auth";
import { listNpcs } from "@/server/progress";

export const dynamic = "force-dynamic";
export const GET = handle(async () => ({ npcs: listNpcs((await currentPlayer())?.id ?? null) }));
