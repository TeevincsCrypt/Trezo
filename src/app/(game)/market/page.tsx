"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Info, Landmark, ShoppingBag, Store, TrendingUp } from "lucide-react";
import { useApi, useItems } from "@/components/hooks";
import { useGame } from "@/components/providers/GameProvider";
import { OnchainAction } from "@/components/onchain/OnchainAction";
import type { OnchainNpc } from "@/components/onchain/NpcTreasury";
import { Empty, ItemImage, PageHeader, RarityBadge, Segmented, ShardIcon, Spinner, cx, shortAccount } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatNear, viewContract } from "@/lib/near-client";
import { accountUrl, publicConfig } from "@/lib/config";
import type { Rarity } from "@/lib/rules";

interface Listing {
  id: number;
  seller_id: string;
  token_id: string;
  amount: string;
  price: string;
  created_at_ms: string;
}
interface Stats {
  active_listings: number;
  total_market_volume: string;
  market_fee_bps: number;
  players: number;
  claims: number;
}

export default function MarketPage() {
  const [tab, setTab] = useState<"players" | "merchant" | "shop">("players");
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/inventory" className="mx-4 mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Inventory
      </Link>
      <PageHeader title="Market" subtitle="Trade with players, deal with the Merchant, or spend Shards." />
      <div className="px-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: "players", label: "Players" }, { value: "merchant", label: "Merchant" }, { value: "shop", label: "Shard Shop" }]} />
      </div>
      <div className="mt-4 px-4 pb-8">{tab === "players" ? <PlayerMarket /> : tab === "merchant" ? <Merchant /> : <ShardShop />}</div>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="card flex gap-3 p-4 text-[13px] text-muted">
      <Info size={18} className="shrink-0 text-gold" />
      <span>The on-chain market runs entirely inside the TREZO NEAR contract. This deployment has no contract configured (<code>NEXT_PUBLIC_TREZO_CONTRACT_ID</code>), so listings can&apos;t be loaded. The Shard Shop still works.</span>
    </div>
  );
}

