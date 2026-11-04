//! # TREZO game contract
//!
//! On-chain state for the TREZO treasure-hunting game.
//!
//! * **Players** – verified wallet identities with on-chain claim statistics.
//! * **Claims** – treasure, mission and quest rewards are settled with
//!   *claim tickets*: short-lived JSON messages signed (ed25519) by the game
//!   server's oracle key **after** it has validated proximity and anti-cheat
//!   rules. The ticket is submitted by the player's own wallet; the contract
//!   checks the signature, the account binding, expiry, replay and the
//!   per-treasure supply caps before minting rewards.
//! * **Collectibles** – NEP-245 multi-token (core + metadata + enumeration +
//!   events). Item types are semi-fungible "editions" with hard supply caps.
//! * **Marketplace** – escrowed player listings; purchase/payment/transfer
//!   happen atomically inside this contract.
//! * **NPC treasuries** – each NPC owns an on-chain NEAR balance and item
//!   allocations governed only by contract rules (bonding-curve pricing,
//!   daily buyback limits). Nobody, including the contract owner, can
//!   withdraw an NPC treasury.

use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::store::{IterableMap, LookupMap, LookupSet};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault};

mod market;
mod mt;
mod npc;

#[cfg(test)]
mod tests;

pub use market::Listing;
pub use mt::{MtToken, MTBaseTokenMetadata, MTContractMetadata, MTTokenMetadata, MTTokenMetadataAll};
pub use npc::{Npc, NpcOffer, NpcOfferView, NpcView};

pub type TokenId = String;

/// Storage deposit required for an explicit `register_player` call.
pub const REGISTER_DEPOSIT: NearToken = NearToken::from_millinear(5); // 0.005 NEAR
pub const MAX_ITEMS_PER_TICKET: usize = 5;
pub const MAX_ID_LEN: usize = 64;
pub const MAX_USERNAME_LEN: usize = 24;
/// Tickets may not be valid for longer than this (server should use ~10 min).
pub const MAX_TICKET_LIFETIME_MS: u64 = 60 * 60 * 1000;

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Players,
    UsedTickets,
    TreasureClaimCount,
    TreasureClaimedBy,
    ItemTypes,
    Balances,
    OwnerTokens,
    Listings,
    SellerListingCount,
    Npcs,
    NpcOffers,
    ClaimRecords,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum Rarity {
    Common,
    Rare,
    Epic,
    Legendary,
}

/// On-chain player record.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Player {
    pub username: Option<String>,
    pub registered_at_ms: U64,
    pub treasures_claimed: u32,
    pub missions_completed: u32,
    pub quests_completed: u32,
}

/// Item type definition (one NEP-245 token id).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct ItemType {
    pub token_id: TokenId,
    pub name: String,
    pub description: String,
    pub media: Option<String>,
    pub rarity: Rarity,
    pub category: String,
    pub transferable: bool,
    /// Hard cap on circulating supply (minted - burned).
    pub max_supply: U128,
    pub minted: U128,
    pub burned: U128,
    pub created_at_ms: U64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TicketKind {
    Treasure,
    Mission,
    Quest,
}

/// The message signed by the TREZO oracle. Serialized as JSON; the signature
/// covers the exact UTF-8 bytes submitted in `ticket`.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ClaimTicket {
    /// Unique ticket id (also the replay-protection nonce).
    pub id: String,
    /// Must equal this contract's account id (prevents cross-deployment replay).
    pub contract_id: AccountId,
    /// Must equal the transaction signer / predecessor.
    pub account_id: AccountId,
    pub kind: TicketKind,
    /// Treasure id, mission id or quest id.
    pub ref_id: String,
    /// For treasure tickets: the total number of claims this treasure allows.
    pub max_claims: Option<u32>,
    /// For mission tickets: the NPC whose allocation pays the reward.
    pub npc_id: Option<String>,
    pub items: Vec<(TokenId, U128)>,
    /// `true` when the claim was made in demo mode with a simulated location.
    pub demo: bool,
    pub expires_at_ms: U64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct ClaimRecord {
    pub ticket_id: String,
    pub account_id: AccountId,
    pub kind: String,
    pub ref_id: String,
    pub npc_id: Option<String>,
    pub items: Vec<(TokenId, U128)>,
    pub demo: bool,
    pub block_height: U64,
    pub timestamp_ms: U64,
}

