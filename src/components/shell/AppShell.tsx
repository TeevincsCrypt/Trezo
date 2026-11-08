"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Compass, Flame, Package, ScrollText, Trophy, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useGame } from "../providers/GameProvider";
import { Avatar, LogoMark, ShardIcon, Spark, cx } from "../ui";
import { levelProgress } from "@/lib/rules";
import { Onboarding } from "./Onboarding";

const NAV = [
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/quests", label: "Quests", icon: ScrollText },
  { href: "/inventory", label: "Vault", icon: Package },
  { href: "/leaderboard", label: "Ranks", icon: Trophy },
  { href: "/profile", label: "Profile", icon: UserRound },
];

/** Fired by the Hunt button; the Explore page focuses the nearest treasure. */
export const HUNT_EVENT = "trezo:hunt";

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const fullBleed = path === "/explore";
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col">
      <TopHud floating={fullBleed} />
      <main className={cx("flex-1", fullBleed ? "" : "pb-36 pt-[calc(var(--safe-top)+78px)]")}>{children}</main>
      <Dock />
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
        "fixed inset-x-0 top-0 z-40 mx-auto flex max-w-[1100px] items-center gap-2.5 px-4 pb-3 pt-[calc(var(--safe-top)+12px)]",
        !floating && "bg-gradient-to-b from-bg via-bg/90 to-bg/0",
      )}
    >
      <Link href="/" className="orb h-12 w-12 shrink-0" aria-label="TREZO home">
        <LogoMark size={26} />
      </Link>
      <div className="flex-1" />
      {loading ? (
        <div className="skeleton h-12 w-40 rounded-full" />
      ) : me ? (
        <>
          <Link href="/inventory" className="hud-glass flex h-12 items-center gap-3 rounded-full pl-3.5 pr-4 text-[13px] font-semibold">
            <span className="flex items-center gap-1 tabular" title="Shards (off-chain game currency)">
              <ShardIcon size={15} /> {me.shards.toLocaleString()}
            </span>
            <span className="h-4 w-px bg-ink/10" />
            <span className="flex items-center gap-1 tabular text-gold-deep" title="Daily streak">
              <Flame size={15} /> {me.streakDays}
            </span>
            <span className="hidden h-4 w-px bg-ink/10 sm:block" />
            <span className="hidden tabular text-muted sm:inline">Lv {lp!.level}</span>
          </Link>
          <Link href="/profile" className="relative shrink-0" aria-label="Your profile">
            <Avatar avatar={me.avatar} frame={me.frame} size={48} />
            <span className="absolute -left-0.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-gold ring-2 ring-bg" />
            <svg className="pointer-events-none absolute -inset-[3px]" viewBox="0 0 54 54" aria-hidden>
              <circle cx="27" cy="27" r="25.5" fill="none" stroke="rgb(14 14 16 / 0.08)" strokeWidth="2" />
              <circle cx="27" cy="27" r="25.5" fill="none" stroke="#FF6A1A" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${lp!.pct * 160.2} 160.2`} transform="rotate(-90 27 27)" />
            </svg>
          </Link>
        </>
      ) : (
        <button onClick={openOnboarding} className="btn btn-primary h-12 px-5">
          Start your adventure
        </button>
      )}
    </header>
  );
}

function Dock() {
  const path = usePathname();
  const router = useRouter();
  const hunt = () => {
    if (path === "/explore") window.dispatchEvent(new Event(HUNT_EVENT));
    else router.push("/explore");
  };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(var(--safe-bottom)+14px)]">
      <div className="flex w-full max-w-[460px] items-center gap-2.5">
        <div className="flex h-[62px] flex-1 items-center gap-0.5 rounded-full bg-ink p-1.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.7)]">
          {NAV.map((n) => {
            const active = path === n.href || path.startsWith(`${n.href}/`) || (n.href === "/inventory" && path.startsWith("/market"));
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-label={n.label}
                aria-current={active ? "page" : undefined}
                className={cx("relative flex h-full items-center justify-center gap-1.5 rounded-full text-[12.5px] font-semibold transition-[flex] duration-300", active ? "flex-[2.1] text-ink" : "flex-1 text-white/60 hover:text-white")}
              >
                {active && <motion.span layoutId="dock-pill" className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", stiffness: 480, damping: 38 }} />}
                <Icon size={19} strokeWidth={active ? 2.2 : 1.8} className="relative shrink-0" />
                {active && <span className="relative truncate">{n.label}</span>}
              </Link>
            );
          })}
        </div>
        <button onClick={hunt} aria-label="Hunt: go to the nearest treasure" title="Hunt" className="grid h-[62px] w-[62px] shrink-0 place-items-center rounded-full bg-gold text-white shadow-[0_16px_34px_-14px_rgba(255,106,26,0.95)] transition active:scale-95">
          <Spark size={24} />
        </button>
      </div>
    </nav>
  );
}

const TONE: Record<string, string> = {
  default: "",
  success: "before:bg-teal",
  error: "before:bg-danger",
  rare: "before:bg-rare",
  epic: "before:bg-epic",
  legendary: "before:bg-legendary",
};

function Toaster() {
  const { toasts, dismiss } = useGame();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--safe-top)+74px)] z-[70] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            onClick={() => dismiss(t.id)}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            className={cx(
              "pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-[22px] bg-ink py-3 pl-5 pr-4 text-left text-white shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)]",
              "before:absolute before:inset-y-3 before:left-2 before:w-1 before:rounded-full before:bg-gold",
              TONE[t.tone ?? "default"],
            )}
          >
            <p className="text-sm font-semibold">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[13px] text-white/65">{t.body}</p>}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
