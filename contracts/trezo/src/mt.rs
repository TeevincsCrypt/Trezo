//! NEP-245 Multi Token: core, metadata, enumeration and events.
//!
//! Approval Management is intentionally **not** implemented: any `approval`
//! argument other than `null` is rejected so integrators get a clear error
//! instead of silently ignored approvals.

use crate::*;
use near_sdk::Gas;

const GAS_FOR_RESOLVE: Gas = Gas::from_tgas(15);
const GAS_FOR_MT_TRANSFER_CALL: Gas = Gas::from_tgas(40);

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct MtToken {
    pub token_id: TokenId,
    pub owner_id: Option<AccountId>,
}

#[near(serializers = [json])]
pub struct MTContractMetadata {
    pub spec: String,
    pub name: String,
}

#[near(serializers = [json])]
pub struct MTBaseTokenMetadata {
    pub name: String,
    pub id: String,
    pub symbol: Option<String>,
    pub icon: Option<String>,
    pub decimals: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub copies: Option<u64>,
    pub reference_hash: Option<Base64VecU8>,
}

#[near(serializers = [json])]
pub struct MTTokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<Base64VecU8>,
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub starts_at: Option<String>,
    pub updated_at: Option<String>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<Base64VecU8>,
}

#[near(serializers = [json])]
pub struct MTTokenMetadataAll {
    pub base: MTBaseTokenMetadata,
    pub token: MTTokenMetadata,
}

impl Contract {
    fn base_metadata(item: &ItemType) -> MTBaseTokenMetadata {
        MTBaseTokenMetadata {
            name: item.name.clone(),
            id: item.token_id.clone(),
            symbol: Some("TREZO".to_string()),
            icon: None,
            decimals: Some("0".to_string()),
            base_uri: None,
            reference: None,
            copies: Some(item.max_supply.0 as u64),
            reference_hash: None,
        }
    }

