const IDENTITY: Symbol = symbol_short!("IDENT");
const TOKEN: Symbol = symbol_short!("TOKEN");
const SUPPLY: Symbol = symbol_short!("SUPPLY");
const ADMIN: Symbol = symbol_short!("ADMIN");

use soroban_sdk::{symbol_short, Address, BytesN, Env, Symbol};
use crate::types::{AidProgram, Distribution};

// Storage keys
const PROGRAMS_V2: Symbol = symbol_short!("PGV2");
const DISTRIBUTIONS_V2: Symbol = symbol_short!("DSV2");
const LAST_DIST_TIME: Symbol = symbol_short!("LDTM");

// Save program
pub fn save_program(env: &Env, program_id: BytesN<32>, program: &AidProgram) {
    let key = (PROGRAMS_V2, program_id);
    env.storage().persistent().set(&key, program);
    env.storage().persistent().extend_ttl(&key, 1_000, 10_000);
}

// Get program
pub fn get_program(env: &Env, program_id: &BytesN<32>) -> Option<AidProgram> {
    let key = (PROGRAMS_V2, program_id.clone());
    env.storage().persistent().get(&key)
}

// Save distribution
pub fn save_distribution(env: &Env, distribution: &Distribution) {
    let key = (DISTRIBUTIONS_V2, distribution.distribution_id.clone());
    env.storage().persistent().set(&key, distribution);
    env.storage().persistent().extend_ttl(&key, 1_000, 10_000);
}

// Get last distribution time
pub fn get_last_distribution_time(
    env: &Env,
    program_id: &BytesN<32>,
    nullifier: &BytesN<32>,
) -> Option<u64> {
    let key = (LAST_DIST_TIME, program_id.clone(), nullifier.clone());
    env.storage().persistent().get(&key)
}

// Update last distribution time
pub fn update_last_distribution_time(
    env: &Env,
    program_id: &BytesN<32>,
    nullifier: &BytesN<32>,
    timestamp: u64,
) {
    let key = (LAST_DIST_TIME, program_id.clone(), nullifier.clone());
    env.storage().persistent().set(&key, &timestamp);
    env.storage().persistent().extend_ttl(&key, 1_000, 10_000);
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().persistent().set(&ADMIN, admin);
}

pub fn get_admin(env: &Env) -> Address {
    env.storage().persistent().get(&ADMIN).unwrap()
}

pub fn has_admin(env: &Env) -> bool {
    env.storage().persistent().has(&ADMIN)
}

// -------------------
// CONTRACT ADDRESSES
// -------------------

// Identity
pub fn set_identity(env: &Env, addr: &Address) {
    env.storage().persistent().set(&IDENTITY, addr);
}

pub fn get_identity(env: &Env) -> Address {
    env.storage().persistent().get(&IDENTITY).unwrap()
}

// Token
pub fn set_token(env: &Env, addr: &Address) {
    env.storage().persistent().set(&TOKEN, addr);
}

pub fn get_token(env: &Env) -> Address {
    env.storage().persistent().get(&TOKEN).unwrap()
}

// Supply Chain
pub fn set_supply(env: &Env, addr: &Address) {
    env.storage().persistent().set(&SUPPLY, addr);
}

pub fn get_supply(env: &Env) -> Address {
    env.storage().persistent().get(&SUPPLY).unwrap()
}