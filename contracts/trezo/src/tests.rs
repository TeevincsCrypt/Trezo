use super::*;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::testing_env;

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const NOW_MS: u64 = 1_800_000_000_000;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn contract_id() -> AccountId {
    acc("trezo.testnet")
}
fn owner() -> AccountId {
    acc("owner.testnet")
}
fn alice() -> AccountId {
    acc("alice.testnet")
}
fn bob() -> AccountId {
    acc("bob.testnet")
}

fn oracle_key() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}

fn ctx(predecessor: AccountId, deposit: u128) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(contract_id())
        .predecessor_account_id(predecessor.clone())
        .signer_account_id(predecessor)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100))
        .block_timestamp(NOW_MS * 1_000_000);
    testing_env!(b.build());
}

fn setup() -> Contract {
    ctx(owner(), 0);
    let pk = oracle_key().verifying_key().to_bytes().to_vec();
    let mut c = Contract::new(owner(), Base64VecU8(pk));
    c.add_item_type("relic-compass".into(), "Ancient Compass".into(), "Points to forgotten places".into(), None, Rarity::Rare, "artifact".into(), true, U128(3));
    c.add_item_type("shard-gem".into(), "Shard Gem".into(), "A shimmering gem".into(), None, Rarity::Common, "treasure".into(), true, U128(1000));
    c.add_item_type("badge-pioneer".into(), "Pioneer Badge".into(), "First steps".into(), None, Rarity::Epic, "badge".into(), false, U128(1000));
    c.upsert_npc("merchant".into(), "The Merchant".into(), "trader".into(), U128(NEAR));
    c.upsert_npc("keeper".into(), "The Treasure Keeper".into(), "guardian".into(), U128(0));
    c.set_npc_offer("keeper".into(), "relic-compass".into(), U128(1), U128(0), 0);
    c.set_npc_offer("merchant".into(), "shard-gem".into(), U128(100), U128(NEAR / 10), 6000);
    for p in [alice(), bob(), acc("carol.testnet")] {
        ctx(p, NEAR / 10);
        c.storage_deposit(None);
    }
    ctx(owner(), 0);
    c
}

