import { handle } from "@/server/api";
import { adminLogout } from "@/server/auth";

export const POST = handle(async () => {
  await adminLogout();
  return { ok: true };
});
