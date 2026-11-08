# Pre-mainnet security review

Scope: `contracts/trezo` (near-sdk 5.30) and the game server (`src/server`, `src/app/api`). Reviewed 2026-11-08 by the development team (this is an internal review, **not** an independent audit). Each finding was checked against the source.

Severity is rated **for mainnet**, where items and NEAR have real value.

## Summary

| # | Finding | Severity | Status |
|---|---|---|---|
| C-1 | Storage-drain: anyone can make the contract pay for unlimited new state | **High** | Fix before mainnet |
| C-2 | Contract account holds a full-access key and is its own owner | **High** | Fix before mainnet (deployment) |
| C-3 | Owner can indirectly spend NPC treasuries via offer settings | Medium | Fix or document |
| C-4 | No on-chain mint rate limit if the oracle key leaks | Medium | Fix before mainnet |
| C-5 | NEAR sent to a deleted seller account is lost | Low | Accept, document |
| S-1 | Demo-zone (simulated GPS) rewards can be minted | **High** | Fix before mainnet |
| S-2 | Client IP taken from the spoofable first `X-Forwarded-For` hop | Medium | Fix |
| S-3 | Old guest session stays valid after wallet login | Low | Fix |
| S-4 | Unauthenticated, display-only market activity feed accepts junk | Low | Accept, document |
| S-5 | No Content-Security-Policy on app pages | Low | Fix |
| O-1 | Production secrets have lived in a development container | Medium | Rotate for mainnet |

## Contract

**C-1 Storage-drain (High).** On NEAR the *contract* pays for every byte it stores. `mt_transfer` to a never-seen account creates new balance and enumeration entries, and `list_item` creates listings. The caller pays only gas (about 0.0003 NEAR) while the contract pays about 0.0015 NEAR in storage per new entry. A script transferring 1 item to thousands of fresh account ids would drain the contract's balance until it can no longer write state, bricking the game.
*Fix:* per-account storage deposits (NEP-145-style `storage_deposit`, `storage_balance_of`, `storage_withdraw`). Any player-initiated call that grows state charges the caller's storage balance, measured with `env::storage_usage()` before and after. The UI tops up storage automatically in the same transaction. Oracle-gated claims stay contract-paid, since they're bounded by the server.

**C-2 Full-access key / self-owner (High).** On testnet the contract account is its own owner and keeps a full-access key, so whoever holds that key can redeploy arbitrary code and bypass every guarantee (supply caps, treasuries). *Fix (deployment):* a separate owner account (ideally a multisig) and the contract account's full-access keys **deleted** after deployment. Upgrades then go through a planned owner method, or not at all.

**C-3 Owner influence on NPC treasuries (Medium).** No method withdraws a treasury, but the owner can raise `buyback_bps` (≤ 90%) and allocations, then sell items they hold back to the Merchant, an indirect drain. *Fix:* cap `buyback_bps` changes per day and make allocation increases time-locked, or remove owner control of offers after launch. At minimum, the README must not claim "nobody can withdraw" without this caveat.

**C-4 No on-chain mint rate limit (Medium).** A leaked oracle key could mint up to every remaining cap before rotation. *Fix:* per-account daily ticket limit and a global per-hour item mint ceiling in `claim`, so a leak is bounded and visible.

**C-5 Lost proceeds (Low).** If a seller deletes their account before a sale, the transfer promise fails and the NEAR stays in the contract. Rare; document it.

Checked and OK: signature over exact ticket bytes, `contract_id` binding, predecessor binding, expiry horizon, replay set, per-treasure caps, supply caps (only reducible), escrow-before-payment ordering, double-buy, 1 yocto on transfers and sells, bounded promise-result read in `mt_resolve_transfer`, `#[private]` callback, integer overflow (checked add, release `overflow-checks`).

## Server

**S-1 Demo rewards mintable (High on mainnet).** Demo-zone claims use a *simulated* location and are flagged `demo: true` on-chain, but the oracle still signs tickets for them. On mainnet anyone could farm real items without moving. *Fix:* the oracle refuses demo rewards when `NEXT_PUBLIC_NEAR_NETWORK=mainnet` (demo stays fully playable off-chain).

**S-2 Spoofable client IP (Medium).** `clientIp()` uses the *first* `X-Forwarded-For` value, which the client controls, so per-IP rate limits (guest sign-ups, login, admin login) can be bypassed. *Fix:* use the right-most hop appended by the trusted proxy (Railway), configurable via `TREZO_TRUSTED_PROXY_HOPS`.

**S-3 Session not rotated on wallet login (Low).** After linking a wallet the old guest session token keeps working for 30 days. *Fix:* delete the previous session when issuing the new one.

**S-4 Market activity feed (Low).** `POST /api/market/events` accepts any well-formed tx hash (rate-limited, display-only in admin). Accept; label it "client-reported".

**S-5 No CSP (Low).** Add a Content-Security-Policy for app pages (wallet iframes, map tiles and RPC hosts allow-listed).

## Operations

**O-1 Secret rotation (Medium).** The testnet oracle key, session secret and admin token were generated in a development container and have been shared as files. For mainnet, generate **fresh** values on a trusted machine, store them only in the host's secret manager, and never reuse the testnet oracle key.

## Plan

1. Fix C-1, C-4, S-1, S-2, S-3 and S-5 in code, with tests (unit, sandbox, e2e).
2. Redeploy to a **fresh testnet account**. The state layout changes, so the current contract can't be upgraded in place. Re-run the testnet demo.
3. Mainnet: new owner account, contract account with keys removed (C-2), fresh secrets (O-1), C-3 decision, reproducible build.
