"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { getConnector } from "@/lib/near-client";
import { useGame, type Me } from "./GameProvider";

interface WalletCtx {
  /** Account currently connected in the wallet (may differ from the profile's linked account). */
  walletAccountId: string | null;
  busy: boolean;
  /** Connect a wallet and sign in to TREZO with a NEP-413 signed message. */
  connectAndSignIn: () => Promise<boolean>;
  disconnect: () => Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { setMe, notify, refresh } = useGame();
  const [walletAccountId, setWalletAccountId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getConnector()
      .then(async (c) => {
        c.on("wallet:signOut", () => alive && setWalletAccountId(null));
        c.on("wallet:signIn", (p) => alive && setWalletAccountId(p.accounts[0]?.accountId ?? null));
        try {
          const { accounts } = await c.getConnectedWallet();
          if (alive) setWalletAccountId(accounts[0]?.accountId ?? null);
        } catch {
          /* not connected */
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const connectAndSignIn = useCallback(async () => {
    setBusy(true);
    try {
      const c = await getConnector();
      const wallet = await c.connect();
      const accounts = await wallet.getAccounts();
      const accountId = accounts[0]?.accountId;
      if (!accountId) throw new Error("No account returned by the wallet");
      setWalletAccountId(accountId);

      const { nonce, message, recipient } = await api<{ nonce: string; message: string; recipient: string }>("/api/auth/nonce");
      const nonceBytes = Uint8Array.from(atob(nonce), (ch) => ch.charCodeAt(0));
      const signed = await wallet.signMessage({ message, recipient, nonce: nonceBytes });
      const r = await api<{ player: Me }>("/api/auth/verify", {
        body: { accountId: signed.accountId || accountId, publicKey: signed.publicKey, signature: signed.signature, nonce },
      });
      setMe({ ...r.player, rank: null });
      await refresh();
      notify({ title: "Wallet connected", body: `Signed in as ${r.player.accountId}`, tone: "success" });
      return true;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message || "Wallet connection cancelled";
      notify({ title: "Couldn't connect wallet", body: msg, tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  }, [notify, refresh, setMe]);

  const disconnect = useCallback(async () => {
    try {
      const c = await getConnector();
      await c.disconnect();
    } catch {
      /* ignore */
    }
    setWalletAccountId(null);
  }, []);

  const value = useMemo(() => ({ walletAccountId, busy, connectAndSignIn, disconnect }), [walletAccountId, busy, connectAndSignIn, disconnect]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
}
