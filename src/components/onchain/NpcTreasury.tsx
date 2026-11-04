"use client";
import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { formatNear, viewContract } from "@/lib/near-client";
import { accountUrl, publicConfig } from "@/lib/config";
import { useItems } from "../hooks";

export interface OnchainNpc {
  npc: { id: string; name: string; treasury: string; daily_spend_limit: string; spent_today: string; total_received: string; total_spent: string };
  offers: { offer: { token_id: string; allocation: string; base_price: string; buyback_bps: number; sold: string; bought_back: string }; current_price: string; buyback_price: string }[];
}

/** Live view of an NPC's on-chain treasury & allocations (read from the contract). */
export function NpcTreasury({ npcId, color }: { npcId: string; color: string }) {
  const { byId } = useItems();
  const [data, setData] = useState<OnchainNpc | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!publicConfig.contractId) return;
    viewContract<OnchainNpc | null>("get_npc", { npc_id: npcId })
      .then(setData)
      .catch((e) => setErr((e as Error).message));
  }, [npcId]);

  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-3.5">
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-muted">
        <Landmark size={14} style={{ color }} /> On-chain treasury
      </div>
      {!publicConfig.contractId ? (
        <p className="mt-1.5 text-[13px] text-muted">The TREZO contract isn&apos;t configured on this deployment, so this NPC&apos;s treasury can&apos;t be shown.</p>
      ) : err ? (
        <p className="mt-1.5 text-[13px] text-muted">Couldn&apos;t read the contract: {err}</p>
      ) : data === undefined ? (
        <div className="skeleton mt-2 h-10" />
      ) : data === null ? (
        <p className="mt-1.5 text-[13px] text-muted">This NPC has not been registered on-chain yet.</p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="font-display text-lg font-bold tabular">{formatNear(data.npc.treasury)}</p>
              <p className="text-[11px] text-muted">NEAR held</p>
            </div>
            <div>
              <p className="font-display text-lg font-bold tabular">{formatNear(data.npc.daily_spend_limit)}</p>
              <p className="text-[11px] text-muted">Daily limit</p>
            </div>
            <div>
              <p className="font-display text-lg font-bold tabular">{formatNear(data.npc.total_spent)}</p>
              <p className="text-[11px] text-muted">Paid out</p>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {data.offers.map((o) => (
              <div key={o.offer.token_id} className="flex justify-between text-[12.5px]">
                <span className="text-muted">{byId[o.offer.token_id]?.name ?? o.offer.token_id}</span>
                <span className="tabular">{BigInt(o.offer.allocation).toLocaleString()} left</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-faint">
            Held by{" "}
            <a className="underline" href={accountUrl(publicConfig.contractId)} target="_blank" rel="noreferrer">
              {publicConfig.contractId}
            </a>{" "}
            under rules nobody can override. Allocations only shrink as rewards are paid.
          </p>
        </>
      )}
    </div>
  );
}
