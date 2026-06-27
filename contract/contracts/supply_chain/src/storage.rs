use soroban_sdk::{symbol_short, Address, BytesN, Env, Vec};
use crate::types::{Batch, CustodyEvent};

const DISBURSEMENT: soroban_sdk::Symbol = symbol_short!("DIST");
const BATCHES_V2: soroban_sdk::Symbol = symbol_short!("BTV2");
const EVENTS_V2: soroban_sdk::Symbol = symbol_short!("ETV2");

// --- Batch Storage (Persistent) ---
// We use persistent storage here because batches are user data that 
// should not be limited by the contract instance's storage size.

pub fn save_batch(env: &Env, batch: &Batch) {
    let key = (BATCHES_V2, batch.batch_id.clone());
    env.storage().persistent().set(&key, batch);
    env.storage().persistent().extend_ttl(&key, 1_000, 10_000);
}

pub fn get_batch(env: &Env, batch_id: &BytesN<32>) -> Option<Batch> {
    let key = (BATCHES_V2, batch_id.clone());
    env.storage().persistent().get(&key)
}

pub fn batch_exists(env: &Env, batch_id: &BytesN<32>) -> bool {
    let key = (BATCHES_V2, batch_id.clone());
    env.storage().persistent().has(&key)
}

// --- Event Storage (Persistent) ---
// Events grow over time; instance storage would eventually hit a size limit.

pub fn save_event(env: &Env, batch_id: &BytesN<32>, event: CustodyEvent) {
    let key = (EVENTS_V2, batch_id.clone());
    
    let mut events: Vec<CustodyEvent> = env.storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env));
    
    events.push_back(event);
    env.storage().persistent().set(&key, &events);
    env.storage().persistent().extend_ttl(&key, 1_000, 10_000);
}

pub fn get_events(env: &Env, batch_id: &BytesN<32>) -> Vec<CustodyEvent> {
    let key = (EVENTS_V2, batch_id.clone());
    env.storage()
        .persistent()
        .get(&key)
        .unwrap_or_else(|| Vec::new(env))
}

// --- Contract Config (Instance) ---
// Using instance storage is correct here because this is administrative config.

pub fn set_disbursement_contract(env: &Env, addr: &Address) {
    env.storage().instance().set(&DISBURSEMENT, addr);
}

pub fn get_disbursement_contract(env: &Env) -> Option<Address> {
    env.storage().instance().get(&DISBURSEMENT)
}

pub fn has_disbursement_contract(env: &Env) -> bool {
    env.storage().instance().has(&DISBURSEMENT)
}