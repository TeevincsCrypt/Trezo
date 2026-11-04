import { handle, limit } from "@/server/api";
import { requirePlayer } from "@/server/auth";
import { issueTicket } from "@/server/oracle";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const p = await requirePlayer();
  limit(req, "ticket", 20, p.id);
  return issueTicket(p.id, (await ctx.params).id);
});
