import { z } from "zod";
import { body, handle, limit } from "@/server/api";
import { createPlayer, selfPlayer } from "@/server/players";
import { startSession } from "@/server/auth";

export const POST = handle(async (req: Request) => {
  limit(req, "guest", 10);
  const b = await body(req, z.object({ username: z.string().min(3).max(20), avatar: z.string().max(20) }));
  const p = createPlayer({ username: b.username, avatar: b.avatar });
  await startSession(p.id);
  return { player: selfPlayer(p) };
});
