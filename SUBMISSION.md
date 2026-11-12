# TREZO: hackathon submission

Paste-ready answers for the submission form. Every claim below can be checked through the links.

---

## Project name
TREZO

## Tagline (short)
Walk your city. Open real-world treasures. Own what you find on NEAR.

## One-line description (≤ 280 characters)
TREZO is a location-based treasure hunt live on NEAR mainnet. Treasures spawn on real streets. Walk to one (GPS-verified) to open it, then mint the collectible as a NEP-245 token. NPCs with on-chain treasuries and a player market keep the economy alive.

## Track
**Track 09: Games With Real Economies**

## Links
- **Live game (mainnet):** https://playtrezo.xyz
- **Contract:** [`trezo-game.near`](https://nearblocks.io/address/trezo-game.near)
- **Repository:** https://github.com/TeevincsCrypt/Trezo
- **Demo video:** *(add your YouTube/X link)*
- **Real player mint (walked to it):** https://nearblocks.io/txns/Fz6SAaYuyXi5keiA6oTgCZeCGYUXJK83nCFHSkAZaQi2

---

## The problem
Most crypto games bolt a token onto a game loop. When speculation stops, the economy dies, because nothing scarce or meaningful backs it. Rewards are farmable from a couch, supply is whatever the developer decides, and "NPCs" are just UI.

## The solution
TREZO grounds a game economy in **physical effort and enforced scarcity**:
- **You have to be there.** Treasures exist at real GPS coordinates. The server verifies proximity and GPS quality and detects impossible movement before it signs a claim ticket.
- **Scarcity is on-chain.** Every collectible is a NEP-245 token with a hard supply cap enforced by the contract (only 50 Ember Eggs and 250 Tidecaller Crowns can ever exist). Each treasure also has a limited number of claims.
- **NPCs are real economic actors.** Bram the Merchant has his own on-chain treasury. He sells on a bonding curve (each sale raises the price 8%) and buys back from players under a daily spending limit. Marketplace fees refill his treasury. Nobody can withdraw it, the economy is locked, and the contract's keys are deleted.
- **No speculative token.** The in-game currency (Shards) is deliberately off-chain, with real sinks. The blockchain is used where ownership matters: collectibles, claims, trades and NPC treasuries.

## How it works (player flow)
1. Open **playtrezo.xyz**. Play as a guest, or sign in with a NEAR wallet (NEP-413 signed message, no transaction).
2. A **satellite map** shows treasures around you. Follow the arrow and the guide line, and the distance drops as you walk.
3. **In range** (precise GPS), open the treasure to get Shards, XP and sometimes a collectible.
4. Press **Mint on NEAR**. The server signs a one-time **claim ticket** (ed25519), your wallet submits `claim`, and the contract verifies the signature, account, expiry, replay and supply caps, then mints the NEP-245 token to *your* wallet.
5. **Trade** on the escrowed player market, **sell** to the Merchant NPC, do **quests** and guild missions, and climb the leaderboard.
6. **Add NEAR from any chain** via **NEAR Intents**: pay with USDC, ETH, BTC, SOL and more, and NEAR lands in your wallet.

## Why it fits Track 09: Games With Real Economies
| Track theme | TREZO |
|---|---|
| NPCs with wallets | 4 guild NPCs with on-chain reward allocations. The Merchant has a treasury, bonding-curve pricing and treasury-funded buybacks (`contracts/trezo/src/npc.rs`) |
| Player-owned markets | On-chain escrow market: list, buy, cancel. Payment and delivery happen in one receipt, double-buys are impossible, and a 2.5% fee goes to the Merchant treasury (`market.rs`) |
| Economy that adjusts without the developer | Prices move with player buys and sells. Allocations only shrink. `lock_economy` permanently removed the owner's ability to change prices, offers or fees, and the contract has no access keys |
| NEP-245 | Full multi-token implementation: core, metadata, enumeration, events, `mt_transfer_call` with resolve (`mt.rs`) |

## What's on-chain (NEAR mainnet), with proof
- **Contract:** [`trezo-game.near`](https://nearblocks.io/address/trezo-game.near). Reproducible build: the code hash `AQTbFPTT…NoW` matches the wasm, and `contract_source_metadata` points to the exact git commit.
- **Economy locked:** [`4Bap9XF5…`](https://nearblocks.io/txns/4Bap9XF5GBwws1L8XKGaYv2yJ9ukf8TAt312uTL4Lthx). **All keys deleted:** [`FBmPJ1pU…`](https://nearblocks.io/txns/FBmPJ1pUAEhRJpNGkLLBJ9jbRbcNiKUtkLQwKyyqFuTW). Ownership handed to `trezonear.near`: [`GXrLouqA…`](https://nearblocks.io/txns/GXrLouqArNifGA4YapBridRZkkw4Rts5CwQLA1P8Tm8H).
- **A real player's mint after walking to a treasure:** [`Fz6SAaYu…`](https://nearblocks.io/txns/Fz6SAaYuyXi5keiA6oTgCZeCGYUXJK83nCFHSkAZaQi2) (`teevincs.near` → `claim`, Success).
- **Player holdings:** `teevincs.near` holds `egg-ember` (Legendary, supply cap 50) and `relic-compass`. Check with `mt_tokens_for_owner`.
- **NEAR Intents:** a live swap of 1 USDC on Base delivered NEAR to `teevincs.near` (shown in the demo video).
- Full deployment record: [`deployments/mainnet.json`](deployments/mainnet.json).

## NEAR technology used
- **Smart contract:** Rust, near-sdk 5.30, cargo-near (reproducible build, NEP-330 source metadata).
- **NEP-245** multi-token standard (editions with supply caps; soulbound badges).
- **NEP-413** signed-message wallet login, verified server-side against the account's on-chain full-access keys.
- **NEAR Connect** wallet selector (Meteor, HOT, NEAR Mobile and more), and **near-api-js 7**.
- **NEAR Intents (1Click Swap API)** for cross-chain top-ups.
- Oracle-signed claim tickets verified on-chain with `env::ed25519_verify`.

## Tech stack
Next.js 16 · React 19 · TypeScript · Tailwind 4 · MapLibre GL (satellite imagery + OpenStreetMap labels) · SQLite (`node:sqlite`) · Rust/near-sdk · Railway (Docker) · Playwright and Vitest.

## Security and quality
- Internal pre-mainnet security review with fixes: storage deposits (no storage-drain), per-account and global mint rate limits, an irreversible economy lock, deleted contract keys, a proxy-aware rate limiter, session rotation and CSP headers. See [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
- Tests:
  - 42 contract unit tests;
  - 48 server tests;
  - a 34-check full-stack run on a local NEAR node;
  - a 14-check browser smoke test;
  - emulated GPS walk tests.
- The anti-cheat is honest about its limits: GPS spoofing can't be fully prevented, so rewards are bounded, rate-limited and rule-checked. See [SECURITY.md](SECURITY.md).

## Challenges we ran into
- **Wasm compatibility:** near-sdk's high-level `Promise` pulled in host functions newer than the network supported, so the contract uses low-level `env::promise_*` calls.
- **Making a game contract trustless:** storage-drain attacks, oracle-key compromise and owner influence over NPC treasuries were each closed with on-chain rules. The deployment ended by deleting every access key.
- **Real-world GPS:** slow fixes, rough Wi-Fi locations and phones in pockets. Fixed with a fast rough fix followed by precise refinement, arrival detection and a compass-relative arrow.
- **Mainnet on a tight budget:** about 4.7 NEAR total. The deploy was rehearsed end to end on testnet first.

## What's next
- **Partner treasures:** projects hide their WL spots, tokens or NFTs inside TREZO treasures, and players walk to them and claim them. *(In design; not yet in the app.)*
- **NEP-171 wrapper:** convert NEP-245 items into classic NFTs for wallet NFT tabs and marketplaces.
- City events, seasonal legendary drops and community challenges.

## Team
**teevincs** ([`teevincs.near`](https://nearblocks.io/address/teevincs.near)): solo builder.

## Honest limitations
- Guest progress lives on one device; sign in with a wallet to sync across devices.
- Demo-zone rewards (simulated location) are never minted on mainnet. Only real-location treasures can be minted.
- The satellite imagery uses Esri's public tile service, with attribution.
