"use client";
import { useState, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { callContract } from "@/lib/near-client";
import { txUrl } from "@/lib/config";
import { useGame } from "../providers/GameProvider";
import { useWallet } from "../providers/WalletProvider";
import { Spinner, cx } from "../ui";

/**
 * A button that signs one TREZO contract call with the player's wallet and
 * reports the real outcome (tx link on success, contract panic on failure).
 */
export function OnchainAction({
  label,
  icon,
  method,
  args,
  deposit = "0",
  gasTgas = 60,
  event,
  disabled,
  className,
  onDone,
}: {
  label: string;
  icon?: ReactNode;
  method: string;
  args: Record<string, unknown>;
  deposit?: string;
  gasTgas?: number;
  event?: "list" | "buy" | "cancel" | "npc_buy" | "npc_sell" | "transfer";
  disabled?: boolean;
  className?: string;
  onDone?: (txHash: string) => void;
}) {
  const { me, notify } = useGame();
  const { walletAccountId, connectAndSignIn } = useWallet();
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setErr(null);
    if (!walletAccountId) {
      if (!(await connectAndSignIn())) return;
    }
    setBusy(true);
    try {
      const r = await callContract(method, args, { deposit, gasTgas });
      setTx(r.txHash);
      notify({ title: "Transaction confirmed", body: `${method} succeeded on NEAR.`, tone: "success" });
      if (event) api("/api/market/events", { body: { txHash: r.txHash, kind: event, detail: { method, args: { ...args, ticket: undefined } } } }).catch(() => {});
      onDone?.(r.txHash);
    } catch (e) {
      const msg = (e as Error).message || "Transaction failed";
      setErr(msg);
      notify({ title: "Transaction failed", body: msg, tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const mismatch = walletAccountId && me?.accountId && walletAccountId !== me.accountId;
  return (
    <div>
      <button className={cx("btn", className)} onClick={run} disabled={busy || disabled}>
        {busy ? <Spinner /> : icon} {busy ? "Confirm in wallet…" : label}
      </button>
      {mismatch && <p className="mt-1.5 text-[11px] text-legendary">Wallet is connected as {walletAccountId} (profile: {me!.accountId}).</p>}
      {err && <p className="mt-1.5 text-[12px] text-danger">{err}</p>}
      {tx && (
        <a className="mt-1.5 inline-flex items-center gap-1 text-[12px] text-teal" href={txUrl(tx)} target="_blank" rel="noreferrer">
          View transaction <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}
