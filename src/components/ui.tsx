"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RARITY, avatarById, type Rarity } from "@/lib/rules";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** Concentric-ring mark: a compass rose seen from above / a radar ping. */
export function LogoMark({ size = 28, tone = "ink" }: { size?: number; tone?: "ink" | "light" }) {
  const c = tone === "ink" ? "#0E0E10" : "#F6F5F2";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="14.5" stroke={c} strokeWidth="1.6" />
      <circle cx="16" cy="19.2" r="11.3" stroke={c} strokeWidth="1.6" />
      <circle cx="16" cy="22.4" r="8.1" stroke={c} strokeWidth="1.6" />
      <circle cx="16" cy="25.4" r="3.6" fill="#FF6A1A" />
    </svg>
  );
}

export function Logo({ size = 28, withWord = true, tone = "ink" }: { size?: number; withWord?: boolean; tone?: "ink" | "light" }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} tone={tone} />
      {withWord && <span className="font-display text-[1rem] tracking-[0.12em]">TREZO</span>}
    </span>
  );
}

/** The ✳ spark used as a brand accent (headlines, FAB). */
export function Spark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
    </svg>
  );
}

export function ShardIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden>
      <path d="M8 1 L13 5.5 L11.5 13 L8 15 L4.5 13 L3 5.5 Z" fill="#FF6A1A" />
      <path d="M8 1 L13 5.5 L8 7 L3 5.5Z" fill="#FFB27A" />
      <path d="M8 7 L11.5 13 L8 15Z" fill="#C9480A" />
    </svg>
  );
}

export function Shards({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 tabular font-semibold", className)}>
      <ShardIcon /> {n.toLocaleString()}
    </span>
  );
}

export function RarityBadge({ rarity, size = "sm" }: { rarity: Rarity; size?: "sm" | "lg" }) {
  const r = RARITY[rarity];
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded-full font-bold uppercase", size === "lg" ? "px-3 py-1 text-xs tracking-[0.18em]" : "px-2 py-0.5 text-[10px] tracking-[0.14em]")}
      style={{ color: r.color, background: `${r.color}14`, border: `1px solid ${r.color}33` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} />
      {r.label}
    </span>
  );
}

const FRAMES: Record<string, string> = {
  gold: "linear-gradient(135deg,#FFD08A,#E08A12)",
  teal: "linear-gradient(135deg,#7FE3C3,#0E8A62)",
  violet: "linear-gradient(135deg,#CDB3FF,#6B3FD1)",
};

export function Avatar({ avatar, frame, size = 40 }: { avatar: string; frame?: string | null; size?: number }) {
  const a = avatarById(avatar);
  const ring = frame ? FRAMES[frame] : "linear-gradient(135deg,#ffffff,#e4e3df)";
  return (
    <span className="relative inline-grid shrink-0 place-items-center rounded-full p-[2px]" style={{ width: size, height: size, background: ring }}>
      <span className="grid h-full w-full place-items-center rounded-full" style={{ background: a.bg, fontSize: size * 0.5 }}>
        <span aria-label={a.label} role="img">
          {a.emoji}
        </span>
      </span>
    </span>
  );
}

export function ItemImage({ id, size = 64, className }: { id: string; size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/art/${id}.svg`} alt="" width={size} height={size} className={cx("select-none", className)} draggable={false} />;
}

export function Progress({ value, max, color = "var(--color-ink)", className }: { value: number; max: number; color?: string; className?: string }) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.07]", className)}>
      <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.6, ease: "easeOut" }} />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("animate-spin", className)} size={18} />;
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="orb mb-5 h-16 w-16 text-muted">{icon}</div>
      <p className="font-display text-lg">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx("flex gap-1 rounded-full bg-ink p-1.5 shadow-[0_14px_30px_-18px_rgba(0,0,0,0.6)]", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("relative flex-1 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors", value === o.value ? "text-ink" : "text-white/55 hover:text-white")}
        >
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join("")}`} className="absolute inset-0 rounded-full bg-white" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Render overlays at <body> level so they escape any page stacking context. */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

/** Mobile bottom sheet / desktop centred dialog. */
export function Sheet({ open, onClose, children, title, wide }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <Portal>
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <motion.div className="absolute inset-0 bg-[#1a1714]/35 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            className={cx("relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[34px] border border-white bg-surface pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-[0_-20px_60px_-30px_rgba(0,0,0,0.45)] sm:rounded-[34px]", wide ? "sm:max-w-2xl" : "sm:max-w-md")}
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between bg-surface/95 px-5 pb-2 pt-3 backdrop-blur">
              <div className="mx-auto h-1 w-10 rounded-full bg-ink/15 sm:hidden" />
            </div>
            <div className="flex items-start justify-between gap-3 px-5">
              <div className="min-w-0 flex-1">{title}</div>
              <button onClick={onClose} className="orb h-10 w-10 shrink-0 text-muted hover:text-ink" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 pt-3">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </Portal>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-4 pb-5 pt-3">
      <div>
        <h1 className="font-display text-[1.85rem] leading-[1.05]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-md text-[13.5px] text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function timeLeft(ts: number) {
  const ms = ts - Date.now();
  if (ms <= 0) return "ended";
  const h = Math.floor(ms / 3600_000);
  if (h >= 48) return `${Math.floor(h / 24)}d left`;
  if (h >= 1) return `${h}h ${Math.floor((ms % 3600_000) / 60_000)}m left`;
  return `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}

export function shortAccount(a: string) {
  return a.length > 22 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a;
}
