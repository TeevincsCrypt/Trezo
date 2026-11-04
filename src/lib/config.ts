/**
 * Public (browser-safe) configuration. Only NEXT_PUBLIC_* values belong here.
 * Server secrets live in src/server/env.ts.
 */
export type NearNetwork = "testnet" | "mainnet";

const network = (process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet") as NearNetwork;

export const publicConfig = {
  network,
  /** Account id of the deployed TREZO contract. Empty = on-chain features disabled. */
  contractId: process.env.NEXT_PUBLIC_TREZO_CONTRACT_ID ?? "",
  rpcUrl:
    process.env.NEXT_PUBLIC_NEAR_RPC_URL ||
    (network === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com"),
  explorerUrl: network === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io",
  /**
   * MapLibre style URL(s), comma separated, tried in order. Defaults are free,
   * key-less OpenStreetMap-based styles. If all fail the map falls back to an
   * offline grid so gameplay keeps working.
   */
  mapStyles: (
    process.env.NEXT_PUBLIC_MAP_STYLE_URLS ||
    "https://tiles.openfreemap.org/styles/dark,https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Centre of the clearly-labelled demo exploration zone. */
  demoCenter: {
    lat: Number(process.env.NEXT_PUBLIC_DEMO_LAT ?? 40.7812),
    lng: Number(process.env.NEXT_PUBLIC_DEMO_LNG ?? -73.9665),
    name: process.env.NEXT_PUBLIC_DEMO_NAME ?? "Central Park Demo Zone",
  },
};

export const onchainEnabled = () => publicConfig.contractId.length > 0;

export const txUrl = (hash: string) => `${publicConfig.explorerUrl}/txns/${hash}`;
export const accountUrl = (id: string) => `${publicConfig.explorerUrl}/address/${id}`;
