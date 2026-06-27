
use soroban_sdk::{Env, BytesN, Address};
use crate::types::Location;

pub fn emit_program_created(
    env: &Env,
    program_id: BytesN<32>,
    donor: Address,
    total_budget: i128,
    amount_per_person: i128,
) {
    env.events().publish(
        ("program_created", program_id),
        (donor, total_budget, amount_per_person),
    );
}

pub fn emit_distribution(
    env: &Env,
    distribution_id: BytesN<32>,
    program_id: BytesN<32>,
    nullifier: BytesN<32>,
    amount: i128,
    location: Location,
    distributed_by: Address,
) {
    env.events().publish(
        ("distribution", distribution_id),
        (program_id, nullifier, amount, location, distributed_by),
    );
}

pub fn emit_program_funded(
    env: &Env,
    program_id: BytesN<32>,
    donor: Address,
    amount: i128,
    new_balance: i128,
) {
    env.events().publish(
        ("program_funded", program_id),
        (donor, amount, new_balance),
    );
}