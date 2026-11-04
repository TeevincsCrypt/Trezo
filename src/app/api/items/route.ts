import { handle } from "@/server/api";
import { itemTypes, itemTypeView } from "@/server/inventory";

export const dynamic = "force-dynamic";
export const GET = handle(async () => ({ items: itemTypes().map(itemTypeView) }));
