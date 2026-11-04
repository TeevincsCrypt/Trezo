"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Package, Store, Wallet } from "lucide-react";
import type { InventoryEntry, RewardView } from "@/server/inventory";
import { useApi, useItems } from "@/components/hooks";
import { useGame } from "@/components/providers/GameProvider";
import { useWallet } from "@/components/providers/WalletProvider";
import { useOnchainHoldings } from "@/components/onchain/useOnchainHoldings";
import { MintButton } from "@/components/onchain/MintButton";
import { Empty, ItemImage, PageHeader, RarityBadge, Segmented, ShardIcon, Spinner, cx } from "@/components/ui";
import { RARITY, type Rarity } from "@/lib/rules";
import { txUrl } from "@/lib/config";

const CATS = [
  { value: "all", label: "All" },
  { value: "treasure", label: "Treasures" },
  { value: "artifact", label: "Artifacts" },
  { value: "badge", label: "Badges" },
  { value: "cosmetic", label: "Cosmetics" },
  { value: "special", label: "Special" },
];

export default function InventoryPage() {
  const { me, loading, openOnboarding } = useGame();
  const [tab, setTab] = useState<"collection" | "rewards">("collection");
  const [cat, setCat] = useState("all");
  const inv = useApi<{ inventory: InventoryEntry[]; rewards: RewardView[] }>(me ? "/api/inventory" : null, [me?.id]);
  const chain = useOnchainHoldings(me?.accountId);
  const { byId } = useItems();

  // Merge game vault with live on-chain balances (items bought on the market appear here too).
  const entries = useMemo(() => {
    const map = new Map<string, { id: string; vault: number; minting: number; onchainNow: number | null; lastAt: number }>();
    for (const e of inv.data?.inventory ?? []) map.set(e.item.id, { id: e.item.id, vault: e.vault, minting: e.minting, onchainNow: null, lastAt: e.lastAt });
    if (chain.balances) {
      for (const [id, n] of Object.entries(chain.balances)) {
        const cur = map.get(id) ?? { id, vault: 0, minting: 0, onchainNow: 0, lastAt: 0 };
        cur.onchainNow = n;
        map.set(id, cur);
      }
      for (const v of map.values()) if (v.onchainNow === null) v.onchainNow = 0;
    } else {
      // No chain data: show what the game recorded as minted.
      for (const e of inv.data?.inventory ?? []) map.get(e.item.id)!.onchainNow = e.onchain || null;
    }
    return [...map.values()].filter((e) => e.vault + e.minting + (e.onchainNow ?? 0) > 0 && (cat === "all" || byId[e.id]?.category === cat || (cat === "special" && byId[e.id]?.category === "event")));
  }, [inv.data, chain.balances, cat, byId]);

  const pendingMints = (inv.data?.rewards ?? []).filter((r) => r.onchainStatus !== "settled" && r.items.some((i) => i.status === "vault" || i.status === "minting"));

  if (!loading && !me)
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Inventory" />
        <Empty icon={<Package />} title="Your vault is empty" body="Create a profile and open your first treasure to start a collection." action={<button className="btn btn-primary" onClick={openOnboarding}>Start exploring</button>} />
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Inventory"
        subtitle="Collectibles you've found, earned and traded."
        right={
          <Link href="/market" className="btn btn-ghost py-2 text-[13px]">
            <Store size={15} className="text-gold" /> Market
          </Link>
        }
      />
      <div className="px-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: "collection", label: "Collection" }, { value: "rewards", label: <span>Rewards{pendingMints.length ? ` (${pendingMints.length} to mint)` : ""}</span> }]} />
      </div>

      {tab === "collection" ? (
        <div className="px-4">
          <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
            {CATS.map((c) => (
              <button key={c.value} onClick={() => setCat(c.value)} className={cx("chip shrink-0 px-3 py-1.5 text-[12px]", cat === c.value && "border-gold/50 bg-gold/10 text-gold")}>
                {c.label}
              </button>
            ))}
          </div>
          {me?.accountId && chain.error && <p className="mt-3 text-[12px] text-muted">Couldn&apos;t read on-chain balances: {chain.error}</p>}
          {!me?.accountId && (
            <div className="card mt-4 flex items-center gap-3 p-3 text-[13px] text-muted">
              <Wallet size={18} className="shrink-0 text-gold" /> Items are held in your TREZO vault. Connect a NEAR wallet in Profile to mint them as NEP-245 tokens you own.
            </div>
          )}
          {inv.loading && !inv.data ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton aspect-[3/4]" />)}</div>
          ) : entries.length === 0 ? (
            <Empty icon={<Package />} title="Nothing here yet" body="Open treasures and complete missions to fill your collection." action={<Link href="/explore" className="btn btn-primary">Go exploring</Link>} />
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3">
              {entries.map((e, i) => {
                const it = byId[e.id];
                if (!it) return null;
                const total = e.vault + e.minting + (e.onchainNow ?? 0);
                return (
                  <motion.div key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <Link href={`/inventory/${e.id}`} className="card group relative block overflow-hidden p-3" style={{ borderColor: `${RARITY[it.rarity as Rarity].color}33` }}>
                      <div className="relative">
                        <ItemImage id={e.id} size={256} className="h-auto w-full rounded-2xl transition-transform group-hover:scale-[1.03]" />
                        <span className="absolute right-2 top-2 rounded-lg bg-black/70 px-2 py-0.5 text-[12px] font-bold tabular">×{total}</span>
                      </div>
                      <p className="mt-2.5 truncate font-semibold">{it.name}</p>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <RarityBadge rarity={it.rarity as Rarity} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(e.onchainNow ?? 0) > 0 && <span className="chip border-teal/30 text-teal">On NEAR ×{e.onchainNow}</span>}
                        {e.vault > 0 && <span className="chip">Vault ×{e.vault}</span>}
                        {e.minting > 0 && <span className="chip text-gold">Minting ×{e.minting}</span>}
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <Rewards rewards={inv.data?.rewards ?? null} reload={() => { inv.reload(); chain.reload(); }} byName={(id) => byId[id]?.name ?? id} />
      )}
    </div>
  );
}

function Rewards({ rewards, reload, byName }: { rewards: RewardView[] | null; reload: () => void; byName: (id: string) => string }) {
  const { connectAndSignIn, busy } = useWallet();
  const { me, config } = useGame();
  if (!rewards) return <div className="mt-4 space-y-3 px-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div>;
  if (rewards.length === 0) return <Empty icon={<Clock />} title="No rewards yet" body="Every treasure, quest and mission reward will appear here." />;
  return (
    <div className="mt-4 space-y-2.5 px-4 pb-6">
      {config?.onchainSettlement && !me?.accountId && (
        <button className="btn btn-ghost w-full" onClick={() => connectAndSignIn()} disabled={busy}>
          {busy ? <Spinner /> : <Wallet size={16} />} Connect wallet to mint rewards
        </button>
      )}
      {rewards.map((r) => {
        const mintable = r.onchainStatus !== "settled" && r.items.some((i) => i.status === "vault" || i.status === "minting");
        return (
          <div key={r.id} className="card p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{r.kind}</span>
                  {r.rarity && <RarityBadge rarity={r.rarity as Rarity} />}
                  {r.demo && <span className="chip text-legendary">demo</span>}
                </div>
                <p className="mt-1 truncate font-semibold">{r.title}</p>
                <p className="text-[12px] text-muted">{new Date(r.createdAt).toLocaleString()}</p>
              </div>
              <div className="shrink-0 text-right text-[13px]">
                <p className="flex items-center justify-end gap-1">
                  <ShardIcon size={12} /> {r.shards}
                </p>
                <p className="text-gold">+{r.xp} XP</p>
              </div>
            </div>
            {r.items.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {r.items.map((i) => (
                  <span key={i.itemId + i.status} className="flex items-center gap-1.5 rounded-xl bg-surface-2 py-1 pl-1 pr-2.5 text-[12px]">
                    <ItemImage id={i.itemId} size={24} className="rounded-md" /> {byName(i.itemId)} ×{i.qty}
                    <span className={cx("ml-1", i.status === "onchain" ? "text-teal" : i.status === "spent" ? "text-faint" : "text-muted")}>{i.status === "onchain" ? "on NEAR" : i.status}</span>
                  </span>
                ))}
              </div>
            )}
            {r.onchainStatus === "settled" ? (
              r.txHash ? (
                <a className="mt-2 inline-block text-[12px] text-teal underline-offset-2 hover:underline" href={txUrl(r.txHash)} target="_blank" rel="noreferrer">
                  Settled on NEAR · view transaction
                </a>
              ) : (
                <p className="mt-2 text-[12px] text-teal">Settled on NEAR</p>
              )
            ) : mintable ? (
              <div className="mt-3">
                <MintButton rewardId={r.id} status={r.onchainStatus} compact onSettled={reload} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
