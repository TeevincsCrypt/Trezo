import { z } from "zod";
import { body, handle, limit } from "@/server/api";
import { requirePlayer } from "@/server/auth";
import { selfPlayer, updateProfile } from "@/server/players";

export const PATCH = handle(async (req: Request) => {
  limit(req, "profile", 20);
  const p = await requirePlayer();
  const b = await body(req, z.object({ username: z.string().max(20).optional(), avatar: z.string().max(20).optional(), frame: z.string().max(20).nullable().optional() }));
  return { player: selfPlayer(updateProfile(p.id, b)) };
});
