<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# TREZO: guide for AI agents and reviewers

TREZO is a location-based treasure-hunting game on NEAR (Track 09: Games With Real Economies). Start with `README.md`.

## Run / verify
- `npm install && npm run dev`, then open http://localhost:3000 (no env needed; SQLite auto-seeds into `data/trezo.db`).
- `npm test` (29 server tests), `npm run test:contract` (34 Rust tests), `npm run typecheck`, `npm run build`.
- `npm run test:e2e` (browser smoke test; needs a running server and Playwright).
- `npm run contract:build && npm run test:sandbox` (local NEAR node, 30 on-chain checks).

## Where things are
- Contract: `contracts/trezo/src/{lib,mt,market,npc,tests}.rs` (near-sdk 5.30, NEP-245).
- Server game rules: `src/server/game.ts` (claims, anti-cheat), `progress.ts` (quests/missions), `inventory.ts`, `oracle.ts` (claim tickets), `auth.ts` (sessions, NEP-413, admin).
- Economy constants: `src/lib/rules.ts`; catalog (items/NPCs/quests): `src/data/catalog.json`.
- API routes: `src/app/api/**/route.ts` (thin wrappers that use `handle()`, zod `body()` and `limit()`).

## Conventions
- Server modules import `server-only`. Routes never trust client positions beyond validation; every rule lives in `src/server`.
- Never present off-chain Shards as a token, and never show a mint as done unless `settleReward` confirmed it on-chain.
- The contract uses low-level `env::promise_*` (not `near_sdk::Promise`) to keep wasm imports compatible with deployed protocol versions.
- Keep the docs (README, ARCHITECTURE, SECURITY, TESTING, DEPLOYMENT, DEVLOG) in sync with behaviour.
