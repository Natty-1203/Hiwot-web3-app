#![cfg(test)]

use soroban_sdk::{Env, Address, BytesN, String, Vec, testutils::Address as _};

use crate::{DisbursementContract, DisbursementContractClient};
use hiwot_identity::{IdentityContract, IdentityContractClient};
use hiwot_token::{TokenContract, TokenContractClient};
use hiwot_supply_chain::{SupplyChainContract, SupplyChainContractClient};

fn generate_bytes(env: &Env, seed: u32) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0..4].copy_from_slice(&seed.to_le_bytes());
    BytesN::from_array(env, &bytes)
}

#[test]
fn test_identity_only() {
    let env = Env::default();
    env.mock_all_auths();

    let agent = Address::generate(&env);
    let nullifier = generate_bytes(&env, 1);
    let metadata = generate_bytes(&env, 2);

    let identity_client = IdentityContractClient::new(&env, &env.register_contract(None, IdentityContract));
    identity_client.register(&agent, &nullifier, &metadata);
    
    let exists = identity_client.verify(&agent, &nullifier);
    assert!(exists);
    
    println!("✅ Identity test passed!");
}

#[test]
fn test_token_only() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let token_client = TokenContractClient::new(&env, &env.register_contract(None, TokenContract));
    token_client.initialize(&admin);
    token_client.mint(&user, &1000i128);

    let balance = token_client.balance(&user);
    assert_eq!(balance, 1000);
    
    println!("✅ Token test passed!");
}

#[test]
fn test_supply_chain_only() {
    let env = Env::default();
    env.mock_all_auths();

    let creator = Address::generate(&env);
    let batch_id = generate_bytes(&env, 1);
    let description = String::from_str(&env, "Test Batch");
    let metadata = generate_bytes(&env, 2);

    let supply_client = SupplyChainContractClient::new(&env, &env.register_contract(None, SupplyChainContract));
    supply_client.create_batch(&creator, &batch_id, &description, &100u32, &metadata);

    let batch = supply_client.get_batch(&batch_id).unwrap();
    assert_eq!(batch.quantity, 100);
    
    println!("✅ Supply chain test passed!");
}

#[test]
fn test_full_integration() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let donor = Address::generate(&env);
    let agent = Address::generate(&env);
    let beneficiary_nullifier = generate_bytes(&env, 1);
    let metadata = generate_bytes(&env, 2);
    let program_id = generate_bytes(&env, 3);
    let location = (9015000, 3865000);

    let geofence_vertices = Vec::new(&env);
    geofence_vertices.push_back((9020000, 3860000));
    geofence_vertices.push_back((9020000, 3870000));
    geofence_vertices.push_back((9010000, 3870000));
    geofence_vertices.push_back((9010000, 3860000));

    println!("\n--- Deploying Contracts ---");

    let token_client = TokenContractClient::new(&env, &env.register_contract(None, TokenContract));
    token_client.initialize(&admin);
    token_client.mint(&donor, &10000i128);
    println!("✅ Token deployed");

    let identity_client = IdentityContractClient::new(&env, &env.register_contract(None, IdentityContract));
    println!("✅ Identity deployed");

    let supply_client = SupplyChainContractClient::new(&env, &env.register_contract(None, SupplyChainContract));
    println!("✅ Supply Chain deployed");

    let disbursement_client = DisbursementContractClient::new(&env, &env.register_contract(None, DisbursementContract));
    disbursement_client.init(&admin, &identity_client.address, &token_client.address, &supply_client.address);
    println!("✅ Disbursement deployed");

    println!("\n--- Register Beneficiary ---");
    identity_client.register(&agent, &beneficiary_nullifier, &metadata);
    let exists = identity_client.verify(&agent, &beneficiary_nullifier);
    assert!(exists);
    println!("✅ Beneficiary registered");

    println!("\n--- Create Program ---");
    let start_time = env.ledger().timestamp();
    let end_time = start_time + 86400 * 90;
    
    disbursement_client.create_program(
        &donor,
        &program_id,
        &10i128,
        &1000i128,
        &30u32,
        &geofence_vertices,
        &start_time,
        &end_time,
    );
    println!("✅ Program created");

    disbursement_client.fund_program(&donor, &program_id, &1000i128);
    println!("✅ Program funded");

    println!("\n--- Distribute Aid ---");
    let eligible = disbursement_client.check_eligibility(&program_id, &beneficiary_nullifier, &location).unwrap();
    assert!(eligible);
    println!("✅ Beneficiary eligible");

    disbursement_client.distribute(&agent, &program_id, &beneficiary_nullifier, &location, &None);
    println!("✅ Aid distributed");

    let agent_balance = token_client.balance(&agent);
    assert_eq!(agent_balance, 10);
    println!("✅ Agent received {} USDC", agent_balance);

    println!("\n--- ALL TESTS PASSED ---");
}