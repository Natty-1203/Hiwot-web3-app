use soroban_sdk::{contracttype, BytesN, Env, Address};
use crate::types::{Beneficiary, Family, Error, UserProfile, UserRole};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Beneficiary(BytesN<32>),
    Family(BytesN<32>),
    User(Address),
}

// Store a beneficiary
pub fn store_beneficiary(env: &Env, nullifier: &BytesN<32>, beneficiary: &Beneficiary) {
    let key = DataKey::Beneficiary(nullifier.clone());

    env.storage()
        .persistent()
        .set(&key, beneficiary);
}

// Get a beneficiary
pub fn get_beneficiary(env: &Env, nullifier: &BytesN<32>) -> Result<Beneficiary, Error> {
    let key = DataKey::Beneficiary(nullifier.clone());

    env.storage()
        .persistent()
        .get::<_, Beneficiary>(&key)
        .ok_or(Error::NotRegistered)
}

// Check if beneficiary exists
pub fn exists(env: &Env, nullifier: &BytesN<32>) -> bool {
    let key = DataKey::Beneficiary(nullifier.clone());

    env.storage()
        .persistent()
        .has(&key)
}

// Store family
pub fn store_family(env: &Env, family_id: &BytesN<32>, family: &Family) {
    let key = DataKey::Family(family_id.clone());

    env.storage()
        .persistent()
        .set(&key, family);
}

// Get family
pub fn get_family(env: &Env, family_id: &BytesN<32>) -> Result<Family, Error> {
    let key = DataKey::Family(family_id.clone());

    env.storage()
        .persistent()
        .get::<_, Family>(&key)
        .ok_or(Error::FamilyNotFound)
}

pub fn store_user(env: &Env, address: &Address, profile: &UserProfile) {
    let key = DataKey::User(address.clone());
    env.storage().persistent().set(&key, profile);
}

pub fn get_user(env: &Env, address: &Address) -> Option<UserProfile> {
    let key = DataKey::User(address.clone());
    env.storage().persistent().get(&key)
}
