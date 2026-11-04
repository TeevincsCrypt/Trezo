"use client";
/**
 * Browser-side NEAR integration.
 *  - Wallet connection & signing: NEAR Connect (@hot-labs/near-connect), the
 *    connector currently recommended in the NEAR docs.
 *  - Read-only calls: near-api-js JsonRpcProvider.
 * Transactions are only reported as successful when the execution outcome
 * says so; failures surface the on-chain error.
 */
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import { JsonRpcProvider } from "near-api-js";
import { publicConfig } from "./config";

let connectorPromise: Promise<NearConnector> | null = null;

export function getConnector(): Promise<NearConnector> {
  if (typeof window === "undefined") throw new Error("NEAR Connect is browser-only");
  if (!connectorPromise) {
    connectorPromise = import("@hot-labs/near-connect").then(
      ({ NearConnector }) =>
        new NearConnector({
          network: publicConfig.network,
          features: { signMessage: true, signAndSendTransaction: true },
          providers: { [publicConfig.network]: [publicConfig.rpcUrl] },
          autoConnect: true,
        }),
    );
  }
  return connectorPromise;
}

let provider: JsonRpcProvider | null = null;
export function rpc() {
  if (!provider) provider = new JsonRpcProvider({ url: publicConfig.rpcUrl });
  return provider;
}

export async function viewContract<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!publicConfig.contractId) throw new Error("TREZO contract is not configured");
  return (await rpc().callFunction({ contractId: publicConfig.contractId, method, args })) as T;
}

export async function connectedWallet(): Promise<{ wallet: NearWalletBase; accountId: string } | null> {
  try {
    const c = await getConnector();
    const { wallet, accounts } = await c.getConnectedWallet();
    if (!accounts[0]) return null;
    return { wallet, accountId: accounts[0].accountId };
  } catch {
    return null;
  }
}

export interface TxResult {
  txHash: string;
  returnValue: unknown;
}

type Outcome = {
  status?: unknown;
  transaction?: { hash?: string };
  transaction_outcome?: { id?: string };
};

function failureMessage(status: unknown): string | null {
  if (status && typeof status === "object" && "Failure" in (status as Record<string, unknown>)) {
    const f = JSON.stringify((status as Record<string, unknown>).Failure);
    const m = f.match(/Smart contract panicked: ([^"\\]+)/);
    return m ? m[1] : f.slice(0, 200);
  }
  return null;
}

function decodeReturn(status: unknown): unknown {
  if (status && typeof status === "object" && "SuccessValue" in (status as Record<string, unknown>)) {
    const v = (status as { SuccessValue: string }).SuccessValue;
    if (!v) return null;
    try {
      return JSON.parse(atob(v));
    } catch {
      return v;
    }
  }
  return null;
}

/** Call a change method on the TREZO contract through the user's wallet. */
export async function callContract(method: string, args: Record<string, unknown>, opts: { deposit?: string; gasTgas?: number } = {}): Promise<TxResult> {
  if (!publicConfig.contractId) throw new Error("TREZO contract is not configured");
  const c = await getConnector();
  const wallet = await c.wallet();
  const outcome = (await wallet.signAndSendTransaction({
    receiverId: publicConfig.contractId,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: method,
          args,
          gas: String(BigInt(opts.gasTgas ?? 100) * 1_000_000_000_000n),
          deposit: opts.deposit ?? "0",
        },
      },
    ],
  })) as unknown as Outcome;
  const txHash = outcome?.transaction?.hash ?? outcome?.transaction_outcome?.id ?? "";
  const failure = failureMessage(outcome?.status);
  if (failure) throw Object.assign(new Error(failure), { txHash });
  if (!txHash) throw new Error("Wallet did not return a transaction result");
  return { txHash, returnValue: decodeReturn(outcome?.status) };
}

export const YOCTO = 10n ** 24n;

export function formatNear(yocto: string | bigint, digits = 3): string {
  const v = BigInt(yocto);
  const whole = v / YOCTO;
  const frac = (v % YOCTO).toString().padStart(24, "0").slice(0, digits).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function parseNear(near: string): string {
  const [w, f = ""] = near.trim().split(".");
  if (!/^\d+$/.test(w || "0") || !/^\d*$/.test(f)) throw new Error("Invalid NEAR amount");
  return (BigInt(w || "0") * YOCTO + BigInt((f + "0".repeat(24)).slice(0, 24))).toString();
}