#[near(serializers = [json])]
pub struct ContractStats {
    pub owner_id: AccountId,
    pub oracle_public_key: Base64VecU8,
    pub paused: bool,
    pub players: u32,
    pub claims: u64,
    pub item_types: u32,
    pub active_listings: u32,
    pub market_fee_bps: u16,
    pub total_market_volume: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub owner_id: AccountId,
    /// Raw 32-byte ed25519 public key of the game server's oracle.
    pub oracle_pk: Vec<u8>,
    pub paused: bool,

    pub players: LookupMap<AccountId, Player>,
    pub player_count: u32,

    pub used_tickets: LookupSet<String>,
    pub claim_records: LookupMap<String, ClaimRecord>,
    pub claim_count: u64,
    pub treasure_claim_count: LookupMap<String, u32>,
    /// key: "<treasure_id>|<account_id>"
    pub treasure_claimed_by: LookupSet<String>,

    // NEP-245
    pub item_types: IterableMap<TokenId, ItemType>,
    pub balances: LookupMap<(TokenId, AccountId), u128>,
    pub owner_tokens: LookupMap<AccountId, Vec<TokenId>>,

    // Marketplace
    pub listings: IterableMap<u64, Listing>,
    pub next_listing_id: u64,
    pub seller_listing_count: LookupMap<AccountId, u32>,
    pub market_fee_bps: u16,
    pub total_market_volume: u128,

    // NPCs
    pub npcs: IterableMap<String, Npc>,
    /// key: (npc_id, token_id)
    pub npc_offers: IterableMap<(String, TokenId), NpcOffer>,
}

pub(crate) fn emit_event(standard: &str, version: &str, event: &str, data: serde_json::Value) {
    let payload = serde_json::json!({
        "standard": standard,
        "version": version,
        "event": event,
        "data": data,
    });
    env::log_str(&format!("EVENT_JSON:{}", payload));
}

pub(crate) fn assert_one_yocto() {
    require!(
        env::attached_deposit() == NearToken::from_yoctonear(1),
        "Requires attached deposit of exactly 1 yoctoNEAR"
    );
}

pub(crate) fn valid_id(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= MAX_ID_LEN
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == ':' || c == '.')
}

