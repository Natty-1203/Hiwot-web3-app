#![cfg(test)]
use soroban_sdk::{Env, BytesN, Address, String, testutils::Address as _};

use crate::contract::{SupplyChainContract, SupplyChainContractClient};
use crate::errors::Error;

// ----------------------
// Helper functions
// ----------------------
fn test_address(env: &Env) -> Address {
    Address::generate(env)
}

fn batch_id(env: &Env, seed: u8) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0] = seed;
    BytesN::from_array(env, &bytes)
}

fn metadata_hash(env: &Env, seed: u8) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[31] = seed;
    BytesN::from_array(env, &bytes)
}

fn str_val(env: &Env, val: &str) -> String {
    String::from_str(env, val)
}

/// Sets up the test environment and returns a registered contract client
fn setup_test(env: &Env) -> SupplyChainContractClient {
    let contract_id = env.register_contract(None, SupplyChainContract);
    SupplyChainContractClient::new(env, &contract_id)
}

// ----------------------
// Tests
// ----------------------

#[test]
fn test_create_batch_success() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup_test(&env);

    let creator = test_address(&env);
    let id = batch_id(&env, 1);
    let desc = str_val(&env, "Premium Coffee");
    let metadata = metadata_hash(&env, 5);

    client.create_batch(&creator, &id, &desc, &100, &metadata);

    let batch = client.get_batch(&id);
    assert_eq!(batch.batch_id, id);
    assert_eq!(batch.remaining, 100);
    assert_eq!(batch.current_custodian, creator);
    assert_eq!(batch.status, 0); // Created
}

#[test]
fn test_create_batch_already_exists() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup_test(&env);

    let creator = test_address(&env);
    let id = batch_id(&env, 2);
    let desc = str_val(&env, "Duplicate");

    client.create_batch(&creator, &id, &desc, &50, &metadata_hash(&env, 6));

    let res = client.try_create_batch(&creator, &id, &desc, &50, &metadata_hash(&env, 6));
    assert!(matches!(res, Err(Ok(Error::BatchAlreadyExists))));
}

#[test]
fn test_transfer_custody_success() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup_test(&env);

    let creator = test_address(&env);
    let receiver = test_address(&env);
    let id = batch_id(&env, 3);

    client.create_batch(&creator, &id, &str_val(&env, "Cargo"), &100, &metadata_hash(&env, 7));
    client.transfer_custody(&creator, &id, &receiver, &(40, 70), &str_val(&env, "Shipment in transit"));

    let batch = client.get_batch(&id);
    assert_eq!(batch.current_custodian, receiver);
    assert_eq!(batch.status, 1); // InTransit
}

#[test]
fn test_transfer_custody_not_custodian() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup_test(&env);

    let creator = test_address(&env);
    let hacker = test_address(&env);
    let id = batch_id(&env, 4);

    client.create_batch(&creator, &id, &str_val(&env, "Secure"), &10, &metadata_hash(&env, 8));

    // Hacker tries to transfer custody even though creator is the custodian
    let res = client.try_transfer_custody(&hacker, &id, &hacker, &(0,0), &str_val(&env, "Steal"));
    assert!(matches!(res, Err(Ok(Error::NotCustodian))));
}

#[test]
fn test_record_damage_partial() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup_test(&env);

    let creator = test_address(&env);
    let id = batch_id(&env, 5);

    client.create_batch(&creator, &id, &str_val(&env, "Glassware"), &100, &metadata_hash(&env, 9));
    client.record_damage(&creator, &id, &20, &(10, 10), &str_val(&env, "Broken during unloading"));

    assert_eq!(client.get_remaining_quantity(&id), 80);
    let batch = client.get_batch(&id);
    assert_ne!(batch.status, 3); // Should not be distributed yet
}

#[test]
fn test_record_damage_insufficient() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup_test(&env);

    let creator = test_address(&env);
    let id = batch_id(&env, 6);

    client.create_batch(&creator, &id, &str_val(&env, "Stock"), &10, &metadata_hash(&env, 10));

    let res = client.try_record_damage(&creator, &id, &15, &(0,0), &str_val(&env, "Too much"));
    assert!(matches!(res, Err(Ok(Error::InsufficientQuantity))));
}

#[test]
fn test_link_to_distribution_full_depletion() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup_test(&env);

    let creator = test_address(&env);
    let id = batch_id(&env, 7);

    client.create_batch(&creator, &id, &str_val(&env, "Final Sale"), &50, &metadata_hash(&env, 11));
    
    client.link_to_distribution(
        &creator, 
        &id, 
        &batch_id(&env, 100), // dist_id
        &batch_id(&env, 200), // nullifier
        &50, 
        &(1, 1)
    );

    let batch = client.get_batch(&id);
    assert_eq!(batch.remaining, 0);
    assert_eq!(batch.status, 3); // Distributed
}

#[test]
fn test_get_batch_history_multi_event() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup_test(&env);

    let creator = test_address(&env);
    let driver = test_address(&env);
    let id = batch_id(&env, 8);

    // Event 1: Create
    client.create_batch(&creator, &id, &str_val(&env, "History Test"), &100, &metadata_hash(&env, 12));
    
    // Event 2: Transfer
    client.transfer_custody(&creator, &id, &driver, &(5,5), &str_val(&env, "To Driver"));

    // Event 3: Damage
    client.record_damage(&driver, &id, &5, &(6,6), &str_val(&env, "Spilled"));

    let history = client.get_batch_history(&id);
    assert_eq!(history.len(), 3);
    
    // Check specific event data (Damage event)
    let last_event = history.get_unchecked(2);
    assert_eq!(last_event.event_type, 2); // Damage
    assert_eq!(last_event.quantity_change, -5);
}

#[test]
fn test_batch_not_found() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup_test(&env);

    let id_none = batch_id(&env, 99);
    
    let res = client.try_get_batch(&id_none);
    assert!(matches!(res, Err(Ok(Error::BatchNotFound))));
}