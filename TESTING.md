# Testing

Four layers, from fastest to most realistic. All of them passed on the final commit of this repository.

## 1. Contract unit tests: 34 tests

```bash
npm run test:contract        # = cd contracts/trezo && cargo test
```

These use near-sdk's mocked runtime with **real ed25519 signatures** (`ed25519-dalek`).

| Area | Tests |
|---|---|
| Claims | valid ticket mints and records; forged signature; tampered ticket; ticket for another account; ticket for another contract; replay; expired; same treasure twice with a new ticket; treasure supply across players; item max supply |
| NPC missions | allocation consumed; exhausted allocation rejected |
| NEP-245 | transfer + enumeration; 1 yocto required; overspend; soulbound; metadata/enumeration views; `nep245` events emitted |
| Market | list → buy (escrow, fee to Merchant, volume); double purchase; underpayment; self-purchase; escrowed items can't be spent; cancel; cancel by non-seller |
| NPC market | price rises with sales; buyback pays from treasury and lowers price; no buy→sell profit; daily limit; can't overspend treasury; anyone can fund |
| Access control | owner-only items and oracle key; pause; supply cap can't be raised; registration deposit |

## 2. Server tests (vitest): 32 tests

```bash
npm test
```

These run in-memory SQLite (`TREZO_DB_PATH=:memory:`) against the real game modules.

- **Profiles:** guest creation, username uniqueness and validation, guest → wallet upgrade keeps progress, existing wallet profile wins, auto-username for fresh wallets.
- **Claims:** in-radius success and reward accounting; too far; duplicate; cooldown; limited supply across players; weak GPS; disabled and expired; impossible jump → rejected *and* logged (the security event survives the rollback); demo/real zone separation with the `demo` flag; five racing claims on a single-supply treasure → exactly one wins.
- **Economy:** daily Shard cap with ledger consistency; item max supply honoured at grant time.
- **Spawning and location:** deterministic, bounded daily cell fields; distance accrual, jitter filtering, new cells; demo fixes ignored.
- **Quests:** daily progress and single payout; special-event entry fee; only post-join progress counts.
- **Missions:** progress counted only after acceptance; unlock costs; Merchant exchange consumes vault items and returns supply; level gating; exploration missions from real GPS.
- **Shop:** frames are one per player; boosts stack radar time.
- **Leaderboard:** ranking with flagged sample data.
- **Oracle and settlement:** wallet required; ticket JSON matches the contract schema and its signature verifies against the oracle public key; settlement only after `get_claim` returns a record for the right account (mocked RPC).
- **NEP-413:** a real signature from a near-api-js `KeyPairSigner` verifies; a wrong message fails; a function-call key is rejected.

## 3. Browser end-to-end smoke test: 14 checks

```bash
npm run dev                  # terminal 1
npm run test:e2e             # terminal 2 (SHOTS=dir to save screenshots, BASE_URL=… to target another host)
```

Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`). It drives an iPhone 14 viewport through the landing page, onboarding, the demo zone, the treasure sheet, a proximity claim and the reveal, quest progress, accepting an NPC mission, inventory rewards, the Shard Shop, the leaderboard and the profile. It also checks that a duplicate claim is rejected via the API, that `/api/admin/*` returns 403 to non-admins, and that admin token login works. A desktop viewport check runs at the end. The test fails on any page error or 5xx response. It ran green against both `next dev` and the production build (`npm run build && npm start`).

Real GPS mode was also checked by granting geolocation to the browser: the device location was moved step by step to a procedurally spawned treasure, and the claim succeeded with the live-GPS banner shown.

## 3b. GPS behaviour test: 6 checks

```bash
npm run dev                  # terminal 1
npm run test:e2e:gps         # terminal 2
```

Emulates a player's GPS feed in Chromium and walks it around: the first fix centres the map, the camera follows a 300 m walk, dragging pauses follow mode, Recenter re-locks it, and walking into a spawned treasure's radius triggers vibration, a toast, the auto-opened treasure sheet and a bouncing marker.

## 4. Full-stack local-chain test: 34 checks

```bash
npm run contract:build
npm run test:sandbox         # add -- --keep to leave the node and app running for manual testing
```

This boots **neard 2.13.4 in sandbox mode** (`near-sandbox`, downloaded on first run, about 94 MB), creates accounts, deploys the real wasm with **`scripts/deploy-contract.mjs`**, and starts the real game server pointed at that node. It then checks:

1. accounts created; deploy plus configuration (7 txs); 13 item types;
2. server reports on-chain settlement enabled;
3. **NEP-413 login** verified against the on-chain access key; nonce replay rejected; impersonation with another account's key rejected;
4. server rejects a claim from 1 km away; claims in range;
5. **forged ticket** (50 items) rejected on-chain; **stolen ticket** (another account) rejected; real `claim` succeeds; **replay** rejected; server **settles by reading `get_claim`**; NEP-245 balance is 1; record flagged `demo: true`;
6. mission reward minted from the Explorer's **NPC allocation** (1,000,000 → 999,999); soulbound transfer rejected;
7. **market**: listing escrowed; buyer receives the item atomically; seller receives exactly price − 2.5%; fee lands in the Merchant treasury; double purchase rejected;
8. **Merchant**: price moves along the curve (0.01 → 0.0108 NEAR); buyback paid from the treasury;
9. `mt_transfer`; `mt_transfer_call` to a non-contract is refunded by `mt_resolve_transfer`;
10. non-owner admin call rejected.

These are local transactions only; they don't stand in for testnet. In containers that forbid raising `RLIMIT_NOFILE` (neard asks for 65,535), the node won't start. Normal machines and GitHub Actions are fine.

## Static checks

```bash
npm run typecheck            # tsc --noEmit
npm run build                # production build (also type-checks)
```

## Continuous integration

`.github/workflows/ci.yml` runs typecheck, vitest, the production build and the contract unit tests on every push. A separate job builds the wasm and runs the sandbox test.

## Manual test checklist

| Area | Steps |
|---|---|
| Wallet connection | Profile → Connect NEAR wallet → pick a wallet in NEAR Connect → approve the sign-in message → account shown; guest progress kept |
| Location permission | Explore → Use my location → allow (live GPS banner) / deny (helpful message + demo zone) |
| Mobile layout | iPhone-width viewport: bottom nav, sheets above the nav, safe areas |
| Desktop layout | ≥ 768 px: left rail navigation, centred content |
| Minting | Claim → Mint on NEAR → wallet → tx link (testnet explorer) → Inventory shows "On NEAR" |
| Market | Item detail → List for sale → second account buys on Market → seller receives NEAR |
| Merchant | Market → Merchant → Buy 1 (price rises) → item detail → Sell to Merchant |
| Admin | /admin → token → create a treasure at your location → disable it → it disappears from the map |
| Errors | Reject a wallet prompt → error shown and nothing marked as minted |
