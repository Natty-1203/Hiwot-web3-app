#![cfg(test)]

use soroban_sdk::{Env, Address, BytesN, String, Vec, testutils::Address as _};
use hiwot_identity::IdentityContractClient;
use hiwot_identity::IdentityContract;
use hiwot_token::TokenContractClient;
use hiwot_token::TokenContract;
use hiwot_supply_chain::SupplyChainContractClient;
use hiwot_supply_chain::SupplyChainContract;
use hiwot_disbursement::DisbursementContractClient;
use hiwot_disbursement::DisbursementContract;

fn generate_bytes(seed: u32) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0..4].copy_from_slice(&seed.to_le_bytes());
    BytesN::from_array(&Env::default(), &bytes)
}

#[test]
fn test_error_handling() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let donor = Address::generate(&env);
    let agent = Address::generate(&env);
    let unauthorized = Address::generate(&env);

    // Deploy contracts
    let token_client = TokenContractClient::new(&env, &env.register_contract(None, TokenContract));
    token_client.initialize(&admin);
    token_client.mint(&donor, &10000i128);

    let identity_client = IdentityContractClient::new(&env, &env.register_contract(None, IdentityContract));
    let supply_client = SupplyChainContractClient::new(&env, &env.register_contract(None, SupplyChainContract));
    let disbursement_client = DisbursementContractClient::new(&env, &env.register_contract(None, DisbursementContract));
    disbursement_client.init(&admin, &identity_client.address, &token_client.address, &supply_client.address);

    let nullifier = generate_bytes(1);
    let metadata = generate_bytes(2);
    let batch_id = generate_bytes(3);
    let program_id = generate_bytes(4);
    let location = (9015000, 3865000);
    
    let geofence = Vec::new(&env);
    geofence.push_back((9020000, 3860000));
    geofence.push_back((9020000, 3870000));
    geofence.push_back((9010000, 3870000));
    geofence.push_back((9010000, 3860000));

    println!("--- Test 1: Unauthorized Registration ---");
    identity_client.register(&agent, &nullifier, &metadata);
    println!("✅ Registration successful");

    println!("\n--- Test 2: Duplicate Registration ---");
    let duplicate = identity_client.try_register(&agent, &nullifier, &metadata);
    assert!(duplicate.is_err());
    println!("✅ Duplicate registration correctly rejected");

    println!("\n--- Test 3: Transfer from Non-Custodian ---");
    let batch_description = String::from_str(&env, "Test Batch");
    supply_client.create_batch(&agent, &batch_id, &batch_description, &100u32, &generate_bytes(10));
    
    let transfer_result = supply_client.try_transfer_custody(
        &unauthorized,
        &batch_id,
        &Address::generate(&env),
        &location,
        &String::from_str(&env, "Unauthorized transfer"),
    );
    assert!(transfer_result.is_err());
    println!("✅ Unauthorized transfer rejected");

    println!("\n--- Test 4: Distribute Without Program ---");
    let result = disbursement_client.try_distribute(
        &agent,
        &program_id,
        &nullifier,
        &location,
        &None,
    );
    assert!(result.is_err());
    println!("✅ Distribution without program rejected");

    println!("\n--- Test 5: Distribute Before Program Start ---");
    let start_time = env.ledger().timestamp() + 86400; // Starts tomorrow
    let end_time = start_time + 86400 * 30;
    
    disbursement_client.create_program(
        &donor,
        &program_id,
        &10i128,
        &1000i128,
        &30u32,
        &geofence,
        &start_time,
        &end_time,
    );
    
    let result = disbursement_client.try_distribute(
        &agent,
        &program_id,
        &nullifier,
        &location,
        &None,
    );
    assert!(result.is_err());
    println!("✅ Distribution before program start rejected");

    println!("\n--- Test 6: Deactivate Non-Existent Beneficiary ---");
    let fake_nullifier = generate_bytes(999);
    let result = identity_client.try_deactivate(&admin, &fake_nullifier);
    assert!(result.is_err());
    println!("✅ Deactivation of non-existent beneficiary rejected");

    println!("\n--- All Error Handling Tests Passed ---");
}

#[test]
fn test_batch_quantity_limits() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let custodian = Address::generate(&env);
    let agent = Address::generate(&env);

    let token_client = TokenContractClient::new(&env, &env.register_contract(None, TokenContract));
    token_client.initialize(&admin);
    token_client.mint(&admin, &10000i128);

    let identity_client = IdentityContractClient::new(&env, &env.register_contract(None, IdentityContract));
    let supply_client = SupplyChainContractClient::new(&env, &env.register_contract(None, SupplyChainContract));
    let disbursement_client = DisbursementContractClient::new(&env, &env.register_contract(None, DisbursementContract));
    disbursement_client.init(&admin, &identity_client.address, &token_client.address, &supply_client.address);

    let batch_id = generate_bytes(1);
    let program_id = generate_bytes(2);
    let nullifier = generate_bytes(3);
    let metadata = generate_bytes(4);
    let location = (9015000, 3865000);
    
    let geofence = Vec::new(&env);
    geofence.push_back((9020000, 3860000));
    geofence.push_back((9020000, 3870000));
    geofence.push_back((9010000, 3870000));
    geofence.push_back((9010000, 3860000));

    println!("--- Test: Batch Quantity Limits ---");

    // Create batch with 10 units
    supply_client.create_batch(
        &custodian,
        &batch_id,
        &String::from_str(&env, "Limited Batch"),
        &10u32,
        &generate_bytes(10),
    );
    println!("✅ Batch created with 10 units");

    // Register beneficiary
    identity_client.register(&agent, &nullifier, &metadata);

    // Create program
    let start_time = env.ledger().timestamp();
    let end_time = start_time + 86400 * 30;
    
    disbursement_client.create_program(
        &admin,
        &program_id,
        &10i128,
        &1000i128,
        &30u32,
        &geofence,
        &start_time,
        &end_time,
    );
    
    disbursement_client.fund_program(&admin, &program_id, &1000i128);

    // Transfer batch to agent
    supply_client.transfer_custody(
        &custodian,
        &batch_id,
        &agent,
        &location,
        &String::from_str(&env, "Transfer to agent"),
    );

    println!("\n--- Test: Distribute More Than Available ---");
    
    for i in 0..10 {
        let result = disbursement_client.try_distribute(
            &agent,
            &program_id,
            &nullifier,
            &location,
            &Some(batch_id.clone()),
        );
        assert!(result.is_ok());
        println!("   Distribution {} successful", i + 1);
    }
    
    // After 10 distributions, batch should be empty
    let batch = supply_client.get_batch(&batch_id).unwrap();
    assert_eq!(batch.remaining, 0);
    assert_eq!(batch.status, 3); // Distributed
    println!("✅ Batch fully distributed after 10 claims");
    
    // Try one more distribution (should fail due to insufficient quantity)
    let result = disbursement_client.try_distribute(
        &agent,
        &program_id,
        &nullifier,
        &location,
        &Some(batch_id),
    );
    assert!(result.is_err());
    println!("✅ Extra distribution rejected - insufficient batch quantity");
}