struct T {
    id: &'static str,
    account: AccountId,
    kind: &'static str,
    ref_id: &'static str,
    max_claims: Option<u32>,
    npc: Option<&'static str>,
    items: Vec<(&'static str, u128)>,
    expires: u64,
    contract: AccountId,
}

impl T {
    fn treasure(id: &'static str, account: AccountId, ref_id: &'static str, max: u32) -> Self {
        T { id, account, kind: "treasure", ref_id, max_claims: Some(max), npc: None, items: vec![("shard-gem", 1)], expires: NOW_MS + 60_000, contract: contract_id() }
    }
    fn json(&self) -> String {
        serde_json::json!({
            "id": self.id,
            "contract_id": self.contract,
            "account_id": self.account,
            "kind": self.kind,
            "ref_id": self.ref_id,
            "max_claims": self.max_claims,
            "npc_id": self.npc,
            "items": self.items.iter().map(|(t, a)| (t.to_string(), a.to_string())).collect::<Vec<_>>(),
            "demo": false,
            "expires_at_ms": self.expires.to_string(),
        })
        .to_string()
    }
    fn sign(&self) -> (String, Base64VecU8) {
        let j = self.json();
        let sig = oracle_key().sign(j.as_bytes()).to_bytes().to_vec();
        (j, Base64VecU8(sig))
    }
}

// ------------------------------- claims -------------------------------

#[test]
fn claim_valid_ticket_mints_and_records() {
    let mut c = setup();
    ctx(alice(), 0);
    let (t, s) = T::treasure("tk1", alice(), "treasure-1", 5).sign();
    let rec = c.claim(t, s);
    assert_eq!(rec.ref_id, "treasure-1");
    assert_eq!(c.mt_balance_of(alice(), "shard-gem".into()).0, 1);
    assert_eq!(c.mt_supply("shard-gem".into()).unwrap().0, 1);
    assert!(c.is_ticket_used("tk1".into()));
    assert!(c.has_claimed_treasure("treasure-1".into(), alice()));
    assert_eq!(c.get_player(alice()).unwrap().treasures_claimed, 1);
    assert_eq!(c.get_stats().claims, 1);
    let logs = get_logs();
    assert!(logs.iter().any(|l| l.contains("\"standard\":\"nep245\"") && l.contains("mt_mint")));
    assert!(logs.iter().any(|l| l.contains("\"event\":\"claim\"")));
}

#[test]
#[should_panic(expected = "Invalid oracle signature")]
fn claim_rejects_forged_signature() {
    let mut c = setup();
    ctx(alice(), 0);
    let t = T::treasure("tk1", alice(), "treasure-1", 5);
    let forger = SigningKey::from_bytes(&[9u8; 32]);
    let j = t.json();
    let sig = forger.sign(j.as_bytes()).to_bytes().to_vec();
    c.claim(j, Base64VecU8(sig));
}

#[test]
#[should_panic(expected = "Invalid oracle signature")]
fn claim_rejects_tampered_ticket() {
    let mut c = setup();
    ctx(alice(), 0);
    let (t, s) = T::treasure("tk1", alice(), "treasure-1", 5).sign();
    let tampered = t.replace("\"1\"]]", "\"999\"]]");
    assert_ne!(t, tampered);
    c.claim(tampered, s);
}

#[test]
#[should_panic(expected = "Ticket belongs to another account")]
fn claim_rejects_ticket_for_other_account() {
    let mut c = setup();
    ctx(bob(), 0);
    let (t, s) = T::treasure("tk1", alice(), "treasure-1", 5).sign();
    c.claim(t, s);
}

#[test]
#[should_panic(expected = "Ticket issued for another contract")]
fn claim_rejects_other_contract() {
    let mut c = setup();
    ctx(alice(), 0);
    let mut t = T::treasure("tk1", alice(), "treasure-1", 5);
    t.contract = acc("evil.testnet");
    let (t, s) = t.sign();
    c.claim(t, s);
}

#[test]
#[should_panic(expected = "Ticket already used")]
fn claim_rejects_replay() {
    let mut c = setup();
    ctx(alice(), 0);
    let (t, s) = T::treasure("tk1", alice(), "treasure-1", 5).sign();
    c.claim(t.clone(), s.clone());
    c.claim(t, s);
}

#[test]
#[should_panic(expected = "Ticket expired")]
fn claim_rejects_expired() {
    let mut c = setup();
    ctx(alice(), 0);
    let mut t = T::treasure("tk1", alice(), "treasure-1", 5);
    t.expires = NOW_MS - 1;
    let (t, s) = t.sign();
    c.claim(t, s);
}

#[test]
#[should_panic(expected = "Treasure already claimed by this player")]
fn claim_rejects_same_treasure_twice_with_new_ticket() {
    let mut c = setup();
    ctx(alice(), 0);
    let (t, s) = T::treasure("tk1", alice(), "treasure-1", 5).sign();
    c.claim(t, s);
    let (t, s) = T::treasure("tk2", alice(), "treasure-1", 5).sign();
    c.claim(t, s);
}

#[test]
#[should_panic(expected = "Treasure supply exhausted")]
fn claim_enforces_treasure_supply() {
    let mut c = setup();
    ctx(alice(), 0);
    let (t, s) = T::treasure("tk1", alice(), "treasure-1", 1).sign();
    c.claim(t, s);
    ctx(bob(), 0);
    let (t, s) = T::treasure("tk2", bob(), "treasure-1", 1).sign();
    c.claim(t, s);
}

#[test]
#[should_panic(expected = "Item supply cap reached")]
fn mint_enforces_item_max_supply() {
    let mut c = setup();
    ctx(alice(), 0);
    let mut t = T::treasure("tk1", alice(), "treasure-1", 5);
    t.items = vec![("relic-compass", 4)]; // cap is 3
    let (t, s) = t.sign();
    c.claim(t, s);
}

#[test]
fn mission_consumes_npc_allocation() {
    let mut c = setup();
    ctx(alice(), 0);
    let t = T { id: "m1", account: alice(), kind: "mission", ref_id: "keeper-trial", max_claims: None, npc: Some("keeper"), items: vec![("relic-compass", 1)], expires: NOW_MS + 60_000, contract: contract_id() };
    let (j, s) = t.sign();
    c.claim(j, s);
    assert_eq!(c.mt_balance_of(alice(), "relic-compass".into()).0, 1);
    assert_eq!(c.get_npc("keeper".into()).unwrap().offers[0].offer.allocation.0, 0);
    assert_eq!(c.get_player(alice()).unwrap().missions_completed, 1);
}

#[test]
#[should_panic(expected = "NPC reward allocation exhausted")]
fn mission_fails_when_npc_allocation_exhausted() {
    let mut c = setup();
    ctx(alice(), 0);
    for id in ["m1", "m2"] {
        let t = T { id, account: alice(), kind: "mission", ref_id: "keeper-trial", max_claims: None, npc: Some("keeper"), items: vec![("relic-compass", 1)], expires: NOW_MS + 60_000, contract: contract_id() };
        let (j, s) = t.sign();
        c.claim(j, s);
    }
}

// ------------------------------- NEP-245 -------------------------------

fn give_alice_gems(c: &mut Contract, n: u128) {
    ctx(alice(), 0);
    let mut t = T::treasure("seed", alice(), "seed-treasure", 100);
    t.items = vec![("shard-gem", n)];
    let (j, s) = t.sign();
    c.claim(j, s);
}

#[test]
fn mt_transfer_moves_balance_and_enumerates() {
    let mut c = setup();
    give_alice_gems(&mut c, 5);
    ctx(alice(), 1);
    c.mt_transfer(bob(), "shard-gem".into(), U128(2), None, None);
    assert_eq!(c.mt_balance_of(alice(), "shard-gem".into()).0, 3);
    assert_eq!(c.mt_balance_of(bob(), "shard-gem".into()).0, 2);
    assert_eq!(c.mt_tokens_for_owner(bob(), None, None)[0].token_id, "shard-gem");
    assert!(get_logs().iter().any(|l| l.contains("mt_transfer")));
    // Transfer everything → removed from enumeration
    ctx(alice(), 1);
    c.mt_transfer(bob(), "shard-gem".into(), U128(3), None, None);
    assert!(c.mt_tokens_for_owner(alice(), None, None).is_empty());
    assert_eq!(c.mt_batch_balance_of(bob(), vec!["shard-gem".into(), "relic-compass".into()]), vec![U128(5), U128(0)]);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn mt_transfer_requires_one_yocto() {
    let mut c = setup();
    give_alice_gems(&mut c, 1);
    ctx(alice(), 0);
    c.mt_transfer(bob(), "shard-gem".into(), U128(1), None, None);
}

#[test]
#[should_panic(expected = "Insufficient balance")]
fn mt_transfer_rejects_overspend() {
    let mut c = setup();
    give_alice_gems(&mut c, 1);
    ctx(alice(), 1);
    c.mt_transfer(bob(), "shard-gem".into(), U128(2), None, None);
}

#[test]
#[should_panic(expected = "soulbound")]
fn soulbound_items_cannot_transfer() {
    let mut c = setup();
    ctx(alice(), 0);
    let mut t = T::treasure("b1", alice(), "badge-t", 5);
    t.items = vec![("badge-pioneer", 1)];
    let (j, s) = t.sign();
    c.claim(j, s);
    ctx(alice(), 1);
    c.mt_transfer(bob(), "badge-pioneer".into(), U128(1), None, None);
}

#[test]
fn metadata_views() {
    let c = setup();
    assert_eq!(c.mt_metadata_contract().spec, "mt-1.0.0");
    let all = c.mt_metadata_token_all(vec!["relic-compass".into(), "nope".into()]);
    assert_eq!(all[0].as_ref().unwrap().base.name, "Ancient Compass");
    assert!(all[1].is_none());
    assert_eq!(c.mt_tokens(None, None).len(), 3);
    assert_eq!(c.mt_token(vec!["shard-gem".into()])[0].as_ref().unwrap().owner_id, None);
}

// ------------------------------ Marketplace ------------------------------

#[test]
fn market_list_buy_flow() {
    let mut c = setup();
    give_alice_gems(&mut c, 3);
    ctx(alice(), 1);
    let l = c.list_item("shard-gem".into(), U128(2), U128(NEAR));
    assert_eq!(c.mt_balance_of(alice(), "shard-gem".into()).0, 1);
    assert_eq!(c.mt_balance_of(contract_id(), "shard-gem".into()).0, 2);
    assert_eq!(c.get_listings(None, None).len(), 1);

    ctx(bob(), NEAR + 5);
    c.buy_listing(l.id);
    assert_eq!(c.mt_balance_of(bob(), "shard-gem".into()).0, 2);
    assert_eq!(c.mt_balance_of(contract_id(), "shard-gem".into()).0, 0);
    assert!(c.get_listing(l.id).is_none());
    // 2.5% fee went to the merchant treasury
    assert_eq!(c.get_npc("merchant".into()).unwrap().npc.treasury.0, NEAR * 250 / 10_000);
    assert_eq!(c.get_stats().total_market_volume.0, NEAR);
}

#[test]
#[should_panic(expected = "Listing not found or already sold")]
fn market_prevents_double_purchase() {
    let mut c = setup();
    give_alice_gems(&mut c, 1);
    ctx(alice(), 1);
    let l = c.list_item("shard-gem".into(), U128(1), U128(NEAR));
    ctx(bob(), NEAR);
    c.buy_listing(l.id);
    ctx(acc("carol.testnet"), NEAR);
    c.buy_listing(l.id);
}

#[test]
#[should_panic(expected = "Attached deposit is less than the price")]
fn market_rejects_underpayment() {
    let mut c = setup();
    give_alice_gems(&mut c, 1);
    ctx(alice(), 1);
    let l = c.list_item("shard-gem".into(), U128(1), U128(NEAR));
    ctx(bob(), NEAR - 1);
    c.buy_listing(l.id);
}

#[test]
#[should_panic(expected = "Cannot buy your own listing")]
fn market_rejects_self_purchase() {
    let mut c = setup();
    give_alice_gems(&mut c, 1);
    ctx(alice(), 1);
    let l = c.list_item("shard-gem".into(), U128(1), U128(NEAR));
    ctx(alice(), NEAR);
    c.buy_listing(l.id);
}

#[test]
#[should_panic(expected = "Insufficient balance")]
fn market_escrow_prevents_double_spend() {
    let mut c = setup();
    give_alice_gems(&mut c, 1);
    ctx(alice(), 1);
    c.list_item("shard-gem".into(), U128(1), U128(NEAR));
    ctx(alice(), 1);
    c.mt_transfer(bob(), "shard-gem".into(), U128(1), None, None);
}

#[test]
fn market_cancel_returns_items() {
    let mut c = setup();
    give_alice_gems(&mut c, 1);
    ctx(alice(), 1);
    let l = c.list_item("shard-gem".into(), U128(1), U128(NEAR));
    ctx(alice(), 1);
    c.cancel_listing(l.id);
    assert_eq!(c.mt_balance_of(alice(), "shard-gem".into()).0, 1);
    assert!(c.get_listings_by_seller(alice()).is_empty());
}

#[test]
#[should_panic(expected = "Only the seller can cancel")]
fn market_cancel_only_seller() {
    let mut c = setup();
    give_alice_gems(&mut c, 1);
    ctx(alice(), 1);
    let l = c.list_item("shard-gem".into(), U128(1), U128(NEAR));
    ctx(bob(), 1);
    c.cancel_listing(l.id);
}

// ------------------------------- NPC market -------------------------------

#[test]
fn npc_price_rises_with_sales_and_buyback_pays_from_treasury() {
    let mut c = setup();
    let p0 = c.get_npc("merchant".into()).unwrap().offers[0].current_price.0;
    assert_eq!(p0, NEAR / 10);
    ctx(alice(), NEAR);
    let paid = c.npc_buy("merchant".into(), "shard-gem".into()).0;
    assert_eq!(paid, p0);
    let p1 = c.get_npc("merchant".into()).unwrap().offers[0].current_price.0;
    assert!(p1 > p0, "price must rise after a sale");
    let treasury = c.get_npc("merchant".into()).unwrap().npc.treasury.0;
    assert_eq!(treasury, p0);

    // Sell back: paid less than bought for (no arbitrage), treasury decreases.
    ctx(alice(), 1);
    let got = c.npc_sell("merchant".into(), "shard-gem".into()).0;
    assert!(got < paid);
    let v = c.get_npc("merchant".into()).unwrap();
    assert_eq!(v.npc.treasury.0, treasury - got);
    assert_eq!(v.offers[0].current_price.0, p0, "price returns after buyback");
    assert_eq!(c.mt_balance_of(alice(), "shard-gem".into()).0, 0);
    assert_eq!(c.mt_supply("shard-gem".into()).unwrap().0, 0);
}

#[test]
#[should_panic(expected = "NPC daily buyback limit reached")]
fn npc_daily_limit_enforced() {
    let mut c = setup();
    ctx(owner(), 0);
    c.upsert_npc("merchant".into(), "The Merchant".into(), "trader".into(), U128(1)); // 1 yocto limit
    ctx(alice(), NEAR);
    c.npc_buy("merchant".into(), "shard-gem".into());
    ctx(alice(), 1);
    c.npc_sell("merchant".into(), "shard-gem".into());
}

#[test]
#[should_panic(expected = "NPC treasury cannot afford this right now")]
fn npc_cannot_spend_more_than_treasury() {
    let mut c = setup();
    give_alice_gems(&mut c, 1); // minted from a treasure, merchant treasury is empty
    ctx(alice(), 1);
    c.npc_sell("merchant".into(), "shard-gem".into());
}

#[test]
fn anyone_can_fund_npc() {
    let mut c = setup();
    ctx(bob(), NEAR);
    assert_eq!(c.fund_npc("merchant".into()).0, NEAR);
}

// ------------------------------ Access control ------------------------------

#[test]
#[should_panic(expected = "Only the contract owner")]
fn only_owner_adds_items() {
    let mut c = setup();
    ctx(alice(), 0);
    c.add_item_type("x".into(), "X".into(), "".into(), None, Rarity::Common, "c".into(), true, U128(1));
}

#[test]
#[should_panic(expected = "Only the contract owner")]
fn only_owner_sets_oracle() {
    let mut c = setup();
    ctx(alice(), 0);
    c.set_oracle_key(Base64VecU8(vec![0u8; 32]));
}

#[test]
#[should_panic(expected = "Contract is paused")]
fn paused_blocks_claims() {
    let mut c = setup();
    ctx(owner(), 0);
    c.set_paused(true);
    ctx(alice(), 0);
    let (t, s) = T::treasure("tk1", alice(), "treasure-1", 5).sign();
    c.claim(t, s);
}

#[test]
#[should_panic(expected = "Supply cap can only be reduced")]
fn supply_cap_cannot_be_raised() {
    let mut c = setup();
    ctx(owner(), 0);
    c.reduce_max_supply("relic-compass".into(), U128(10));
}

#[test]
#[should_panic(expected = "Attach 0.005 NEAR")]
fn register_requires_deposit() {
    let mut c = setup();
    ctx(alice(), 0);
    c.register_player(Some("alice".into()));
}

#[test]
fn register_with_deposit() {
    let mut c = setup();
    ctx(alice(), REGISTER_DEPOSIT.as_yoctonear());
    let p = c.register_player(Some("alice_01".into()));
    assert_eq!(p.username.as_deref(), Some("alice_01"));
    assert_eq!(c.get_stats().players, 1);
}

// ------------------------- storage / limits / lock -------------------------

#[test]
#[should_panic(expected = "Storage deposit required")]
fn transfer_to_new_account_requires_storage_deposit() {
    let mut c = setup();
    give_alice_gems(&mut c, 3);
    ctx(alice(), 1);
    c.storage_withdraw(None);
    ctx(alice(), 1);
    c.mt_transfer(acc("fresh1.testnet"), "shard-gem".into(), U128(1), None, None);
}

#[test]
fn storage_is_charged_to_sender_and_withdrawable() {
    let mut c = setup();
    give_alice_gems(&mut c, 3);
    let before = c.storage_balance_of(alice()).0;
    ctx(alice(), 1);
    c.mt_transfer(acc("fresh1.testnet"), "shard-gem".into(), U128(1), None, None);
    let after = c.storage_balance_of(alice()).0;
    assert!(after < before, "sender storage balance should be charged");
    ctx(alice(), 1);
    assert_eq!(c.storage_withdraw(None).0, 0);
    assert_eq!(c.storage_balance_of(alice()).0, 0);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn storage_withdraw_requires_one_yocto() {
    let mut c = setup();
    ctx(alice(), 0);
    c.storage_withdraw(None);
}

#[test]
#[should_panic(expected = "Daily claim limit reached")]
fn claim_daily_limit_per_account() {
    let mut c = setup();
    ctx(alice(), 0);
    let ids: Vec<String> = (0..=MAX_TICKETS_PER_ACCOUNT_PER_DAY).map(|i| format!("tk{}", i)).collect();
    let refs: Vec<String> = (0..=MAX_TICKETS_PER_ACCOUNT_PER_DAY).map(|i| format!("treasure-{}", i)).collect();
    for i in 0..=MAX_TICKETS_PER_ACCOUNT_PER_DAY as usize {
        let id: &'static str = Box::leak(ids[i].clone().into_boxed_str());
        let r: &'static str = Box::leak(refs[i].clone().into_boxed_str());
        let (t, s) = T::treasure(id, alice(), r, 5).sign();
        ctx(alice(), 0);
        c.claim(t, s);
    }
}

#[test]
#[should_panic(expected = "Global hourly mint ceiling reached")]
fn claim_global_hourly_ceiling() {
    let mut c = setup();
    c.mint_hour = NOW_MS / (60 * 60 * 1000);
    c.mint_hour_count = MAX_ORACLE_ITEMS_PER_HOUR;
    ctx(alice(), 0);
    let (t, s) = T::treasure("tk1", alice(), "treasure-1", 5).sign();
    c.claim(t, s);
}

#[test]
#[should_panic(expected = "Economy is locked")]
fn lock_economy_freezes_offers() {
    let mut c = setup();
    ctx(owner(), 0);
    c.lock_economy();
    assert!(c.get_stats().economy_locked);
    c.set_npc_offer("merchant".into(), "shard-gem".into(), U128(1000), U128(1), 9000);
}

#[test]
#[should_panic(expected = "Economy is locked")]
fn lock_economy_freezes_fee() {
    let mut c = setup();
    ctx(owner(), 0);
    c.lock_economy();
    c.set_market_fee_bps(1000);
}

#[test]
#[should_panic(expected = "Only the contract owner")]
fn lock_economy_owner_only() {
    let mut c = setup();
    ctx(alice(), 0);
    c.lock_economy();
}
