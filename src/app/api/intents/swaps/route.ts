import { z } from "zod";
import { body, handle, limit } from "@/server/api";
import { requirePlayer } from "@/server/auth";
import { createSwap, listSwaps } from "@/server/intents";

export const GET = handle(async () => {
  const p = await requirePlayer();
  return { swaps: listSwaps(p.id) };
});

const Create = z.object({
  originAsset: z.string().min(3).max(200),
  amount: z.string().min(1).max(40),
  refundTo: z.string().min(1).max(128),
  dry: z.boolean().optional(),
});

export const POST = handle(async (req: Request) => {
  const p = await requirePlayer();
  const input = await body(req, Create);
  limit(req, input.dry ? "intents-preview" : "intents-quote", input.dry ? 30 : 6, p.id);
  return { swap: await createSwap(p.id, input) };
});
