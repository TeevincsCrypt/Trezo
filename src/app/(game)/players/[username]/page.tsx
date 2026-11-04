"use client";
import Link from "next/link";
import { use } from "react";
import { ArrowLeft, UserX } from "lucide-react";
import type { InventoryEntry } from "@/server/inventory";
import type { PublicPlayer } from "@/server/players";
import { useApi } from "@/components/hooks";
import { Achievements, CollectionStrip, ProfileHeader, type Achievement } from "@/components/profile/ProfileView";
import { Empty, RarityBadge } from "@/components/ui";
import type { Rarity } from "@/lib/rules";

interface Prof {
  player: PublicPlayer;
  collection: InventoryEntry[];
  achievements: Achievement[];
  recent: { title: string; rarity: string | null; kind: string; createdAt: number; onchain: boolean; demo: boolean }[];
}

export default function PlayerPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { data, error, loading } = useApi<Prof>(`/api/players/${encodeURIComponent(username)}`);
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pb-8">
      <Link href="/leaderboard" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Leaderboard
      </Link>
      {loading && !data ? (
        <div className="skeleton h-56" />
      ) : error || !data ? (
        <Empty icon={<UserX />} title="Explorer not found" />
      ) : (
        <>
          <ProfileHeader player={data.player} />
          <section>
            <h2 className="mb-2 font-display text-lg font-semibold">Collection</h2>
            <CollectionStrip items={data.collection} />
          </section>
          <section>
            <h2 className="mb-2 font-display text-lg font-semibold">Achievements</h2>
            <Achievements list={data.achievements} />
          </section>
          {data.recent.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-lg font-semibold">Recent activity</h2>
              <div className="space-y-1.5">
                {data.recent.map((r, i) => (
                  <div key={i} className="card flex items-center justify-between gap-2 p-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      {r.rarity && <RarityBadge rarity={r.rarity as Rarity} />}
                      <span className="truncate">{r.title}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-muted">
                      {r.onchain && <span className="mr-2 text-teal">on NEAR</span>}
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
