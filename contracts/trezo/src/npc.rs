//! NPC treasuries and the Merchant's autonomous market.
//!
//! Every NPC has an on-chain treasury (NEAR held by this contract and
//! accounted per NPC) and per-item *allocations* (how many units it may still
//! hand out). NPCs have no private keys; they act only through the rules
//! below, which nobody — including the contract owner — can bypass:
//!
//! * **Mission rewards** consume the issuing NPC's allocation
//!   (see `claim` with `kind = mission`). When an allocation is exhausted the
//!   NPC simply cannot pay that reward any more.
//! * **Merchant sales** (`npc_buy`): bonding-curve price that rises with net
//!   units sold; revenue flows into the NPC treasury.
//! * **Merchant buybacks** (`npc_sell`): the NPC buys items back from players
//!   at a fraction of its current price, paid from its treasury, capped by a
//!   daily spending limit. Bought-back items are burned and the allocation is
//!   restocked, so prices fall again as players sell.
//! * Treasuries can be topped up by anyone (`fund_npc`) and receive the
//!   marketplace fee, but **cannot be withdrawn** by anyone.

use crate::*;

/// Price step per net unit sold, in basis points of the base price (8%).
pub const PRICE_STEP_BPS: u128 = 800;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Npc {
    pub id: String,
    pub name: String,
    pub role: String,
    pub treasury: U128,
    pub daily_spend_limit: U128,
    pub spent_today: U128,
    pub spend_day: u64,
    pub total_received: U128,
    pub total_spent: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct NpcOffer {
    pub npc_id: String,
    pub token_id: TokenId,
    /// Units this NPC may still mint (as mission rewards or sales).
    pub allocation: U128,
    /// Base sale price in yoctoNEAR; 0 = not for sale (reward-only).
    pub base_price: U128,
    /// Buyback price as bps of the current sale price; 0 = no buyback.
    pub buyback_bps: u16,
    pub sold: U128,
    pub bought_back: U128,
}

#[near(serializers = [json])]
pub struct NpcOfferView {
    pub offer: NpcOffer,
    pub current_price: U128,
    pub buyback_price: U128,
}

#[near(serializers = [json])]
pub struct NpcView {
    pub npc: Npc,
    pub offers: Vec<NpcOfferView>,
}

impl NpcOffer {
    pub fn current_price(&self) -> u128 {
        let net_sold = self.sold.0.saturating_sub(self.bought_back.0);
        self.base_price.0 * (10_000 + PRICE_STEP_BPS * net_sold) / 10_000
    }

    pub fn buyback_price(&self) -> u128 {
        // Priced against the *previous* step so a buy→sell round trip always
        // loses value (no treasury-draining arbitrage).
        let net_sold = self.sold.0.saturating_sub(self.bought_back.0);
        let prev = self.base_price.0 * (10_000 + PRICE_STEP_BPS * net_sold.saturating_sub(1)) / 10_000;
        prev * self.buyback_bps as u128 / 10_000
    }
}

#[near]
impl Contract {
    // ------------------------------- Admin -------------------------------

    pub fn upsert_npc(&mut self, npc_id: String, name: String, role: String, daily_spend_limit: U128) {
        self.assert_owner();
        self.assert_economy_unlocked();
        require!(valid_id(&npc_id), "Invalid npc_id");
        require!(name.len() <= 48 && role.len() <= 48, "Name/role too long");
        let npc = match self.npcs.get(&npc_id) {
            Some(existing) => Npc { name, role, daily_spend_limit, ..existing.clone() },
            None => Npc {
                id: npc_id.clone(),
                name,
                role,
                treasury: U128(0),
                daily_spend_limit,
                spent_today: U128(0),
                spend_day: 0,
                total_received: U128(0),
                total_spent: U128(0),
            },
        };
        self.npcs.insert(npc_id, npc);
    }

    /// Configure what an NPC can hand out / sell. Allocation is still bounded
    /// by each item's global `max_supply` at mint time.
    pub fn set_npc_offer(&mut self, npc_id: String, token_id: TokenId, allocation: U128, base_price: U128, buyback_bps: u16) {
        self.assert_owner();
        self.assert_economy_unlocked();
        require!(self.npcs.get(&npc_id).is_some(), "Unknown NPC");
        require!(self.item_types.get(&token_id).is_some(), "Unknown token_id");
        require!(buyback_bps <= 9_000, "Buyback cannot exceed 90% of price");
        let key = (npc_id.clone(), token_id.clone());
        let offer = match self.npc_offers.get(&key) {
            Some(o) => NpcOffer { allocation, base_price, buyback_bps, ..o.clone() },
            None => NpcOffer {
                npc_id,
                token_id,
                allocation,
                base_price,
                buyback_bps,
                sold: U128(0),
                bought_back: U128(0),
            },
        };
        self.npc_offers.insert(key, offer);
    }

    /// Anyone may top up an NPC treasury. Funds can never be withdrawn; they
    /// are only spent by the NPC's rules (buybacks).
    #[payable]
    pub fn fund_npc(&mut self, npc_id: String) -> U128 {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "Attach NEAR to fund the NPC");
        let credited = self.credit_npc_treasury(&npc_id, amount);
        require!(credited == amount, "Unknown NPC");
        U128(self.npcs.get(&npc_id).unwrap().treasury.0)
    }

    // --------------------------- Merchant market ---------------------------

    /// Buy one unit from an NPC at its current bonding-curve price.
    #[payable]
    pub fn npc_buy(&mut self, npc_id: String, token_id: TokenId) -> U128 {
        self.assert_not_paused();
        let key = (npc_id.clone(), token_id.clone());
        let mut offer = self.npc_offers.get(&key).cloned().unwrap_or_else(|| env::panic_str("This NPC does not sell that item"));
        require!(offer.base_price.0 > 0, "Item is not for sale");
        require!(offer.allocation.0 >= 1, "NPC is out of stock");
        let price = offer.current_price();
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit >= price, "Attached deposit is less than the current price");

        offer.allocation = U128(offer.allocation.0 - 1);
        offer.sold = U128(offer.sold.0 + 1);
        self.npc_offers.insert(key, offer);

        let buyer = env::predecessor_account_id();
        let before = env::storage_usage();
        self.ensure_player(&buyer);
        self.internal_mint(&buyer, &[token_id.clone()], &[1], Some(format!("npc_buy:{}", npc_id)));
        self.charge_storage(&buyer, before);
        self.credit_npc_treasury(&npc_id, price);
        self.pay(&buyer, deposit - price);
        emit_event("trezo", "1.0.0", "npc_sale", serde_json::json!([{ "npc_id": npc_id, "buyer_id": buyer, "token_id": token_id, "price": U128(price) }]));
        U128(price)
    }

    /// Sell one unit back to an NPC. Paid from the NPC treasury, subject to
    /// its daily spending limit. The item is burned and the NPC restocks.
    #[payable]
    pub fn npc_sell(&mut self, npc_id: String, token_id: TokenId) -> U128 {
        assert_one_yocto();
        self.assert_not_paused();
        let key = (npc_id.clone(), token_id.clone());
        let mut offer = self.npc_offers.get(&key).cloned().unwrap_or_else(|| env::panic_str("This NPC does not buy that item"));
        require!(offer.buyback_bps > 0 && offer.base_price.0 > 0, "NPC does not buy this item");
        let price = offer.buyback_price();
        require!(price > 0, "Nothing to pay");

        let mut npc = self.npcs.get(&npc_id).cloned().unwrap_or_else(|| env::panic_str("Unknown NPC"));
        let today = env::block_timestamp_ms() / DAY_MS;
        if npc.spend_day != today {
            npc.spend_day = today;
            npc.spent_today = U128(0);
        }
        require!(npc.treasury.0 >= price, "NPC treasury cannot afford this right now");
        require!(npc.spent_today.0 + price <= npc.daily_spend_limit.0, "NPC daily buyback limit reached");
        // Never let a payout eat into the contract's storage stake.
        let storage_cost = env::storage_usage() as u128 * env::storage_byte_cost().as_yoctonear();
        require!(env::account_balance().as_yoctonear().saturating_sub(price) >= storage_cost, "Contract balance reserved for storage");

        let seller = env::predecessor_account_id();
        self.internal_burn(&seller, &token_id, 1, Some(format!("npc_sell:{}", npc_id)));

        offer.allocation = U128(offer.allocation.0 + 1);
        offer.bought_back = U128(offer.bought_back.0 + 1);
        self.npc_offers.insert(key, offer);

        npc.treasury = U128(npc.treasury.0 - price);
        npc.spent_today = U128(npc.spent_today.0 + price);
        npc.total_spent = U128(npc.total_spent.0 + price);
        self.npcs.insert(npc_id.clone(), npc);

        self.pay(&seller, price);
        emit_event("trezo", "1.0.0", "npc_buyback", serde_json::json!([{ "npc_id": npc_id, "seller_id": seller, "token_id": token_id, "price": U128(price) }]));
        U128(price)
    }

    // -------------------------------- Views --------------------------------

    pub fn get_npc(&self, npc_id: String) -> Option<NpcView> {
        self.npcs.get(&npc_id).map(|npc| NpcView {
            npc: npc.clone(),
            offers: self
                .npc_offers
                .values()
                .filter(|o| o.npc_id == npc_id)
                .map(|o| NpcOfferView {
                    offer: o.clone(),
                    current_price: U128(o.current_price()),
                    buyback_price: U128(o.buyback_price()),
                })
                .collect(),
        })
    }

    pub fn get_npcs(&self) -> Vec<NpcView> {
        self.npcs.keys().cloned().collect::<Vec<_>>().into_iter().filter_map(|id| self.get_npc(id)).collect()
    }
}

impl Contract {
    /// Returns the amount actually credited (0 when the NPC does not exist).
    pub(crate) fn credit_npc_treasury(&mut self, npc_id: &str, amount: u128) -> u128 {
        if amount == 0 {
            return 0;
        }
        match self.npcs.get_mut(npc_id) {
            Some(npc) => {
                npc.treasury = U128(npc.treasury.0 + amount);
                npc.total_received = U128(npc.total_received.0 + amount);
                amount
            }
            None => 0,
        }
    }

    pub(crate) fn consume_npc_allocation(&mut self, npc_id: &str, token_id: &TokenId, amount: u128) {
        let key = (npc_id.to_string(), token_id.clone());
        let offer = self.npc_offers.get_mut(&key).unwrap_or_else(|| env::panic_str("NPC has no allocation for this item"));
        require!(offer.allocation.0 >= amount, "NPC reward allocation exhausted");
        offer.allocation = U128(offer.allocation.0 - amount);
    }
}
