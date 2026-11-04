"use client";
import Link from "next/link";
import { Award, Crown, Eye, Flame, Footprints, Gem, Handshake, Link as LinkIcon, Sparkles } from "lucide-react";
import type { PublicPlayer } from "@/server/players";
import type { InventoryEntry } from "@/server/inventory";
import { Avatar, ItemImage, RarityBadge, cx } from "../ui";
import { formatDistance } from "@/lib/geo";
import { levelProgress, type Rarity } from "@/lib/rules";

const ICONS: Record<string, typeof Award> = { sparkles: Sparkles, gem: Gem, crown: Crown, eye: Eye, footprints: Footprints, handshake: Handshake, flame: Flame, link: LinkIcon };

export interface Achievement {
  id: string;
  title: string;
  description: string;
  done: boolean;
  icon: string;
}

export function ProfileHeader({ player, extra }: { player: PublicPlayer; extra?: React.ReactNode }) {
  const lp = levelProgress(player.xp);
  return (
    <div className="card-raised relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold/15 blur-3xl" />
      <div className="flex items-center gap-4">
        <Avatar avatar={player.avatar} frame={player.frame} size={76} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display truncate text-2xl font-bold">{player.username}</h1>
            {player.isSample && <span className="chip">sample</span>}
          </div>
          <p className="text-[13px] text-muted">{player.accountId ?? (player.isGuest ? "Guest explorer" : "Explorer")}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-md bg-gold/15 px-2 py-0.5 text-[12px] font-bold text-gold">Level {lp.level}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-gold-deep to-gold" style={{ width: `${lp.pct * 100}%` }} />
            </div>
            <span className="text-[11px] tabular text-muted">
              {lp.current}/{lp.needed}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        <S v={player.xp.toLocaleString()} l="Total XP" />
        <S v={player.treasuresFound} l="Treasures" />
        <S v={player.rareFound} l="Rare+" />
        <S v={player.missionsCompleted} l="Missions" />
        <S v={player.questsCompleted} l="Quests" />
        <S v={formatDistance(player.distanceM)} l="Explored" />
      </div>
      {extra}
    </div>
  );
}

function S({ v, l }: { v: React.ReactNode; l: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface/60 py-2">
      <p className="font-display text-[1.05rem] font-bold tabular">{v}</p>
      <p className="text-[11px] text-muted">{l}</p>
    </div>
  );
}

export function Achievements({ list }: { list: Achievement[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {list.map((a) => {
        const I = ICONS[a.icon] ?? Award;
        return (
          <div key={a.id} className={cx("card p-3", !a.done && "opacity-40")}>
            <I size={20} className={a.done ? "text-gold" : "text-faint"} />
            <p className="mt-2 text-[13px] font-semibold">{a.title}</p>
            <p className="text-[11px] text-muted">{a.description}</p>
          </div>
        );
      })}
    </div>
  );
}

export function CollectionStrip({ items }: { items: InventoryEntry[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">No collectibles yet.</p>;
  return (
    <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
      {items.map((e) => (
        <Link key={e.item.id} href={`/inventory/${e.item.id}`} className="card w-32 shrink-0 p-2">
          <ItemImage id={e.item.id} size={128} className="h-auto w-full rounded-xl" />
          <p className="mt-1.5 truncate text-[12px] font-semibold">{e.item.name}</p>
          <div className="mt-1 flex items-center justify-between">
            <RarityBadge rarity={e.item.rarity as Rarity} />
            {e.onchain > 0 && <span className="text-[10px] font-semibold text-teal">NEAR</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}
