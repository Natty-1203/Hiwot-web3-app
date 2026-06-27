use soroban_sdk::{Env, Address, BytesN, Symbol};

pub fn batch_created(env: &Env, batch_id: BytesN<32>, creator: Address) {
    env.events().publish(
        (Symbol::new(env, "batch_created"), batch_id),
        (creator, env.ledger().timestamp()),
    );
}

pub fn custody_transferred(env: &Env, batch_id: BytesN<32>, from: Address, to: Address) {
    env.events().publish(
        (Symbol::new(env, "custody_transferred"), batch_id),
        (from, to, env.ledger().timestamp()),
    );
}

pub fn damage_recorded(env: &Env, batch_id: BytesN<32>, quantity: u32, location: (i32, i32)) {
    env.events().publish(
        (Symbol::new(env, "damage_recorded"), batch_id),
        (quantity, location, env.ledger().timestamp()),
    );
}

pub fn batch_distributed(
    env: &Env, 
    batch_id: BytesN<32>, 
    distribution_id: BytesN<32>, 
    nullifier: BytesN<32>,
    quantity: u32,
) {
    env.events().publish(
        (Symbol::new(env, "batch_distributed"), batch_id),
        (distribution_id, nullifier, quantity, env.ledger().timestamp()),
    );
}