function PlayerMarket() {
  const { me } = useGame();
  const { byId } = useItems();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [mine, setMine] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([viewContract<Listing[]>("get_listings", { from_index: 0, limit: 100 }), viewContract<Stats>("get_stats")]);
      setListings(l);
      setStats(s);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (publicConfig.contractId) load();
  }, [load]);
  if (!publicConfig.contractId) return <NotConfigured />;
  if (err) return <p className="text-sm text-muted">Couldn&apos;t reach the contract: {err}</p>;
  if (!listings) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div>;
  const shown = mine ? listings.filter((l) => l.seller_id === me?.accountId) : listings;
  return (
    <>
      {stats && (
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Active listings" value={stats.active_listings} />
          <Stat label="Volume (NEAR)" value={formatNear(stats.total_market_volume, 2)} />
          <Stat label="Fee → Merchant" value={`${stats.market_fee_bps / 100}%`} />
        </div>
      )}
      {me?.accountId && (
        <div className="mb-3 flex gap-2">
          <button className={cx("chip px-3 py-1.5", !mine && "border-gold/50 text-gold")} onClick={() => setMine(false)}>All</button>
          <button className={cx("chip px-3 py-1.5", mine && "border-gold/50 text-gold")} onClick={() => setMine(true)}>My listings</button>
        </div>
      )}
      {shown.length === 0 ? (
        <Empty icon={<ShoppingBag />} title={mine ? "You have no active listings" : "No listings yet"} body="Mint a collectible, open it from your Inventory and choose “List for sale”." />
      ) : (
        <div className="space-y-2.5">
          {shown.map((l) => {
            const it = byId[l.token_id];
            const own = l.seller_id === me?.accountId;
            return (
              <div key={l.id} className="card flex items-center gap-3 p-3">
                <ItemImage id={l.token_id} size={64} className="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {it?.name ?? l.token_id} <span className="text-muted">×{l.amount}</span>
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {it && <RarityBadge rarity={it.rarity as Rarity} />}
                    <a className="truncate text-[11px] text-muted underline-offset-2 hover:underline" href={accountUrl(l.seller_id)} target="_blank" rel="noreferrer">
                      {shortAccount(l.seller_id)}
                    </a>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-lg font-bold tabular">{formatNear(l.price)} Ⓝ</p>
                  {own ? (
                    <OnchainAction label="Cancel" method="cancel_listing" args={{ listing_id: l.id }} deposit="1" event="cancel" className="btn-ghost mt-1 px-3 py-1.5 text-xs" onDone={load} />
                  ) : (
                    <OnchainAction label="Buy" method="buy_listing" args={{ listing_id: l.id }} deposit={l.price} event="buy" className="btn-primary mt-1 px-4 py-1.5 text-xs" onDone={load} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-[11px] text-faint">Listings, escrow, payment and delivery are all executed atomically by the contract: an item can only be bought once, and only while it is listed.</p>
    </>
  );
}

function Merchant() {
  const { byId } = useItems();
  const [npc, setNpc] = useState<OnchainNpc | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    viewContract<OnchainNpc | null>("get_npc", { npc_id: "merchant" }).then(setNpc).catch((e) => setErr((e as Error).message));
  }, []);
  useEffect(() => {
    if (publicConfig.contractId) load();
  }, [load]);
  if (!publicConfig.contractId) return <NotConfigured />;
  if (err) return <p className="text-sm text-muted">Couldn&apos;t reach the contract: {err}</p>;
  if (npc === undefined) return <div className="skeleton h-40" />;
  if (!npc) return <p className="text-sm text-muted">The Merchant hasn&apos;t opened shop on-chain yet.</p>;
  const forSale = npc.offers.filter((o) => BigInt(o.offer.base_price) > 0n);
  return (
    <>
      <div className="card relative overflow-hidden p-4">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-legendary/25 blur-3xl" />
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-legendary/15 text-3xl">⚖️</div>
          <div>
            <p className="font-display text-lg font-semibold">Bram&apos;s Exchange</p>
            <p className="text-[13px] text-muted">Prices follow an on-chain curve: each sale raises the price 8%, each buyback lowers it.</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[13px]">
          <Landmark size={15} className="text-legendary" /> Treasury <b className="tabular">{formatNear(npc.npc.treasury)} NEAR</b>
          <span className="text-muted">· daily buyback limit {formatNear(npc.npc.daily_spend_limit)}</span>
        </div>
      </div>
      <div className="mt-3 space-y-2.5">
        {forSale.map((o) => {
          const price = BigInt(o.current_price);
          const maxPay = ((price * 110n) / 100n).toString(); // 10% slippage buffer; contract refunds the excess
          const it = byId[o.offer.token_id];
          return (
            <div key={o.offer.token_id} className="card flex items-center gap-3 p-3">
              <ItemImage id={o.offer.token_id} size={60} className="rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{it?.name ?? o.offer.token_id}</p>
                <p className="flex items-center gap-1 text-[12px] text-muted">
                  <TrendingUp size={12} /> {BigInt(o.offer.sold).toString()} sold · {BigInt(o.offer.allocation).toLocaleString()} in stock
                </p>
                <p className="text-[12px] text-muted">Buys back at {formatNear(o.buyback_price)} Ⓝ</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-lg font-bold tabular">{formatNear(o.current_price)} Ⓝ</p>
                <OnchainAction label="Buy 1" icon={<Store size={13} />} method="npc_buy" args={{ npc_id: "merchant", token_id: o.offer.token_id }} deposit={maxPay} event="npc_buy" className="btn-primary mt-1 px-3 py-1.5 text-xs" onDone={load} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[11px] text-faint">You attach up to 10% above the shown price in case someone buys first; the contract refunds anything you overpay.</p>
    </>
  );
}

interface ShopItem {
  id: string;
  name: string;
  description: string;
  kind: string;
  value: string;
  price: number;
  remaining: number | null;
  owned: boolean;
}

function ShardShop() {
  const { me, notify, refresh, openOnboarding } = useGame();
  const shop = useApi<{ items: ShopItem[] }>("/api/shop", [me?.id]);
  const [busy, setBusy] = useState<string | null>(null);
  const buy = async (it: ShopItem) => {
    if (!me) return openOnboarding();
    setBusy(it.id);
    try {
      await api(`/api/shop/${it.id}/buy`, { method: "POST" });
      notify({ title: `Purchased ${it.name}`, body: it.kind === "boost" ? "Claim radius doubled for 30 minutes." : "Equipped on your profile.", tone: "success" });
      await Promise.all([shop.reload(), refresh()]);
    } catch (e) {
      notify({ title: "Purchase failed", body: e instanceof ApiError ? e.message : "Network error", tone: "error" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div className="card mb-3 flex gap-3 p-3 text-[12.5px] text-muted">
        <ShardIcon size={18} className="mt-0.5 shrink-0" />
        <span>Shards are TREZO&apos;s in-game currency. They live in the game database and are <b>not</b> a blockchain token. Spending them here removes them from circulation.</span>
      </div>
      {!shop.data ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-20" />)}</div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {shop.data.items.map((it) => (
            <div key={it.id} className="card flex items-center gap-3 p-3.5">
              <div className={cx("grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl", it.kind === "boost" ? "bg-teal/15" : "bg-gold/10")}>{it.kind === "boost" ? "📡" : "🖼️"}</div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{it.name}</p>
                <p className="text-[12px] text-muted">{it.description}</p>
                {it.remaining !== null && <p className="text-[11px] text-legendary">{it.remaining} left</p>}
              </div>
              {it.owned ? (
                <span className="text-[12px] font-semibold text-teal">Owned</span>
              ) : (
                <button className="btn btn-ghost px-3 py-2 text-[13px]" disabled={busy === it.id || (me ? me.shards < it.price : false)} onClick={() => buy(it)}>
                  {busy === it.id ? <Spinner /> : <ShardIcon size={13} />} {it.price}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card px-2 py-2.5">
      <p className="font-display text-lg font-bold tabular">{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}