    fn token_metadata(item: &ItemType) -> MTTokenMetadata {
        MTTokenMetadata {
            title: Some(item.name.clone()),
            description: Some(item.description.clone()),
            media: item.media.clone(),
            media_hash: None,
            issued_at: Some(item.created_at_ms.0.to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: Some(
                serde_json::json!({
                    "rarity": item.rarity,
                    "category": item.category,
                    "transferable": item.transferable,
                })
                .to_string(),
            ),
            reference: None,
            reference_hash: None,
        }
    }

    /// Core transfer used by mt_transfer / batch / transfer_call.
    pub(crate) fn internal_transfer_batch(
        &mut self,
        sender_id: &AccountId,
        receiver_id: &AccountId,
        token_ids: &[TokenId],
        amounts: &[U128],
        memo: Option<String>,
    ) {
        require!(sender_id != receiver_id, "Sender and receiver must differ");
        require!(!token_ids.is_empty(), "No tokens to transfer");
        require!(token_ids.len() == amounts.len(), "token_ids and amounts length mismatch");
        for (token_id, amount) in token_ids.iter().zip(amounts.iter()) {
            require!(amount.0 > 0, "Amount must be positive");
            let item = self.item_types.get(token_id).unwrap_or_else(|| env::panic_str("Unknown token_id"));
            require!(item.transferable, "This item is soulbound and cannot be transferred");
            self.sub_balance(token_id, sender_id, amount.0);
            self.add_balance(token_id, receiver_id, amount.0);
        }
        Self::emit_transfer(sender_id, receiver_id, token_ids, amounts, memo);
    }

    pub(crate) fn emit_transfer(
        old_owner: &AccountId,
        new_owner: &AccountId,
        token_ids: &[TokenId],
        amounts: &[U128],
        memo: Option<String>,
    ) {
        let mut log = serde_json::json!({
            "old_owner_id": old_owner,
            "new_owner_id": new_owner,
            "token_ids": token_ids,
            "amounts": amounts,
        });
        if let Some(m) = memo {
            log["memo"] = serde_json::Value::String(m);
        }
        emit_event("nep245", "1.0.0", "mt_transfer", serde_json::json!([log]));
    }

    fn reject_approvals<T>(approvals: &Option<T>) {
        require!(approvals.is_none(), "Approval Management is not supported by this contract");
    }
}

#[near]
impl Contract {
    // ---------------------------- Core: change ----------------------------

    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        self.assert_not_paused();
        Self::reject_approvals(&approval);
        let sender = env::predecessor_account_id();
        let before = env::storage_usage();
        self.internal_transfer_batch(&sender, &receiver_id, &[token_id], &[amount], memo);
        self.charge_storage(&sender, before);
    }

    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        self.assert_not_paused();
        if let Some(a) = &approvals {
            require!(a.len() == token_ids.len(), "approvals length mismatch");
            require!(a.iter().all(|x| x.is_none()), "Approval Management is not supported by this contract");
        }
        let sender = env::predecessor_account_id();
        let before = env::storage_usage();
        self.internal_transfer_batch(&sender, &receiver_id, &token_ids, &amounts, memo);
        self.charge_storage(&sender, before);
    }

    #[payable]
    pub fn mt_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
        msg: String,
    ) {
        self.mt_batch_transfer_call(
            receiver_id,
            vec![token_id],
            vec![amount],
            approval.map(|a| vec![Some(a)]),
            memo,
            msg,
        )
    }

    #[payable]
    pub fn mt_batch_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
        msg: String,
    ) {
        // Returns (via promise_return) the amounts used by the receiver, as
        // resolved by `mt_resolve_transfer`.
        assert_one_yocto();
        self.assert_not_paused();
        if let Some(a) = &approvals {
            require!(a.iter().all(|x| x.is_none()), "Approval Management is not supported by this contract");
        }
        require!(
            env::prepaid_gas().saturating_sub(env::used_gas()) > GAS_FOR_MT_TRANSFER_CALL.saturating_add(GAS_FOR_RESOLVE),
            "More gas is required"
        );
        let sender = env::predecessor_account_id();
        let before = env::storage_usage();
        self.internal_transfer_batch(&sender, &receiver_id, &token_ids, &amounts, memo);
        self.charge_storage(&sender, before);
        let previous_owner_ids = vec![sender.clone(); token_ids.len()];
        let on_transfer = serde_json::json!({
            "sender_id": sender,
            "previous_owner_ids": previous_owner_ids,
            "token_ids": token_ids,
            "amounts": amounts,
            "msg": msg,
        });
        let resolve = serde_json::json!({
            "sender_id": sender,
            "receiver_id": receiver_id,
            "token_ids": token_ids,
            "amounts": amounts,
        });
        let p = env::promise_create(
            receiver_id,
            "mt_on_transfer",
            on_transfer.to_string(),
            NearToken::from_yoctonear(0),
            GAS_FOR_MT_TRANSFER_CALL,
        );
        let cb = env::promise_then(
            p,
            env::current_account_id(),
            "mt_resolve_transfer",
            resolve.to_string(),
            NearToken::from_yoctonear(0),
            GAS_FOR_RESOLVE,
        );
        env::promise_return(cb);
    }

    /// Returns the amounts actually used by the receiver; refunds the rest.
    #[private]
    pub fn mt_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        token_ids: Vec<TokenId>,
        amounts: Vec<U128>,
    ) -> Vec<U128> {
        require!(token_ids.len() == amounts.len(), "length mismatch");
        // Bounded read: a malicious receiver cannot make us run out of gas
        // by returning a huge payload.
        let unused: Vec<u128> = match env::promise_result_checked(0, 16 * 1024) {
            Ok(value) => match serde_json::from_slice::<Vec<U128>>(&value) {
                Ok(v) if v.len() == amounts.len() => {
                    v.iter().zip(amounts.iter()).map(|(u, a)| u.0.min(a.0)).collect()
                }
                // Malformed response: treat everything as unused (refund).
                _ => amounts.iter().map(|a| a.0).collect(),
            },
            Err(_) => amounts.iter().map(|a| a.0).collect(),
        };

        let mut used = Vec::with_capacity(amounts.len());
        let mut refund_ids = Vec::new();
        let mut refund_amounts = Vec::new();
        for ((token_id, amount), unused_amount) in token_ids.iter().zip(amounts.iter()).zip(unused.iter()) {
            // The receiver may already have moved some tokens on.
            let receiver_balance = self.balance_of(token_id, &receiver_id);
            let refund = (*unused_amount).min(receiver_balance);
            if refund > 0 {
                self.sub_balance(token_id, &receiver_id, refund);
                self.add_balance(token_id, &sender_id, refund);
                refund_ids.push(token_id.clone());
                refund_amounts.push(U128(refund));
            }
            used.push(U128(amount.0 - refund));
        }
        if !refund_ids.is_empty() {
            Self::emit_transfer(&receiver_id, &sender_id, &refund_ids, &refund_amounts, Some("refund".into()));
        }
        used
    }

    // ----------------------------- Core: view -----------------------------

    pub fn mt_token(&self, token_ids: Vec<TokenId>) -> Vec<Option<MtToken>> {
        token_ids
            .into_iter()
            .map(|id| self.item_types.get(&id).map(|_| MtToken { token_id: id.clone(), owner_id: None }))
            .collect()
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: TokenId) -> U128 {
        U128(self.balance_of(&token_id, &account_id))
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<TokenId>) -> Vec<U128> {
        token_ids.iter().map(|id| U128(self.balance_of(id, &account_id))).collect()
    }

    pub fn mt_supply(&self, token_id: TokenId) -> Option<U128> {
        self.item_types.get(&token_id).map(|i| U128(i.minted.0 - i.burned.0))
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<TokenId>) -> Vec<Option<U128>> {
        token_ids.into_iter().map(|id| self.mt_supply(id)).collect()
    }

    // ------------------------------ Metadata ------------------------------

    pub fn mt_metadata_contract(&self) -> MTContractMetadata {
        MTContractMetadata { spec: "mt-1.0.0".to_string(), name: "TREZO Collectibles".to_string() }
    }

    pub fn mt_metadata_token_all(&self, token_ids: Vec<TokenId>) -> Vec<Option<MTTokenMetadataAll>> {
        token_ids
            .iter()
            .map(|id| {
                self.item_types.get(id).map(|item| MTTokenMetadataAll {
                    base: Self::base_metadata(item),
                    token: Self::token_metadata(item),
                })
            })
            .collect()
    }

    pub fn mt_metadata_token_by_token_id(&self, token_ids: Vec<TokenId>) -> Vec<Option<MTTokenMetadata>> {
        token_ids.iter().map(|id| self.item_types.get(id).map(Self::token_metadata)).collect()
    }

    pub fn mt_metadata_base_by_token_id(&self, token_ids: Vec<TokenId>) -> Vec<Option<MTBaseTokenMetadata>> {
        token_ids.iter().map(|id| self.item_types.get(id).map(Self::base_metadata)).collect()
    }

    /// Each token id has exactly one base metadata whose id equals the token id.
    pub fn mt_metadata_base_by_metadata_id(&self, base_metadata_ids: Vec<String>) -> Vec<Option<MTBaseTokenMetadata>> {
        self.mt_metadata_base_by_token_id(base_metadata_ids)
    }

    // ----------------------------- Enumeration ----------------------------

    pub fn mt_tokens(&self, from_index: Option<U128>, limit: Option<u32>) -> Vec<MtToken> {
        self.item_types
            .keys()
            .skip(from_index.map(|i| i.0 as usize).unwrap_or(0))
            .take(limit.unwrap_or(100) as usize)
            .map(|id| MtToken { token_id: id.clone(), owner_id: None })
            .collect()
    }

    pub fn mt_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u32>) -> Vec<MtToken> {
        self.owner_tokens
            .get(&account_id)
            .map(|list| {
                list.iter()
                    .skip(from_index.map(|i| i.0 as usize).unwrap_or(0))
                    .take(limit.unwrap_or(100) as usize)
                    .map(|id| MtToken { token_id: id.clone(), owner_id: Some(account_id.clone()) })
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn mt_tokens_base_metadata_all(&self, from_index: Option<U128>, limit: Option<u32>) -> Vec<MTBaseTokenMetadata> {
        self.item_types
            .values()
            .skip(from_index.map(|i| i.0 as usize).unwrap_or(0))
            .take(limit.unwrap_or(100) as usize)
            .map(Self::base_metadata)
            .collect()
    }
}
