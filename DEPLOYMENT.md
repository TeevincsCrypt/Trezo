# Deployment

TREZO has two deployable parts: the **NEAR contract** (`contracts/trezo`) and the **Next.js app** (game server and UI).

> **Status:** deployed to **testnet** at [`trezo-game-0e8b06.testnet`](https://testnet.nearblocks.io/address/trezo-game-0e8b06.testnet) on 2026-11-07 using exactly this procedure (record at the bottom). **Mainnet is not deployed.** The app is not hosted yet.

## 0. Prerequisites

```bash
# Rust (stable ≥ 1.95) + wasm target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# NEAR CLI (near-cli-rs) and cargo-near: official installers from docs.near.org
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/cargo-near/releases/latest/download/cargo-near-installer.sh | sh
# (or: cargo install cargo-near --locked --no-default-features)

npm install
```

## 1. Create the contract account (testnet)

```bash
near account create-account sponsor-by-faucet-service trezo-<yourname>.testnet \
  autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
```

This saves the key to `~/.near-credentials/testnet/trezo-<yourname>.testnet.json`, where the deploy script finds it automatically. Alternatively, export `NEAR_PRIVATE_KEY=ed25519:…` (never commit it).

The wasm is about 380 KB, and storage staking costs roughly 1 NEAR per 100 KB. The faucet's 10 NEAR covers deployment, configuration and the 0.5 NEAR Merchant seed.

## 2. Generate the oracle key

```bash
npm run oracle:keygen
```

Put `TREZO_ORACLE_SECRET_KEY=ed25519:…` in `.env.local`. It is a **server-only secret**: it signs claim tickets and controls no NEAR. The deploy script derives the public key and stores it in the contract.

## 3. Configure `.env.local`

```bash
cp .env.example .env.local
# then set at least:
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_TREZO_CONTRACT_ID=trezo-<yourname>.testnet
TREZO_ORACLE_SECRET_KEY=ed25519:...           # from step 2
TREZO_SESSION_SECRET=<32+ random chars>       # openssl rand -base64 32
TREZO_ADMIN_TOKEN=<long random token>
TREZO_APP_URL=https://your-app.example        # used for NEP-245 media URLs
```

## 4. Build and deploy the contract

```bash
npm run contract:build      # cargo near build non-reproducible-wasm
npm run contract:deploy     # node scripts/deploy-contract.mjs
```

The script is **idempotent**. It:
1. deploys the wasm and calls `new(owner_id, oracle_public_key)` (first run only);
2. registers all 13 NEP-245 item types from `src/data/catalog.json`;
3. registers the 4 NPCs and their offers/allocations;
4. seeds the Merchant treasury (`TREZO_FUND_MERCHANT_NEAR`, default 0.5);
5. prints an explorer link for **every transaction** and writes `deployments/testnet.json`.

Re-running only applies what's missing. Use `--upgrade` to redeploy new code while keeping state. If the oracle key in `.env.local` changed, it calls `set_oracle_key`.

Verify:

```bash
near contract call-function as-read-only trezo-<yourname>.testnet get_stats json-args {} network-config testnet now
near contract call-function as-read-only trezo-<yourname>.testnet mt_metadata_contract json-args {} network-config testnet now
```

## 4b. Optional: scripted on-chain demo

`node scripts/testnet-demo.mjs` creates two faucet-funded players and plays claim → mint → list → buy → Merchant buy/sell with real transactions, writing `deployments/testnet-demo.json`. (In a proxied container, run Node with `NODE_USE_ENV_PROXY=1` so `fetch` uses the proxy.)

## 5. Run the app against it

`NEXT_PUBLIC_*` variables are compiled in at build time:

```bash
npm run build
npm start                   # http://localhost:3000
```

Then, in the browser: create a profile, go to **Profile → Connect NEAR wallet** (NEAR Connect opens; approve the sign-in message), claim a treasure, and choose **Mint on NEAR** in the reveal or in **Inventory → Rewards**. The transaction link opens NearBlocks testnet. List the minted item from its detail page, and buy it from a second account.

## 6. Hosting the app

The game server stores state in SQLite, so it needs a **persistent filesystem**:

- **Railway / Render / Fly.io / any VM or container**: `npm ci && npm run build && npm start`, with a volume mounted and `TREZO_DB_PATH=/data/trezo.db`.
- **Docker** (example):
  ```Dockerfile
  FROM node:22-slim
  WORKDIR /app
  COPY . .
  RUN npm ci && npm run build
  ENV TREZO_DB_PATH=/data/trezo.db NODE_ENV=production
  VOLUME /data
  CMD ["npm","start"]
  ```
- Serverless hosts with ephemeral disks (e.g. Vercel) are **not** suitable without swapping SQLite for a hosted database.

Set the same environment variables on the host. Keep `TREZO_ORACLE_SECRET_KEY`, `TREZO_SESSION_SECRET` and `TREZO_ADMIN_TOKEN` in the host's secret store.

## 7. Mainnet

The same flow with `NEXT_PUBLIC_NEAR_NETWORK=mainnet` and a funded mainnet account. Before going to mainnet:
- use a dedicated owner account (`TREZO_OWNER_ID`) separate from the contract account, and consider removing the contract account's full-access key after configuration (`near account delete-keys`) so code can only change through a planned upgrade path;
- use a reproducible build (`cargo near build reproducible-wasm`; this needs Docker);
- review [SECURITY.md](SECURITY.md).

Do not claim a mainnet deployment until the `deployments/mainnet.json` transactions exist.

## Deployment record

From `deployments/testnet.json` and `deployments/testnet-demo.json`:

| Field | Value |
|---|---|
| Network | testnet |
| Contract account | [`trezo-game-0e8b06.testnet`](https://testnet.nearblocks.io/address/trezo-game-0e8b06.testnet) (owner: same account) |
| Deploy + init transaction | [`BHJzHKfYP9yTNcgn39x3ykTpE5YJZgaCgiQ3wmSihMZe`](https://testnet.nearblocks.io/txns/BHJzHKfYP9yTNcgn39x3ykTpE5YJZgaCgiQ3wmSihMZe) |
| Configuration | 6 more txs (13 item types, 4 NPCs, 10 offers, 0.5 NEAR Merchant seed); see `deployments/testnet.json` |
| Wasm SHA-256 | `487492eb0c069f9634bbbfd20cc6ba9d0ccebf0cb52e0396448388f08fed494b` (non-reproducible build) |
| Demo transactions | claim/mint, list, buy, Merchant sale and buyback: `deployments/testnet-demo.json` (`node scripts/testnet-demo.mjs`) |
| Oracle public key (base64) | `wSJv/MHX/IarrEaF3ql7EFsYXiamREGAt53joFU76ks=` |
| App URL | not hosted yet |
