import { z } from "zod";
import { body, handle, limit } from "@/server/api";
import { currentPlayer, startSession, verifyWalletLogin } from "@/server/auth";
import { selfPlayer } from "@/server/players";

export const POST = handle(async (req: Request) => {
  limit(req, "verify", 10);
  const b = await body(
    req,
    z.object({ accountId: z.string().min(2).max(64), publicKey: z.string().max(128), signature: z.string().max(256), nonce: z.string().max(64) }),
  );
  const cur = await currentPlayer();
  const p = await verifyWalletLogin(b, cur?.id ?? null);
  await startSession(p.id);
  return { player: selfPlayer(p) };
});
