import { handle } from "@/server/api";
import { oracleConfigured, oraclePublicKey } from "@/server/oracle";
import { publicConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const GET = handle(async () => ({
  network: publicConfig.network,
  contractId: publicConfig.contractId || null,
  onchainSettlement: oracleConfigured(),
  oraclePublicKey: oraclePublicKey()?.near ?? null,
}));
