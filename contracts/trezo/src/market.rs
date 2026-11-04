//! Player-to-player marketplace with on-chain escrow.
//!
//! * `list_item` moves the listed amount into escrow (the contract account's
//!   NEP-245 balance) so the seller can no longer transfer or double-list it.
//! * `buy_listing` removes the listing **before** anything else, so a listing
//!   can be bought exactly once (NEAR executes a contract's receipts one at a
//!   time, so there is no race). Payment to the seller and item delivery
//!   happen in the same receipt.
//! * A fee (default 2.5%) is credited to the Merchant NPC treasury, funding
//!   the Merchant's buyback programme (an economic sink/source loop).

use crate::*;

pub const MAX_LISTINGS_PER_SELLER: u32 = 25;
pub const MIN_PRICE: u128 = 10_000_000_000_000_000_000_000; // 0.01 NEAR
pub const FEE_RECEIVER_NPC: &str = "merchant";

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Listing {
    pub id: u64,
    pub seller_id: AccountId,
    pub token_id: TokenId,
    pub amount: U128,
    /// Total price in yoctoNEAR for the whole listed amount.
    pub price: U128,
    pub created_at_ms: U64,
}

#[near]
impl Contract {
    #[payable]
    pub fn list_item(&mut self, token_id: TokenId, amount: U128, price: U128) -> Listing {
        assert_one_yocto();
        self.assert_not_paused();
        require!(amount.0 > 0, "Amount must be positive");
        require!(price.0 >= MIN_PRICE, "Minimum price is 0.01 NEAR");
        let seller = env::predecessor_account_id();
        let item = self.item_types.get(&token_id).unwrap_or_else(|| env::panic_str("Unknown token_id"));
        require!(item.transferable, "This item is soulbound and cannot be listed");
        let count = self.seller_listing_count.get(&seller).copied().unwrap_or(0);
        require!(count < MAX_LISTINGS_PER_SELLER, "Too many active listings");

        // Escrow: move tokens to the contract account.
        let escrow = env::current_account_id();
        self.sub_balance(&token_id, &seller, amount.0);
        self.add_balance(&token_id, &escrow, amount.0);
        Self::emit_transfer(&seller, &escrow, &[token_id.clone()], &[amount], Some("market:list".into()));

        let id = self.next_listing_id;
        self.next_listing_id += 1;
        let listing = Listing {
            id,
            seller_id: seller.clone(),
            token_id,
            amount,
            price,
            created_at_ms: U64(env::block_timestamp_ms()),
        };
        self.listings.insert(id, listing.clone());
        self.seller_listing_count.insert(seller, count + 1);
        emit_event("trezo", "1.0.0", "market_list", serde_json::json!([listing]));
        listing
    }

    #[payable]
    pub fn cancel_listing(&mut self, listing_id: u64) {
        assert_one_yocto();
        let listing = self.listings.get(&listing_id).cloned().unwrap_or_else(|| env::panic_str("Listing not found"));
        require!(listing.seller_id == env::predecessor_account_id(), "Only the seller can cancel");
        self.remove_listing(&listing);
        let escrow = env::current_account_id();
        self.sub_balance(&listing.token_id, &escrow, listing.amount.0);
        self.add_balance(&listing.token_id, &listing.seller_id, listing.amount.0);
        Self::emit_transfer(&escrow, &listing.seller_id, &[listing.token_id.clone()], &[listing.amount], Some("market:cancel".into()));
        emit_event("trezo", "1.0.0", "market_cancel", serde_json::json!([{ "listing_id": listing_id }]));
    }

    /// Buy a listing. Attach at least `price` yoctoNEAR; any excess is refunded.
    #[payable]
    pub fn buy_listing(&mut self, listing_id: u64) {
        self.assert_not_paused();
        let listing = self.listings.get(&listing_id).cloned().unwrap_or_else(|| env::panic_str("Listing not found or already sold"));
        let buyer = env::predecessor_account_id();
        require!(buyer != listing.seller_id, "Cannot buy your own listing");
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit >= listing.price.0, "Attached deposit is less than the price");

        // Remove first: guarantees single purchase.
        self.remove_listing(&listing);

        let escrow = env::current_account_id();
        self.sub_balance(&listing.token_id, &escrow, listing.amount.0);
        self.add_balance(&listing.token_id, &buyer, listing.amount.0);
        Self::emit_transfer(&escrow, &buyer, &[listing.token_id.clone()], &[listing.amount], Some(format!("market:buy:{}", listing_id)));

        // Fee goes to the Merchant treasury; if no Merchant exists the seller keeps it.
        let fee = listing.price.0 * self.market_fee_bps as u128 / 10_000;
        let fee = self.credit_npc_treasury(FEE_RECEIVER_NPC, fee);
        let seller_proceeds = listing.price.0 - fee;
        self.total_market_volume += listing.price.0;

        self.pay(&listing.seller_id, seller_proceeds);
        self.pay(&buyer, deposit - listing.price.0);
        self.ensure_player(&buyer);
        emit_event(
            "trezo",
            "1.0.0",
            "market_buy",
            serde_json::json!([{
                "listing_id": listing_id,
                "buyer_id": buyer,
                "seller_id": listing.seller_id,
                "token_id": listing.token_id,
                "amount": listing.amount,
                "price": listing.price,
                "fee": U128(fee),
            }]),
        );
    }

    pub fn get_listing(&self, listing_id: u64) -> Option<Listing> {
        self.listings.get(&listing_id).cloned()
    }

    pub fn get_listings(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Listing> {
        self.listings
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .cloned()
            .collect()
    }

    pub fn get_listings_by_seller(&self, seller_id: AccountId) -> Vec<Listing> {
        self.listings.values().filter(|l| l.seller_id == seller_id).cloned().collect()
    }
}

impl Contract {
    fn remove_listing(&mut self, listing: &Listing) {
        self.listings.remove(&listing.id);
        let count = self.seller_listing_count.get(&listing.seller_id).copied().unwrap_or(1);
        if count <= 1 {
            self.seller_listing_count.remove(&listing.seller_id);
        } else {
            self.seller_listing_count.insert(listing.seller_id.clone(), count - 1);
        }
    }
}
