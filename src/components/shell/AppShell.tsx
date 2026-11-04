"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Compass, Flame, Package, ScrollText, Trophy, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useGame } from "../providers/GameProvider";
import { Avatar, Logo, Shards, cx } from "../ui";
import { levelProgress } from "@/lib/rules";
import { Onboarding } from "./Onboarding";

const NAV = [
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/quests", label: "Quests", icon: ScrollText },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/leaderboard", label: "Ranks", icon: Trophy },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const fullBleed = path === "/explore";
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col">
      <TopHud floating={fullBleed} />
      <main className={cx("flex-1", fullBleed ? "" : "pb-28 pt-[calc(var(--safe-top)+72px)] md:pb-12 md:pl-[92px]")}>{children}</main>
      <BottomNav />
      <Toaster />
      <Onboarding />
    </div>
  );
}

function TopHud({ floating }: { floating: boolean }) {
  const { me, loading, openOnboarding } = useGame();
  const lp = me ? levelProgress(me.xp) : null;
  return (
    <header
      className={cx(
        "fixed inset-x-0 top-0 z-40 mx-auto flex max-w-[1200px] items-center gap-3 px-3 pb-2 pt-[calc(var(--safe-top)+10px)] md:pl-[104px]",
        !floating && "bg-gradient-to-b from-bg via-bg/95 to-transparent",
      )}
    >
      <Link href="/explore" className="hud-glass flex h-11 items-center rounded-2xl px-3 md:hidden" aria-label="TREZO home">
        <Logo size={22} withWord={false} />
      </Link>
      {loading ? (
        <div className="skeleton h-11 flex-1 md:max-w-sm" />
      ) : me ? (
        <Link href="/profile" className="hud-glass flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-2xl pl-1.5 pr-3 md:max-w-sm">
          <Avatar avatar={me.avatar} frame={me.frame} size={32} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[12px] font-semibold">
              <span className="truncate">{me.username}</span>
              <span className="rounded-md bg-gold/15 px-1.5 text-[10px] font-bold text-gold">LV {lp!.level}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-gold-deep to-gold" style={{ width: `${Math.round(lp!.pct * 100)}%` }} />
            </div>
          </div>
        </Link>
      ) : (
        <button onClick={openOnboarding} className="hud-glass flex h-11 flex-1 items-center justify-center rounded-2xl px-4 text-sm font-semibold text-gold md:max-w-sm">
          Start your adventure
        </button>
      )}
      {me && (
        <div className="hud-glass flex h-11 items-center gap-3 rounded-2xl px-3 text-[13px]">
          <span className="flex items-center gap-1 font-semibold text-[#FF9B4D]" title="Daily streak">
            <Flame size={15} /> {me.streakDays}
          </span>
          <Shards n={me.shards} />
        </div>
      )}
    </header>
  );
}

function BottomNav() {
  const path = usePathname();
  return (
    <nav
      className={cx(
        "fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(var(--safe-bottom)+10px)]",
        "md:inset-y-0 md:left-[max(0px,calc(50%-600px))] md:right-auto md:w-[92px] md:px-3 md:pb-0 md:pt-6",
      )}
    >
      <div className="hud-glass mx-auto flex max-w-md items-stretch justify-between rounded-[22px] p-1.5 md:h-full md:max-w-none md:flex-col md:justify-start md:gap-2 md:rounded-[26px] md:py-4">
        <div className="hidden justify-center pb-4 md:flex">
          <Logo size={30} withWord={false} />
        </div>
        {NAV.map((n) => {
          const active = path === n.href || path.startsWith(`${n.href}/`) || (n.href === "/inventory" && path.startsWith("/market"));
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} className={cx("relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-2 text-[10.5px] font-semibold md:flex-none md:py-3", active ? "text-ink" : "text-faint hover:text-muted")}>
              {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-2xl bg-white/[0.07]" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <Icon size={21} strokeWidth={active ? 2.3 : 1.9} className={cx("relative", active && "text-gold")} />
              <span className="relative">{n.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

const TONE: Record<string, string> = {
  default: "border-line",
  success: "border-teal/40",
  error: "border-danger/50",
  rare: "border-rare/50",
  epic: "border-epic/50",
  legendary: "border-legendary/60",
};

function Toaster() {
  const { toasts, dismiss } = useGame();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+66px)] z-[70] flex flex-col items-center gap-2 px-3">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            onClick={() => dismiss(t.id)}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            className={cx("hud-glass pointer-events-auto w-full max-w-sm rounded-2xl border px-4 py-3 text-left shadow-xl", TONE[t.tone ?? "default"])}
          >
            <p className="text-sm font-semibold">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[13px] text-muted">{t.body}</p>}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
