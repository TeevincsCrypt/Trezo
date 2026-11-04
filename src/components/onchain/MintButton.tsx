"use client";
import { useState } from "react";
import { CheckCircle2, ExternalLink, Link2, ShieldAlert, Wallet } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { callContract } from "@/lib/near-client";
import { txUrl } from "@/lib/config";
import { useGame } from "../providers/GameProvider";
import { useWallet } from "../providers/WalletProvider";
import { Spinner, cx } from "../ui";

type Phase = "idle" | "ticket" | "wallet" | "confirming" | "done" | "error";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mint a reward on NEAR:
 *  1. ask the game server for an oracle-signed claim ticket
 *  2. the player's wallet submits `claim(ticket, signature)` to the contract
 *  3. the server confirms by reading `get_claim` from the contract
 * Nothing is shown as minted unless step 3 succeeds.
 */
export function MintButton({ rewardId, status, txHash: initialTx, onSettled, compact }: { rewardId: string; status: string; txHash?: string | null; onSettled?: () => void; compact?: boolean }) {
  const { me, config, notify } = useGame();
  const { connectAndSignIn, walletAccountId, busy } = useWallet();
  const [phase, setPhase] = useState<Phase>(status === "settled" ? "done" : "idle");
  const [txHash, setTxHash] = useState<string | null>(initialTx ?? null);
  const [error, setError] = useState<string | null>(null);

  if (!config?.onchainSettlement) {
    return (
      <div className={cx("flex items-start gap-2 rounded-xl border border-line bg-surface-2 p-3 text-[12.5px] text-muted", compact && "p-2")}>
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-faint" />
        <span>Saved in your TREZO vault. On-chain minting isn&apos;t configured on this server (no contract / oracle key set).</span>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-teal/30 bg-teal/10 p-3 text-[13px]">
        <span className="flex items-center gap-2 font-semibold text-teal">
          <CheckCircle2 size={16} /> Minted on NEAR {config.network}
        </span>
        {txHash && (
          <a className="flex items-center gap-1 text-teal underline-offset-2 hover:underline" href={txUrl(txHash)} target="_blank" rel="noreferrer">
            View tx <ExternalLink size={13} />
          </a>
        )}
      </div>
    );
  }

  if (!me?.accountId) {
    return (
      <button className={cx("btn btn-ghost w-full", compact && "py-2 text-xs")} onClick={() => connectAndSignIn()} disabled={busy}>
        {busy ? <Spinner /> : <Wallet size={16} />} Connect NEAR wallet to mint
      </button>
    );
  }

  const mismatch = walletAccountId && walletAccountId !== me.accountId;

  const run = async () => {
    setError(null);
    try {
      setPhase("ticket");
      const t = await api<{ ticket: string; signature: string }>(`/api/rewards/${rewardId}/ticket`, { method: "POST" });
      setPhase("wallet");
      let hash: string | null = null;
      try {
        const r = await callContract("claim", { ticket: t.ticket, signature: t.signature }, { gasTgas: 100 });
        hash = r.txHash;
      } catch (e) {
        const msg = (e as Error).message || "Transaction was not completed";
        // The ticket may already have been used by an earlier attempt — fall through to verification.
        if (!/already used/i.test(msg)) throw new Error(msg);
      }
      setTxHash(hash);
      setPhase("confirming");
      for (let i = 0; i < 6; i++) {
        try {
          await api(`/api/rewards/${rewardId}/settle`, { body: { txHash: hash } });
          setPhase("done");
          notify({ title: "Minted on NEAR", body: "Your collectible is now in your wallet.", tone: "success" });
          onSettled?.();
          return;
        } catch (e) {
          if (e instanceof ApiError && e.code === "not_found_onchain" && i < 5) {
            await sleep(2000);
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      setPhase("error");
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    }
  };

  const label = { idle: "Mint on NEAR", ticket: "Preparing claim…", wallet: "Confirm in your wallet…", confirming: "Confirming on-chain…", error: "Try again", done: "" }[phase];
  return (
    <div className="space-y-2">
      <button className={cx("btn btn-teal w-full", compact && "py-2 text-xs")} onClick={run} disabled={phase === "ticket" || phase === "wallet" || phase === "confirming"}>
        {phase === "ticket" || phase === "wallet" || phase === "confirming" ? <Spinner /> : <Link2 size={16} />} {label}
      </button>
      {mismatch && <p className="text-[12px] text-legendary">Your wallet is connected as {walletAccountId}, but this profile belongs to {me.accountId}. Switch accounts in your wallet.</p>}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}
