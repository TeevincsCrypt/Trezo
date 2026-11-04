"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft, ArrowRightLeft, BadgeCheck, Lock, Store, Tag } from "lucide-react";
import { motion } from "framer-motion";
import type { InventoryEntry } from "@/server/inventory";
import { useApi, useItems } from "@/components/hooks";
import { useGame } from "@/components/providers/GameProvider";
import { useOnchainHoldings } from "@/components/onchain/useOnchainHoldings";
import { OnchainAction } from "@/components/onchain/OnchainAction";
import type { OnchainNpc } from "@/components/onchain/NpcTreasury";
import { ItemImage, RarityBadge, Sheet, cx } from "@/components/ui";
import { RARITY, type Rarity } from "@/lib/rules";
import { formatNear, parseNear, viewContract } from "@/lib/near-client";
import { accountUrl, publicConfig } from "@/lib/config";

export default function ItemDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useGame();
  const { byId, items } = useItems();
  const inv = useApi<{ inventory: InventoryEntry[] }>(me ? "/api/inventory" : null, [me?.id]);
  const chain = useOnchainHoldings(me?.accountId);
  const [supply, setSupply] = useState<string | null>(null);
  const [merchant, setMerchant] = useState<OnchainNpc | null>(null);
  const [sheet, setSheet] = useState<"list" | "transfer" | null>(null);

  useEffect(() => {
    if (!publicConfig.contractId) return;
    viewContract<string | null>("mt_supply", { token_id: id }).then(setSupply).catch(() => {});
    viewContract<OnchainNpc | null>("get_npc", { npc_id: "merchant" }).then(setMerchant).catch(() => {});
  }, [id]);

  const it = byId[id];
  if (!items) return <div className="mx-auto max-w-3xl px-4"><div className="skeleton mt-4 aspect-square max-w-sm" /></div>;
  if (!it) return <p className="px-4 py-20 text-center text-muted">Unknown collectible.</p>;

  const entry = inv.data?.inventory.find((e) => e.item.id === id);
  const onchain = chain.balances?.[id] ?? 0;
  const c = RARITY[it.rarity as Rarity].color;
  const offer = merchant?.offers.find((o) => o.offer.token_id === id && o.offer.buyback_bps > 0);
  const reload = () => {
    chain.reload();
    inv.reload();
    if (publicConfig.contractId) viewContract<OnchainNpc | null>("get_npc", { npc_id: "merchant" }).then(setMerchant).catch(() => {});
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10">
      <Link href="/inventory" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={16} /> Inventory
      </Link>
      <div className="grid gap-6 md:grid-cols-[minmax(0,360px)_1fr]">
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative">
          <div className="absolute inset-6 rounded-full blur-3xl" style={{ background: `${c}40` }} />
          <ItemImage id={id} size={512} className="relative h-auto w-full rounded-[28px]" />
        </motion.div>
        <div>
          <RarityBadge rarity={it.rarity as Rarity} size="lg" />
          <h1 className="font-display mt-3 text-3xl font-bold">{it.name}</h1>
          <p className="mt-2 text-muted">{it.description}</p>

          <dl className="mt-5 grid grid-cols-2 gap-2 text-sm">
            <Info label="Category" value={<span className="capitalize">{it.category}</span>} />
            <Info label="Transferable" value={it.transferable ? "Yes" : <span className="inline-flex items-center gap-1"><Lock size={13} /> Soulbound</span>} />
            <Info label="Supply cap" value={it.maxSupply.toLocaleString()} />
            <Info label="Issued by game" value={it.issued.toLocaleString()} />
            {supply !== null && <Info label="On-chain supply" value={BigInt(supply).toLocaleString()} />}
            <Info label="Token id (NEP-245)" value={<code className="text-[12px]">{id}</code>} />
          </dl>

          {me && (
            <div className="card mt-5 p-4">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Your holdings</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <Holding n={onchain} label="On NEAR" accent="text-teal" />
                <Holding n={entry?.vault ?? 0} label="In vault" />
                <Holding n={entry?.minting ?? 0} label="Minting" accent="text-gold" />
              </div>
              {entry && <p className="mt-3 text-[12px] text-muted">First acquired {new Date(entry.firstAt).toLocaleDateString()} · Owner: {me.accountId ? <a className="underline" href={accountUrl(me.accountId)} target="_blank" rel="noreferrer">{me.accountId}</a> : me.username}</p>}
              {(entry?.vault ?? 0) > 0 && (
                <Link href="/inventory" className="mt-3 block text-[13px] font-semibold text-teal">
                  Mint vault items from the Rewards tab →
                </Link>
              )}
            </div>
          )}

          {me?.accountId && publicConfig.contractId && onchain > 0 && it.transferable && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="btn btn-primary" onClick={() => setSheet("list")}>
                <Tag size={16} /> List for sale
              </button>
              <button className="btn btn-ghost" onClick={() => setSheet("transfer")}>
                <ArrowRightLeft size={16} /> Transfer
              </button>
              {offer && (
                <div className="col-span-2">
                  <OnchainAction
                    label={`Sell 1 to the Merchant for ${formatNear(offer.buyback_price)} NEAR`}
                    icon={<Store size={16} />}
                    method="npc_sell"
                    args={{ npc_id: "merchant", token_id: id }}
                    deposit="1"
                    event="npc_sell"
                    className="btn-ghost w-full"
                    onDone={reload}
                  />
                  <p className="mt-1.5 text-[11px] text-faint">Paid from the Merchant&apos;s on-chain treasury ({formatNear(merchant!.npc.treasury)} NEAR, daily limit {formatNear(merchant!.npc.daily_spend_limit)}).</p>
                </div>
              )}
            </div>
          )}
          {!it.transferable && (
            <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
              <BadgeCheck size={16} className="text-epic" /> Soulbound: proof of achievement that stays with you.
            </p>
          )}
        </div>
      </div>

      <ListSheet open={sheet === "list"} onClose={() => setSheet(null)} tokenId={id} max={onchain} onDone={reload} />
      <TransferSheet open={sheet === "transfer"} onClose={() => setSheet(null)} tokenId={id} max={onchain} onDone={reload} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function Holding({ n, label, accent }: { n: number; label: string; accent?: string }) {
  return (
    <div>
      <p className={cx("font-display text-2xl font-bold tabular", n > 0 && accent)}>{n}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  );
}

