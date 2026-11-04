import { handle } from "@/server/api";
import { requireAdmin } from "@/server/auth";
import { overview } from "@/server/admin";

export const dynamic = "force-dynamic";
export const GET = handle(async () => {
  await requireAdmin();
  return overview();
});
