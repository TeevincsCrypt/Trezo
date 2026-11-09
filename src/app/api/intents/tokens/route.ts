import { handle, limit } from "@/server/api";
import { intentsEnabled, listTokens } from "@/server/intents";

export const GET = handle(async (req: Request) => {
  if (!intentsEnabled()) return { enabled: false, tokens: [] };
  limit(req, "intents-tokens", 30);
  return { enabled: true, tokens: await listTokens() };
});
