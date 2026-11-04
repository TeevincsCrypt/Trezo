import { handle, limit } from "@/server/api";
import { currentPlayer } from "@/server/auth";
import { nearbyTreasures } from "@/server/game";
import { ensureSpawnField } from "@/server/spawn";
import { db } from "@/server/db";
import { GameError } from "@/server/errors";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  limit(req, "treasures", 120);
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat"));
  const lng = Number(u.searchParams.get("lng"));
  const zone = u.searchParams.get("mode") === "demo" ? "demo" : "world";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new GameError("bad_location", "lat/lng required");
  const p = await currentPlayer();
  // Guests exploring without a profile still see the local field.
  if (zone === "world") ensureSpawnField(db(), { lat, lng });
  return { treasures: nearbyTreasures(p?.id ?? null, { lat, lng }, zone) };
});
