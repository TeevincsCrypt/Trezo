import { handle } from "@/server/api";
import { endSession } from "@/server/auth";

export const POST = handle(async () => {
  await endSession();
  return { ok: true };
});
