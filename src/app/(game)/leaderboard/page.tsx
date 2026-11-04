"use client";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Crown, Trophy } from "lucide-react";
import { useApi } from "@/components/hooks";
import { useGame } from "@/components/providers/GameProvider";
import { Avatar, Empty, PageHeader, cx } from "@/components/ui";
import type { PublicPlayer } from "@/server/players";

type Cat = "xp" | "treasures" | "quests" | "rare" | "weekly";
const CATS: { value: Cat; label: string; unit: string }[] = [
  { value: "xp", label: "XP", unit: "XP" },
  { value: "treasures", label: "Treasures", unit: "found" },
  { value: "rare", label: "Rare finds", unit: "rare+" },
  { value: "quests", label: "Quests", unit: "done" },
  { value: "weekly", label: "This week", unit: "finds" },
];

interface Entry {
  rank: number;
  score: number;
  player: PublicPlayer;
}

const MEDAL = ["#FFB547", "#C9D4E0", "#D08B5B"];

export default function LeaderboardPage() {
  const [cat, setCat] = useState<Cat>("xp");
  const { me } = useGame();
  const { data, loading } = useApi<{ entries: Entry[]; myRank: number | null }>(`/api/leaderboard?category=${cat}`, [me?.id]);
  const unit = CATS.find((c) => c.value === cat)!.unit;
  const top = data?.entries.slice(0, 3) ?? [];
  const rest = data?.entries.slice(3) ?? [];
  const hasSamples = data?.entries.some((e) => e.player.isSample);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Leaderboard" subtitle={cat === "weekly" ? "Treasures found in the last 7 days." : "All-time rankings."} right={data?.myRank ? <span className="chip border-gold/40 text-gold">You: #{data.myRank}</span> : null} />
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4">
        {CATS.map((c) => (
          <button key={c.value} onClick={() => setCat(c.value)} className={cx("chip shrink-0 px-3.5 py-1.5 text-[12.5px]", cat === c.value && "border-gold/50 bg-gold/10 text-gold")}>
            {c.label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="space-y-2 px-4 pt-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-16" />)}</div>
      ) : !data || data.entries.length === 0 ? (
        <Empty icon={<Trophy />} title="No rankings yet" body="Be the first to open a treasure." />
      ) : (
        <>
          {/* Podium */}
          <div className="mt-6 grid grid-cols-3 items-end gap-2 px-4">
            {[1, 0, 2].map((i) => {
              const e = top[i];
              if (!e) return <div key={i} />;
              const h = [128, 100, 84][i];
              return (
                <Link href={`/players/${e.player.username}`} key={e.player.id} className="flex flex-col items-center">
                  {i === 0 && <Crown size={22} className="mb-1 text-legendary" />}
                  <Avatar avatar={e.player.avatar} frame={e.player.frame} size={i === 0 ? 64 : 52} />
                  <p className="mt-2 max-w-full truncate text-[13px] font-semibold">{e.player.username}</p>
                  <p className="text-[11px] text-muted">
                    {e.score.toLocaleString()} {unit}
                  </p>
                  <motion.div initial={{ height: 0 }} animate={{ height: h }} transition={{ delay: 0.1 * i, type: "spring", stiffness: 120 }} className="mt-2 grid w-full place-items-start justify-center overflow-hidden rounded-t-2xl pt-2 font-display text-2xl font-bold" style={{ background: `linear-gradient(180deg, ${MEDAL[i]}33, transparent)`, color: MEDAL[i], borderTop: `2px solid ${MEDAL[i]}` }}>
                    {i + 1}
                  </motion.div>
                </Link>
              );
            })}
          </div>

          <div className="mt-2 space-y-1.5 px-4 pb-6">
            {rest.map((e, idx) => {
              const isMe = e.player.id === me?.id;
              return (
                <motion.div key={e.player.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(idx, 12) * 0.025 }}>
                  <Link href={`/players/${e.player.username}`} className={cx("card flex items-center gap-3 p-2.5 pr-4", isMe && "border-gold/50 bg-gold/[0.06]")}>
                    <span className="w-8 text-center font-display font-bold tabular text-muted">{e.rank}</span>
                    <Avatar avatar={e.player.avatar} frame={e.player.frame} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-semibold">
                        {e.player.username} {isMe && <span className="text-[11px] text-gold">(you)</span>}
                        {e.player.isSample && <span className="rounded bg-white/5 px-1 text-[9px] font-semibold uppercase text-faint">sample</span>}
                      </p>
                      <p className="text-[12px] text-muted">Level {e.player.level}</p>
                    </div>
                    <p className="font-display font-bold tabular">{e.score.toLocaleString()}</p>
                  </Link>
                </motion.div>
              );
            })}
            {hasSamples && <p className="pt-3 text-center text-[11px] text-faint">Players tagged “sample” are seeded demo profiles, clearly separated from real activity.</p>}
          </div>
        </>
      )}
    </div>
  );
}
