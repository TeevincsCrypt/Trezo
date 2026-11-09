# Security

## Keys and secrets

| Secret | Where it lives | Can it move funds? |
|---|---|---|
| Player wallet keys | The player's wallet (NEAR Connect). TREZO never sees them and never asks for seed phrases. | Yes (player-controlled) |
| `TREZO_ORACLE_SECRET_KEY` | Server environment only | **No.** It only signs claim tickets. |
| Contract owner key | Owner's wallet / near-cli keychain; never in the app | Can change config (not treasuries) |
| `TREZO_SESSION_SECRET`, `TREZO_ADMIN_TOKEN` | Server environment only | No |

No key or secret is committed, and none is bundled into the browser: only `NEXT_PUBLIC_*` values reach the client, and they hold public data only. `.env*` files are git-ignored. Test keys exist only inside tests (a fixed `0x07…` seed marked TEST-ONLY) and inside the throwaway local sandbox.

## Smart contract

- **Authorization:** owner-only admin methods; `#[private]` resolve callback; listing cancel limited to the seller; claims bound to `predecessor == ticket.account_id`.
- **Oracle tickets:** ed25519 over the exact submitted bytes, with checks on `contract_id` (prevents cross-deployment replay), expiry (≤ 1 h horizon), a unique id in `used_tickets` (replay), a 2 KB size limit, and at most 5 items per ticket.
- **Supply:** per-item `circulating ≤ max_supply` (caps can only be lowered); per-treasure claim caps; one claim per player per treasure; NPC allocations.
- **Value transfer:** marketplace `buy_listing` removes the listing *before* paying, checks the deposit against the price, refunds excess, and caps the fee at 10%. Escrow moves tokens to the contract balance, so listed items can't be double-spent. NEAR's single-threaded per-contract execution prevents races.
- **NPC treasuries:** no withdrawal method exists. Buybacks are limited by treasury balance, a daily limit and the contract's storage reserve, and are priced one curve step below the sale price so buy-then-sell arbitrage always loses.
- **NEP-245:** 1 yoctoNEAR is required on transfers, listing, cancel and sell (full-access key confirmation). Soulbound items can't be transferred or listed. `mt_resolve_transfer` reads promise results with a bounded size, so a hostile receiver can't make it run out of gas, and it refunds at most what the receiver still holds.
- **Integers:** `u128` balances, `checked_add` on credits, explicit `require!` before subtraction; release profile has `overflow-checks = true`.
- **Pause switch:** `set_paused` halts claims, transfers and trading.
- **Tests:** 42 unit tests plus a 34-check integration run on a real `neard` node (forgery, replay, stolen tickets, unauthorized admin calls, double-buy).

**Residual risks:** the owner can rotate the oracle key, add items and set NPC offers (but not raise supply caps or withdraw treasuries). A compromised oracle key could mint items up to the remaining caps and allocations until it's rotated. No external audit has been done.

## Game server

- **Sessions:** 256-bit random tokens, stored only as SHA-256 hashes; httpOnly, SameSite=Lax, Secure in production; 30-day expiry.
- **Wallet login (NEP-413):** single-use 32-byte nonces with a 10-minute TTL; message and recipient fixed by the server. The signature is verified with `near-api-js/nep413`, which also checks via RPC that the public key is a **FullAccess** key of the claimed account. Impersonation with another account's key is rejected (sandbox-tested).
- **Admin:** every admin route calls `requireAdmin()` on the server. Access is either a constant-time-compared token that sets an HMAC'd httpOnly SameSite=Strict cookie (8 h), or a wallet-verified account listed in `TREZO_ADMIN_ACCOUNTS`. Hiding UI is never the control. All admin writes go to `admin_log`.
- **Validation:** every request body goes through zod; unknown items, NPCs and enum values are rejected; numbers are bounded. SQL uses prepared statements only.
- **Rate limiting:** token buckets per IP and player (claims 12/min, location 60/min, login 10/min, admin login 5/min). They're in-memory, which suits a single instance.
- **Errors:** no stack traces leave the server; failures return `{error, message}`.
- **Headers:** `nosniff`, a strict referrer policy, and a `Permissions-Policy` that only allows geolocation on self. Art SVGs are served with a restrictive CSP.

## NEAR Intents (cross-chain top-ups)

- The swap recipient is **always the signed-in player's linked NEAR account**, read from the session on the server. The client can't redirect output.
- Refunds go to the player's own origin-chain address. TREZO never takes custody: deposits go to 1Click's one-time address.
- Swaps are mainnet-only and rate-limited (6 real quotes per minute per player). Status is visible only to the swap's owner.
- The full signed quote is stored (`intent_swaps.quote_json`), as 1Click recommends for disputes.
- The optional partner JWT (`TREZO_ONECLICK_JWT`) is server-only.

## Anti-cheat (and its limits)

Implemented server-side, inside the claim transaction:

1. claim radius (default 40 m; demo 50 m; Radar Pulse doubles it for 30 min);
2. GPS accuracy must be ≤ 75 m in real mode;
3. impossible-movement detection: > 500 m at > 55 m/s since the last fix rejects the claim and records a `security_events` row and a player flag;
4. per-player cooldown (15 s) and rate limits;
5. duplicate prevention (DB `UNIQUE(player_id, treasure_id)` *and* an on-chain check);
6. availability (active, not expired, supply remaining), with the counter guarded by `UPDATE … WHERE claim_count < max_claims`;
7. distance accrual ignores jitter below 8 m and caps each fix at 2 km; demo fixes never count;
8. admins can disable suspicious treasures instantly and review flagged players and security events.

**Limitation:** browser GPS can't prove physical presence. Mock-location apps, emulators and scripted clients that send plausible coordinates will pass these checks. The rules raise the cost of cheating and make abuse visible; they don't make it impossible. Stronger options for the future include device attestation (Play Integrity / App Attest), velocity models across many fixes, and community-placed treasures that need a QR scan. Demo-mode claims always carry `demo: true` on-chain.

## Reporting

Please open a private security advisory on the GitHub repository.
