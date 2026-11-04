import { itemType } from "@/server/inventory";
import { itemSvg } from "@/lib/art";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = (await ctx.params).id.replace(/\.svg$/, "");
  const it = itemType(id);
  if (!it) return new Response("Not found", { status: 404 });
  return new Response(itemSvg(it.art, it.rarity), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" },
  });
}
