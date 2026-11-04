"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { SelfPlayer } from "@/server/players";

export type Me = SelfPlayer & { rank: number | null };

export interface ServerConfig {
  network: string;
  contractId: string | null;
  onchainSettlement: boolean;
  oraclePublicKey: string | null;
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone?: "default" | "success" | "error" | "rare" | "epic" | "legendary";
  href?: string;
}

interface GameCtx {
  me: Me | null;
  loading: boolean;
  isAdmin: boolean;
  config: ServerConfig | null;
  refresh: () => Promise<void>;
  setMe: (m: Me | null) => void;
  toasts: Toast[];
  notify: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
  onboardingOpen: boolean;
  openOnboarding: () => void;
  closeOnboarding: () => void;
}

const Ctx = createContext<GameCtx | null>(null);

let toastId = 1;

export function GameProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ player: Me | null; isAdmin: boolean }>("/api/me");
      setMe(r.player);
      setIsAdmin(r.isAdmin);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    api<ServerConfig>("/api/config").then(setConfig).catch(() => setConfig(null));
  }, [refresh]);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = toastId++;
      setToasts((list) => [...list.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === "error" ? 6000 : 4200);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      me,
      loading,
      isAdmin,
      config,
      refresh,
      setMe,
      toasts,
      notify,
      dismiss,
      onboardingOpen,
      openOnboarding: () => setOnboardingOpen(true),
      closeOnboarding: () => setOnboardingOpen(false),
    }),
    [me, loading, isAdmin, config, refresh, toasts, notify, dismiss, onboardingOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useGame outside GameProvider");
  return c;
}