function ListSheet({ open, onClose, tokenId, max, onDone }: { open: boolean; onClose: () => void; tokenId: string; max: number; onDone: () => void }) {
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("0.1");
  let priceYocto: string | null = null;
  try {
    priceYocto = parseNear(price);
    if (BigInt(priceYocto) < 10n ** 22n) priceYocto = null;
  } catch {
    priceYocto = null;
  }
  return (
    <Sheet open={open} onClose={onClose} title={<p className="font-display text-lg font-semibold">List on the player market</p>}>
      <p className="text-[13px] text-muted">Your items move into contract escrow until sold or cancelled. Buyers pay you directly; a 2.5% fee funds the Merchant&apos;s treasury.</p>
      <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-muted">Quantity (max {max})</label>
      <input className="input mt-1.5" type="number" min={1} max={max} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
      <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-muted">Total price (NEAR, min 0.01)</label>
      <input className="input mt-1.5" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      <div className="mt-4 pb-2">
        <OnchainAction
          label="Sign listing"
          method="list_item"
          args={{ token_id: tokenId, amount: String(qty), price: priceYocto ?? "0" }}
          deposit="1"
          event="list"
          disabled={!priceYocto}
          className="btn-primary w-full"
          onDone={() => {
            onDone();
            onClose();
          }}
        />
      </div>
    </Sheet>
  );
}

function TransferSheet({ open, onClose, tokenId, max, onDone }: { open: boolean; onClose: () => void; tokenId: string; max: number; onDone: () => void }) {
  const [to, setTo] = useState("");
  const [qty, setQty] = useState(1);
  const valid = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(to) && to.length >= 2;
  return (
    <Sheet open={open} onClose={onClose} title={<p className="font-display text-lg font-semibold">Transfer (NEP-245 mt_transfer)</p>}>
      <label className="block text-xs font-semibold uppercase tracking-wider text-muted">Recipient NEAR account</label>
      <input className="input mt-1.5" placeholder={`friend.${publicConfig.network === "mainnet" ? "near" : "testnet"}`} value={to} onChange={(e) => setTo(e.target.value.trim().toLowerCase())} />
      <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-muted">Quantity (max {max})</label>
      <input className="input mt-1.5" type="number" min={1} max={max} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value) || 1)))} />
      <div className="mt-4 pb-2">
        <OnchainAction
          label="Sign transfer"
          method="mt_transfer"
          args={{ receiver_id: to, token_id: tokenId, amount: String(qty), approval: null, memo: "TREZO transfer" }}
          deposit="1"
          event="transfer"
          disabled={!valid}
          className="btn-primary w-full"
          onDone={() => {
            onDone();
            onClose();
          }}
        />
      </div>
    </Sheet>
  );
}
