import { handle } from "@/server/api";
import { currentPlayer } from "@/server/auth";
import { shop } from "@/server/inventory";

export const dynamic = "force-dynamic";
export const GET = handle(async () => ({ items: shop((await currentPlayer())?.id ?? null) }));
