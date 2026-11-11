# Development log

## 2026-11-11: no fake players; data-loss alarm
- Removed the seeded sample players. The leaderboard shows real explorers only, and existing sample rows are deleted on startup.
- **Bug report:** "my profile resets to 0 after signing in with NEAR Mobile." The live admin data showed the cause was the mainnet service's database being **wiped on every redeploy**: one player created that morning, and 0 claims despite 1 claim on-chain. Wallet sign-in itself worked (`teevincs.near` was linked correctly). The Railway service had no volume at `/data`.
- After the deploy, the new check found the real cause: a volume **was** attached at `/data`, but a `TREZO_DB_PATH=data/trezo.db` variable put the database at `/app/data/trezo.db`, outside the volume. On Railway the server now always keeps the database on the mounted volume, whatever `TREZO_DB_PATH` says, and `.env.example` no longer suggests a relative path.
- The server now checks its storage (`storageStatus()`, using Railway's `RAILWAY_VOLUME_MOUNT_PATH`). It logs a warning at startup, and the admin page shows a red banner with the time the database was created when data isn't persistent.

## 2026-11-09: satellite map, easier to find treasure
- A tester asked for an Apple-Maps-style view. **Satellite is now the default**:
  - Esri World Imagery, with roads, road names, places and water names drawn on top from OpenFreeMap vector tiles;
  - a map/satellite toggle, remembered per device.
- The player is now an Apple-style **blue dot with a heading beam**. It uses the phone's compass: `deviceorientationabsolute` on Android, and `webkitCompassHeading` on iOS after a tap on Recenter grants permission. It falls back to the GPS direction of travel.
- **Finding treasure:**
  - a dashed guide line from the player to the selected (or nearest) treasure;
  - stronger pulsing halos on every unopened marker;
  - the Nearby and treasure-card arrows now point relative to where the phone faces, so you can follow them.
- Fixed an old bug: the Nearby arrow used lucide's `Navigation` icon, which points north-east, so every direction was off by 45°. It now uses `Navigation2`.
- Verified with stand-in imagery (the tile hosts aren't reachable from the build environment). The smoke and GPS suites pass.

## 2026-11-09: NEAR Intents
- **"Add NEAR from any chain"** (Profile and the Merchant tab, mainnet only), built on the 1Click Swap API. The API shapes come from the official `@defuse-protocol/one-click-sdk-typescript` types, because the docs host wasn't reachable from the build environment.
- The server forces the recipient to the session's NEAR account and stores signed quotes. Status is owner-only and proxied.
- 8 new unit tests against a mocked 1Click, and phone screenshots of the flow (mocked responses).
- **Not yet verified:** a live swap with a real deposit.

## 2026-11-09: mainnet
- Reproducible build (cargo-near 0.22.0 / Rust 1.97.0 image, pinned by digest). The local sandbox's Docker Hub rate limit and lack of container network needed a local `docker` wrapper: it skips the registry re-check for the already-pulled digest and passes the HTTPS proxy. Neither changes the build inputs.
- New `scripts/mainnet-account.mjs` (one-time funding address → named `.near` account via the registrar → close and return leftovers). `deploy-contract.mjs` now initialises with itself as owner, transfers ownership and supports `--delete-keys`.
- Rehearsed the whole procedure on testnet (`trezo-rehearsal-65920b.testnet`). The keyless contract played the full loop.
- Deployed **`trezo-game.near`**:
  - code hash matches the reproducible wasm;
  - economy locked, ownership with `trezonear.near`, 0 access keys;
  - 0.1 NEAR Merchant seed, because of the budget.
- First create attempt was rejected before execution (prepaid gas reservation pushed the cost over the balance); retried with 4.63 NEAR.

## 2026-11-08: security fixes, fresh testnet contract
- Implemented the [pre-mainnet review](SECURITY_REVIEW.md) fixes. **Contract:** NEP-145-style storage deposits charged on every player call that grows state (C-1), a per-account daily ticket limit and a global hourly mint ceiling (C-4), and an irreversible `lock_economy` that freezes NPCs, offers and the market fee (C-3). **Server:** demo-zone rewards are never minted on mainnet (S-1), the client IP comes from the trusted proxy hop (S-2), sessions rotate on login (S-3), and there are clickjacking/base-uri/object/form-action CSP directives plus HSTS (S-5).
- **App:** when the prepaid storage balance is low, a 0.02 NEAR `storage_deposit` action is added to the same wallet transaction, so it's still one approval.
- The state layout changed, so this is a **new contract**: `trezo-v2-f8ff97.testnet` (8 deploy/config txs, the last one `lock_economy`). The full testnet demo was re-run against it (claim, storage deposits, list, buy, Merchant sale and buyback). The old `trezo-game-0e8b06.testnet` is retired.
- A unit test hit NEAR's 16 KB total-log limit by making 51 claims in one mocked context. The test now resets the context per call, as on-chain each claim is its own transaction.
- Tests: contract 42, server 37, local chain 34, smoke 14, GPS 6 + 4.

## 2026-11-08: faster location, wallet guidance
- Tester feedback: finding the location took very long. Precise GPS is now refined in the background after a **rough Wi-Fi/cell fix shown in ~0.5 s** ("Approximate · sharpening GPS…").
- A GPS timeout no longer shows "Can't find your location"; it says "Still finding you…" and keeps trying.
- Rough fixes (> 150 m) are never sent to the server, so they can't trip the jump detector. Arrival and claims wait for precise GPS (≤ 75 m).
- NEAR Mobile is mainnet-only in the NEAR Connect manifest, so it's hidden on testnet. The profile now explains this and suggests Meteor Web (choose "Meteor Web" inside the Meteor app).
- New `scripts/e2e-gps-slow.cjs` (4 checks); `npm run test:e2e:gps` runs both GPS suites.

## 2026-11-08: Docker deployment
- Railway's Railpack builder failed to download from GitHub (outage on their side), blocking deploys. Added a `Dockerfile` (node:22-slim, multi-stage, `NEXT_PUBLIC_*` as build args, honours `PORT`, DB on `/data`) and a `.dockerignore`; Railway uses the Dockerfile automatically.
- The container test caught a real bug: empty build args made `NEXT_PUBLIC_DEMO_LAT=""` parse as `0`, moving the demo zone to 0°, 0°. `src/lib/config.ts` now treats empty values as unset.
- Verified in the built image with a fresh volume: smoke test 14/14, GPS test 6/6.

## 2026-11-08: map usability
- **Follow mode:** the camera tracks the player as they walk; dragging pauses it and ⌖ re-locks it (black when following).
- **First GPS fix** now centres the map. Before, it could stay on the default demo area until Recenter was tapped.
- **Arrival:** entering a treasure's radius vibrates the phone, shows a toast, bounces the marker and auto-opens the treasure once.
- **Heading:** a direction-of-travel arrow on the player dot when GPS reports a heading (while moving).
- **Fixed a dev-only reload loop** introduced by the `node:sqlite` switch: Turbopack traced the literal DB path as a build dependency, so every write reloaded the page. The path is now built at runtime, and WAL mode is back.
- New `scripts/e2e-gps.cjs` (6 checks). The smoke test still passes 14/14 on dev and production builds.

## 2026-11-08: live deployment fix
- Railway crashed with `Segmentation fault` on every database request. The `better-sqlite3` native addon was incompatible with the host image.
- Replaced it with Node's built-in `node:sqlite` behind `src/server/sqlite.ts`, which keeps the same API with lenient parameter binding and savepoint-nested transactions, plus 3 new adapter tests (32 server tests total). Switched to the rollback journal, pinned Node 22, and removed the native dependency.
- Verified a production build on a fresh database file: all DB routes return 200 and the E2E smoke test passes 14/14.

## 2026-11-08: UI redesign
- New light visual system, inspired by a reference shot the team supplied: warm paper canvas, porcelain cards, ink primary surfaces, a single ember accent, Unbounded display type, and a concentric-ring logo.
- New public landing page at `/` (it previously redirected to `/explore`), with live server stats and the testnet contract link.
- Floating ink dock with a white active pill, plus an orange Hunt button that focuses the nearest treasure. Onboarding was reworked as a "boarding pass". Explore gained orb controls and a Nearby panel. The reveal moved to a bright stage.
- Map styles switched to light OSM styles (OpenFreeMap Positron → CARTO Positron → dot-grid fallback).
- E2E smoke test now covers the landing page and the Hunt button (14 checks, all passing).

## 2026-11-07: testnet deployment
- NEAR RPC and the faucet were allowed in the environment. Created `trezo-game-0e8b06.testnet` via the faucet and deployed with `npm run contract:deploy` (7 txs, all succeeded first try, thanks to the earlier sandbox fix for wasm host imports).
- Added `scripts/testnet-demo.mjs`, which ran the full loop on testnet: NEP-413 login, claim → mint, settlement, listing, purchase, Merchant sale and buyback. Links are in the README and `deployments/testnet-demo.json`.
- Note: Node's built-in `fetch` ignores `HTTPS_PROXY`; in proxied containers run with `NODE_USE_ENV_PROXY=1`.

## 2026-11-04: initial build

### Reconnaissance
- The repository was empty apart from a placeholder README.
- `nearhackathon.com` (`HACKATHON.md` and the site) was **not reachable** from the build container (egress policy). The brief's track description (Track 09, Games With Real Economies) was used as the source of truth.
- Current NEAR guidance was read from the `near/docs` repository:
  - wallet login is **NEAR Connect** (`@hot-labs/near-connect`) with near-api-js, not Wallet Selector;
  - FastAuth is deprecated, and social login goes through Privy/Web3Auth or NEAR Connect wallets;
  - contracts use near-sdk with `cargo near build` and `near deploy` (near-cli-rs);
  - NEP-245 is a final token standard, and its spec plus extensions were read from `near/NEPs`.
- Versions in use: near-sdk 5.30, cargo-near 0.22, near-api-js 7.4, NEAR Connect 0.12, Next.js 16.4, React 19.3, MapLibre 6.16, Tailwind 4.3.

### Completed
- **Contract:** oracle-ticket claims, NEP-245 (core, metadata, enumeration, events, transfer_call), escrowed marketplace, NPC treasuries with a bonding curve and capped buybacks, admin and pause. 34 unit tests.
- **Server:** SQLite schema and seed, proximity claim engine with anti-cheat, Shard economy with a daily cap and ledger, procedural spawn fields, quests (daily, weekly, special, community), NPC missions (progress and exchange), Shard Shop, leaderboard, profiles, NEP-413 login, oracle ticket signing, on-chain settlement verification, admin API with audit log. 29 tests.
- **UI:** onboarding, Explore (map, list, search, demo zone, GPS states, proximity sheet, discovery alerts, opening animation), Quests and Guild (NPC dialogue, live on-chain treasuries), Inventory (vault plus live on-chain balances, rewards and mint), item detail (list, transfer, sell to Merchant), Market (players, Merchant, Shard Shop), Leaderboard, Profile, public profiles, Admin dashboard. Original SVG art for all collectibles.
- **Tooling:** oracle keygen, an idempotent deploy-and-configure script, a browser e2e smoke test, a full-stack local NEAR sandbox test (30 checks), and CI.

### Bugs found by testing and fixed
| Bug | Found by | Fix |
|---|---|---|
| A security event logged inside the claim transaction was rolled back with the rejected claim | vitest | log after rollback (`GameError.extra.audit`) |
| Mission/quest progress counted an event in the same millisecond as acceptance | vitest | windows start strictly after `accepted_at` / `joined_at` |
| MapLibre worker failed to load under Turbopack | browser console | copy the ESM worker to `/public/maplibre`, `setWorkerUrl` |
| Markers mispositioned: overwriting `className` dropped `maplibregl-marker` | screenshots | MapLibre owns the outer element; we style an inner one |
| Map container had zero height (MapLibre's unlayered CSS beats Tailwind's layered utilities) | DOM inspection | inline `position:absolute; inset:0` |
| Bottom sheets rendered under the nav bar (map page stacking context) | e2e (click intercepted) | portal overlays to `<body>` |
| Desktop logo invisible (duplicate SVG gradient id inside a `display:none` element) | screenshot | `useId()`-scoped gradient ids |
| Production build failed: session-secret check ran at module load | `next build` | lazy getter; random per-process secret plus a warning when unset |
| **Wasm rejected by neard: "Link Error: unknown or invalid import"** (high-level `Promise` linked gas-key and state-init host functions newer than protocol 86) | sandbox test | low-level `env::promise_*`; the wasm imports only what it uses |
| Sandbox test reused a stale app server (killing `npx` didn't kill `next`) | sandbox test | spawn detached, kill the process group, fail if the port is busy |

### Remaining work / not done
- ~~Deploy to NEAR testnet~~ (done 2026-11-07). Still to do: a recorded browser-wallet (NEAR Connect) run on testnet.
- Host the app on a platform with a persistent volume, and set `TREZO_APP_URL` for NEP-245 media URLs.
- Optional: one-step cross-chain Merchant purchases (needs NEP-141 support in the contract), NEP-245 Approval Management, an embedded social-login provider (Privy/Web3Auth), device attestation for anti-spoofing, and Postgres/Redis for horizontal scaling.

### Known issues
- GPS spoofing can't be fully prevented (see [SECURITY.md](SECURITY.md)).
- Rate limits are per process (in-memory).
- Free OSM-based tile styles have no SLA; offline-grid fallback included.
- Place search uses the public Nominatim service (low volume only).
