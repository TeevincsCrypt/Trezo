"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RARITY, avatarById, type Rarity } from "@/lib/rules";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Logo({ size = 28, withWord = true }: { size?: number; withWord?: boolean }) {
  // Unique gradient id per instance: a shared id breaks when the first instance is display:none.
  const gid = `trz-g-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFE3A3" />
            <stop offset="1" stopColor="#E0A93F" />
          </linearGradient>
        </defs>
        <path d="M16 1.5 L30.5 16 L16 30.5 L1.5 16 Z" fill="#111823" stroke={`url(#${gid})`} strokeWidth="2" />
        <path d="M9.5 11h13v3.2h-4.8V23h-3.4v-8.8H9.5z" fill={`url(#${gid})`} />
        <circle cx="16" cy="6.2" r="1.3" fill="#3DDCB4" />
      </svg>
      {withWord && <span className="font-display text-[1.05rem] font-bold tracking-[0.18em]">TREZO</span>}
    </span>
  );
}

export function ShardIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden>
      <path d="M8 1 L13 5.5 L11.5 13 L8 15 L4.5 13 L3 5.5 Z" fill="#3DDCB4" />
      <path d="M8 1 L13 5.5 L8 7 L3 5.5Z" fill="#A6F5E1" />
      <path d="M8 7 L11.5 13 L8 15Z" fill="#1E9C7E" />
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
      style={{ color: r.color, background: `${r.color}1a`, border: `1px solid ${r.color}40` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.color }} />
      {r.label}
    </span>
  );
}

const FRAMES: Record<string, string> = {
  gold: "linear-gradient(135deg,#FFE3A3,#C99A3C)",
  teal: "linear-gradient(135deg,#7FF0D3,#178F73)",
  violet: "linear-gradient(135deg,#D4B5FF,#6B3FD1)",
};

export function Avatar({ avatar, frame, size = 40 }: { avatar: string; frame?: string | null; size?: number }) {
  const a = avatarById(avatar);
  const ring = frame ? FRAMES[frame] : "linear-gradient(135deg,#2A3546,#1A2230)";
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

export function Progress({ value, max, color = "var(--color-teal)", className }: { value: number; max: number; color?: string; className?: string }) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]", className)}>
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
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-line bg-surface-2 text-muted">{icon}</div>
      <p className="font-display text-lg font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx("flex gap-1 rounded-2xl border border-line bg-surface p-1", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("relative flex-1 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors", value === o.value ? "text-ink" : "text-muted hover:text-ink")}
        >
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join("")}`} className="absolute inset-0 rounded-xl bg-surface-3" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
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
          <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal
            className={cx("relative max-h-[88dvh] w-full overflow-y-auto rounded-t-[28px] border border-line bg-surface pb-[calc(env(safe-area-inset-bottom)+16px)] sm:rounded-[28px]", wide ? "sm:max-w-2xl" : "sm:max-w-md")}
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between bg-surface/95 px-5 pb-2 pt-3 backdrop-blur">
              <div className="mx-auto h-1 w-10 rounded-full bg-white/15 sm:hidden" />
            </div>
            <div className="flex items-start justify-between gap-3 px-5">
              <div className="min-w-0 flex-1">{title}</div>
              <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink" aria-label="Close">
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
    <div className="flex items-end justify-between gap-3 px-4 pb-4 pt-2">
      <div>
        <h1 className="font-display text-[1.7rem] font-bold leading-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
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
