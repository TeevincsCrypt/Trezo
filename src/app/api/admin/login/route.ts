import { z } from "zod";
import { body, handle, limit } from "@/server/api";
import { adminLogin } from "@/server/auth";

export const POST = handle(async (req: Request) => {
  limit(req, "admin-login", 5);
  const b = await body(req, z.object({ token: z.string().min(1).max(200) }));
  await adminLogin(b.token);
  return { ok: true };
});
