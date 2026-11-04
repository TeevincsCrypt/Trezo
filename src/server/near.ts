import "server-only";
import { JsonRpcProvider } from "near-api-js";
import bs58 from "bs58";
import { verifyMessage } from "near-api-js/nep413";
import { publicConfig } from "@/lib/config";
import { serverEnv } from "./env";

type ProviderLike = Pick<JsonRpcProvider, "viewAccessKey" | "callFunction">;

let provider: ProviderLike | null = null;
export function nearProvider(): ProviderLike {
  if (!provider) provider = new JsonRpcProvider({ url: serverEnv.rpcUrl || publicConfig.rpcUrl });
  return provider;
}

/** Testing hook. */
export function setNearProviderForTests(p: ProviderLike | null) {
  provider = p;
}

export async function viewContract<T>(method: string, args: Record<string, unknown> = {}): Promise<T | undefined> {
  if (!publicConfig.contractId) throw new Error("Contract not configured");
  return (await nearProvider().callFunction({ contractId: publicConfig.contractId, method, args })) as T | undefined;
}

export function decodeSignature(sig: string): Uint8Array {
  const clean = sig.startsWith("ed25519:") ? sig.slice(8) : sig;
  const b64 = Buffer.from(clean, "base64");
  if (b64.length === 64) return new Uint8Array(b64);
  // Some wallets return base58.
  const b58 = bs58.decode(clean);
  if (b58.length === 64) return b58;
  throw new Error("Unrecognised signature encoding");
}

/**
 * Verify a NEP-413 signed message: checks the ed25519 signature over the
 * NEP-413 payload AND that the public key is a FullAccess key of the account
 * (via RPC), using near-api-js's official verifier.
 */
export async function verifyNep413(input: {
  accountId: string;
  publicKey: string;
  signature: string;
  message: string;
  recipient: string;
  nonce: Uint8Array;
}) {
  await verifyMessage({
    signerAccountId: input.accountId,
    signerPublicKey: input.publicKey,
    payload: { message: input.message, recipient: input.recipient, nonce: input.nonce },
    signature: decodeSignature(input.signature),
    // The verifier only uses viewAccessKey.
    provider: nearProvider() as unknown as JsonRpcProvider,
  });
}
