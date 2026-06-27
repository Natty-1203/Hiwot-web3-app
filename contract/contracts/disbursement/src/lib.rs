#![no_std]
use soroban_sdk::{contractclient, Address, BytesN, Env};

mod contract;
mod types;
mod storage;
mod geofence;
mod events;
mod errors;
mod test;


#[contractclient(name = "IdentityClient")]
pub trait IdentityContractTrait {
    fn verify(agent: Address, nullifier: BytesN<32>) -> Result<bool, crate::errors::Error>;
}

#[contractclient(name = "TokenClient")]
pub trait TokenContractTrait {
    fn transfer(from: Address, to: Address, amount: i128);
}

#[contractclient(name = "SupplyChainClient")]
pub trait SupplyChainContractTrait {
    fn link_to_distribution(
        custodian: Address,
        batch_id: BytesN<32>,
        distribution_id: BytesN<32>,
        nullifier: BytesN<32>,
        quantity: u32,
        location: (i32, i32),
    ) -> Result<(), crate::errors::Error>;
}

pub fn set_contracts(
    env: Env,
    admin: Address,
    identity: Address,
    token: Address,
    supply: Address,
) {
    admin.require_auth();

    storage::set_identity(&env, &identity);
    storage::set_token(&env, &token);
    storage::set_supply(&env, &supply);
}
pub use crate::contract::DisbursementContract;