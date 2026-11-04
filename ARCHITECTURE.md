# Architecture

## Design goals

1. **Server-authoritative gameplay, on-chain ownership.** The rules that need location and context (proximity, cooldowns, quests) run on the game server. Anything a player *owns* or *trades*, and every NPC treasury, lives in the NEAR contract.
2. **No custodial keys.** The server never holds a funded NEAR key and never signs transactions for players. It only signs *claim tickets*; the player's own wallet submits them.
3. **Works with zero configuration.** `npm install && npm run dev` gives a fully playable game. On-chain features switch on when a contract is configured, and the UI says plainly when they're off.
4. **Honest by construction.** Off-chain Shards are never shown as tokens. Demo claims are flagged on-chain. The UI shows "minted" only after the server has read the claim back from the contract.

## Components

```
┌──────────────────────────── Browser ────────────────────────────┐
│ Next.js 16 client (React 19, Tailwind 4, Framer Motion, Lucide)  │
│  • Explore: MapLibre GL 6, markers, proximity UI, reveal         │
│  • LocationProvider: watchPosition → throttled /api/location     │
│  • WalletProvider: NEAR Connect → NEP-413 sign-in                │
│  • near-client: signAndSendTransaction + JsonRpcProvider views   │
└───────────────┬───────────────────────────────┬─────────────────┘
                │ JSON (cookies, zod, limits)   │ RPC (views) + wallet txs
┌───────────────▼──────────── Server ───┐  ┌────▼────────── NEAR ─────────┐
│ Route handlers  src/app/api/*         │  │ trezo contract (Rust)        │
│ game.ts     claims, location, rewards │  │  claim(ticket, sig)          │
│ progress.ts quests, NPC missions      │  │  NEP-245 multi-token         │
│ inventory.ts vault, shop, leaderboard │  │  marketplace (escrow)        │
│ auth.ts     sessions, NEP-413, admin  │  │  NPC treasuries & curve      │
│ oracle.ts   ticket signing/settlement │──┼─▶ get_claim (settlement read)│
│ near.ts     RPC provider, verifier    │  └──────────────────────────────┘
│ db.ts       SQLite (better-sqlite3)   │
└───────────────────────────────────────┘
```

## The claim pipeline (core mechanic)

```
Player  ──(GPS fix)──▶ /api/location     distance, exploration cells, streak, spawn field
Player  ──(open)─────▶ /api/treasures/:id/claim
                         └─ one SQLite transaction:
                            active? expired? supply left? right zone? not claimed?
                            cooldown? GPS accuracy ok? no impossible jump? within radius?
                            → claim row + reward (Shards w/ daily cap, XP, vault items)
Player  ──(mint)─────▶ /api/rewards/:id/ticket
                         └─ JSON ticket {id, contract_id, account_id, kind, ref_id,
                            max_claims, npc_id, items, demo, expires_at_ms}
                            signed ed25519 by the oracle; items → status "minting"
Wallet  ──(tx)───────▶ contract.claim(ticket, signature)
                         └─ verify signature over the exact bytes, contract_id,
                            predecessor == account_id, expiry ≤ 1h, unused id,
                            treasure: not claimed by account & count < max_claims,
                            mission: NPC allocation ≥ items → mint NEP-245, record
Player  ──(confirm)──▶ /api/rewards/:id/settle
                         └─ server reads get_claim(ticket_id) from chain; marks the
                            reward settled only if the record exists for this account
```

Why tickets? Proximity can't be verified on-chain, and we didn't want a hot wallet minting on players' behalf. Tickets make the server an *attester*, never a custodian. The contract still enforces everything it *can* check itself: replay, account binding, expiry, per-treasure caps and NPC allocations. A compromised oracle key can't move NEAR, take items, or exceed the on-chain supply caps, and the owner can rotate it with `set_oracle_key`.

## Data model (SQLite)

| Table | Purpose |
|---|---|
| `players` | Profile, wallet link, XP/Shards, counters, streak, last GPS fix, cooldown, flags |
| `sessions`, `auth_nonces` | Hashed session tokens; single-use NEP-413 login nonces |
| `treasures`, `spawn_cells` | Treasure definitions and supply; which cell/day fields were generated |
| `claims` | One row per (player, treasure), with position, accuracy, distance, demo flag |
| `rewards`, `reward_items` | Everything granted; items move `vault → minting → onchain` (or `spent` in exchanges) |
| `events` | Append-only activity used to compute quest and mission progress windows |
| `visited_cells` | Exploration (~220 m cells) for "visit a new location" |
| `quests`, `quest_state` | Definitions; per-player per-period join/claim state |
| `npcs`, `npc_missions`, `mission_state` | NPC definitions, missions (progress or exchange), runs |
| `item_types` | Catalog mirror with game-side issuance counters |
| `shop_items`, `purchases`, `shard_ledger` | Off-chain sinks and full Shard audit trail |
| `security_events`, `admin_log`, `market_events` | Anti-cheat log, admin audit, client-reported market txs |

Quest progress is *derived* from `events` within a time window (day, ISO week, season, or since a join or acceptance), so it can't drift out of sync with gameplay.

## Contract layout (`contracts/trezo/src`)

| File | Contents |
|---|---|
| `lib.rs` | State, init/admin, players, `claim`, views, internal balance/mint/burn helpers, low-level NEAR transfer |
| `mt.rs` | NEP-245 core, `mt_transfer_call` via low-level promises + `mt_resolve_transfer`, metadata, enumeration |
| `market.rs` | Escrowed listings, atomic buy, cancel, views |
| `npc.rs` | NPC treasuries, offers/allocations, bonding-curve `npc_buy`, capped `npc_sell`, `fund_npc` |
| `tests.rs` | 34 unit tests with real ed25519 signatures |

Storage uses `near_sdk::store` collections. Balances are keyed `(token_id, account_id)`, and `owner_tokens` provides enumeration. Every mint, burn and transfer emits NEP-297 `nep245` events.

**Low-level promises.** The contract calls `env::promise_*` directly instead of using `near_sdk::Promise`. The high-level type links host imports for *every* action kind, including gas-key and state-init actions newer than protocol 86. neard 2.13 rejected that wasm at link time (found by `npm run test:sandbox`). The wasm now imports only the six promise host functions it uses.

## Frontend structure

- `src/app/(game)/*`: the five-tab game shell (Explore, Quests, Inventory, Ranks, Profile), plus Market, item detail and public profiles.
- `src/app/admin`: separate, server-protected dashboard.
- `src/components/onchain/*`: `MintButton` (ticket → tx → settle), `OnchainAction` (any signed call that reports the real outcome), `NpcTreasury`, `useOnchainHoldings`.
- Overlays (`Sheet`, reveal) are portalled to `<body>`, so they escape the map's stacking context.
- Map: MapLibre's ES-module worker is copied to `public/maplibre` (`postinstall`) and wired with `setWorkerUrl`. Style URLs fall back in order and then to an offline grid, so gameplay never depends on a tile provider.

## Scaling notes

The SQLite + single-process design is deliberate for a hackathon (zero setup, ACID claims). To scale horizontally, move to Postgres (the schema is plain SQL with `UPDATE … WHERE` guards), Redis for rate limits, and keep the contract unchanged.
