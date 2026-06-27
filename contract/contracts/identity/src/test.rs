#![cfg(test)]
use super::*; // import IdentityContractClient
use soroban_sdk::{Env, BytesN, Address}; // real Address type
use soroban_sdk::testutils::Address as _; // bring trait into scope
use crate::contract::IdentityContractClient;

fn make_bytesn(env: &Env, val: u8) -> BytesN<32> {
    BytesN::from_array(env, &[val; 32])
}

fn setup() -> (Env, IdentityContractClient<'static>) {
    let env = Env::default();
    let contract_id = env.register_contract(None, IdentityContract);
    let client = IdentityContractClient::new(&env, &contract_id);
    (env, client)
}

#[test]
fn test_register() {
    let (env, client) = setup();

    let agent = Address::generate(&env);
    let nullifier = make_bytesn(&env, 1);
    let metadata = make_bytesn(&env, 9);

    client.register(&agent, &nullifier, &metadata);
    // Verify registration
    let result = client.get_beneficiary(&nullifier);
    assert_eq!(result.metadata_hash, metadata);
}


#[test]
fn test_verify_active() {
    let (env, client) = setup();

    let agent = Address::generate(&env);
    let nullifier = make_bytesn(&env, 1);
    let metadata = make_bytesn(&env, 9);

    client.register(&agent, &nullifier, &metadata);

    let result = client.verify(&agent, &nullifier);

    assert_eq!(result, true);
}

#[test]
fn test_verify_nonexistent() {
    let (env, client) = setup();

    let agent = Address::generate(&env);
    let nullifier = make_bytesn(&env, 99);

    let result = client.verify(&agent, &nullifier);
    assert_eq!(result, false);
}

#[test]
fn test_deactivate() {
    let (env, client) = setup();

    let agent = Address::generate(&env);
    let regulator = Address::generate(&env);
    let nullifier = make_bytesn(&env, 3);
    let metadata = make_bytesn(&env, 9);

    client.register(&agent, &nullifier, &metadata);

    client.deactivate(&regulator, &nullifier);

    let result = client.verify(&agent, &nullifier);
    assert_eq!(result, false);
}

#[test]
fn test_create_family() {
    let (env, client) = setup();

    let agent = Address::generate(&env);
    let head_nullifier = make_bytesn(&env, 4);
    let metadata = make_bytesn(&env, 9);
    let family_id = make_bytesn(&env, 100);

    client.register(&agent, &head_nullifier, &metadata);

    client
        .create_family(&agent, &family_id, &head_nullifier);

    let head = client.get_beneficiary(&head_nullifier);

    assert_eq!(head.family_head, Some(family_id));
}

#[test]
fn test_add_to_family() {
    let (env, client) = setup();

    let agent = Address::generate(&env);

    let head_nullifier = make_bytesn(&env, 5);
    let child_nullifier = make_bytesn(&env, 6);

    let metadata = make_bytesn(&env, 9);
    let family_id = make_bytesn(&env, 200);

    client.register(&agent, &head_nullifier, &metadata);
    client.register(&agent, &child_nullifier, &metadata);

    client
        .create_family(&agent, &family_id, &head_nullifier)
        ;

    client
        .add_to_family(&agent, &family_id, &child_nullifier)
        ;

    let members = client.get_family_members(&family_id);

    assert_eq!(members.len(), 1);
    assert_eq!(members.get(0).unwrap(), child_nullifier);
}

#[test]
fn test_get_family_members_empty() {
    let (env, client) = setup();

    let agent = Address::generate(&env);
    let head_nullifier = make_bytesn(&env, 7);
    let metadata = make_bytesn(&env, 9);
    let family_id = make_bytesn(&env, 30);

    client.register(&agent, &head_nullifier, &metadata);

    client
        .create_family(&agent, &family_id, &head_nullifier);

    let members = client.get_family_members(&family_id);

    assert_eq!(members.len(), 0);
}

#[test]
fn test_register_and_verify_beneficiary() {
    let (env, client) = setup();

    let agent = Address::generate(&env);
    let nullifier = make_bytesn(&env, 1);
    let metadata = make_bytesn(&env, 9);

    client.register(&agent, &nullifier, &metadata);

    let result = client.get_beneficiary(&nullifier);
    assert_eq!(result.metadata_hash, metadata);
    assert_eq!(result.is_active, true);
}

#[test]
#[should_panic]
fn test_get_beneficiary_not_found() {
    let (env, client) = setup();

    let nullifier = make_bytesn(&env, 2);

    let _ = client.get_beneficiary(&nullifier);
}

#[test]
fn test_exists() {
    let (env, client) = setup();

    let agent = Address::generate(&env);
    let nullifier = make_bytesn(&env, 3);
    let metadata = make_bytesn(&env, 9);

    // Initially, the beneficiary should NOT exist
    let exists_before = client.try_get_beneficiary(&nullifier);
    assert!(matches!(exists_before, Err(_))); // NotRegistered

    // Register the beneficiary via contract
    client.register(&agent, &nullifier, &metadata);

    // Now it should exist
    let exists_after = client.get_beneficiary(&nullifier);
    assert_eq!(exists_after.metadata_hash, metadata);
    assert_eq!(exists_after.is_active, true);
}

#[test]
fn test_register_and_get_family_via_client() {
    let (env, client) = setup();

    let agent = Address::generate(&env);
    let head_nullifier = make_bytesn(&env, 10);
    let metadata = make_bytesn(&env, 99);
    let family_id = make_bytesn(&env, 200);

    client.register(&agent, &head_nullifier, &metadata);

    client.create_family(&agent, &family_id, &head_nullifier);

    // Call fetch_family via client
    let family = client.fetch_family(&family_id);

    assert_eq!(family.family_id, family_id);
    assert_eq!(family.head, head_nullifier);
    assert_eq!(family.members.len(), 0);
}

#[test]
#[should_panic]
fn test_get_family_not_found() {
    let (env, client) = setup();

    let family_id = make_bytesn(&env, 5);

    let _ = client.fetch_family(&family_id);
}