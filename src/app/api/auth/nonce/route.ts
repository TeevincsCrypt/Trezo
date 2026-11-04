import { handle, limit } from "@/server/api";
import { createNonce } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  limit(req, "nonce", 20);
  return createNonce();
});
