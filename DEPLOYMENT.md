# Deployment

TREZO has two deployable parts: the **NEAR contract** (`contracts/trezo`) and the **Next.js app** (game server and UI).

> **Status:** deployed to **testnet** at [`trezo-v2-f8ff97.testnet`](https://testnet.nearblocks.io/address/trezo-v2-f8ff97.testnet) on 2026-11-08 (post-security-review build, economy locked) using exactly this procedure (record at the bottom). **Mainnet is not deployed.** The app is live on Railway at https://trezo-production-0500.up.railway.app.

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
5. calls `lock_economy`, which **irreversibly** freezes NPCs, offers, prices and the market fee (set `TREZO_LOCK_ECONOMY=0` to skip it on a development contract; once locked, steps 3 and 5 are skipped on re-runs);
6. prints an explorer link for **every transaction** and writes `deployments/testnet.json`.

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

> Requires **Node 22 (≥ 22.13)**, pinned via `.nvmrc`, `.node-version` and `engines`. SQLite is Node's built-in `node:sqlite`, so there's no native module to compile.

### Railway (what the live deployment uses)
The repo ships a tested `Dockerfile`, which Railway uses automatically. That avoids Railpack's builder download, which failed during a Railway/GitHub outage. Leave the custom build and start commands empty.
1. New project → Deploy from GitHub → `main`.
2. Attach a volume at `/data`.
3. Variables: `NEXT_PUBLIC_NEAR_NETWORK`, `NEXT_PUBLIC_TREZO_CONTRACT_ID`, `TREZO_ORACLE_SECRET_KEY`, `TREZO_SESSION_SECRET`, `TREZO_ADMIN_TOKEN`, `TREZO_DB_PATH=/data/trezo.db`. Redeploy after setting `NEXT_PUBLIC_*`, since they're compiled in.
4. Check `/api/config` shows `onchainSettlement: true`.


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

Rehearsed end to end on testnet with the same binary: [`trezo-rehearsal-65920b.testnet`](https://testnet.nearblocks.io/address/trezo-rehearsal-65920b.testnet). Its records are `deployments/testnet-rehearsal*.json`. After its keys were deleted it still played the full loop.

1. **Reproducible build** (Docker): `cd contracts/trezo && cargo near build reproducible-wasm`. The wasm embeds NEP-330 metadata (`contract_source_metadata`) naming the exact git commit and image, so anyone can rebuild and compare hashes.
2. **Funding address:** `NEXT_PUBLIC_NEAR_NETWORK=mainnet node scripts/mainnet-account.mjs funder` prints a one-time implicit account. Send it about **6.2 NEAR**:
   - ~4.05 NEAR for contract storage (the 393 KB wasm plus config);
   - 0.5 NEAR for the Merchant treasury;
   - about 1.5 NEAR of headroom for contract-paid claim storage.
3. **Named account:** `... mainnet-account.mjs create <name>.near 6.1` registers the name through the `near` registrar with a fresh key.
4. **Fresh oracle key** (O-1): `npm run oracle:keygen`. Never reuse the testnet key.
5. **Deploy, lock, hand over, seal:** `NEXT_PUBLIC_NEAR_NETWORK=mainnet NEXT_PUBLIC_TREZO_CONTRACT_ID=<name>.near TREZO_OWNER_ID=<your-wallet>.near node scripts/deploy-contract.mjs --delete-keys`. This deploys and initialises, configures items, NPCs and offers, funds the Merchant, calls `lock_economy`, then `transfer_ownership` to your wallet, and finally **deletes every access key** of the contract account (C-2). After this, nobody can redeploy the code or move its NEAR except through contract rules.
6. **Return leftovers:** `... mainnet-account.mjs close <funder-id> <your-wallet>.near`.
7. **Host:** set the following on a mainnet app instance:
   - `NEXT_PUBLIC_NEAR_NETWORK=mainnet`;
   - `NEXT_PUBLIC_TREZO_CONTRACT_ID=<name>.near`;
   - the new oracle key;
   - a new session secret and admin token;
   - a fresh database.

What the owner wallet can still do: `set_oracle_key` (rotate a leaked key), `set_paused`, `add_item_type` (new items), `reduce_max_supply` and `transfer_ownership`. It cannot change NPC offers, prices or fees (locked) or upgrade the code (no keys). Anyone can top up the contract's storage balance with a plain NEAR transfer.

**Done 2026-11-09:** `trezo-game.near`, owner `trezonear.near`, keys deleted, 0.1 NEAR Merchant seed. The record is in `deployments/mainnet.json`. After deployment the contract held 4.62 NEAR, with 4.02 NEAR locked for storage. Mainnet app: https://exquisite-expression-production-412c.up.railway.app, a separate Railway service with its own volume, fresh secrets and a fresh database. Its oracle public key matches the contract, and the smoke test passes 14/14.

## Deployment record

From `deployments/testnet.json` and `deployments/testnet-demo.json`:

| Field | Value |
|---|---|
| Network | testnet |
| Contract account | [`trezo-v2-f8ff97.testnet`](https://testnet.nearblocks.io/address/trezo-v2-f8ff97.testnet) (owner: same account; testnet only, see C-2) |
| Deploy + init transaction | [`9k1QRNGopudL7gsux7TUXASZmgCByTdhfBWjXH58fzbv`](https://testnet.nearblocks.io/txns/9k1QRNGopudL7gsux7TUXASZmgCByTdhfBWjXH58fzbv) |
| Configuration | 7 more txs (13 item types, 4 NPCs, 10 offers, 0.5 NEAR Merchant seed, `lock_economy`); see `deployments/testnet.json` |
| Wasm SHA-256 | `c22d67932ac6a4f1c4f6d55c318a1a334f2f52e6ff5cbe086631fe4e17374485` (non-reproducible build) |
| Demo transactions | claim/mint, storage deposits, list, buy, Merchant sale and buyback: `deployments/testnet-demo.json` (`node scripts/testnet-demo.mjs`) |
| Oracle public key (base64) | `wSJv/MHX/IarrEaF3ql7EFsYXiamREGAt53joFU76ks=` |
| Previous contract | `trezo-game-0e8b06.testnet` (2026-11-07, pre-review; retired, state layout changed): `deployments/testnet-v1*.json` |
| App URL | https://trezo-production-0500.up.railway.app (Railway) |