fn decode_oracle_pk(pk: &Base64VecU8) -> Vec<u8> {
    require!(pk.0.len() == 32, "Oracle public key must be 32 raw ed25519 bytes");
    pk.0.clone()
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, oracle_public_key: Base64VecU8) -> Self {
        Self {
            owner_id,
            oracle_pk: decode_oracle_pk(&oracle_public_key),
            paused: false,
            players: LookupMap::new(StorageKey::Players),
            player_count: 0,
            used_tickets: LookupSet::new(StorageKey::UsedTickets),
            claim_records: LookupMap::new(StorageKey::ClaimRecords),
            claim_count: 0,
            treasure_claim_count: LookupMap::new(StorageKey::TreasureClaimCount),
            treasure_claimed_by: LookupSet::new(StorageKey::TreasureClaimedBy),
            item_types: IterableMap::new(StorageKey::ItemTypes),
            balances: LookupMap::new(StorageKey::Balances),
            owner_tokens: LookupMap::new(StorageKey::OwnerTokens),
            listings: IterableMap::new(StorageKey::Listings),
            next_listing_id: 1,
            seller_listing_count: LookupMap::new(StorageKey::SellerListingCount),
            market_fee_bps: 250,
            total_market_volume: 0,
            npcs: IterableMap::new(StorageKey::Npcs),
            npc_offers: IterableMap::new(StorageKey::NpcOffers),
        }
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    pub(crate) fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner_id, "Only the contract owner can call this method");
    }

    pub(crate) fn assert_not_paused(&self) {
        require!(!self.paused, "Contract is paused");
    }

    pub fn set_oracle_key(&mut self, oracle_public_key: Base64VecU8) {
        self.assert_owner();
        self.oracle_pk = decode_oracle_pk(&oracle_public_key);
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    pub fn transfer_ownership(&mut self, new_owner_id: AccountId) {
        self.assert_owner();
        self.owner_id = new_owner_id;
    }

    pub fn set_market_fee_bps(&mut self, fee_bps: u16) {
        self.assert_owner();
        require!(fee_bps <= 1000, "Fee cannot exceed 10%");
        self.market_fee_bps = fee_bps;
    }

    /// Define a new collectible type (NEP-245 token id). Supply caps can only
    /// be lowered later, never raised above the original definition.
    #[allow(clippy::too_many_arguments)]
    pub fn add_item_type(
        &mut self,
        token_id: TokenId,
        name: String,
        description: String,
        media: Option<String>,
        rarity: Rarity,
        category: String,
        transferable: bool,
        max_supply: U128,
    ) {
        self.assert_owner();
        require!(valid_id(&token_id), "Invalid token_id");
        require!(self.item_types.get(&token_id).is_none(), "Item type already exists");
        require!(!name.is_empty() && name.len() <= 64, "Invalid name");
        require!(description.len() <= 280, "Description too long");
        require!(category.len() <= 32, "Category too long");
        require!(media.as_ref().map(|m| m.len() <= 256).unwrap_or(true), "Media URL too long");
        require!(max_supply.0 > 0, "max_supply must be positive");
        self.item_types.insert(
            token_id.clone(),
            ItemType {
                token_id,
                name,
                description,
                media,
                rarity,
                category,
                transferable,
                max_supply,
                minted: U128(0),
                burned: U128(0),
                created_at_ms: U64(env::block_timestamp_ms()),
            },
        );
    }

    /// Lower (never raise) the supply cap of an item type.
    pub fn reduce_max_supply(&mut self, token_id: TokenId, max_supply: U128) {
        self.assert_owner();
        let item = self.item_types.get_mut(&token_id).unwrap_or_else(|| env::panic_str("Unknown token_id"));
        require!(max_supply.0 <= item.max_supply.0, "Supply cap can only be reduced");
        require!(max_supply.0 >= item.minted.0 - item.burned.0, "Cap below circulating supply");
        item.max_supply = max_supply;
    }

    // ---------------------------------------------------------------------
    // Players
    // ---------------------------------------------------------------------

    /// Explicit on-chain registration (optional: claiming auto-registers).
    /// Requires a 0.005 NEAR storage deposit to prevent storage spam.
    #[payable]
    pub fn register_player(&mut self, username: Option<String>) -> Player {
        self.assert_not_paused();
        require!(env::attached_deposit() >= REGISTER_DEPOSIT, "Attach 0.005 NEAR storage deposit to register");
        if let Some(u) = &username {
            require!(
                !u.is_empty()
                    && u.len() <= MAX_USERNAME_LEN
                    && u.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'),
                "Invalid username"
            );
        }
        let account = env::predecessor_account_id();
        let mut player = self.ensure_player(&account);
        if username.is_some() {
            player.username = username;
            self.players.insert(account, player.clone());
        }
        player
    }

    pub(crate) fn ensure_player(&mut self, account: &AccountId) -> Player {
        if let Some(p) = self.players.get(account) {
            return p.clone();
        }
        let p = Player {
            username: None,
            registered_at_ms: U64(env::block_timestamp_ms()),
            treasures_claimed: 0,
            missions_completed: 0,
            quests_completed: 0,
        };
        self.players.insert(account.clone(), p.clone());
        self.player_count += 1;
        emit_event("trezo", "1.0.0", "player_registered", serde_json::json!([{ "account_id": account }]));
        p
    }

    // ---------------------------------------------------------------------
    // Claims
    // ---------------------------------------------------------------------

    /// Settle an oracle-signed claim ticket. Must be called by the player
    /// named in the ticket. Mints the reward items (NEP-245) and records the
    /// claim permanently.
    pub fn claim(&mut self, ticket: String, signature: Base64VecU8) -> ClaimRecord {
        self.assert_not_paused();
        require!(ticket.len() <= 2048, "Ticket too large");

        // 1. Signature
        let sig: [u8; 64] = signature
            .0
            .as_slice()
            .try_into()
            .unwrap_or_else(|_| env::panic_str("Signature must be 64 bytes"));
        let pk: [u8; 32] = self.oracle_pk.as_slice().try_into().unwrap();
        require!(env::ed25519_verify(&sig, ticket.as_bytes(), &pk), "Invalid oracle signature");

        // 2. Ticket contents
        let t: ClaimTicket =
            serde_json::from_str(&ticket).unwrap_or_else(|_| env::panic_str("Malformed ticket"));
        let caller = env::predecessor_account_id();
        require!(t.contract_id == env::current_account_id(), "Ticket issued for another contract");
        require!(t.account_id == caller, "Ticket belongs to another account");
        let now = env::block_timestamp_ms();
        require!(now <= t.expires_at_ms.0, "Ticket expired");
        require!(t.expires_at_ms.0 <= now + MAX_TICKET_LIFETIME_MS, "Ticket lifetime too long");
        require!(valid_id(&t.id) && valid_id(&t.ref_id), "Invalid ticket id");
        require!(!self.used_tickets.contains(&t.id), "Ticket already used");
        require!(t.items.len() <= MAX_ITEMS_PER_TICKET, "Too many items in ticket");

        // 3. Kind-specific rules
        let mut player = self.ensure_player(&caller);
        match t.kind {
            TicketKind::Treasure => {
                let max = t.max_claims.unwrap_or_else(|| env::panic_str("Treasure ticket needs max_claims"));
                let key = format!("{}|{}", t.ref_id, caller);
                require!(!self.treasure_claimed_by.contains(&key), "Treasure already claimed by this player");
                let count = self.treasure_claim_count.get(&t.ref_id).copied().unwrap_or(0);
                require!(count < max, "Treasure supply exhausted");
                self.treasure_claimed_by.insert(key);
                self.treasure_claim_count.insert(t.ref_id.clone(), count + 1);
                player.treasures_claimed += 1;
            }
            TicketKind::Mission => {
                let npc_id = t.npc_id.clone().unwrap_or_else(|| env::panic_str("Mission ticket needs npc_id"));
                require!(self.npcs.get(&npc_id).is_some(), "Unknown NPC");
                for (token_id, amount) in &t.items {
                    self.consume_npc_allocation(&npc_id, token_id, amount.0);
                }
                player.missions_completed += 1;
            }
            TicketKind::Quest => {
                player.quests_completed += 1;
            }
        }
        self.players.insert(caller.clone(), player);
        self.used_tickets.insert(t.id.clone());

        // 4. Mint rewards
        if !t.items.is_empty() {
            let ids: Vec<TokenId> = t.items.iter().map(|(id, _)| id.clone()).collect();
            let amounts: Vec<u128> = t.items.iter().map(|(_, a)| a.0).collect();
            self.internal_mint(&caller, &ids, &amounts, Some(format!("claim:{}", t.id)));
        }

        let kind = match t.kind {
            TicketKind::Treasure => "treasure",
            TicketKind::Mission => "mission",
            TicketKind::Quest => "quest",
        }
        .to_string();
        let record = ClaimRecord {
            ticket_id: t.id.clone(),
            account_id: caller.clone(),
            kind,
            ref_id: t.ref_id.clone(),
            npc_id: t.npc_id.clone(),
            items: t.items.clone(),
            demo: t.demo,
            block_height: U64(env::block_height()),
            timestamp_ms: U64(now),
        };
        self.claim_records.insert(t.id.clone(), record.clone());
        self.claim_count += 1;
        emit_event("trezo", "1.0.0", "claim", serde_json::json!([record]));
        record
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    pub fn get_player(&self, account_id: AccountId) -> Option<Player> {
        self.players.get(&account_id).cloned()
    }

    pub fn get_claim(&self, ticket_id: String) -> Option<ClaimRecord> {
        self.claim_records.get(&ticket_id).cloned()
    }

    pub fn is_ticket_used(&self, ticket_id: String) -> bool {
        self.used_tickets.contains(&ticket_id)
    }

    pub fn has_claimed_treasure(&self, treasure_id: String, account_id: AccountId) -> bool {
        self.treasure_claimed_by.contains(&format!("{}|{}", treasure_id, account_id))
    }

    pub fn get_treasure_claim_count(&self, treasure_id: String) -> u32 {
        self.treasure_claim_count.get(&treasure_id).copied().unwrap_or(0)
    }

    pub fn get_item_types(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<ItemType> {
        self.item_types
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(100) as usize)
            .cloned()
            .collect()
    }

    pub fn get_item_type(&self, token_id: TokenId) -> Option<ItemType> {
        self.item_types.get(&token_id).cloned()
    }

    pub fn get_stats(&self) -> ContractStats {
        ContractStats {
            owner_id: self.owner_id.clone(),
            oracle_public_key: Base64VecU8(self.oracle_pk.clone()),
            paused: self.paused,
            players: self.player_count,
            claims: self.claim_count,
            item_types: self.item_types.len(),
            active_listings: self.listings.len(),
            market_fee_bps: self.market_fee_bps,
            total_market_volume: U128(self.total_market_volume),
        }
    }
}

/// Internal helpers shared across modules.
impl Contract {
    pub(crate) fn balance_of(&self, token_id: &TokenId, account: &AccountId) -> u128 {
        self.balances.get(&(token_id.clone(), account.clone())).copied().unwrap_or(0)
    }

    pub(crate) fn add_balance(&mut self, token_id: &TokenId, account: &AccountId, amount: u128) {
        let key = (token_id.clone(), account.clone());
        let current = self.balances.get(&key).copied().unwrap_or(0);
        let new = current.checked_add(amount).unwrap_or_else(|| env::panic_str("Balance overflow"));
        self.balances.insert(key, new);
        if current == 0 && new > 0 {
            let mut list = self.owner_tokens.get(account).cloned().unwrap_or_default();
            if !list.contains(token_id) {
                list.push(token_id.clone());
                self.owner_tokens.insert(account.clone(), list);
            }
        }
    }

    pub(crate) fn sub_balance(&mut self, token_id: &TokenId, account: &AccountId, amount: u128) {
        let key = (token_id.clone(), account.clone());
        let current = self.balances.get(&key).copied().unwrap_or(0);
        require!(current >= amount, "Insufficient balance");
        let new = current - amount;
        if new == 0 {
            self.balances.remove(&key);
            if let Some(list) = self.owner_tokens.get(account).cloned() {
                let filtered: Vec<TokenId> = list.into_iter().filter(|t| t != token_id).collect();
                if filtered.is_empty() {
                    self.owner_tokens.remove(account);
                } else {
                    self.owner_tokens.insert(account.clone(), filtered);
                }
            }
        } else {
            self.balances.insert(key, new);
        }
    }

    pub(crate) fn internal_mint(&mut self, owner: &AccountId, token_ids: &[TokenId], amounts: &[u128], memo: Option<String>) {
        require!(token_ids.len() == amounts.len(), "token_ids and amounts length mismatch");
        for (token_id, amount) in token_ids.iter().zip(amounts.iter()) {
            require!(*amount > 0, "Amount must be positive");
            let item = self.item_types.get_mut(token_id).unwrap_or_else(|| env::panic_str("Unknown token_id"));
            let circulating = item.minted.0 - item.burned.0;
            require!(circulating + amount <= item.max_supply.0, "Item supply cap reached");
            item.minted = U128(item.minted.0 + amount);
            self.add_balance(token_id, owner, *amount);
        }
        let mut log = serde_json::json!({
            "owner_id": owner,
            "token_ids": token_ids,
            "amounts": amounts.iter().map(|a| a.to_string()).collect::<Vec<_>>(),
        });
        if let Some(m) = memo {
            log["memo"] = serde_json::Value::String(m);
        }
        emit_event("nep245", "1.0.0", "mt_mint", serde_json::json!([log]));
    }

    pub(crate) fn internal_burn(&mut self, owner: &AccountId, token_id: &TokenId, amount: u128, memo: Option<String>) {
        self.sub_balance(token_id, owner, amount);
        let item = self.item_types.get_mut(token_id).unwrap_or_else(|| env::panic_str("Unknown token_id"));
        item.burned = U128(item.burned.0 + amount);
        let mut log = serde_json::json!({
            "owner_id": owner,
            "token_ids": [token_id],
            "amounts": [amount.to_string()],
        });
        if let Some(m) = memo {
            log["memo"] = serde_json::Value::String(m);
        }
        emit_event("nep245", "1.0.0", "mt_burn", serde_json::json!([log]));
    }

    /// NEAR transfer via the low-level promise API. (The high-level
    /// `near_sdk::Promise` links host functions for every action kind,
    /// including ones newer than some deployed protocol versions.)
    pub(crate) fn pay(&self, to: &AccountId, amount: u128) {
        if amount > 0 {
            let p = env::promise_batch_create(to);
            env::promise_batch_action_transfer(p, NearToken::from_yoctonear(amount));
        }
    }
}
