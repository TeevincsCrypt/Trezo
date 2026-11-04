"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { RARITY, levelForXp, type Rarity } from "@/lib/rules";
import { chestSvg } from "@/lib/art";
import { ItemImage, Portal, RarityBadge, ShardIcon } from "../ui";
import { MintButton } from "../onchain/MintButton";

export interface RevealData {
  treasure: { id: string; name: string; rarity: Rarity; zone: string };
  reward: { id: string; shards: number; shardsCapped: boolean; xp: number; items: { itemId: string; qty: number }[] };
  levelBefore: number;
  player: { xp: number };
  itemNames: Record<string, string>;
}

/** Premium chest-opening sequence: anticipation → burst → rewards. */
export function RevealModal({ data, onClose }: { data: RevealData | null; onClose: () => void }) {
  const [stage, setStage] = useState<"shake" | "open">("shake");
  useEffect(() => {
    if (!data) return;
    setStage("shake");
    const t = setTimeout(() => setStage("open"), data.treasure.rarity === "legendary" ? 1700 : 1100);
    return () => clearTimeout(t);
  }, [data]);

  const c = data ? RARITY[data.treasure.rarity].color : "#fff";
  const leveled = data ? levelForXp(data.player.xp) > levelForXp(data.levelBefore) : false;

  return (
    <Portal>
    <AnimatePresence>
      {data && (
        <motion.div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-[#05070b]/95 px-4 py-10 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="pointer-events-none absolute left-1/2 top-[30%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: `radial-gradient(circle, ${c}55 0%, transparent 60%)` }} animate={stage === "open" ? { scale: [0.6, 1.25, 1], opacity: [0.4, 1, 0.7] } : { scale: [0.8, 0.9, 0.8], opacity: 0.5 }} transition={{ duration: stage === "open" ? 0.9 : 1.2, repeat: stage === "open" ? 0 : Infinity }} />

          <div className="relative w-full max-w-sm text-center">
            <motion.p className="font-display text-[11px] font-bold uppercase tracking-[0.35em]" style={{ color: c }} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
              {stage === "shake" ? "Unlocking…" : `${RARITY[data.treasure.rarity].label} treasure opened`}
            </motion.p>

            <div className="relative mx-auto mt-4 h-40 w-40">
              {stage === "open" &&
                Array.from({ length: 14 }).map((_, i) => (
                  <motion.span
                    key={i}
                    className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
                    style={{ background: i % 3 === 0 ? "#fff" : c }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{ x: Math.cos((i / 14) * Math.PI * 2) * 140, y: Math.sin((i / 14) * Math.PI * 2) * 140, opacity: 0, scale: 0.4 }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                  />
                ))}
              <motion.div
                className="absolute inset-0 grid place-items-center"
                animate={stage === "shake" ? { rotate: [0, -6, 6, -4, 4, 0], scale: [1, 1.04, 1] } : { scale: [1, 1.25, 0.9], opacity: [1, 1, 0] }}
                transition={stage === "shake" ? { duration: 0.5, repeat: Infinity } : { duration: 0.5 }}
                dangerouslySetInnerHTML={{ __html: chestSvg(data.treasure.rarity).replace('width="48" height="48"', 'width="150" height="150"') }}
              />
              {stage === "open" && (
                <motion.div className="absolute inset-0 grid place-items-center" initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.25, type: "spring", stiffness: 220, damping: 14 }}>
                  {data.reward.items[0] ? <ItemImage id={data.reward.items[0].itemId} size={150} className="drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]" /> : <Sparkles size={88} style={{ color: c }} />}
                </motion.div>
              )}
            </div>

            {stage === "open" && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                <h2 className="font-display mt-2 text-2xl font-bold">{data.treasure.name}</h2>
                <div className="mt-2 flex justify-center">
                  <RarityBadge rarity={data.treasure.rarity} size="lg" />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-2.5">
                  <motion.div className="card p-3" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.6 }}>
                    <div className="flex items-center justify-center gap-1.5 font-display text-2xl font-bold">
                      <ShardIcon size={20} />+{data.reward.shards}
                    </div>
                    <p className="text-[11px] text-muted">{data.reward.shardsCapped ? "Shards (daily cap hit)" : "Shards"}</p>
                  </motion.div>
                  <motion.div className="card p-3" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.7 }}>
                    <div className="font-display text-2xl font-bold text-gold">+{data.reward.xp}</div>
                    <p className="text-[11px] text-muted">XP</p>
                  </motion.div>
                </div>

                {data.reward.items.map((it) => (
                  <motion.div key={it.itemId} className="card mt-2.5 flex items-center gap-3 p-3 text-left" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 }}>
                    <ItemImage id={it.itemId} size={44} className="rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{data.itemNames[it.itemId] ?? it.itemId}</p>
                      <p className="text-[12px] text-muted">Collectible ×{it.qty} · added to your vault</p>
                    </div>
                  </motion.div>
                ))}

                {leveled && (
                  <motion.div className="mt-2.5 rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm font-semibold text-gold" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.9 }}>
                    Level up! You reached level {levelForXp(data.player.xp)}.
                  </motion.div>
                )}

                <div className="mt-4 text-left">
                  {data.treasure.zone === "demo" && <p className="mb-2 text-center text-[11px] text-legendary">Demo-zone claim (simulated location). If minted, it is flagged demo:true on-chain.</p>}
                  <MintButton rewardId={data.reward.id} status="none" />
                </div>

                <button className="btn btn-primary mt-3 w-full py-3.5" onClick={onClose}>
                  Keep exploring
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </Portal>
  );
}
