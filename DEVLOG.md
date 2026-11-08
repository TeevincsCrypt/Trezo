# Development log

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
- Optional: NEAR Intents (cross-chain payment for Merchant items), NEP-245 Approval Management, an embedded social-login provider (Privy/Web3Auth), device attestation for anti-spoofing, and Postgres/Redis for horizontal scaling.

### Known issues
- GPS spoofing can't be fully prevented (see [SECURITY.md](SECURITY.md)).
- Rate limits are per process (in-memory).
- Free OSM-based tile styles have no SLA; offline-grid fallback included.
- Place search uses the public Nominatim service (low volume only).
