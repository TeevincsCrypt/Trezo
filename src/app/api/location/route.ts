import { z } from "zod";
import { body, handle, latLng, limit } from "@/server/api";
import { requirePlayer } from "@/server/auth";
import { recordLocation } from "@/server/game";

export const POST = handle(async (req: Request) => {
  const p = await requirePlayer();
  limit(req, "loc", 60, p.id);
  const b = await body(req, z.object({ pos: latLng, accuracy: z.number().min(0).max(100000).nullable(), demo: z.boolean() }));
  return recordLocation(p.id, b.pos, b.accuracy, b.demo);
});
