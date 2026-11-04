"use client";
import { useCallback, useEffect, useState } from "react";
import { viewContract } from "@/lib/near-client";
import { publicConfig } from "@/lib/config";

/** Live NEP-245 balances for an account, read straight from the contract. */
export function useOnchainHoldings(accountId: string | null | undefined) {
  const [balances, setBalances] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!accountId || !publicConfig.contractId) {
      setBalances(null);
      return;
    }
    try {
      const tokens = await viewContract<{ token_id: string }[]>("mt_tokens_for_owner", { account_id: accountId, from_index: null, limit: 100 });
      const ids = tokens.map((t) => t.token_id);
      const amounts = ids.length ? await viewContract<string[]>("mt_batch_balance_of", { account_id: accountId, token_ids: ids }) : [];
      setBalances(Object.fromEntries(ids.map((id, i) => [id, Number(amounts[i] ?? 0)])));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [accountId]);
  useEffect(() => {
    load();
  }, [load]);
  return { balances, error, reload: load };
}
