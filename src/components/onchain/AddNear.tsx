"use client";
/**
 * "Add NEAR from any chain" via NEAR Intents (1Click). The player sends a
 * token on another chain to a one-time deposit address; solvers deliver NEAR
 * to the player's own NEAR account. TREZO never holds the funds.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Check, Copy, ExternalLink, Globe } from "lucide-react";
import type { IntentToken, SwapView } from "@/server/intents";
import { useGame } from "@/components/providers/GameProvider";
import { Sheet, Spinner, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

const CHAIN: Record<string, string> = { eth: "Ethereum", base: "Base", arb: "Arbitrum", sol: "Solana", btc: "Bitcoin", bsc: "BNB Chain", op: "Optimism", pol: "Polygon", avax: "Avalanche", tron: "Tron", ton: "TON", doge: "Dogecoin", xrp: "XRP Ledger", zec: "Zcash", gnosis: "Gnosis", sui: "Sui", ltc: "Litecoin", bch: "Bitcoin Cash" };
const chainName = (c: string) => CHAIN[c] ?? c.toUpperCase();
const STATUS: Record<string, { label: string; tone: string }> = {
  PENDING_DEPOSIT: { label: "Waiting for your deposit", tone: "text-muted" },
  KNOWN_DEPOSIT_TX: { label: "Deposit seen, confirming", tone: "text-gold" },
  INCOMPLETE_DEPOSIT: { label: "Deposit is less than quoted", tone: "text-legendary" },
  PROCESSING: { label: "Swapping to NEAR", tone: "text-gold" },
  SUCCESS: { label: "NEAR delivered", tone: "text-teal" },
  REFUNDED: { label: "Refunded to your address", tone: "text-legendary" },
  FAILED: { label: "Failed", tone: "text-legendary" },
};
const FINAL = new Set(["SUCCESS", "REFUNDED", "FAILED"]);

export function AddNearButton({ className }: { className?: string }) {
  const { me, config } = useGame();
  const [open, setOpen] = useState(false);
  if (config?.network !== "mainnet" || !me?.accountId) return null;
  return (
    <>
      <button className={cx("btn btn-ghost", className)} onClick={() => setOpen(true)}>
        <Globe size={16} /> Add NEAR from any chain
      </button>
      <AddNearSheet open={open} onClose={() => setOpen(false)} accountId={me.accountId} />
    </>
  );
}

function AddNearSheet({ open, onClose, accountId }: { open: boolean; onClose: () => void; accountId: string }) {
  const { notify } = useGame();
  const [tokens, setTokens] = useState<IntentToken[] | null>(null);
  const [asset, setAsset] = useState("");
  const [amount, setAmount] = useState("");
  const [refundTo, setRefundTo] = useState("");
  const [preview, setPreview] = useState<SwapView | null>(null);
  const [swap, setSwap] = useState<SwapView | null>(null);
  const [busy, setBusy] = useState<false | "preview" | "quote">(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<SwapView[]>([]);

  useEffect(() => {
    if (!open || tokens) return;
    api<{ tokens: IntentToken[] }>("/api/intents/tokens")
      .then((r) => {
        setTokens(r.tokens);
        const def = r.tokens.find((t) => t.symbol === "USDC" && t.blockchain === "base") ?? r.tokens[0];
        if (def) setAsset(def.assetId);
      })
      .catch((e) => setError((e as Error).message));
    api<{ swaps: SwapView[] }>("/api/intents/swaps").then((r) => setRecent(r.swaps)).catch(() => {});
  }, [open, tokens]);

  const token = useMemo(() => tokens?.find((t) => t.assetId === asset) ?? null, [tokens, asset]);
  // Both buttons work as soon as the form is filled in; Preview is optional.
  const ready = !!asset && Number(amount) > 0 && refundTo.length >= 20;
  useEffect(() => setPreview(null), [asset, amount, refundTo]);

  // Poll the live status of the active swap.
  useEffect(() => {
    if (!swap || FINAL.has(swap.status)) return;
    const id = setInterval(async () => {
      try {
        const r = await api<{ swap: SwapView }>(`/api/intents/swaps/${encodeURIComponent(swap.depositAddress)}`);
        setSwap((s) => (s ? { ...s, ...r.swap, symbol: s.symbol, blockchain: s.blockchain } : r.swap));
        if (r.swap.status === "SUCCESS") notify({ title: "NEAR delivered", body: `${r.swap.amountOut} NEAR arrived in ${accountId}.` });
      } catch {
        /* keep polling */
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [swap, accountId, notify]);

  const request = async (dry: boolean) => {
    setBusy(dry ? "preview" : "quote");
    setError(null);
    try {
      const r = await api<{ swap: SwapView }>("/api/intents/swaps", { body: { originAsset: asset, amount, refundTo, dry } });
      if (dry) setPreview(r.swap);
      else {
        setSwap(r.swap);
        setRecent((l) => [r.swap, ...l]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSwap(null);
    setPreview(null);
    setAmount("");
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add NEAR from any chain">
      <p className="text-[13px] text-muted">
        Pay with USDC, ETH, BTC, SOL and more. <b className="text-ink">NEAR Intents</b> swaps it and delivers NEAR to <span className="font-mono text-ink">{accountId}</span>. TREZO never holds your funds.
      </p>

      {swap ? (
        <ActiveSwap swap={swap} onDone={reset} />
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted">
            Pay with
            <select className="input mt-1.5" value={asset} onChange={(e) => setAsset(e.target.value)} disabled={!tokens}>
              {!tokens && <option>Loading tokens…</option>}
              {tokens?.map((t) => (
                <option key={t.assetId} value={t.assetId}>
                  {t.symbol} · {chainName(t.blockchain)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted">
            Amount{token ? ` (${token.symbol})` : ""}
            <input className="input mt-1.5" inputMode="decimal" placeholder={token?.symbol === "BTC" ? "0.001" : "10"} value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
            {token && Number(amount) > 0 && <span className="mt-1 block text-[11px] normal-case tracking-normal text-faint">≈ ${(Number(amount) * token.price).toFixed(2)}</span>}
          </label>
          <label className="block text-[12px] font-semibold uppercase tracking-wider text-muted">
            Your {token ? `${chainName(token.blockchain)} ` : ""}address for refunds
            <input className="input mt-1.5 font-mono text-[13px]" placeholder={token?.blockchain === "sol" ? "Solana address" : token?.blockchain === "btc" ? "bc1…" : "0x…"} value={refundTo} onChange={(e) => setRefundTo(e.target.value.trim())} />
            <span className="mt-1 block text-[11px] normal-case tracking-normal text-faint">Only used if the swap can&apos;t complete. Use an address you control on that chain.</span>
          </label>

          {preview && (
            <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-3 py-2.5 text-[13px]">
              <span className="flex items-center gap-1.5 text-muted"><ArrowDownUp size={14} /> You receive about</span>
              <b>{preview.amountOut} NEAR</b>
            </div>
          )}
          {error && <p className="rounded-2xl bg-legendary/10 px-3 py-2 text-[13px] text-legendary">{error}</p>}

          <div className="flex gap-2">
            <button className="btn btn-ghost flex-1" disabled={!!busy || !ready} onClick={() => request(true)}>
              {busy === "preview" ? <Spinner /> : null} Preview
            </button>
            <button className="btn btn-primary flex-1" disabled={!!busy || !ready} onClick={() => request(false)}>
              {busy === "quote" ? <Spinner /> : null} Get deposit address
            </button>
          </div>
          {!ready && <p className="text-[12px] text-muted">Fill in the amount and your refund address to continue.</p>}
          <p className="text-[11px] text-faint">Rates come from NEAR Intents solvers (1% max slippage). Quotes expire after 1 hour; late or short deposits are refunded to your address.</p>

          {recent.length > 0 && (
            <div className="pt-2">
              <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted">Recent</p>
              {recent.slice(0, 5).map((s) => (
                <button key={s.depositAddress} className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left text-[13px] hover:bg-surface-2" onClick={() => setSwap(s)}>
                  <span>
                    {s.amountIn} {s.symbol} → {s.amountOut} NEAR
                  </span>
                  <span className={cx("text-[12px]", STATUS[s.status]?.tone ?? "text-muted")}>{STATUS[s.status]?.label ?? s.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function ActiveSwap({ swap, onDone }: { swap: SwapView; onDone: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [tx, setTx] = useState("");
  const [sent, setSent] = useState(false);
  const st = STATUS[swap.status] ?? { label: swap.status, tone: "text-muted" };
  const copy = async (v: string, k: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(k);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  const submitTx = async () => {
    try {
      await api(`/api/intents/swaps/${encodeURIComponent(swap.depositAddress)}`, { body: { txHash: tx } });
      setSent(true);
    } catch {
      setSent(false);
    }
  };
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-2xl border border-line p-3">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">
          Send exactly {swap.amountIn} {swap.symbol}
          {swap.blockchain ? ` on ${chainName(swap.blockchain)}` : ""} to
        </p>
        <div className="mt-2 flex items-start gap-2">
          <code className="min-w-0 flex-1 break-all rounded-xl bg-surface-2 px-2.5 py-2 text-[13px]">{swap.depositAddress}</code>
          <button className="btn btn-ghost px-3" aria-label="Copy address" onClick={() => copy(swap.depositAddress, "a")}>
            {copied === "a" ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
        {swap.depositMemo && (
          <div className="mt-2 flex items-start gap-2">
            <p className="min-w-0 flex-1 text-[13px]">
              <b className="text-legendary">Memo required:</b> <code className="break-all">{swap.depositMemo}</code>
            </p>
            <button className="btn btn-ghost px-3" aria-label="Copy memo" onClick={() => copy(swap.depositMemo!, "m")}>
              {copied === "m" ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        )}
        <p className="mt-2 text-[12px] text-faint">
          You&apos;ll receive about <b className="text-ink">{swap.amountOut} NEAR</b> at {swap.recipient}
          {swap.timeEstimate ? `, usually ~${Math.max(1, Math.round(swap.timeEstimate / 60))} min after the deposit confirms` : ""}.
          {swap.deadline ? ` Deposit before ${new Date(swap.deadline).toLocaleTimeString()}.` : ""}
        </p>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-3 py-2.5 text-[13px]">
        <span className="text-muted">Status</span>
        <span className={cx("flex items-center gap-1.5 font-semibold", st.tone)}>
          {!FINAL.has(swap.status) && <Spinner />} {st.label}
        </span>
      </div>
      {swap.refundReason && <p className="text-[12px] text-muted">Refund reason: {swap.refundReason}</p>}
      {swap.destinationTxs?.map((t) => (
        <a key={t.hash} href={t.explorerUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[13px] text-teal">
          View NEAR delivery <ExternalLink size={13} />
        </a>
      ))}

      {!FINAL.has(swap.status) && (
        <div className="flex gap-2">
          <input className="input flex-1 font-mono text-[12px]" placeholder="Optional: deposit tx hash (speeds it up)" value={tx} onChange={(e) => setTx(e.target.value.trim())} />
          <button className="btn btn-ghost" disabled={tx.length < 10 || sent} onClick={submitTx}>
            {sent ? <Check size={16} /> : "Send"}
          </button>
        </div>
      )}
      <button className="btn btn-ghost w-full" onClick={onDone}>
        {FINAL.has(swap.status) ? "New swap" : "Back"}
      </button>
    </div>
  );
}
